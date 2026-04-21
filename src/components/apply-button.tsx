"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/design/icon";

interface ApplyButtonProps {
  jobId: string;
  portal: string;
}

export function ApplyButton({ jobId, portal }: ApplyButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/applications/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, portal }),
      });
      const body = await res.json().catch(() => ({}));

      if (res.status === 409 && body?.error === "missing_cv") {
        toast.error("Carica il tuo CV prima di candidarti.");
        router.push("/onboarding");
        return;
      }
      if (res.status === 409 && body?.error === "missing_session") {
        toast.error(
          `Collega prima il tuo account ${portal}. (arriva in Sprint 5 con l'extension Chrome)`,
        );
        return;
      }
      if (!res.ok) {
        toast.error(body?.message ?? "Errore. Riprova tra qualche secondo.");
        return;
      }

      toast.success("Candidatura in coda! Ti avvisiamo appena è partita.");
      router.push("/applications");
    } catch {
      toast.error("Errore di rete. Controlla la connessione.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="ds-btn ds-btn-accent w-full"
      style={{ padding: "11px 18px", fontSize: 14 }}
    >
      {loading ? (
        <>
          <Icon name="refresh" size={14} /> Invio in corso...
        </>
      ) : (
        <>
          <Icon name="sparkles" size={14} /> Applica con LavorAI{" "}
          <Icon name="arrow-right" size={14} />
        </>
      )}
    </button>
  );
}
