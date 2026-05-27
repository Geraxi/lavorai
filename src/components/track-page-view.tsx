"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Fire-and-forget page view beacon. Mounted nel root layout una sola volta.
 * Si attiva ad ogni cambio di pathname (Next.js client-side nav).
 */
export function TrackPageView() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    // Salta i path interni / admin (rumore).
    if (
      pathname.startsWith("/api/") ||
      pathname.startsWith("/admin") ||
      pathname.startsWith("/_next")
    )
      return;
    try {
      const body = JSON.stringify({
        path: pathname,
        referrer: document.referrer || null,
      });
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        navigator.sendBeacon("/api/track/view", blob);
      } else {
        fetch("/api/track/view", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => void 0);
      }
    } catch {
      // ignore
    }
  }, [pathname]);

  return null;
}
