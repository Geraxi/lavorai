import { readFile } from "node:fs/promises";
import type { PortalAdapter, ApplyInput, ApplyOutcome, PendingQuestion } from "./types";

/**
 * Recruitee — Careers Site API pubblica, candidatura via HTTP (niente browser):
 *   POST https://<careers-host>/api/offers/<slug>/candidates  (multipart)
 *   candidate[name], candidate[email], candidate[phone], candidate[cv],
 *   candidate[cover_letter], candidate[referrer], open_question_answers.
 * L'URL dell'annuncio è <careers-host>/o/<slug>[/c/new]; il careers host può
 * essere <tenant>.recruitee.com o un dominio custom (es. careers.bunq.com).
 */
const OFFER_RE = /\/o\/([^/?#]+)/i;

interface OpenQuestion { id: number; kind?: string; body?: string; required?: boolean; open_question_options?: Array<{ id: number; body: string }> }

export const recruiteeAdapter: PortalAdapter = {
  id: "recruitee",
  label: "Recruitee",
  matches(url: string): boolean {
    try {
      const u = new URL(url);
      return /(^|\.)recruitee\.com$/i.test(u.hostname) || OFFER_RE.test(u.pathname);
    } catch { return false; }
  },
  async apply(_page, input: ApplyInput): Promise<ApplyOutcome> {
    let origin = "";
    let slug = "";
    try {
      const u = new URL(input.jobUrl);
      origin = u.origin;
      slug = u.pathname.match(OFFER_RE)?.[1] ?? "";
    } catch { /* below */ }
    if (!origin || !slug) return { ok: false, status: "form_not_found", error: `URL Recruitee non riconosciuto: ${input.jobUrl}` };

    const headers = { Accept: "application/json", "User-Agent": "Mozilla/5.0 LavorAI/1.0" };
    // 1. Offerta: esiste ancora? domande obbligatorie?
    let questions: OpenQuestion[] = [];
    try {
      const r = await fetch(`${origin}/api/offers/${encodeURIComponent(slug)}`, { headers, signal: AbortSignal.timeout(15_000) });
      if (r.status === 404) return { ok: false, status: "job_closed", error: "Annuncio non più online (Recruitee 404)." };
      if (r.ok) {
        const j = (await r.json()) as { offer?: { status?: string; open_questions?: OpenQuestion[] } };
        if (j.offer?.status && j.offer.status !== "published") return { ok: false, status: "job_closed", error: `Annuncio Recruitee in stato ${j.offer.status}.` };
        questions = j.offer?.open_questions ?? [];
      }
    } catch (err) {
      return { ok: false, status: "unknown_error", error: `Recruitee offer lookup fallito: ${err instanceof Error ? err.message : err}` };
    }

    // 2. Domande obbligatorie: stessa catena degli altri adapter (risposte
    //    salvate → profilo → regole → Claude → default prudente in autonomo).
    const answers: Array<{ open_question_id: number; content?: string; flag?: boolean }> = [];
    const pending: PendingQuestion[] = [];
    const req = questions.filter((q) => q.required && (q.kind ?? "") !== "infobox");
    const fields = req.map((q, idx) => {
      const kind = (q.kind ?? "").toLowerCase();
      const label = (q.body ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const options = kind === "boolean" ? ["Yes", "No"] : q.open_question_options?.map((o) => o.body);
      const fkind: "text" | "textarea" | "select" | "checkbox" = kind === "boolean" ? "checkbox" : kind.includes("choice") ? "select" : kind === "text" ? "textarea" : "text";
      return { idx, label, kind: fkind, options, q };
    });
    const { answerOffline } = await import("./ai-answer");
    const { buildAnswerContext } = await import("./web-form");
    const res = await answerOffline(buildAnswerContext(input), fields.map(({ idx, label, kind, options }) => ({ idx, label, kind, options })));
    if (res.given.length > 0) input.onAiAnswers?.(res.given);
    for (const f of fields) {
      const v = res.answers.get(f.idx);
      const kind = (f.q.kind ?? "").toLowerCase();
      if (v == null) { pending.push({ label: f.label, kind: f.kind, options: f.options }); continue; }
      if (kind === "boolean") answers.push({ open_question_id: f.q.id, flag: /^(y|yes|s|sì|si|true|1)/i.test(v) });
      else answers.push({ open_question_id: f.q.id, content: v });
    }
    if (pending.length > 0) return { ok: false, status: "needs_user_input", error: `${pending.length} domande obbligatorie richiedono la tua risposta prima dell'invio.`, pendingQuestions: pending };
    if (input.dryRun) return { ok: true, status: "submitted", confirmation: "DRY_RUN" };

    // 3. Invio multipart
    const p = input.profile;
    const fd = new FormData();
    fd.set("candidate[name]", [p.firstName, p.lastName].filter(Boolean).join(" ").trim() || input.userEmail);
    fd.set("candidate[email]", p.email?.trim() || input.userEmail);
    const phone = p.phone?.trim() || input.userPhone;
    if (phone) fd.set("candidate[phone]", phone);
    if (input.coverLetterText) fd.set("candidate[cover_letter]", input.coverLetterText.slice(0, 5000));
    fd.set("candidate[referrer]", "LavorAI");
    try {
      const buf = await readFile(input.cvLocalPath);
      const name = input.cvLocalPath.split(/[\\/]/).pop() || "cv.pdf";
      fd.set("candidate[cv]", new Blob([buf], { type: name.endsWith(".pdf") ? "application/pdf" : "application/octet-stream" }), name);
    } catch (err) {
      return { ok: false, status: "missing_field", error: `CV non leggibile: ${err instanceof Error ? err.message : err}` };
    }
    answers.forEach((a, i) => {
      fd.set(`candidate[open_question_answers_attributes][${i}][open_question_id]`, String(a.open_question_id));
      if (a.content != null) fd.set(`candidate[open_question_answers_attributes][${i}][content]`, a.content);
      if (a.flag != null) fd.set(`candidate[open_question_answers_attributes][${i}][flag]`, String(a.flag));
    });

    try {
      const r = await fetch(`${origin}/api/offers/${encodeURIComponent(slug)}/candidates`, { method: "POST", headers, body: fd, signal: AbortSignal.timeout(30_000) });
      const text = await r.text().catch(() => "");
      if (r.ok) return { ok: true, status: "submitted", confirmation: `DETECTED_HTTP_${r.status}` };
      if (r.status === 422) return { ok: false, status: "validation_failed", error: `Recruitee ha rifiutato la candidatura: ${text.slice(0, 300)}` };
      if (r.status === 404) return { ok: false, status: "job_closed", error: "Annuncio non più online (Recruitee 404)." };
      return { ok: false, status: "unknown_error", error: `Recruitee ${r.status}: ${text.slice(0, 300)}` };
    } catch (err) {
      return { ok: false, status: "unknown_error", error: `Recruitee submit fallito: ${err instanceof Error ? err.message : err}` };
    }
  },
};

function norm(s: string): string {
  return s.toLowerCase().replace(/[*]/g, "").replace(/[^a-z0-9]+/g, " ").trim().slice(0, 120);
}
