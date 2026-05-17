"use client";

import { useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

/**
 * Handler degli intent di billing che atterrano su /settings.
 *
 * Gestisce DUE casi, perché la catena di conversione passa entrambi:
 *
 * 1. ?upgrade=pro|pro_plus  (da /pricing → /login?plan=X → callbackUrl
 *    /settings?upgrade=X). Prima era un DEAD END: nessuno traduceva
 *    questo param in un checkout, l'utente atterrava su settings e
 *    non succedeva nulla. Ora auto-POSTa /api/stripe/checkout e
 *    redirige a Stripe.
 *
 * 2. ?subscribed=1  (success_url di Stripe dopo pagamento). Il webhook
 *    aggiorna user.tier nel DB ma può arrivare con qualche secondo di
 *    ritardo rispetto al redirect. Polliamo update() della sessione +
 *    router.refresh() finché il tier non risulta non-free, così il
 *    paywall si sblocca appena il webhook lande.
 */
export function PostCheckoutRefresh() {
  const params = useSearchParams();
  const router = useRouter();
  const { data: session, update } = useSession();
  const done = useRef(false);
  const attempts = useRef(0);

  const upgrade = params.get("upgrade");
  const subscribed = params.get("subscribed") === "1";

  // CASO 1: auto-trigger checkout da ?upgrade=<tier>
  useEffect(() => {
    if (done.current) return;
    if (upgrade !== "pro" && upgrade !== "pro_plus") return;
    done.current = true;
    (async () => {
      try {
        const res = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tier: upgrade }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body?.url) {
          window.location.href = body.url;
          return;
        }
        toast.error(
          body?.message ??
            "Checkout non disponibile in questo momento. Riprova dalle Impostazioni.",
        );
      } catch {
        toast.error("Errore di rete durante il checkout. Riprova.");
      }
    })();
  }, [upgrade]);

  // CASO 2: refresh post-pagamento con polling sulla latenza webhook
  useEffect(() => {
    if (!subscribed || done.current) return;
    let cancelled = false;

    async function poll() {
      if (cancelled || done.current) return;
      attempts.current += 1;
      try {
        await update();
      } catch {
        /* network blip — riprova */
      }
      const tier = session?.user?.tier;
      if (tier && tier !== "free") {
        done.current = true;
        toast.success("Abbonamento attivato — accesso premium sbloccato.");
        router.refresh();
        return;
      }
      if (attempts.current >= 5) {
        done.current = true;
        router.refresh();
        return;
      }
      setTimeout(poll, 1500 * attempts.current);
    }

    void poll();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribed]);

  return null;
}
