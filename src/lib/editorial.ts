import { complete } from "@/lib/ai-router";
import { prisma } from "@/lib/db";

export type EditorialSection = {
  h2: string;
  paragraphs: string[];
  list?: string[];
};

export type EditorialDraft = {
  title: string;
  metaTitle: string;
  description: string;
  keywords: string[];
  intro: string[];
  sections: EditorialSection[];
  faq: Array<{ q: string; a: string }>;
};

export type EditorialTopic = {
  slug: string;
  keyword: string;
  category: "CV" | "Candidature" | "Colloquio" | "Strumenti";
  angle: string;
};

/**
 * Calendario editoriale deliberatamente stretto: query con un'intenzione
 * concreta, utili a chi cerca lavoro e vicine al prodotto. Non una content
 * farm di varianti città/ruolo quasi identiche.
 */
export const EDITORIAL_TOPICS: EditorialTopic[] = [
  { slug: "come-cercare-lavoro-linkedin", keyword: "come cercare lavoro su LinkedIn", category: "Candidature", angle: "Procedura concreta: filtri, alert, verifica della fonte ATS e tracciamento delle candidature." },
  { slug: "cv-in-inglese-esempio", keyword: "cv in inglese esempio", category: "CV", angle: "Struttura, terminologia e differenze pratiche rispetto a un CV italiano; niente traduzioni letterali." },
  { slug: "follow-up-candidatura-esempio", keyword: "follow up candidatura esempio", category: "Candidature", angle: "Quando scrivere, come non essere insistenti e tre template adattabili senza inventare informazioni." },
  { slug: "domande-colloquio-lavoro", keyword: "domande colloquio di lavoro", category: "Colloquio", angle: "Preparazione con storie verificabili, domande da fare al recruiter e metodo STAR senza frasi fatte." },
  { slug: "come-negoziare-stipendio", keyword: "come negoziare lo stipendio", category: "Colloquio", angle: "Preparazione, range, proposta e controproposta: guida pratica senza promettere risultati." },
  { slug: "candidatura-spontanea-email", keyword: "candidatura spontanea email esempio", category: "Candidature", angle: "Quando funziona, come scegliere l'azienda e una struttura email breve che porta a una conversazione." },
  { slug: "portfolio-ux-designer", keyword: "portfolio UX designer", category: "CV", angle: "Come selezionare case study, mostrare decisioni e collegare il portfolio alla posizione desiderata." },
  { slug: "job-alert-efficaci", keyword: "job alert lavoro", category: "Strumenti", angle: "Come impostare alert utili senza ricevere rumore: ruoli, seniority, località, lingua e fonti." },
];

const system = `Sei l'editor italiano di LavorAI. Scrivi guide accurate, concrete e originali per persone che cercano lavoro. Non inventare statistiche, fonti, risultati, normative o funzionalità. Non usare formule promozionali generiche. Il prodotto LavorAI può comparire solo nella CTA finale, in modo verificabile. Il lettore deve poter agire subito dopo aver letto.`;

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function parseDraft(raw: string): EditorialDraft {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const sections = Array.isArray(parsed.sections) ? parsed.sections.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      h2: clean(row.h2, 110),
      paragraphs: (Array.isArray(row.paragraphs) ? row.paragraphs : []).map((p) => clean(p, 900)).filter(Boolean).slice(0, 3),
      list: (Array.isArray(row.list) ? row.list : []).map((p) => clean(p, 260)).filter(Boolean).slice(0, 7),
    };
  }).filter((s) => s.h2 && s.paragraphs.length > 0).slice(0, 6) : [];
  const faq = Array.isArray(parsed.faq) ? parsed.faq.map((item) => {
    const row = item as Record<string, unknown>;
    return { q: clean(row.q, 170), a: clean(row.a, 500) };
  }).filter((item) => item.q && item.a).slice(0, 5) : [];
  const draft: EditorialDraft = {
    title: clean(parsed.title, 115),
    metaTitle: clean(parsed.metaTitle, 62),
    description: clean(parsed.description, 158),
    keywords: (Array.isArray(parsed.keywords) ? parsed.keywords : []).map((item) => clean(item, 60)).filter(Boolean).slice(0, 7),
    intro: (Array.isArray(parsed.intro) ? parsed.intro : []).map((item) => clean(item, 850)).filter(Boolean).slice(0, 2),
    sections,
    faq,
  };
  if (!draft.title || !draft.metaTitle || !draft.description || draft.intro.length < 1 || draft.sections.length < 3 || draft.faq.length < 2) {
    throw new Error("La bozza non contiene abbastanza contenuto editoriale da revisionare.");
  }
  return draft;
}

export async function generateEditorialDraft(topic: EditorialTopic): Promise<EditorialDraft> {
  const { text } = await complete({
    task: "editorial",
    maxTokens: 2600,
    json: true,
    system,
    user: `Prepara una bozza SEO in italiano per questa guida.\n\nKeyword primaria: ${topic.keyword}\nCategoria: ${topic.category}\nAngolo: ${topic.angle}\n\nRestituisci JSON puro con title, metaTitle, description, keywords, intro (1-2 paragrafi), sections (4-6 elementi con h2, paragraphs e lista opzionale) e faq (3-5 elementi q/a). Titolo e meta title devono essere diversi. Il testo deve essere utile anche senza LavorAI; niente CTA nel corpo, niente numeri non verificabili e niente citazioni inventate.`,
  });
  return parseDraft(text);
}

export function nextEditorialTopic(existingSlugs: string[]) {
  return EDITORIAL_TOPICS.find((topic) => !existingSlugs.includes(topic.slug)) ?? null;
}

let editorialStoreReady: Promise<void> | undefined;

/**
 * The production runtime has a pooled database connection while schema
 * migrations use a separate direct connection. Initialise this isolated,
 * additive store from the trusted runtime connection so a new deployment
 * cannot leave the editorial controls unusable when that direct connection
 * is unavailable. No existing application table is changed.
 */
export function ensureEditorialStore() {
  editorialStoreReady ??= (async () => {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "EditorialArticle" (
        "id" TEXT NOT NULL,
        "slug" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "metaTitle" TEXT NOT NULL,
        "description" TEXT NOT NULL,
        "keyword" TEXT NOT NULL,
        "category" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'review',
        "content" JSONB NOT NULL,
        "faq" JSONB NOT NULL,
        "keywords" JSONB NOT NULL,
        "scheduledFor" TIMESTAMP(3),
        "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "publishedAt" TIMESTAMP(3),
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "EditorialArticle_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "EditorialArticle_slug_key" ON "EditorialArticle"("slug")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "EditorialArticle_status_publishedAt_idx" ON "EditorialArticle"("status", "publishedAt")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "EditorialArticle_scheduledFor_idx" ON "EditorialArticle"("scheduledFor")');
  })();
  return editorialStoreReady;
}
