"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

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
export function ThemeToggle({ compact = true, fullWidth = false, locale = "it" }: { compact?: boolean; fullWidth?: boolean; locale?: string }) {
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
  const label = locale === "en" ? (theme === "light" ? "Dark theme" : "Light theme") : (theme === "light" ? "Tema scuro" : "Tema chiaro");

  return (
    <button
      type="button"
      className={`ds-btn ds-btn-sm pm-theme-toggle${compact ? " is-icon" : ""}`}
      onClick={() => {
        applyTheme(next);
        setTheme(next);
      }}
      aria-label={label}
      title={label}
      style={{ opacity: ready ? 1 : 0.6, gap: 6, ...(fullWidth ? { width: "100%", justifyContent: "center" } : {}) }}
    >
      {theme === "light" ? <Moon size={14} strokeWidth={1.75} aria-hidden /> : <Sun size={14} strokeWidth={1.75} aria-hidden />}
      {!compact && label}
    </button>
  );
}

/**
 * Selettore tema a pillola (Chiaro / Scuro) per la top bar. Stesso
 * meccanismo di ThemeToggle: data-theme su <html> + localStorage.
 * Radiogroup con frecce sinistra/destra; su telefono solo icone.
 */
export function ThemePill({ locale = "it" }: { locale?: string }) {
  const en = locale === "en";
  const [theme, setTheme] = useState<Theme>("dark");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setTheme(readTheme());
    setReady(true);
    const onChange = (e: Event) => setTheme((e as CustomEvent<Theme>).detail);
    window.addEventListener("lavorai:theme", onChange);
    return () => window.removeEventListener("lavorai:theme", onChange);
  }, []);

  const options: Array<{ value: Theme; label: string; Icon: typeof Sun }> = [
    { value: "light", label: en ? "Light" : "Chiaro", Icon: Sun },
    { value: "dark", label: en ? "Dark" : "Scuro", Icon: Moon },
  ];
  const choose = (t: Theme, focus = false) => {
    if (t !== theme) { applyTheme(t); setTheme(t); }
    if (focus) document.getElementById(`pm-theme-opt-${t}`)?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={en ? "Theme" : "Tema"}
      className="pm-theme-pill"
      data-active={theme}
      data-ready={ready ? "" : undefined}
      onKeyDown={(e) => {
        if (["ArrowLeft", "ArrowUp"].includes(e.key)) { e.preventDefault(); choose("light", true); }
        if (["ArrowRight", "ArrowDown"].includes(e.key)) { e.preventDefault(); choose("dark", true); }
      }}
    >
      <span className="pm-theme-pill-thumb" aria-hidden />
      {options.map(({ value, label, Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            id={`pm-theme-opt-${value}`}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            tabIndex={active ? 0 : -1}
            className="pm-theme-pill-opt"
            onClick={() => choose(value)}
          >
            <Icon size={14} strokeWidth={1.75} aria-hidden />
            <span className="pm-theme-pill-label">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
