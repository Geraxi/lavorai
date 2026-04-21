import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { readUserFile } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * GET /api/applications/[id]/document?kind=cv|cover
 * Scarica il DOCX relativo alla candidatura. Solo proprietario.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { id } = await params;
  const kind = request.nextUrl.searchParams.get("kind");
  if (kind !== "cv" && kind !== "cover") {
    return NextResponse.json({ error: "bad_kind" }, { status: 400 });
  }

  const app = await prisma.application.findUnique({
    where: { id },
    select: {
      userId: true,
      cvDocxPath: true,
      coverLetterPath: true,
      job: { select: { title: true, company: true } },
    },
  });

  if (!app || app.userId !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const path = kind === "cv" ? app.cvDocxPath : app.coverLetterPath;
  if (!path) {
    return NextResponse.json(
      { error: "not_ready", message: "File non ancora generato." },
      { status: 409 },
    );
  }

  try {
    const buffer = await readUserFile(path);
    const safeTitle = (app.job.title ?? "job")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .slice(0, 40);
    const filename =
      kind === "cv"
        ? `CV_Ottimizzato_${safeTitle}.docx`
        : `Lettera_Motivazionale_${safeTitle}.docx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  } catch (err) {
    console.error("[api/applications/:id/document]", err);
    return NextResponse.json(
      { error: "read_failed", message: "Impossibile leggere il file." },
      { status: 500 },
    );
  }
}
