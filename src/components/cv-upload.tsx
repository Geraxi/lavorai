"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Icon } from "@/components/design/icon";

/** Reuse the existing authenticated CV upload; no application is triggered. */
export function CVUpload() {
  const router = useRouter();
  const en = useLocale() === "en";
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  async function upload(event: React.FormEvent) {
    event.preventDefault();
    if (!file || inFlight.current) return;
    if (file.size > 10 * 1024 * 1024) { setError(en ? "Choose a file under 10 MB." : "Scegli un file di massimo 10 MB."); return; }
    inFlight.current = true; setBusy(true); setError("");
    try {
      const data = new FormData(); data.set("cv", file);
      const response = await fetch("/api/onboarding/cv", { method: "POST", body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || (en ? "Upload failed. Try again." : "Caricamento non riuscito. Riprova."));
      setComplete(true); router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : (en ? "Connection failed. Try again." : "Errore di rete. Riprova.")); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <form onSubmit={upload} style={{ width: "100%", maxWidth: 420, display: "grid", gap: 12, textAlign: "left", marginTop: 12 }}>
    <span className="ds-label">{en ? "Your CV · PDF or DOCX, up to 10 MB" : "Il tuo CV · PDF o DOCX, massimo 10 MB"}</span>
    {/* Styled picker: the native control's text follows the browser locale (e.g. "No file chosen"). */}
    <label htmlFor="profile-cv-upload" className={`pm-file${file ? " has-file" : ""}`}>
      <input id="profile-cv-upload" className="pm-file-input" type="file" accept=".pdf,.docx" disabled={busy || complete} required onChange={event => { setFile(event.target.files?.[0] ?? null); setError(""); }} />
      <Icon name="file" size={15} />
      <span className="pm-file-name">{file ? file.name : (en ? "Choose a file" : "Scegli un file")}</span>
      <span className="pm-file-action">{file ? (en ? "Change" : "Cambia") : (en ? "Browse" : "Sfoglia")}</span>
    </label>
    {error && <p role="alert" style={{ color: "var(--red-ds)", fontSize: 13 }}>{error}</p>}
    {complete ? <p role="status">{en ? "CV uploaded. Your profile is updating…" : "CV caricato. Aggiornamento del profilo…"}</p> : <button type="submit" disabled={busy || !file} className="ds-btn ds-btn-primary"><Icon name="upload" size={15} />{busy ? (en ? "Uploading…" : "Caricamento…") : (en ? "Upload CV" : "Carica il CV")}</button>}
  </form>;
}
