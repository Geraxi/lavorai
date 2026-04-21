"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/design/icon";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved =
      (localStorage.getItem("lavorai-theme") as "light" | "dark" | null) ??
      "light";
    setTheme(saved);
    applyTheme(saved);
  }, []);

  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    applyTheme(next);
    localStorage.setItem("lavorai-theme", next);
  }

  return (
    <button
      type="button"
      className="ds-btn ds-btn-ghost"
      aria-label="Cambia tema"
      onClick={toggle}
      style={{ width: 32, height: 32, padding: 0 }}
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} size={14} />
    </button>
  );
}

function applyTheme(t: "light" | "dark") {
  if (t === "dark") document.documentElement.setAttribute("data-theme", "dark");
  else document.documentElement.removeAttribute("data-theme");
}
