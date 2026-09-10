"use client";

/**
 * Selettore periodo per le pagine admin: aggiorna il query param (default
 * `range`) e ricarica i dati server-side. Sostituisce i FakeSelect.
 */

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Suspense, useTransition } from "react";

const DEFAULT_OPTIONS = [1, 7, 14, 30, 90];

function RangeSelectInner({ value, options = DEFAULT_OPTIONS, param = "range" }: { value: number; options?: number[]; param?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  return (
    <select
      value={String(value)}
      aria-label="Periodo"
      disabled={pending}
      onChange={(e) => {
        const p = new URLSearchParams(sp.toString());
        p.set(param, e.target.value);
        start(() => router.push(`${pathname}?${p.toString()}`));
      }}
      className="adm-btn"
      style={{ appearance: "none", WebkitAppearance: "none", paddingRight: 26, backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='3'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center", opacity: pending ? 0.6 : 1 }}
    >
      {options.map((d) => <option key={d} value={d}>{d === 1 ? "Ultime 24 ore" : `Ultimi ${d} giorni`}</option>)}
    </select>
  );
}

export function AdminRangeSelect(props: { value: number; options?: number[]; param?: string }) {
  return (
    <Suspense fallback={<span className="adm-btn" style={{ opacity: 0.6 }}>{props.value === 1 ? "Ultime 24 ore" : `Ultimi ${props.value} giorni`}</span>}>
      <RangeSelectInner {...props} />
    </Suspense>
  );
}
