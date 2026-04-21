import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { checkOrigin } from "@/lib/csrf";

export const runtime = "nodejs";

const Schema = z.object({
  confirm: z.literal("ELIMINA"),
  password: z.string().optional(),
});

/**
 * GDPR Art.17 — Right to erasure.
 * Elimina l'account e tutti i dati correlati (cascade via Prisma).
 * Richiede conferma esplicita + password (se impostata).
 *
 * NOTA: i file fisici su storage (CV originali + DOCX generati) NON
 * vengono eliminati qui automaticamente. Per ora ci affidiamo al fatto
 * che senza CVDocument record sono orfani e possono essere puliti da
 * job batch. Per prod strict: aggiungere chiamata a storage.delete.
 */
export async function POST(request: NextRequest) {
  if (!checkOrigin(request)) {
    return NextResponse.json({ error: "bad_origin" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation",
        message: "Conferma con la parola ELIMINA per procedere.",
      },
      { status: 400 },
    );
  }

  // Se l'utente ha password, richiedi la password per confermare
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (dbUser?.passwordHash) {
    if (!parsed.data.password) {
      return NextResponse.json(
        { error: "password_required", message: "Inserisci la password per confermare." },
        { status: 400 },
      );
    }
    const ok = await bcrypt.compare(parsed.data.password, dbUser.passwordHash);
    if (!ok) {
      return NextResponse.json(
        { error: "bad_password", message: "Password non corretta." },
        { status: 400 },
      );
    }
  }

  await prisma.user.delete({ where: { id: user.id } });

  return NextResponse.json({ ok: true });
}
