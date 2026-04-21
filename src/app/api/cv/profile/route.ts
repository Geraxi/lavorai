import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

const Schema = z.object({
  firstName: z.string().trim().max(60).optional(),
  lastName: z.string().trim().max(60).optional(),
  title: z.string().trim().max(100).optional(),
  email: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  city: z.string().trim().max(80).optional(),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "unauthenticated" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { firstName, lastName, ...rest } = parsed.data;

  // Salva il nome completo sul User record
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (fullName) {
    await prisma.user.update({
      where: { id: user.id },
      data: { name: fullName },
    });
  }

  // Aggiorna anche il parsedProfileJson della CVDocument corrente
  const cv = await prisma.cVDocument.findFirst({
    where: { userId: user.id },
    select: { id: true, parsedProfileJson: true },
    orderBy: { createdAt: "desc" },
  });
  if (cv) {
    let existing: Record<string, unknown> = {};
    try {
      existing = cv.parsedProfileJson ? JSON.parse(cv.parsedProfileJson) : {};
    } catch {
      existing = {};
    }
    const updated = {
      ...existing,
      firstName: firstName ?? existing.firstName ?? "",
      lastName: lastName ?? existing.lastName ?? "",
      ...rest,
    };
    await prisma.cVDocument.update({
      where: { id: cv.id },
      data: { parsedProfileJson: JSON.stringify(updated) },
    });
  }

  return NextResponse.json({ ok: true });
}
