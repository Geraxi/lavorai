"use client";
import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { CONSENT_EVENT, CONSENT_KEY, hasAnalyticsConsent, identifyAnalyticsUser, resetAnalyticsUser, syncPostHogConsent } from "@/lib/posthog/client";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const previousUser = useRef<string | undefined>(undefined);
  const id = session?.user?.id;
  const plan = session?.user?.tier ?? "free";
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    function sync() {
      try {
        if (previousUser.current && previousUser.current !== id) resetAnalyticsUser();
        previousUser.current = id;
        const accepted = syncPostHogConsent();
        if (!id && status === "unauthenticated") resetAnalyticsUser(true);
        if (id) {
          if (accepted) identifyAnalyticsUser(id, plan);
          void fetch("/api/analytics/consent", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accepted: hasAnalyticsConsent() }), keepalive: true }).catch(() => {});
        }
      } catch { /* storage/network unavailable */ }
    }
    if (status !== "loading") sync();
    const storage = (event: StorageEvent) => { if (event.key === CONSENT_KEY || event.key === null) sync(); };
    window.addEventListener(CONSENT_EVENT, sync);
    window.addEventListener("storage", storage);
    return () => { window.removeEventListener(CONSENT_EVENT, sync); window.removeEventListener("storage", storage); };
  }, [id, plan, status]);
  return children;
}
