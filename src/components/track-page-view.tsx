"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const VID_KEY = "lv_vid";
/** Ritardo "umano": un bot che carica e scappa non arriva a inviare il beacon. */
const HUMAN_DELAY_MS = 1500;

/** Id visitatore persistente (localStorage). Prefisso `v_` = generato dal client. */
function visitorId(): string | null {
  try {
    const existing = window.localStorage.getItem(VID_KEY);
    if (existing && /^v_[A-Za-z0-9_-]{16,40}$/.test(existing)) return existing;
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    const id =
      "v_" +
      Array.from(bytes, (b) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"[b & 63]).join("");
    window.localStorage.setItem(VID_KEY, id);
    return id;
  } catch {
    return null; // storage bloccato: il server ripiega sul cookie lv_sid
  }
}

function send(pathname: string) {
  try {
    const body = JSON.stringify({
      path: pathname,
      // Reddit/Telegram/app in-app browser spesso non passano il referrer:
      // gli utm nel link sono l'attribuzione affidabile.
      referrer: (() => {
        const q = new URLSearchParams(window.location.search);
        const src = q.get("utm_source");
        if (src) return `utm:${src.slice(0, 40)}${q.get("utm_medium") ? `/${q.get("utm_medium")!.slice(0, 30)}` : ""}`;
        return document.referrer || null;
      })(),
      vid: visitorId(),
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
}

/**
 * Page view beacon. Mounted nel root layout una sola volta; si attiva ad ogni cambio di
 * pathname (Next.js client-side nav). Anti-bot lato client:
 *   - niente beacon se `navigator.webdriver` (Selenium/Puppeteer/Playwright);
 *   - parte solo a pagina visibile, dopo ~1.5s o alla prima interazione (quello che arriva prima);
 *   - annullato se il pathname cambia o il componente si smonta prima.
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
    if (typeof navigator !== "undefined" && navigator.webdriver) return;

    let done = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const interactions = ["pointerdown", "keydown", "scroll", "touchstart"] as const;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      document.removeEventListener("visibilitychange", onVisibility);
      for (const ev of interactions) window.removeEventListener(ev, fire);
    };
    function fire() {
      if (done || document.visibilityState !== "visible") return;
      done = true;
      cleanup();
      send(pathname!);
    }
    function startTimer() {
      if (timer || done) return;
      timer = setTimeout(fire, HUMAN_DELAY_MS);
    }
    function onVisibility() {
      if (document.visibilityState === "visible") startTimer();
      else if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }

    document.addEventListener("visibilitychange", onVisibility);
    for (const ev of interactions) window.addEventListener(ev, fire, { passive: true });
    if (document.visibilityState === "visible") startTimer();

    return () => {
      done = true;
      cleanup();
    };
  }, [pathname]);

  return null;
}
