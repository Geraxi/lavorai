"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, RefreshCw } from "lucide-react";

/** Copia negli appunti il testo dell'elemento #targetId. */
export function CopyTargetButton({ targetId, label = "Copia" }: { targetId: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="adm-btn sm"
      onClick={() => {
        const el = document.getElementById(targetId);
        if (!el) return;
        navigator.clipboard.writeText(el.innerText).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => void 0);
      }}
    >
      <Copy size={11} />{done ? "Copiato" : label}
    </button>
  );
}

/** Lancia il sync del pool annunci (GET /api/admin/sync-jobs, sessione admin). */
export function SyncJobsButton({ label = "Sync", small = true }: { label?: string; small?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={`adm-btn ${small ? "sm" : ""}`}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try { await fetch("/api/admin/sync-jobs"); router.refresh(); } finally { setBusy(false); }
      }}
    >
      <RefreshCw size={11} className={busy ? "animate-spin" : undefined} />{busy ? "In corso…" : label}
    </button>
  );
}
