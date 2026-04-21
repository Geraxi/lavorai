/**
 * Estrazione euristica del profilo da testo CV (italiano).
 * MVP: regex + euristiche sulle prime righe. Non è AI, basta l'80%.
 */

export interface ExtractedProfile {
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  phone: string;
  city: string;
  seniority: "junior" | "mid" | "senior" | "lead" | "principal" | null;
  yearsExperience: number | null;
  englishLevel: "none" | "a2" | "b1" | "b2" | "c1" | "c2" | null;
}

// Città italiane comuni — match case-insensitive
const IT_CITIES = [
  "Milano",
  "Roma",
  "Torino",
  "Napoli",
  "Bologna",
  "Firenze",
  "Venezia",
  "Verona",
  "Genova",
  "Palermo",
  "Bari",
  "Catania",
  "Padova",
  "Brescia",
  "Modena",
  "Parma",
  "Reggio Emilia",
  "Pisa",
  "Livorno",
  "Trento",
  "Bergamo",
  "Cagliari",
  "Trieste",
  "Perugia",
  "Ancona",
  "Salerno",
  "Messina",
  "Rimini",
  "Monza",
  "Lecce",
];

// Titoli professionali comuni (pattern-based)
const TITLE_HINTS = [
  "Product Designer",
  "Software Engineer",
  "Full Stack",
  "Frontend",
  "Backend",
  "DevOps",
  "Data Scientist",
  "Data Analyst",
  "UX Designer",
  "UI Designer",
  "Product Manager",
  "Project Manager",
  "Marketing Manager",
  "Growth",
  "Sales",
  "Account",
  "Consultant",
  "Developer",
  "Engineer",
  "Designer",
  "Analyst",
  "Manager",
  "Specialist",
  "Architect",
  "Lead",
];

export function extractProfile(
  text: string,
  sessionEmail: string | null,
): ExtractedProfile {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const head = lines.slice(0, 15).join("\n");

  // Email: preferisci quella trovata nel CV, fallback a session
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const email = emailMatch?.[0] ?? sessionEmail ?? "";

  // Telefono: cerca pattern IT (+39 ...) o formato generico con spazi/dash
  const phoneMatch = text.match(
    /(?:\+?39[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)\d{2,4}[\s.-]?\d{2,4}[\s.-]?\d{0,4}/,
  );
  const phone = phoneMatch?.[0]?.trim() ?? "";

  // Nome: prima riga non vuota che non è titolo/email/telefono.
  // Accetta sia "Mario Rossi" (Title Case) che "MARIO ROSSI" (ALL CAPS).
  let fullName = "";
  for (const line of lines.slice(0, 8)) {
    if (/@|\d{4,}|\+39|http|linkedin|curriculum|profile|profilo/i.test(line))
      continue;
    const words = line.split(/\s+/);
    if (words.length < 2 || words.length > 4) continue;
    const titleCase = words.every((w) => /^[A-ZÀ-Ý][a-zà-ÿ'-]+$/.test(w));
    const allCaps = words.every((w) => /^[A-ZÀ-Ý][A-ZÀ-Ý'-]+$/.test(w));
    if (titleCase || allCaps) {
      fullName = line;
      break;
    }
  }
  // Normalizza in Title Case se trovato in ALL CAPS
  const toTitleCase = (w: string) =>
    w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  const normalized = fullName
    .split(/\s+/)
    .map(toTitleCase)
    .join(" ");
  const nameParts = normalized.split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] ?? "";
  const lastName = nameParts.slice(1).join(" ");

  // Titolo: riga subito dopo il nome, o match su TITLE_HINTS nelle prime righe
  let title = "";
  if (fullName) {
    const idx = lines.findIndex((l) => l === fullName);
    if (idx >= 0 && idx + 1 < lines.length) {
      const candidate = lines[idx + 1];
      if (
        !/@|\+39|\d{4,}/.test(candidate) &&
        candidate.length < 80 &&
        candidate.length > 4
      ) {
        title = candidate;
      }
    }
  }
  if (!title) {
    for (const hint of TITLE_HINTS) {
      const re = new RegExp(`([A-Z][A-Za-z/ ]*)?\\s*${hint}[A-Za-z/ ]*`, "i");
      const m = head.match(re);
      if (m) {
        title = m[0].trim();
        break;
      }
    }
  }

  // Città
  let city = "";
  for (const c of IT_CITIES) {
    if (new RegExp(`\\b${c}\\b`, "i").test(head)) {
      city = c;
      break;
    }
  }

  return {
    firstName,
    lastName,
    title: title.slice(0, 80),
    email,
    phone,
    city,
    seniority: detectSeniority(title, text),
    yearsExperience: detectYearsExperience(text),
    englishLevel: detectEnglishLevel(text),
  };
}

function detectSeniority(
  title: string,
  text: string,
): "junior" | "mid" | "senior" | "lead" | "principal" | null {
  const hay = `${title} ${text.slice(0, 1500)}`.toLowerCase();
  // Check in order of specificity — principal/lead prima di senior
  if (/\bprincipal\b|\bstaff\b|\bdistinguished\b|\bhead of\b/i.test(hay))
    return "principal";
  if (/\blead\b|\bteam lead\b|\bengineering manager\b|\btech lead\b/i.test(hay))
    return "lead";
  if (/\bsenior\b|\bsr\.?\b|\bfounder\b|\bfounding\b/i.test(hay)) return "senior";
  if (/\bjunior\b|\bjr\.?\b|\bentry[- ]?level\b|\binternship\b|\bstagista\b|\btrainee\b/i.test(
    hay,
  ))
    return "junior";
  if (/\bmid[- ]?level\b|\bmid[- ]?weight\b/i.test(hay)) return "mid";
  return null;
}

function detectYearsExperience(text: string): number | null {
  // Raccoglie tutti i range di anni nel CV (es. "2018 – 2024", "2019-oggi", "2020 - Present")
  const now = new Date().getFullYear();
  const rangeRe =
    /\b(19\d{2}|20\d{2})\s*[–\-–—]\s*(19\d{2}|20\d{2}|oggi|present|current|now|attuale|in corso)\b/gi;
  const ranges: Array<[number, number]> = [];
  let match: RegExpExecArray | null;
  while ((match = rangeRe.exec(text)) !== null) {
    const start = parseInt(match[1], 10);
    const endRaw = match[2].toLowerCase();
    const end = /\d{4}/.test(endRaw) ? parseInt(endRaw, 10) : now;
    if (end >= start && end <= now + 1 && start >= 1970) {
      ranges.push([start, end]);
    }
  }
  if (ranges.length === 0) return null;

  // Merge overlapping ranges per calcolare anni di esperienza lavorativa effettiva
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1] + 1) {
      last[1] = Math.max(last[1], r[1]);
    } else {
      merged.push([...r]);
    }
  }
  const years = merged.reduce((acc, [s, e]) => acc + (e - s), 0);
  if (years <= 0) return null;
  return Math.min(50, years);
}

function detectEnglishLevel(
  text: string,
): "none" | "a2" | "b1" | "b2" | "c1" | "c2" | null {
  const hay = text.toLowerCase();
  // Cerca vicinanza "english" / "inglese" + livello CEFR
  const ctx = hay.match(/(english|inglese)[^\n]{0,80}/);
  const scope = ctx ? ctx[0] : hay;

  if (/\bc2\b|mother\s?tongue|madrelingua|proficient|native/.test(scope))
    return "c2";
  if (/\bc1\b|advanced|fluent|fluente|avanzato/.test(scope)) return "c1";
  if (/\bb2\b|upper[-\s]?intermediate|intermedio\s?superiore/.test(scope))
    return "b2";
  if (/\bb1\b|intermediate|intermedio/.test(scope)) return "b1";
  if (/\ba2\b|elementary|elementare|basic|base/.test(scope)) return "a2";

  // Fallback: se "english" appare ma nessun livello → probabilmente B2
  if (/english|inglese/.test(hay)) return "b2";
  return null;
}
