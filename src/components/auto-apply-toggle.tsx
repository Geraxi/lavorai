"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Icon } from "@/components/design/icon";

type Mode = "off" | "manual" | "hybrid" | "auto";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

/**
 * Toggle pause/resume dell'auto-apply.
 * - Click quando mode !== "off" → salva mode corrente in localStorage,
 *   setta autoApplyMode=off via PUT /api/preferences.
 * - Click quando mode === "off" → ripristina la mode precedente (da
 *   localStorage) o "hybrid" come fallback.
 *
 * Non gestisce qui la modale/picker — quella resta su /preferences.
 */
export function AutoApplyToggle() {
  const { data, mutate } = useSWR<{ autoApplyMode: Mode }>(
    "/api/preferences",
    fetcher,
  );
  const [busy, setBusy] = useState(false);
  const mode = (data?.autoApplyMode ?? "manual") as Mode;
  const paused = mode === "off";

  async function toggle() {
    setBusy(true);
    try {
      let nextMode: Mode;
      if (paused) {
        // Ripristino: leggi precedente da LS, fallback "hybrid"
        let prev: Mode = "hybrid";
        try {
          const v = localStorage.getItem("lavorai.prevAutoApplyMode");
          if (v === "manual" || v === "hybrid" || v === "auto") prev = v;
        } catch {
          /* noop */
        }
        nextMode = prev;
      } else {
        // Pausa: ricorda la mode corrente
        try {
          localStorage.setItem("lavorai.prevAutoApplyMode", mode);
        } catch {
          /* noop */
        }
        nextMode = "off";
      }
      const res = await fetch("/api/preferences/mode", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoApplyMode: nextMode }),
      });
      if (!res.ok) {
        toast.error("Impossibile aggiornare l'auto-apply");
        return;
      }
      toast.success(
        nextMode === "off"
          ? "Auto-apply in pausa"
          : `Auto-apply ripreso (${nextMode})`,
      );
      mutate();
    } catch {
      toast.error("Errore di rete");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy || !data}
      className={`ds-btn ${paused ? "ds-btn-primary" : ""}`}
      title={
        paused
          ? "Riprendi l'invio automatico delle candidature"
          : "Metti in pausa l'auto-apply globale"
      }
    >
      {busy ? (
        <>
          <Icon name="refresh" size={13} />{" "}
          {paused ? "Riprendo..." : "Metto in pausa..."}
        </>
      ) : paused ? (
        <>
          <Icon name="play" size={13} /> Riprendi auto-apply
        </>
      ) : (
        <>
          <Icon name="pause-circle" size={13} /> Pausa auto-apply
        </>
      )}
    </button>
  );
}
