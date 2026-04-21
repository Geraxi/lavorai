import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { Resend } from "resend";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { moveFile } from "@/lib/storage";
import { normalizeTier, type Tier } from "@/lib/billing";

/**
 * NextAuth v5 config — Email magic link via Resend.
 * User si logga con email → riceve link → clicca → sessione creata.
 *
 * In prod servono:
 *  - AUTH_SECRET (openssl rand -hex 32)
 *  - AUTH_URL (es. https://lavorai.it)
 *  - RESEND_API_KEY
 *  - EMAIL_FROM (es. LavorAI <noreply@lavorai.it>) — dominio verificato
 */

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      tier: Tier;
      subscriptionStatus: string | null;
    } & DefaultSession["user"];
  }
}

const EMAIL_FROM =
  process.env.EMAIL_FROM ??
  process.env.RESEND_FROM_OVERRIDE ??
  "LavorAI <onboarding@resend.dev>";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // Credentials richiede strategy "jwt" — il Prisma adapter continua
  // a funzionare per email magic link + Account/User lookup.
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    verifyRequest: "/login?check=1",
    error: "/login?error=1",
  },
  providers: [
    Credentials({
      id: "password",
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === "string"
            ? credentials.email.trim().toLowerCase()
            : "";
        const password =
          typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        // Gate: email deve essere verificata prima di poter fare login.
        // Solo account con passwordHash vengono bloccati (i magic link
        // impliciterebbero la verifica).
        if (!user.emailVerified) {
          throw new Error("EmailNotVerified");
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
    {
      id: "email",
      type: "email",
      name: "Email",
      from: EMAIL_FROM,
      server: "",
      maxAge: 24 * 60 * 60, // 24h
      async sendVerificationRequest({ identifier, url }) {
        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) {
          // Dev fallback: niente Resend → stampa il link in console.
          if (process.env.NODE_ENV !== "production") {
            console.log(
              `\n\n🔑 [auth DEV] Magic link per ${identifier}:\n   ${url}\n\n`,
            );
            return;
          }
          console.error(
            "[auth] RESEND_API_KEY mancante — login via email non disponibile.",
          );
          throw new Error("Email provider non configurato. Contatta il supporto.");
        }
        const resend = new Resend(apiKey);
        const { error } = await resend.emails.send({
          from: EMAIL_FROM,
          to: identifier,
          subject: "Il tuo link di accesso a LavorAI",
          html: renderLoginEmail(url),
          text: `Accedi a LavorAI\n\nClicca per completare l'accesso: ${url}\n\nIl link scade tra 24 ore.\n\n— LavorAI`,
        });
        if (error) {
          console.error("[auth] Resend error", error);
          throw new Error("Invio email fallito. Riprova tra qualche minuto.");
        }
      },
    },
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Primo accesso: copia l'id nel token
      if (user?.id) {
        token.sub = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      // Porta id + tier + subscription dalla DB alla sessione
      const userId = typeof token.sub === "string" ? token.sub : null;
      if (session.user && userId) {
        session.user.id = userId;
        const dbUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { tier: true, subscriptionStatus: true, email: true, name: true },
        });
        session.user.tier = normalizeTier(dbUser?.tier);
        session.user.subscriptionStatus = dbUser?.subscriptionStatus ?? null;
        if (dbUser?.email) session.user.email = dbUser.email;
        if (dbUser?.name) session.user.name = dbUser.name;
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      // Primo signup → welcome email
      if (!user.email) return;
      try {
        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) return;
        const resend = new Resend(apiKey);
        const siteUrl =
          process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
        await resend.emails.send({
          from: EMAIL_FROM,
          to: user.email,
          subject: "Benvenuto in LavorAI 🎯",
          html: renderWelcomeEmail(siteUrl),
        });
      } catch (err) {
        console.error("[auth.events.createUser] welcome email failed", err);
      }
    },
    async signIn({ user }) {
      // Aggiorna lastLoginAt
      if (user.id) {
        await prisma.user
          .update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          })
          .catch(() => void 0);
      }
      // Adotta CV staged da /optimize (se presente e non scaduto)
      if (user.id && user.email) {
        await adoptStagedCv(user.id, user.email).catch((err) => {
          console.error("[auth.events.signIn] adoptStagedCv failed", err);
        });
      }
    },
  },
});

/**
 * Adotta una staging row di CV dal flow pubblico /optimize verso il User reale.
 * - Sposta il file dal path staging/ al path reale dell'utente
 * - Crea il CVDocument
 * - Imposta User.privacyConsentAt (solo se non già settato)
 * - Elimina la staging row
 * Best-effort: se qualcosa va storto, l'utente può ricaricare il CV manualmente
 * da /onboarding — non rompiamo mai il login.
 */
async function adoptStagedCv(userId: string, rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  const staged = await prisma.pendingCvSubmission.findUnique({
    where: { email },
  });
  if (!staged) return;

  // Cleanup se scaduto
  if (staged.expiresAt.getTime() < Date.now()) {
    await prisma.pendingCvSubmission.delete({ where: { email } }).catch(() => void 0);
    return;
  }

  // Non sovrascrivere un CV esistente
  const existing = await prisma.cVDocument.findFirst({
    where: { userId },
    select: { id: true },
  });
  if (existing) {
    await prisma.pendingCvSubmission.delete({ where: { email } }).catch(() => void 0);
    return;
  }

  // Sposta il file dal path staging a quello dell'utente reale (storage
  // abstraction: fs in dev, Supabase in prod).
  const finalPath = await moveFile(
    staged.storagePath,
    userId,
    "cv-source",
    staged.originalFilename,
  );

  // Estrazione AI del profilo (best-effort; fallback a regex dentro extractProfileAI)
  let parsedProfileJson: string | null = null;
  try {
    const { extractProfileAI } = await import("@/lib/cv-profile-ai");
    const profile = await extractProfileAI(staged.extractedText, email);
    parsedProfileJson = JSON.stringify(profile);
  } catch (err) {
    console.warn("[adoptStagedCv] profile extraction failed", err);
  }

  await prisma.cVDocument.create({
    data: {
      userId,
      originalFilename: staged.originalFilename,
      storagePath: finalPath,
      extractedText: staged.extractedText,
      parsedProfileJson,
    },
  });

  await prisma.user.update({
    where: { id: userId },
    data: {
      // Non sovrascrivere se già presente (updateMany with where clause would be cleaner,
      // ma qui sappiamo che nel primo signIn post-staging è sempre null)
      privacyConsentAt: staged.privacyConsentAt,
    },
  });

  await prisma.pendingCvSubmission.delete({ where: { email } });
}

function renderWelcomeEmail(siteUrl: string): string {
  return `<!doctype html>
<html lang="it">
  <body style="margin:0;padding:0;background:#FAFAF7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;color:#0F1012;">
    <div style="max-width:560px;margin:0 auto;padding:48px 24px;">
      <div style="font-size:18px;font-weight:700;letter-spacing:-0.02em;margin-bottom:32px;">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;background:#0F1012;color:#fff;font-size:12px;border-radius:5px;font-family:ui-monospace,monospace;margin-right:8px;vertical-align:-4px;">L</span>
        LavorAI
      </div>
      <h1 style="font-size:26px;font-weight:600;margin:0 0 14px;letter-spacing:-0.02em;">Benvenuto in LavorAI 🎯</h1>
      <p style="font-size:15px;line-height:1.6;color:#5B5D61;margin:0 0 20px;">
        Ciao! Benvenuto in LavorAI — il copilota italiano per la ricerca del lavoro.
      </p>
      <p style="font-size:15px;line-height:1.6;color:#5B5D61;margin:0 0 24px;">
        Ecco i prossimi 3 passi per iniziare:
      </p>
      <ol style="font-size:15px;line-height:1.7;color:#0F1012;padding-left:22px;margin:0 0 32px;">
        <li><strong>Carica il tuo CV</strong> — lo useremo come base per ogni candidatura</li>
        <li><strong>Imposta preferenze</strong> — ruoli, città, range RAL</li>
        <li><strong>Candidati con un click</strong> — LavorAI fa il resto</li>
      </ol>
      <a href="${siteUrl}/dashboard"
         style="display:inline-block;background:#0F1012;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:500;font-size:14px;">
        Vai alla dashboard →
      </a>
      <p style="font-size:12.5px;color:#8A8C90;margin:32px 0 0;line-height:1.5;">
        Hai 3 candidature gratis per provare. Il piano Pro parte da €19.99/mese e lo puoi cancellare con un click.
      </p>
      <hr style="border:none;border-top:1px solid #E6E4DD;margin:32px 0 16px;"/>
      <p style="font-size:11px;color:#8A8C90;line-height:1.5;margin:0;">
        Hai domande? Rispondi a questa email — arriva direttamente al fondatore.<br/>
        © 2026 LavorAI · Made in Italy 🇮🇹 · Dati in UE (Vercel Frankfurt + Supabase Frankfurt)
      </p>
    </div>
  </body>
</html>`;
}

function renderLoginEmail(url: string): string {
  return `<!doctype html>
<html lang="it">
  <body style="margin:0;padding:0;background:#FAFAF7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;color:#0F1012;">
    <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
      <div style="font-size:18px;font-weight:700;letter-spacing:-0.02em;margin-bottom:32px;">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;background:#0F1012;color:#fff;font-size:12px;border-radius:5px;font-family:ui-monospace,monospace;margin-right:8px;vertical-align:-4px;">L</span>
        LavorAI
      </div>
      <h1 style="font-size:22px;font-weight:600;margin:0 0 12px;">Accedi al tuo account</h1>
      <p style="font-size:15px;line-height:1.5;color:#5B5D61;margin:0 0 24px;">
        Hai richiesto l'accesso a LavorAI. Clicca il pulsante qui sotto per completare il login.
      </p>
      <a href="${url}" style="display:inline-block;background:#0F1012;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:500;font-size:14px;">
        Accedi a LavorAI
      </a>
      <p style="font-size:12.5px;color:#8A8C90;margin:28px 0 0;line-height:1.5;">
        Il link scade tra 24 ore. Se non hai richiesto tu questo accesso, ignora questa email.
      </p>
      <hr style="border:none;border-top:1px solid #E6E4DD;margin:32px 0 16px;"/>
      <p style="font-size:11px;color:#8A8C90;line-height:1.5;margin:0;">
        Hai problemi? Copia e incolla questo link nel browser:<br/>
        <span style="word-break:break-all;color:#5B5D61;">${url}</span>
      </p>
    </div>
  </body>
</html>`;
}
