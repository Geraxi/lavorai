"use client";

import { useEffect } from "react";

/**
 * Theme toggle DISABILITATO per brand direction "white + green only".
 *
 * Mantengo il componente esistente per backward-compat (è ancora
 * importato in dashboard/page.tsx), ma:
 *   - nasconde il bottone (render null)
 *   - rimuove eventuale `data-theme="dark"` salvato in localStorage
 *     da una vecchia sessione, così l'utente non resta bloccato in
 *     dark mode se ha cliccato il toggle prima del rebrand
 *
 * Se in futuro vuoi reintrodurre dark mode, ripristina il vecchio file
 * dal commit precedente + uncomment il blocco [data-theme="dark"] in
 * globals.css.
 */
export function ThemeToggle() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      // Pulisci eventuale state legacy
      document.documentElement.removeAttribute("data-theme");
      localStorage.removeItem("lavorai-theme");
    } catch {
      /* sandboxed iframe / private mode */
    }
  }, []);
  return null;
}
