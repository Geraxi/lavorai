"use client";

/**
 * Stato condiviso "zona a fuoco" della dashboard: il pannello nella colonna
 * destra sceglie una regione/paese/area, il globo ci zooma sopra e mostra
 * solo quella zona nelle statistiche del pannello.
 */

import { createContext, useContext, useMemo, useState } from "react";
import { REGIONS, type RegionInfo } from "@/lib/city-centroids";

interface FocusCtx {
  region: RegionInfo | null;
  setRegionKey: (key: string | null) => void;
}
const Ctx = createContext<FocusCtx>({ region: null, setRegionKey: () => {} });

export function DashboardFocusProvider({ children }: { children: React.ReactNode }) {
  const [key, setKey] = useState<string | null>(null);
  const value = useMemo<FocusCtx>(() => ({ region: REGIONS.find((r) => r.key === key) ?? null, setRegionKey: setKey }), [key]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDashboardFocus() {
  return useContext(Ctx);
}
