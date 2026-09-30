import type { Guide, GuideSection } from "@/content/guide";

type ArticleRecord = {
  slug: string; title: string; metaTitle: string; description: string; keyword: string;
  category: string; content: unknown; faq: unknown; keywords: unknown; publishedAt: Date | null; updatedAt: Date;
};

const categories = new Set(["CV", "Candidature", "Colloquio", "Strumenti"]);
const stringArray = (value: unknown, max: number) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, max) : [];

export function editorialToGuide(article: ArticleRecord): Guide {
  const body = (article.content && typeof article.content === "object" ? article.content : {}) as { intro?: unknown; sections?: unknown };
  const sections = (Array.isArray(body.sections) ? body.sections : []).map((section) => {
    const row = (section && typeof section === "object" ? section : {}) as { h2?: unknown; paragraphs?: unknown; list?: unknown };
    return { h2: typeof row.h2 === "string" ? row.h2 : "", paragraphs: stringArray(row.paragraphs, 3), list: stringArray(row.list, 7) } satisfies GuideSection;
  }).filter((section) => section.h2 && (section.paragraphs?.length || section.list?.length));
  const faq = (Array.isArray(article.faq) ? article.faq : []).map((item) => {
    const row = (item && typeof item === "object" ? item : {}) as { q?: unknown; a?: unknown };
    return { q: typeof row.q === "string" ? row.q : "", a: typeof row.a === "string" ? row.a : "" };
  }).filter((item) => item.q && item.a);
  const date = (article.publishedAt ?? article.updatedAt).toISOString();
  return {
    slug: article.slug, title: article.title, metaTitle: article.metaTitle, description: article.description,
    keywords: stringArray(article.keywords, 8), published: date, updated: article.updatedAt.toISOString(),
    category: categories.has(article.category) ? article.category as Guide["category"] : "Strumenti",
    intro: stringArray(body.intro, 2), sections, faq, related: [],
    cta: { title: "Vuoi toglierti di dosso le candidature ripetitive?", body: "LavorAI adatta il CV a ogni annuncio e prepara le candidature sui portali supportati.", label: "Inizia gratis", href: "/signup" },
  };
}
