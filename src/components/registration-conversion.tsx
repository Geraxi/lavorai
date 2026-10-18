"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useConsent } from "@/components/consent/use-consent";
import { hasConsent } from "@/lib/consent/client-store";
import { loadMetaPixel, trackCompleteRegistration, type PixelDocument, type PixelWindow } from "@/lib/consent/meta-pixel";
import { claimAndSendRegistration } from "@/lib/consent/registration-claim";

/**
 * Sends Meta `CompleteRegistration` at most once per real new account.
 *
 * Runs on the first authenticated page view of a browser session, after the
 * consent region is resolved. The server hands out the opaque eventId only
 * on the FIRST claim within 30 minutes of account creation and only when
 * advertising consent is effective; the claim consumes the event either way
 * (see src/lib/registration-conversion.ts). No PII in params or URLs.
 */
export function RegistrationConversion() {
  const { data, status } = useSession();
  const { effective } = useConsent();
  const ran = useRef<string | null>(null);
  const userId = data?.user?.id ?? null;
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim();
  const pathname = usePathname() ?? "";
  // The auth pages hard-navigate right after sign-in, which could cut off a
  // queued pixel request after the claim already consumed the event. Claim on
  // the page the user lands on instead (onboarding / dashboard / settings).
  const onAuthPage = /^\/(signup|login)(\/|$)/.test(pathname);

  useEffect(() => {
    if (onAuthPage) return;
    if (status !== "authenticated" || !userId || !effective.ready) return;
    if (ran.current === userId) return;
    ran.current = userId;
    const win = window as unknown as PixelWindow;
    const doc = document as unknown as PixelDocument;
    let local: Storage | null = null;
    let session: Storage | null = null;
    try { local = window.localStorage; session = window.sessionStorage; } catch { /* blocked */ }
    void claimAndSendRegistration({
      userId,
      advertisingAllowed: () => Boolean(pixelId) && hasConsent("advertising"),
      post: (path, body) => fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      }),
      local,
      session,
      send: (eventId) => {
        if (!pixelId || !hasConsent("advertising")) return false;
        loadMetaPixel(win, doc, pixelId);
        return trackCompleteRegistration(win, eventId, () => hasConsent("advertising"));
      },
    });
  }, [onAuthPage, status, userId, effective.ready, pixelId]);

  return null;
}
