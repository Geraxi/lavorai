import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { checkOrigin } from "@/lib/csrf";
import { validatePassword } from "@/lib/password-policy";

export const runtime = "nodejs";

const Schema = z.object({
  currentPassword: z.string().max(100).optional(),
  newPassword: z.string().min(1).max(100),
});

/**
 * Cambia o imposta la password dell'utente autenticato.
 * - Se passwordHash esiste: richiede currentPassword corretta.
 * - Se non esiste (solo Google): imposta la prima password senza current.
 */
export async function POST(request: NextRequest) {
  try {
    if (!checkOrigin(request)) {
      return NextResponse.json(
        { error: "bad_origin", message: "Richiesta non autorizzata." },
        { status: 403 },
      );
    }

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "unauthenticated", message: "Devi essere autenticato." },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation", message: "Dati non validi." },
        { status: 400 },
      );
    }

    const { currentPassword, newPassword } = parsed.data;

    const pwCheck = validatePassword(newPassword);
    if (!pwCheck.ok) {
      return NextResponse.json(
        { error: "weak_password", message: pwCheck.message },
        { status: 400 },
      );
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    if (!dbUser) {
      return NextResponse.json(
        { error: "not_found", message: "Utente non trovato." },
        { status: 404 },
      );
    }

    if (dbUser.passwordHash) {
      if (!currentPassword) {
        return NextResponse.json(
          {
            error: "password_required",
            message: "Inserisci la password attuale.",
          },
          { status: 400 },
        );
      }
      const ok = await bcrypt.compare(currentPassword, dbUser.passwordHash);
      if (!ok) {
        return NextResponse.json(
          {
            error: "bad_password",
            message: "Password attuale non corretta.",
          },
          { status: 400 },
        );
      }
      const same = await bcrypt.compare(newPassword, dbUser.passwordHash);
      if (same) {
        return NextResponse.json(
          {
            error: "same_password",
            message: "La nuova password deve essere diversa da quella attuale.",
          },
          { status: 400 },
        );
      }
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    return NextResponse.json({
      ok: true,
      mode: dbUser.passwordHash ? "changed" : "set",
    });
  } catch (err) {
    console.error("[/api/account/password]", err);
    return NextResponse.json(
      { error: "internal", message: "Errore interno. Riprova." },
      { status: 500 },
    );
  }
}
