"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

export function AdminPeriodPicker({ range = "30", from = "", to = "" }: { range?: string; from?: string; to?: string }) {
  const router = useRouter(); const path = usePathname(); const search = useSearchParams(); const [pending, start] = useTransition();
  const [mode, setMode] = useState(range); const [startDate, setStartDate] = useState(from); const [endDate, setEndDate] = useState(to);
  const update = (next: string, customFrom = startDate, customTo = endDate) => {
    setMode(next); const p = new URLSearchParams(search.toString()); p.set("range", next);
    if (next === "custom" && customFrom && customTo) { p.set("from", customFrom); p.set("to", customTo); } else { p.delete("from"); p.delete("to"); }
    start(() => router.push(`${path}?${p.toString()}`));
  };
  return <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
    {["7", "30", "90"].map((value) => <button type="button" key={value} onClick={() => update(value)} className="adm-btn" style={{ background: mode === value ? "hsl(var(--primary) / .14)" : undefined, color: mode === value ? "hsl(var(--primary))" : undefined }}>{value}g</button>)}
    <button type="button" onClick={() => setMode("custom")} className="adm-btn" style={{ background: mode === "custom" ? "hsl(var(--primary) / .14)" : undefined }}>Personalizzato</button>
    {mode === "custom" && <><input aria-label="Data inizio" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="adm-btn" /><input aria-label="Data fine" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="adm-btn" /><button type="button" disabled={!startDate || !endDate || pending} onClick={() => update("custom")} className="adm-btn primary">Applica</button></>}
  </div>;
}
