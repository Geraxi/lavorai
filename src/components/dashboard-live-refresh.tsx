"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Triggera router.refresh() ogni 30s mentre la dashboard è in foreground.
 * Riesegue il server component (force-dynamic) e ricarica i conteggi:
 * candidature inviate, viewedAt → "Aperte dai recruiter" KPI ecc.
 *
 * Salta refresh quando il tab è nascosto (document.hidden) per non
 * sprecare query DB.
 */
export function DashboardLiveRefresh() {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      router.refresh();
    };
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [router]);
  return null;
}
