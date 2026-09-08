"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/design/icon";

type Theme = "light" | "dark";
const KEY = "lavorai-theme";

function readTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export function applyTheme(t: Theme) {
  if (t === "light") document.documentElement.setAttribute("data-theme", "light");
  else document.documentElement.removeAttribute("data-theme");
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new CustomEvent("lavorai:theme", { detail: t }));
}

/**
 * Toggle tema chiaro/scuro. Lo stato vero è l'attributo data-theme su
 * <html> (impostato prima del paint da ThemeScript); qui lo leggiamo
 * dopo il mount per evitare mismatch di idratazione.
 */
export function ThemeToggle({ compact = true }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setTheme(readTheme());
    setReady(true);
    const onChange = (e: Event) => setTheme((e as CustomEvent<Theme>).detail);
    window.addEventListener("lavorai:theme", onChange);
    return () => window.removeEventListener("lavorai:theme", onChange);
  }, []);

  const next: Theme = theme === "light" ? "dark" : "light";
  const label = theme === "light" ? "Tema scuro" : "Tema chiaro";

  return (
    <button
      type="button"
      className="ds-btn ds-btn-sm"
      onClick={() => {
        applyTheme(next);
        setTheme(next);
      }}
      aria-label={label}
      title={label}
      style={{ opacity: ready ? 1 : 0.6, gap: 6 }}
    >
      <Icon name={theme === "light" ? "sun" : "sparkles"} size={13} />
      {!compact && label}
    </button>
  );
}
