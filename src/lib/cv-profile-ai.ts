import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedProfile } from "@/lib/cv-profile";
import { extractProfile as extractProfileRegex } from "@/lib/cv-profile";

/**
 * Extract structured profile from CV text using Claude.
 * Falls back to regex-based extraction if ANTHROPIC_API_KEY is missing
 * or the API call fails.
 */

// Usa lo stesso modello di claude.ts per consistenza (l'estrazione è breve → costo trascurabile)
const MODEL = "claude-sonnet-4-20250514";

const SYSTEM_PROMPT = `Sei un parser di CV italiano/inglese. Estrai campi oggettivi in JSON.

Rispondi SOLO con un JSON valido (nessun markdown), schema esatto:

{
  "firstName": string,   // Nome Title Case. "" se non trovato.
  "lastName": string,    // Cognome Title Case. "" se non trovato.
  "title": string,       // Titolo professionale attuale (max 80 char). Usa il titolo DICHIARATO nel CV così com'è.
  "email": string,       // Email. "" se non trovato.
  "phone": string,       // Telefono. "" se non trovato.
  "city": string,        // Città di residenza PROPRIA. "" se non esplicita (NON dedurre da nomi azienda).
  "seniority": null,
  "yearsExperience": number | null,
  "englishLevel": "none" | "a2" | "b1" | "b2" | "c1" | "c2" | null,
  "suggestedRoles": string[],
    // 6-10 titoli di ruolo SIMILI al profilo del CV che l'utente potrebbe voler candidare.
    // Esempi: se CV è "Senior Software Engineer" suggerisci: ["Senior Software Engineer", "Software Engineer",
    // "Full-Stack Developer", "Backend Engineer", "Staff Engineer", "Tech Lead"].
    // Se CV è "Product Designer" → ["Product Designer", "Senior Product Designer", "UX Designer",
    // "UI Designer", "Design Lead"]. Include sia il ruolo attuale sia progressioni naturali.
    // SEMPRE in italiano o inglese coerente con il CV.
    // Se il CV è troppo generico/ambiguo per suggerire, ritorna [].
  "suggestedCities": string[]
    // 3-6 città italiane dove l'utente potrebbe candidarsi, basate sulla città di residenza
    // del CV. Include la città del CV + aggiungi "Remoto", e 2-3 città italiane principali
    // accessibili (Milano, Roma, Torino, Bologna...).
    // Se non c'è città nel CV, ritorna ["Milano", "Roma", "Remoto"] come default IT.
}

Regole ferree:
- Non inventare dati personali. "" o null sono risposte valide.
- seniority è SEMPRE null (troppo soggettivo).
- Il titolo va estratto COME SCRITTO.
- suggestedRoles: MAI vuoto se il CV ha un titolo professionale. Deve matchare l'area del CV.`;

function userPrompt(cvText: string): string {
  // Limit length to keep token usage reasonable
  const clipped = cvText.slice(0, 8000);
  return `CV TEXT:\n\n${clipped}\n\n---\nEstrai il profilo in JSON.`;
}

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

export async function extractProfileAI(
  cvText: string,
  sessionEmail: string | null,
): Promise<ExtractedProfile> {
  const client = getClient();
  if (!client) {
    return extractProfileRegex(cvText, sessionEmail);
  }

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userPrompt(cvText) }],
    });

    const raw = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    console.log("[cv-profile-ai] RAW RESPONSE:", raw);
    const cleaned = stripCodeFence(raw);
    const parsed = JSON.parse(cleaned) as Partial<ExtractedProfile>;

    // Normalizza stringhe: null/undefined → ""; email/phone/city fallback a session
    const str = (v: unknown): string =>
      typeof v === "string" && v.length > 0 ? v : "";
    const email = str(parsed.email) || sessionEmail || "";

    const suggestedRoles = Array.isArray(parsed.suggestedRoles)
      ? parsed.suggestedRoles
          .filter((r): r is string => typeof r === "string" && r.length > 0)
          .slice(0, 10)
          .map((r) => r.trim())
      : [];
    const suggestedCities = Array.isArray(parsed.suggestedCities)
      ? parsed.suggestedCities
          .filter((c): c is string => typeof c === "string" && c.length > 0)
          .slice(0, 6)
          .map((c) => c.trim())
      : [];

    return {
      firstName: toTitleCase(str(parsed.firstName)),
      lastName: toTitleCase(str(parsed.lastName)),
      title: str(parsed.title).slice(0, 80),
      email,
      phone: str(parsed.phone),
      city: str(parsed.city),
      seniority:
        (parsed.seniority as ExtractedProfile["seniority"]) ?? null,
      yearsExperience:
        typeof parsed.yearsExperience === "number"
          ? Math.max(0, Math.min(50, Math.round(parsed.yearsExperience)))
          : null,
      englishLevel:
        (parsed.englishLevel as ExtractedProfile["englishLevel"]) ?? null,
      suggestedRoles,
      suggestedCities,
    };
  } catch (err) {
    console.error("[cv-profile-ai] Claude extraction failed, fallback to regex", err);
    return extractProfileRegex(cvText, sessionEmail);
  }
}

function stripCodeFence(text: string): string {
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1].trim() : text;
}

function toTitleCase(s: string): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ""))
    .join(" ");
}
