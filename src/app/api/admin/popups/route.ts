import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";

export const runtime = "nodejs";

const KINDS = ["rating", "feedback", "improvement", "info"];
const AUDIENCES = ["all", "free", "pro", "pro_plus"];

/**
 * GET  /api/admin/popups — lista tutti i popup con conteggi risposte.
 * POST /api/admin/popups — crea un nuovo popup.
 * Admin-only (founder).
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user?.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const popups = await prisma.adminPopup.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { responses: true } } },
  });
  return NextResponse.json({ popups });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: {
    title?: string;
    bodyText?: string;
    kind?: string;
    ctaLabel?: string;
    audience?: string;
    expiresAt?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const title = (body.title ?? "").trim();
  const bodyText = (body.bodyText ?? "").trim();
  if (!title || !bodyText) {
    return NextResponse.json(
      { error: "title e body sono obbligatori" },
      { status: 400 },
    );
  }
  const kind = KINDS.includes(body.kind ?? "") ? body.kind! : "feedback";
  const audience = AUDIENCES.includes(body.audience ?? "")
    ? body.audience!
    : "all";
  const ctaLabel = (body.ctaLabel ?? "").trim() || null;
  let expiresAt: Date | null = null;
  if (body.expiresAt) {
    const d = new Date(body.expiresAt);
    if (!Number.isNaN(d.getTime())) expiresAt = d;
  }

  const popup = await prisma.adminPopup.create({
    data: {
      title: title.slice(0, 200),
      body: bodyText.slice(0, 2000),
      kind,
      audience,
      ctaLabel: ctaLabel?.slice(0, 60) ?? null,
      expiresAt,
    },
  });
  return NextResponse.json({ popup });
}
