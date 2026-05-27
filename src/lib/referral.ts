import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";

/**
 * Referral: ogni utente ha un codice univoco da condividere. Quando un
 * referred sale a Pro, entrambi guadagnano 1 mese gratis (gestione reward
 * via Stripe coupon / admin alert in v1).
 *
 * Codice: 8 char alfanumerici case-insensitive (lowercase). Generato al
 * primo accesso alla sezione referral (lazy) — evita migrazione di massa.
 */

const COOKIE = "lv_ref";

function genCode(): string {
  return randomBytes(6)
    .toString("base64url")
    .toLowerCase()
    .replace(/[-_]/g, "")
    .slice(0, 8);
}

/**
 * Restituisce il codice dell'utente, creandolo se assente. Idempotent.
 * Resiliente a collisioni (random 6 byte → spazio enorme; in pratica mai).
 */
export async function ensureReferralCode(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
  if (u?.referralCode) return u.referralCode;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = genCode();
    try {
      await prisma.user.update({ where: { id: userId }, data: { referralCode: code } });
      return code;
    } catch {
      // collisione rarissima → riprova
    }
  }
  throw new Error("Could not generate unique referral code");
}

/** Stats: quanti referred, quanti paganti. */
export async function getReferralStats(userId: string) {
  const referrals = await prisma.user.findMany({
    where: { referredById: userId },
    select: { id: true, tier: true, createdAt: true },
  });
  const total = referrals.length;
  const paying = referrals.filter((r) => r.tier === "pro" || r.tier === "pro_plus").length;
  return { total, paying };
}

/** Risolve un codice → userId. Null se inesistente o suo (no self-referral). */
export async function resolveReferralCode(code: string, selfUserId?: string): Promise<string | null> {
  const c = code.trim().toLowerCase();
  if (!c) return null;
  const u = await prisma.user.findUnique({ where: { referralCode: c }, select: { id: true } });
  if (!u) return null;
  if (selfUserId && u.id === selfUserId) return null;
  return u.id;
}

export const REFERRAL_COOKIE = COOKIE;
