"use client";
import { useEffect } from "react";
import { captureFunnel } from "@/lib/posthog/client";

const trackedClicks = new WeakSet<Event>();

/** Adds measurement to server-rendered walls without changing their markup. */
export function AnalyticsUpgradeWall({ target = "pro" }: { target?: "pro" | "pro_plus" }) {
  useEffect(() => {
    captureFunnel("upgrade_wall_viewed");
    function click(event: MouseEvent) {
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[data-analytics-upgrade]") : null;
      if (link?.dataset.analyticsUpgrade === target && !trackedClicks.has(event)) {
        trackedClicks.add(event);
        captureFunnel("upgrade_clicked", { target_plan: target });
      }
    }
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, [target]);
  return null;
}
