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
  "seniority": null,     // SEMPRE null. Non provare a dedurre — troppo soggettivo.
  "yearsExperience": number | null,
    // SOLO se il CV ha date chiare (es. "Gen 2020 - Dic 2023"). Somma gli anni SOLO di ruoli FULL-TIME in azienda
    // (esclusi: stage, side project, freelance part-time, ruoli con durata <3 mesi, periodi "Current" senza data inizio).
    // Se meno di 3 ruoli full-time chiari → null.
  "englishLevel": "none" | "a2" | "b1" | "b2" | "c1" | "c2" | null
    // Solo se esplicitamente dichiarato nel CV.
    // "Native"/"Madrelingua" → c2. "Fluent" → c1. "C2"/"C1"/"B2"/"B1"/"A2" letterali → match diretto.
    // Se "English" compare senza livello → null.
}

Regole ferree:
- Non inventare. "" o null sono risposte valide e preferite a dati sbagliati.
- seniority è SEMPRE null.
- Il titolo va estratto COME SCRITTO (non modificarlo, non interpretarlo).`;

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
