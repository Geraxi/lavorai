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

/**
 * Chiave canonica per raggruppare i job in una sessione.
 *
 * Strategia (post-refactor): SOLO category. Il titolo del job non
 * entra più nella chiave — se lo facesse si generavano decine di
 * sessioni per utente ("Front End Developer", "Senior React",
 * "Fullstack Node"...), tutte separate, con lista che cresceva
 * all'infinito. Ora un utente ha tipicamente 3-6 sessioni (una per
 * categoria: IT, Design, Marketing, ecc.) e resta gestibile a colpo
 * d'occhio.
 */
export function sessionKeyForJob(job: {
  title: string;
  category: string | null;
}): { key: string; label: string } {
  const cat = normalize(job.category) || "generico";
  const key = `cat::${cat}`;
  const label = prettify(cat);
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
