import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { saveUserFile, readUserFile } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

/** POST /api/cv-profile/photo  (multipart: photo=<File>) */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "missing_file", message: "Nessun file inviato." },
      { status: 400 },
    );
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: "bad_type", message: "Usa JPG, PNG o WEBP." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "too_large", message: "Massimo 4 MB." },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
  const path = await saveUserFile(
    user.id,
    "cv-profile",
    `photo.${ext}`,
    buffer,
  );

  await prisma.cVProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, photoPath: path },
    update: { photoPath: path, pdfPath: null, pdfLanguage: null },
  });

  return NextResponse.json({ ok: true, path });
}

/** GET /api/cv-profile/photo  → serves the bytes (owner only) */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const row = await prisma.cVProfile.findUnique({
    where: { userId: user.id },
    select: { photoPath: true },
  });
  if (!row?.photoPath) {
    return NextResponse.json({ error: "no_photo" }, { status: 404 });
  }
  try {
    const buf = await readUserFile(row.photoPath);
    const type = row.photoPath.endsWith(".png")
      ? "image/png"
      : row.photoPath.endsWith(".webp")
        ? "image/webp"
        : "image/jpeg";
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": type,
        "Cache-Control": "private, max-age=30",
      },
    });
  } catch {
    return NextResponse.json({ error: "read_failed" }, { status: 500 });
  }
}

/** DELETE /api/cv-profile/photo  → rimuove la foto */
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  await prisma.cVProfile
    .update({
      where: { userId: user.id },
      data: { photoPath: null, pdfPath: null, pdfLanguage: null },
    })
    .catch(() => void 0);
  return NextResponse.json({ ok: true });
}
