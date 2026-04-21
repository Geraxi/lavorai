import Anthropic from "@anthropic-ai/sdk";
import {
  CVProfileSchema,
  EMPTY_PROFILE,
  type CVProfile,
} from "@/lib/cv-profile-types";

/**
 * Two jobs:
 * 1. `extractFullProfile(cvText)` — one-shot Claude extraction from raw CV text
 *    into the full structured CVProfile. Never fabricates — leaves fields empty.
 * 2. `tailorProfileForJob(profile, jobPosting, lang)` — reorders / rewrites /
 *    translates the profile for a specific job. NEVER adds skills or bullets
 *    not present in the source profile.
 */

const MODEL = "claude-sonnet-4-20250514";

let cached: Anthropic | null = null;
function client(): Anthropic | null {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  cached = new Anthropic({ apiKey });
  return cached;
}

function stripCodeFence(text: string): string {
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1].trim() : text;
}

// ------------------------- EXTRACTION -------------------------

const EXTRACT_SYSTEM = `Sei un parser di CV. Estrai TUTTE le informazioni oggettive dal testo CV in un JSON valido.

REGOLA FERREA: se un campo non è nel CV, lascialo stringa vuota o array vuoto. NON inventare MAI.

Schema esatto (rispondi SOLO con JSON, nessun markdown):
{
  "firstName": string,
  "lastName": string,
  "email": string,
  "phone": string,
  "city": string,
  "title": string,             // Titolo professionale attuale come scritto nel CV
  "summary": string,           // Breve (2-4 frasi). Se il CV ha un "About/Summary" usalo come base. Altrimenti derivalo.
  "experiences": [             // Ordinate dalla più recente
    {
      "role": string,
      "company": string,
      "location": string,
      "startDate": string,     // "MM/YYYY" o "YYYY" come nel CV. "" se assente.
      "endDate": string,       // stesso formato, o "" se tuttora in corso
      "description": string,   // 1-2 frasi descrittive
      "bullets": string[]      // 3-6 bullet point dalle responsabilità/achievements nel CV
    }
  ],
  "education": [
    {
      "degree": string,
      "school": string,
      "location": string,
      "startDate": string,
      "endDate": string,
      "notes": string
    }
  ],
  "skills": [ { "name": string } ],  // Skill tecniche estratte dal CV (max 40)
  "languages": [
    { "name": string, "level": string }  // es. "Italiano" / "Madrelingua", "Inglese" / "C1"
  ],
  "links": [
    { "label": string, "url": string }   // LinkedIn, GitHub, portfolio — solo se presenti nel CV
  ]
}`;

export async function extractFullProfile(cvText: string): Promise<CVProfile> {
  const c = client();
  if (!c) return { ...EMPTY_PROFILE };

  const clipped = cvText.slice(0, 16000);
  try {
    const resp = await c.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system: [
        {
          type: "text",
          text: EXTRACT_SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `CV TEXT:\n\n${clipped}\n\n---\nEstrai il profilo completo in JSON.`,
        },
      ],
    });
    const raw = resp.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    const cleaned = stripCodeFence(raw);
    const parsed = JSON.parse(cleaned);
    const r = CVProfileSchema.safeParse(parsed);
    if (!r.success) {
      console.error("[cv-profile-ai-full] schema mismatch", r.error.issues);
      return { ...EMPTY_PROFILE };
    }
    return r.data;
  } catch (err) {
    console.error("[cv-profile-ai-full] extraction failed", err);
    return { ...EMPTY_PROFILE };
  }
}

// ------------------------- TAILORING -------------------------

const TAILOR_SYSTEM_IT = `Sei un career coach che riscrive CV per una candidatura specifica.

REGOLE FERREE:
1. MAI aggiungere competenze, esperienze, aziende, date o titoli che NON sono nel profilo sorgente.
2. Puoi: riordinare bullet/esperienze, riformulare frasi, enfatizzare parole-chiave del job posting, sintetizzare.
3. Mantieni OGNI esperienza del profilo (non cancellare ruoli), ma riordina i bullet per metterli in ordine di rilevanza.
4. Il summary deve essere riscritto per il ruolo specifico, max 4 frasi, in PRIMA PERSONA.
5. Le skill possono essere riordinate (più rilevanti prima) ma NON aggiunte.
6. OUTPUT: in ITALIANO.

Ritorna SOLO JSON valido con ESATTAMENTE la stessa shape del profilo sorgente.`;

const TAILOR_SYSTEM_EN = `You are a career coach rewriting a CV for a specific job application.

HARD RULES:
1. NEVER add skills, experiences, companies, dates, or titles that are NOT in the source profile.
2. You MAY: reorder bullets/experiences, rephrase, emphasize keywords from the job posting, condense.
3. Keep EVERY experience from the profile (do not delete roles) but reorder bullets by relevance.
4. The summary must be rewritten for this specific role, max 4 sentences, FIRST PERSON.
5. Skills may be reordered (most relevant first) but NEVER added.
6. OUTPUT: in ENGLISH (translate all Italian content to English).

Return ONLY valid JSON with EXACTLY the same shape as the source profile.`;

export async function tailorProfileForJob(input: {
  profile: CVProfile;
  jobPosting: string;
  lang: "it" | "en";
}): Promise<CVProfile> {
  const c = client();
  if (!c) return input.profile;

  const sys = input.lang === "en" ? TAILOR_SYSTEM_EN : TAILOR_SYSTEM_IT;
  const userPrompt = `PROFILO SORGENTE (JSON):
${JSON.stringify(input.profile)}

---
JOB POSTING:
${input.jobPosting.slice(0, 8000)}

---
Riscrivi il profilo per questo job, rispettando le regole ferree. Output in ${input.lang === "en" ? "inglese" : "italiano"}.`;

  try {
    const resp = await c.messages.create({
      model: MODEL,
      max_tokens: 3500,
      system: [{ type: "text", text: sys, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userPrompt }],
    });
    const raw = resp.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    const cleaned = stripCodeFence(raw);
    const parsed = JSON.parse(cleaned);
    const r = CVProfileSchema.safeParse(parsed);
    if (!r.success) {
      console.error("[tailor] schema mismatch, falling back", r.error.issues);
      return input.profile;
    }
    // Guardrail anti-allucinazione: tutte le aziende nel tailored devono
    // esistere nel source profile. Se Claude ne aggiunge, usa il source.
    const srcCompanies = new Set(
      input.profile.experiences.map((e) => e.company.toLowerCase().trim()),
    );
    const hallucinated = r.data.experiences.some(
      (e) =>
        e.company &&
        !srcCompanies.has(e.company.toLowerCase().trim()),
    );
    if (hallucinated) {
      console.warn("[tailor] hallucinated company detected, using source");
      return input.profile;
    }
    return r.data;
  } catch (err) {
    console.error("[tailor] failed, using source", err);
    return input.profile;
  }
}
