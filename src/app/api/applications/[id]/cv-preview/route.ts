import { NextResponse } from "next/server";
import mammoth from "mammoth";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { readUserFile } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { id } = await params;
  const app = await prisma.application.findUnique({
    where: { id },
    select: { userId: true, cvDocxPath: true },
  });
  if (!app || app.userId !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!app.cvDocxPath) {
    return NextResponse.json({ error: "not_ready" }, { status: 409 });
  }

  try {
    const buffer = await readUserFile(app.cvDocxPath);
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value.trim();
    if (!text) throw new Error("empty CV document");
    return NextResponse.json({ text }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[api/applications/:id/cv-preview]", error);
    return NextResponse.json({ error: "read_failed" }, { status: 500 });
  }
}
