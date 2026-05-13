import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { canAccess, type PremiumFeature } from "@/lib/billing";

/**
 * Server-side gate per API routes premium.
 *
 * Uso:
 *   const gate = await guardPremiumAPI("founder_coach");
 *   if (gate.error) return gate.error;
 *   const user = gate.user;
 *
 * Restituisce 401 se non loggato, 402 (Payment Required) se loggato ma
 * senza il tier giusto. 402 è semanticamente corretto e permette al
 * client di sapere DA RIDIRIGERE A /pricing invece di trattare come
 * unknown error.
 */
export async function guardPremiumAPI(feature: PremiumFeature) {
  const user = await getCurrentUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "auth_required" }, { status: 401 }),
      user: null,
    };
  }
  if (!canAccess({ tier: user.tier, email: user.email }, feature)) {
    return {
      error: NextResponse.json(
        {
          error: "payment_required",
          feature,
          message:
            "Questa funzionalità è inclusa nel piano Pro+ (€39.99/mese). Vai a /pricing per attivarla.",
          upgradeUrl: "/pricing",
        },
        { status: 402 },
      ),
      user: null,
    };
  }
  return { error: null, user };
}

/**
 * Server-side check per RSC pages. Ritorna `null` se l'utente può
 * accedere (lascia la pagina renderizzare normalmente), altrimenti
 * ritorna un boolean true che la pagina usa per renderizzare il
 * <PaywallGate /> in-page invece dei contenuti.
 *
 * Non usiamo redirect() per dare un'esperienza migliore: l'utente
 * vede esattamente cosa sta per sbloccare prima di andare al
 * checkout.
 */
export async function checkPremiumPage(feature: PremiumFeature): Promise<
  | { allowed: true; user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>> }
  | { allowed: false; user: Awaited<ReturnType<typeof getCurrentUser>> | null }
> {
  const user = await getCurrentUser();
  if (!user) return { allowed: false, user: null };
  const ok = canAccess({ tier: user.tier, email: user.email }, feature);
  if (ok) return { allowed: true, user };
  return { allowed: false, user };
}
