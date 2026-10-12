"use client";

import { useEffect, useState } from "react";
import type { OptimizedCVData } from "@/types/cv";

type Job = { id: string; title: string; company: string | null; location: string | null; description: string };
type Preview = { optimizedCV: OptimizedCVData; coverLetter: string; target: { title: string; company: string | null; location: string | null } };

/** The card trial never queues an application or invokes a second AI feature. */
export default function CardTrialOnboarding({ locale, email, verified, initialFilename, jobs }: {
  locale: "it" | "en"; email: string; verified: boolean; initialFilename: string | null; jobs: Job[];
}) {
  const en = locale === "en";
  const [filename, setFilename] = useState(initialFilename);
  const [jobId, setJobId] = useState("");
  const [lockedJobId, setLockedJobId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempted, setAttempted] = useState(false);
  const [message, setMessage] = useState("");
  const selected = jobs.find(job => job.id === jobId);

  useEffect(() => {
    let active = true;
    fetch("/api/onboarding/demo").then(async response => {
      const result = await response.json();
      if (!active) return;
      if (!response.ok) throw new Error("preview_status_unavailable");
      const saved = result.result;
      if (saved?.optimizedCV && saved?.coverLetter) setPreview(saved);
      if (result.jobId) { setJobId(result.jobId); setLockedJobId(result.jobId); }
      if (["reserved", "succeeded", "reconciliation_required"].includes(result.state)) setAttempted(true);
      if (result.state === "reconciliation_required") setMessage(en ? "Your preview needs a support check before any further generation." : "L'anteprima richiede una verifica dell'assistenza prima di altre generazioni.");
      if (result.state === "failed") setMessage(en ? "No preview was produced. You can retry for the same selected job." : "Nessuna anteprima prodotta. Puoi riprovare per la stessa offerta selezionata.");
    }).catch(() => {
      if (active) {
        setAttempted(true);
        setMessage(en ? "Could not load your saved preview. Reload before continuing." : "Impossibile caricare l'anteprima salvata. Ricarica prima di continuare.");
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [en]);

  async function upload(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true); setMessage("");
    try {
      const data = new FormData(); data.set("cv", file);
      const response = await fetch("/api/onboarding/cv", { method: "POST", body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || (en ? "Upload failed." : "Caricamento non riuscito."));
      setFilename(file.name);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Upload failed"); }
    finally { setBusy(false); }
  }

  async function generate() {
    if (!jobId || !filename || !verified || busy || attempted || preview) return;
    setBusy(true); setAttempted(true); setMessage("");
    try {
      const response = await fetch("/api/onboarding/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || (en ? "The preview could not be completed. Reload to check its status." : "L'anteprima non è stata completata. Ricarica per verificarne lo stato."));
      setPreview(result.preview ?? result);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Preview unavailable"); }
    finally { setBusy(false); }
  }

  async function manageSubscription() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/stripe/portal", { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.url) throw new Error();
      window.location.assign(result.url);
    } catch { setMessage(en ? "Could not open subscription management. Please try again later." : "Impossibile aprire la gestione dell'abbonamento. Riprova più tardi."); setBusy(false); }
  }

  async function resend() {
    setBusy(true);
    try {
      const response = await fetch("/api/auth/verify-email/resend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      if (!response.ok) throw new Error();
      setMessage(en ? "Check your email, then reload this page after verification." : "Controlla la tua email, poi ricarica questa pagina dopo la verifica.");
    } catch { setMessage(en ? "Could not resend. Try again later." : "Invio non riuscito. Riprova più tardi."); }
    finally { setBusy(false); }
  }

  const cv = preview?.optimizedCV;
  return <main className="mx-auto max-w-4xl px-6 py-12 text-foreground">
    <p className="text-sm font-semibold text-emerald-500">{en ? "3-day trial · card registered" : "Prova di 3 giorni · carta registrata"}</p>
    <h1 className="mt-3 text-3xl font-bold">{en ? "Your CV and cover letter, tailored to one job" : "CV e lettera su misura per un'offerta"}</h1>
    <p className="mt-4 text-muted-foreground">{en ? "Choose one real job. Your trial includes one saved preview. Applications and further AI features unlock only after your first successful subscription payment." : "Scegli un'offerta reale. La prova include una sola anteprima salvata. Candidature e altre funzioni AI si attivano solo dopo il primo pagamento dell'abbonamento riuscito."}</p>
    <p className="mt-3 text-sm"><button className="underline" disabled={busy} onClick={manageSubscription}>{en ? "Manage or cancel subscription" : "Gestisci o annulla abbonamento"}</button></p>
    {message && <p role="status" className="my-5 rounded-lg border p-4">{message}</p>}
    {!verified && <section className="my-6 rounded-xl border p-5"><p>{en ? "Verify your email before generating your preview." : "Verifica la tua email prima di generare l'anteprima."}</p><button className="mt-3 underline" disabled={busy} onClick={resend}>{en ? "Resend verification email" : "Reinvia email di verifica"}</button></section>}
    {loading ? <p className="mt-8" role="status">{en ? "Loading your preview…" : "Caricamento anteprima…"}</p> : preview && cv ? <section className="mt-8 space-y-6">
      <h2 className="text-xl font-bold">{preview.target?.title} {preview.target?.company ? `· ${preview.target.company}` : ""}</h2>
      <article className="space-y-5 rounded-xl border p-6">
        <h2 className="text-2xl font-bold">{cv.fullName}</h2>
        {cv.targetRole && <p>{cv.targetRole}</p>}
        <p>{[cv.email, cv.phone, cv.location, cv.linkedinUrl].filter(Boolean).join(" · ")}</p>
        <p className="whitespace-pre-line">{cv.summary}</p>
        <h3 className="text-lg font-semibold">{en ? "Experience" : "Esperienza"}</h3>
        {cv.experiences.map((item, index) => <section key={index}><h4 className="font-semibold">{item.role} · {item.company}</h4><p className="text-sm">{[item.location, `${item.startDate} – ${item.endDate}`].filter(Boolean).join(" · ")}</p><ul className="ml-5 list-disc">{item.bullets.map((bullet, i) => <li key={i}>{bullet}</li>)}</ul></section>)}
        <h3 className="text-lg font-semibold">{en ? "Education" : "Formazione"}</h3>
        {cv.education.map((item, index) => <section key={index}><h4 className="font-semibold">{item.degree} · {item.institution}</h4><p>{[item.location, `${item.startDate} – ${item.endDate}`].filter(Boolean).join(" · ")}</p>{item.notes && <p>{item.notes}</p>}</section>)}
        <h3 className="text-lg font-semibold">{en ? "Skills" : "Competenze"}</h3>
        <p>{[...cv.skills.technical, ...cv.skills.soft, ...cv.skills.tools].join(" · ")}</p>
        <h3 className="text-lg font-semibold">{en ? "Languages" : "Lingue"}</h3>
        <p>{cv.languages.map(item => `${item.language}: ${item.level}`).join(" · ")}</p>
      </article>
      <article className="rounded-xl border p-6"><h2 className="mb-4 text-xl font-bold">{en ? "Cover letter" : "Lettera di presentazione"}</h2><p className="whitespace-pre-line">{preview.coverLetter}</p></article>
      <p>{en ? "Saved preview. No application has been sent." : "Anteprima salvata. Nessuna candidatura inviata."}</p>
    </section> : attempted ? <p className="mt-8">{en ? "Your preview request has been used. Reload to check for a saved result; this does not generate another preview." : "La richiesta di anteprima è stata utilizzata. Ricarica per controllare il risultato salvato; non verrà generata una nuova anteprima."}</p> : <section className="mt-8 space-y-5">
      <label className="block font-semibold">{en ? "1. Upload your CV" : "1. Carica il tuo CV"}<input className="mt-2 block w-full rounded-lg border p-3 font-normal" type="file" accept=".pdf,.docx" disabled={busy} onChange={event => void upload(event.target.files?.[0])} /></label>
      {filename && <p>{en ? "CV ready:" : "CV pronto:"} {filename}</p>}
      <label className="block font-semibold" htmlFor="preview-job">{en ? "2. Choose your job" : "2. Scegli l'offerta"}</label>
      <select id="preview-job" className="w-full rounded-lg border bg-background p-3" value={jobId} disabled={busy || Boolean(lockedJobId)} onChange={event => setJobId(event.target.value)}><option value="">{en ? "Select a job" : "Seleziona un'offerta"}</option>{lockedJobId && !jobs.some(job => job.id === lockedJobId) && <option value={lockedJobId}>{en ? "Previously selected job" : "Offerta già selezionata"}</option>}{jobs.map(job => <option key={job.id} value={job.id}>{job.title} · {job.company ?? ""} · {job.location ?? ""}</option>)}</select>
      {!jobs.length && <p>{en ? "No open jobs are available right now. Please check again later." : "Al momento non ci sono offerte aperte. Controlla più tardi."}</p>}
      {selected && <article className="rounded-lg border p-4"><h2 className="font-semibold">{selected.title}</h2><p>{[selected.company, selected.location].filter(Boolean).join(" · ")}</p><p className="mt-3 whitespace-pre-line text-sm">{selected.description}</p></article>}
      <button className="rounded-lg bg-emerald-600 px-5 py-3 font-semibold text-white disabled:opacity-50" onClick={generate} disabled={!verified || !filename || !jobId || busy}>{busy ? (en ? "Preparing…" : "Preparazione…") : (en ? "Create my one preview" : "Crea la mia unica anteprima")}</button>
    </section>}
  </main>;
}
