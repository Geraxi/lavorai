import { NextResponse } from "next/server";
import mammoth from "mammoth";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { readUserFile } from "@/lib/storage";
import { diffCvText } from "@/lib/cv-diff";
import { yearsIn } from "@/lib/cv-fact-guard";

export const runtime = "nodejs";

export async function GET(
  request: Request,
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
    const compare = new URL(request.url).searchParams.get("compare") === "1";
    if (compare) {
      // Confronto con il CV originale dell'utente (l'ultimo caricato, che è
      // quello usato dal worker per generare il CV su misura).
      const original = await prisma.cVDocument.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        select: { extractedText: true, originalFilename: true, createdAt: true },
      });
      if (!original?.extractedText?.trim()) {
        return NextResponse.json({ text, compare: null }, { headers: { "Cache-Control": "private, no-store" } });
      }
      const { lines, summary } = diffCvText(original.extractedText, text);
      const originalYears = new Set(yearsIn(original.extractedText));
      const yearsNotInOriginal = Array.from(new Set(yearsIn(text))).filter((year) => !originalYears.has(year));
      return NextResponse.json({
        text,
        compare: {
          originalFilename: original.originalFilename,
          originalUploadedAt: original.createdAt.toISOString(),
          summary,
          lines,
          yearsNotInOriginal,
        },
      }, { headers: { "Cache-Control": "private, no-store" } });
    }
    return NextResponse.json({ text }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const { logCvExtractionFailure } = await import("@/lib/cv-extraction-log");
    logCvExtractionFailure("cv-preview", error);
    return NextResponse.json({ error: "read_failed" }, { status: 500 });
  }
}
