import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { checkOrigin } from "@/lib/csrf";
import { deleteAllUserFiles } from "@/lib/storage";
import { cancelApplication } from "@/lib/application-queue";

export const runtime = "nodejs";
export const maxDuration = 60;

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

  // 1. Cancella i job BullMQ delle candidature in coda/processing (queued /
  //    awaiting_consent / optimizing / applying). L'update che il worker
  //    tenterebbe fallirebbe comunque dopo il delete user, ma rimuovere
  //    esplicitamente evita retry inutili e liberia la coda.
  const activeApps = await prisma.application.findMany({
    where: {
      userId: user.id,
      status: {
        in: [
          "awaiting_consent",
          "queued",
          "optimizing",
          "applying",
          "needs_session",
          "ready_to_apply",
        ],
      },
    },
    select: { id: true },
  });
  await Promise.allSettled(
    activeApps.map((a) => cancelApplication(a.id)),
  );

  // 2. Cancella tutti i file utente dallo storage (CV sorgente + CV ottimizzati
  //    per candidatura + cover letter DOCX + PDF tailored + foto profilo).
  //    Best-effort: se Blob/Supabase è giù, continuiamo comunque con il
  //    delete DB (GDPR Art.17 è priorità assoluta).
  await deleteAllUserFiles(user.id).catch((err) => {
    console.error("[account/delete] storage wipe failed, continuing", err);
  });

  // 3. Hard delete utente — cascade Prisma elimina: Account, Session,
  //    EmailVerificationToken, PasswordResetToken, UserPreferences, CVProfile,
  //    PortalSession, Application, CVDocument.
  await prisma.user.delete({ where: { id: user.id } });

  return NextResponse.json({
    ok: true,
    cancelledApplications: activeApps.length,
  });
}
