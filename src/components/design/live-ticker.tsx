"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/design/icon";

interface Item {
  id: string;
  html: string;
  time: string;
  fresh: boolean;
}

const COMPANIES = [
  "Satispay", "Scalapay", "Nexi", "Bending Spoons", "Casavo",
  "Everli", "Subito", "MoneyFarm", "Docebo", "Young Platform",
];
const ROLES = [
  "Product Designer", "Senior UX Designer", "UX Designer",
  "Senior Product Designer", "Design Lead", "UI Designer",
];

const TEMPLATES = [
  "candidatura inviata a <strong>{C}</strong>",
  "lettera motivazionale generata per <strong>{R}</strong> · <span class=\"muted\">{C}</span>",
  "CV adattato al JD di <strong>{C}</strong>",
  "<strong>{C}</strong> ha visualizzato la tua candidatura",
  "nuovo annuncio compatibile: <strong>{R}</strong> · {C} <span class=\"muted\">match {M}%</span>",
  "<strong>{C}</strong> ha richiesto un colloquio",
];

const SEED: Omit<Item, "id">[] = [
  { html: "candidatura inviata a <strong>Satispay</strong>", time: "09:42:18", fresh: false },
  { html: "CV adattato al JD di <strong>Scalapay</strong>", time: "09:41:02", fresh: false },
  { html: "nuovo annuncio compatibile: <strong>Senior UX Designer</strong> · Nexi <span class=\"muted\">match 88%</span>", time: "09:38:55", fresh: false },
  { html: "<strong>Bending Spoons</strong> ha visualizzato la tua candidatura", time: "09:32:44", fresh: false },
  { html: "lettera motivazionale generata per <strong>Product Designer</strong> · <span class=\"muted\">Casavo</span>", time: "09:29:11", fresh: false },
  { html: "candidatura inviata a <strong>Casavo</strong>", time: "09:28:03", fresh: false },
  { html: "<strong>Everli</strong> ha richiesto un colloquio", time: "09:14:22", fresh: false },
  { html: "CV adattato al JD di <strong>Docebo</strong>", time: "09:02:51", fresh: false },
];

function makeItem(): Item {
  const template = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
  const company = COMPANIES[Math.floor(Math.random() * COMPANIES.length)];
  const role = ROLES[Math.floor(Math.random() * ROLES.length)];
  const match = 75 + Math.floor(Math.random() * 21);
  const html = template
    .replaceAll("{C}", company)
    .replaceAll("{R}", role)
    .replaceAll("{M}", String(match));
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
  return { id: crypto.randomUUID(), html, time, fresh: true };
}

export function LiveTicker() {
  const [items, setItems] = useState<Item[]>(() =>
    SEED.map((b, i) => ({ ...b, id: String(i) })),
  );
  const [running, setRunning] = useState(true);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setItems((prev) => [makeItem(), ...prev].slice(0, 24));
    }, 3200);
    return () => clearInterval(id);
  }, [running]);

  return (
    <div className="ds-ticker">
      <div className="ds-ticker-head">
        <div className="ds-section-head-title">
          <span
            className={`ds-dot ds-dot-green${running ? " ds-dot-pulse" : ""}`}
          />
          Attività in tempo reale
        </div>
        <button
          type="button"
          className="ds-btn ds-btn-sm ds-btn-ghost"
          onClick={() => setRunning((r) => !r)}
        >
          <Icon name={running ? "pause" : "play"} size={12} />{" "}
          {running ? "Pausa" : "Riprendi"}
        </button>
      </div>
      <div className="ds-ticker-body">
        {items.map((t, i) => (
          <div
            key={t.id}
            className={`ds-ticker-item${i === 0 && t.fresh ? " new" : ""}`}
          >
            <span className="ds-ticker-time">{t.time}</span>
            <span
              className="ds-ticker-text"
              dangerouslySetInnerHTML={{ __html: t.html }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
