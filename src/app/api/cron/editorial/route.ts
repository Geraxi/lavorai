import { captureApiException } from "@/lib/posthog/server";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { EDITORIAL_TOPICS, ensureEditorialStore, generateEditorialDraft, nextEditorialTopic } from "@/lib/editorial";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Una bozza per ogni giorno lavorativo, mai auto-pubblicata. Il ritmo aumenta
 * la copertura delle query senza sacrificare qualità: ogni guida resta in
 * revisione editoriale prima di poter comparire nel sito o nella sitemap.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await ensureEditorialStore();
  const existing = await prisma.editorialArticle.findMany({ select: { slug: true } });
  const topic = nextEditorialTopic(existing.map((article) => article.slug));
  if (!topic) return NextResponse.json({ ok: true, status: "calendar_complete" });
  try {
    const draft = await generateEditorialDraft(topic);
    const article = await prisma.editorialArticle.create({
      data: {
        slug: topic.slug, title: draft.title, metaTitle: draft.metaTitle,
        description: draft.description, keyword: topic.keyword, category: topic.category,
        content: { intro: draft.intro, sections: draft.sections }, faq: draft.faq,
        keywords: draft.keywords, status: "review",
      },
      select: { slug: true, title: true, status: true },
    });
    return NextResponse.json({ ok: true, article });
  } catch (error) {
    await captureApiException(error, "/api/cron/editorial");
    console.error("[cron/editorial]", error);
    return NextResponse.json({ error: "generation_failed", message: error instanceof Error ? error.message : "unknown" }, { status: 500 });
  }
}
