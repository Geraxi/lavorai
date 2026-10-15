import { isLifetimeProPlus, normalizeTier } from "@/lib/billing";

export type BillingReadinessUser = { email: string; tier: string; subscriptionStatus: string | null; cardSetupAt?: Date | string | null };

/** Local subscription state is evidence of entitlement, not an inventory of cards. */
export function adminBillingReadiness(user: BillingReadinessUser) {
  if (isLifetimeProPlus(user.email)) return { label: "Lifetime", tone: "good", confirmed: true, detail: "Accesso permanente autorizzato; carta non richiesta." };
  if (user.tier === "free" && user.cardSetupAt) return { label: "Free attivo", tone: "good", confirmed: true, detail: "Carta salvata da Stripe. 5 candidature totali, nessun addebito automatico." };
  if (user.subscriptionStatus === "active") return { label: "Attivo", tone: "good", confirmed: true, detail: "Abbonamento attivo confermato da Stripe." };
  if (user.subscriptionStatus === "trialing") return { label: "In prova", tone: "good", confirmed: true, detail: "Abbonamento in prova confermato da Stripe." };
  if (user.subscriptionStatus === "pending_payment_method") return { label: "In verifica", tone: "warn", confirmed: false, detail: "Attivazione in attesa della verifica della carta; accesso bloccato." };
  if (normalizeTier(user.tier) !== "free") return { label: "Assegnato", tone: "neutral", confirmed: false, detail: "Piano assegnato conservato; abbonamento Stripe non confermato. Verificare prima degli invii." };
  if (user.subscriptionStatus) return { label: "Non attivo", tone: "warn", confirmed: false, detail: `Stato abbonamento: ${user.subscriptionStatus}. Accesso da riattivare.` };
  return { label: "Da verificare", tone: "neutral", confirmed: false, detail: "Nessun abbonamento confermato nei dati locali. Non dimostra l’assenza di una carta su Stripe." };
}
