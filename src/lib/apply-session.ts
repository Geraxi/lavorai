import { prisma } from "@/lib/db";

/**
 * Application Session: un gruppo logico di candidature dell'utente che
 * condividono categoria (settore) + ruolo principale.
 *
 * Esempio: "Front-End Developer" a Milano + "Senior React Developer"
 * a Roma stanno nella stessa sessione (category=IT Jobs, role=developer).
 * "Product Designer" cade in una sessione diversa.
 */

function normalize(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9àèéìòù\s-]/g, "")
    .replace(/\s+/g, " ");
}

/** Stopword che non ci dicono nulla sul ruolo effettivo */
const STOPWORDS = new Set([
  "senior",
  "junior",
  "lead",
  "principal",
  "staff",
  "head",
  "of",
  "and",
  "the",
  "la",
  "il",
  "di",
  "a",
  "da",
  "to",
  "for",
  "per",
  "stage",
  "tirocinio",
  "intern",
  "remote",
  "remoto",
  "full",
  "part",
  "time",
]);

/**
 * Chiave canonica per raggruppare i job in una sessione.
 * Strategia: category (se presente) + primi 1-2 token significativi del titolo.
 */
export function sessionKeyForJob(job: {
  title: string;
  category: string | null;
}): { key: string; label: string } {
  const cat = normalize(job.category) || "generico";
  const titleTokens = normalize(job.title)
    .split(" ")
    .filter((t) => t && !STOPWORDS.has(t))
    .slice(0, 2);
  const role = titleTokens.join(" ") || "varie";
  const key = `${cat}::${role}`;
  const prettyCat = prettify(cat);
  const prettyRole = prettify(role);
  const label =
    prettyCat === prettyRole ? prettyRole : `${prettyCat} · ${prettyRole}`;
  return { key, label };
}

function prettify(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

/**
 * Trova o crea la sessione giusta per un job. Upsert idempotente.
 */
export async function resolveSession(
  userId: string,
  job: { title: string; category: string | null },
): Promise<{ id: string; status: string; label: string; key: string }> {
  const { key, label } = sessionKeyForJob(job);
  const row = await prisma.applicationSession.upsert({
    where: { userId_key: { userId, key } },
    create: { userId, key, label },
    update: { label }, // refresh label if title formatting changed
    select: { id: true, status: true, label: true, key: true },
  });
  return row;
}
