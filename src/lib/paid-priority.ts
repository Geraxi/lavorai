import { isLifetimeProPlus, normalizeTier, trialState } from "@/lib/billing";

/**
 * Priorità di elaborazione per auto-apply cron e worker.
 *
 * Come sono salvati tier/prova (User):
 *  - `tier` ("free" | "pro" | "pro_plus") scritto dal webhook Stripe;
 *  - `subscriptionStatus` (Stripe): "active" = pagato, "trialing" = prova
 *    Stripe con carta, "past_due" | "paused" | "canceled" = non in regola;
 *  - Free con prova da registrazione (`trialState` attiva, vedi billing.ts)
 *    è trattato come Pro durante la prova;
 *  - whitelist lifetime Pro+ (isLifetimeProPlus) = pagato.
 *
 * Rank (più alto = prima): 4 Pro+ pagato, 3 Pro pagato, 2 Pro+ in prova,
 * 1 Pro in prova (Stripe o registrazione), 0 tutti gli altri.
 */
export type PriorityUser = {
  tier?: string | null;
  email?: string | null;
  subscriptionStatus?: string | null;
  createdAt?: Date | string;
  trialEndsAt?: Date | string | null;
  trialGraceEndsAt?: Date | string | null;
};

export const PAID_PRIORITY_RANK = { proPlusPaid: 4, proPaid: 3, proPlusTrial: 2, proTrial: 1, none: 0 } as const;

export function paidPriorityRank(user: PriorityUser | null | undefined): number {
  if (!user) return PAID_PRIORITY_RANK.none;
  if (isLifetimeProPlus(user.email)) return PAID_PRIORITY_RANK.proPlusPaid;
  const tier = normalizeTier(user.tier);
  const status = user.subscriptionStatus ?? null;
  if (tier !== "free") {
    const plus = tier === "pro_plus";
    if (status === "trialing") return plus ? PAID_PRIORITY_RANK.proPlusTrial : PAID_PRIORITY_RANK.proTrial;
    // null = tier concesso fuori da Stripe (admin/legacy): trattato come pagato.
    if (status === "active" || status === null) return plus ? PAID_PRIORITY_RANK.proPlusPaid : PAID_PRIORITY_RANK.proPaid;
    return PAID_PRIORITY_RANK.none; // past_due / paused / canceled
  }
  return trialState(user).status === "active" ? PAID_PRIORITY_RANK.proTrial : PAID_PRIORITY_RANK.none;
}

function time(v: Date | string | undefined | null): number {
  const t = v ? new Date(v).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
}

/** Ordina per rank desc, poi createdAt asc, stabile. Non muta l'input. */
export function sortByPaidPriority<T>(items: readonly T[], userOf: (item: T) => PriorityUser | null | undefined,
  createdAtOf: (item: T) => Date | string | undefined | null = () => null): T[] {
  return items
    .map((item, i) => ({ item, i, rank: paidPriorityRank(userOf(item)), at: time(createdAtOf(item)) }))
    .sort((a, b) => b.rank - a.rank || a.at - b.at || a.i - b.i)
    .map(x => x.item);
}

/** Finestra di lettura del worker: abbastanza larga da vedere righe paganti dietro a un backlog free. */
export function claimScanWindow(limit: number): number {
  return Math.min(500, Math.max(100, limit * 20));
}
