import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { isAdmin } from "@/lib/admin";
import { getCurrentUser } from "@/lib/session";
import { EDITORIAL_TOPICS, ensureEditorialStore, generateEditorialDraft, nextEditorialTopic } from "@/lib/editorial";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null) as { action?: string; slug?: string } | null;
  if (!body?.action) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  await ensureEditorialStore();

  if (body.action === "generate") {
    const existing = await prisma.editorialArticle.findMany({ select: { slug: true } });
    const topic = body.slug ? EDITORIAL_TOPICS.find((item) => item.slug === body.slug) : nextEditorialTopic(existing.map((item) => item.slug));
    if (!topic) return NextResponse.json({ error: "calendar_complete", message: "Nessun nuovo brief nel calendario editoriale." }, { status: 409 });
    if (existing.some((item) => item.slug === topic.slug)) return NextResponse.json({ error: "already_exists" }, { status: 409 });

    try {
      const draft = await generateEditorialDraft(topic);
      const article = await prisma.editorialArticle.create({
        data: {
          slug: topic.slug,
          title: draft.title,
          metaTitle: draft.metaTitle,
          description: draft.description,
          keyword: topic.keyword,
          category: topic.category,
          content: { intro: draft.intro, sections: draft.sections },
          faq: draft.faq,
          keywords: draft.keywords,
          status: "review",
        },
        select: { id: true, slug: true, title: true, status: true },
      });
      return NextResponse.json({ ok: true, article });
    } catch (error) {
      console.error("[admin/editorial] generate", error);
      return NextResponse.json({ error: "generation_failed", message: error instanceof Error ? error.message : "Impossibile generare la bozza." }, { status: 500 });
    }
  }

  if (!body.slug) return NextResponse.json({ error: "missing_slug" }, { status: 400 });
  if (body.action === "publish") {
    const article = await prisma.editorialArticle.update({ where: { slug: body.slug }, data: { status: "published", publishedAt: new Date() }, select: { slug: true, status: true } });
    return NextResponse.json({ ok: true, article });
  }
  if (body.action === "unpublish") {
    const article = await prisma.editorialArticle.update({ where: { slug: body.slug }, data: { status: "review", publishedAt: null }, select: { slug: true, status: true } });
    return NextResponse.json({ ok: true, article });
  }
  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
