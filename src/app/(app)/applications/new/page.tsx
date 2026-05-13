"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Icon } from "@/components/design/icon";

/**
 * Pagina per importare una candidatura fatta fuori da LavorAI.
 *
 * Use case: l'utente si è candidato direttamente su un sito carriere
 * o LinkedIn e vuole registrarla qui per (a) tenere traccia centrale
 * (b) attivare l'Interview Copilot per quel ruolo specifico.
 */
export default function ManualApplicationPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [appliedAt, setAppliedAt] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [userStatus, setUserStatus] = useState("inviata");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!company.trim() || !title.trim()) {
      toast.error("Azienda e ruolo sono obbligatori.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/applications/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company,
          title,
          jobUrl: jobUrl || undefined,
          location: location || undefined,
          description: description || undefined,
          appliedAt,
          userStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message ?? "Errore creazione candidatura");
        setLoading(false);
        return;
      }
      toast.success("Candidatura importata");
      // Vai alla pagina di prep colloquio per questa application
      router.push(`/interview/prep/${data.applicationId}`);
    } catch {
      toast.error("Errore di rete, riprova");
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px" }}>
      <Link
        href="/applications"
        style={{
          fontSize: 13,
          color: "var(--fg-muted)",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 20,
        }}
      >
        <Icon name="chevron-right" size={11} style={{ transform: "rotate(180deg)" }} />
        Torna alle candidature
      </Link>

      <h1
        style={{
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          marginBottom: 8,
        }}
      >
        Importa candidatura
      </h1>
      <p
        style={{
          fontSize: 14.5,
          color: "var(--fg-muted)",
          lineHeight: 1.55,
          marginBottom: 28,
        }}
      >
        Hai già candidato fuori da LavorAI? Registralo qui per tenere tutto
        in un posto e attivare l&apos;Interview Copilot per quel colloquio.
      </p>

      <form
        onSubmit={onSubmit}
        style={{ display: "flex", flexDirection: "column", gap: 18 }}
      >
        <Field label="Azienda *" hint="Nome dell'azienda a cui ti sei candidato">
          <input
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Monzo"
            required
            className="ds-input"
          />
        </Field>

        <Field label="Ruolo *" hint="Titolo esatto dell'annuncio">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Senior Product Manager, FinCrime"
            required
            className="ds-input"
          />
        </Field>

        <Field label="URL annuncio" hint="Opzionale ma utile: il Copilot legge la JD per personalizzare le risposte">
          <input
            type="url"
            value={jobUrl}
            onChange={(e) => setJobUrl(e.target.value)}
            placeholder="https://job-boards.greenhouse.io/monzo/jobs/..."
            className="ds-input"
          />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Location" hint="Città o 'Remote'">
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="London"
              className="ds-input"
            />
          </Field>
          <Field label="Data candidatura">
            <input
              type="date"
              value={appliedAt}
              onChange={(e) => setAppliedAt(e.target.value)}
              className="ds-input"
            />
          </Field>
        </div>

        <Field label="Stato attuale">
          <select
            value={userStatus}
            onChange={(e) => setUserStatus(e.target.value)}
            className="ds-input"
          >
            <option value="inviata">Inviata, aspetto risposta</option>
            <option value="vista">Vista dal recruiter</option>
            <option value="colloquio">Colloquio fissato</option>
            <option value="offerta">Offerta ricevuta</option>
            <option value="rifiutata">Rifiutata</option>
          </select>
        </Field>

        <Field
          label="Descrizione job (opzionale)"
          hint="Incolla la JD se non hai l'URL — il Copilot legge tutto"
        >
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Incolla qui la job description completa..."
            rows={5}
            className="ds-input"
            style={{ resize: "vertical", fontFamily: "inherit" }}
          />
        </Field>

        <div
          style={{
            display: "flex",
            gap: 12,
            marginTop: 8,
            flexWrap: "wrap",
          }}
        >
          <button
            type="submit"
            disabled={loading}
            className="ds-btn ds-btn-primary"
            style={{ padding: "12px 22px", fontSize: 14 }}
          >
            {loading ? (
              <>
                <Icon name="refresh" size={14} /> Importo...
              </>
            ) : (
              <>
                Importa e prepara il colloquio <Icon name="arrow-right" size={13} />
              </>
            )}
          </button>
          <Link
            href="/applications"
            className="ds-btn"
            style={{ padding: "12px 22px", fontSize: 14 }}
          >
            Annulla
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "-0.005em" }}>
        {label}
      </span>
      {children}
      {hint && (
        <span style={{ fontSize: 11.5, color: "var(--fg-subtle)", lineHeight: 1.45 }}>
          {hint}
        </span>
      )}
    </label>
  );
}
