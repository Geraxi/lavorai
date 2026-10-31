import { classifyRecruiteeForm, recruiteeChallengeCompatibility } from '@/lib/recruitee-form-capability';
import { providerPolicy } from '@/lib/application-provider-policy';
import { allowUnpublishedRecruiteeOffer, recheckAtsTestBeforeSubmitHttp } from "@/lib/ats-test-capability";
import { verifySubmissionResponse } from "./submission-proof";
import { readFile } from "node:fs/promises";
import type { PortalAdapter, ApplyInput, ApplyOutcome, PendingQuestion } from "./types";

/**
 * Recruitee — Careers Site API pubblica, candidatura via HTTP (niente browser):
 *   POST https://<careers-host>/api/offers/<slug>/candidates  (multipart)
 *   candidate[name], candidate[email], candidate[phone], candidate[cv],
 *   candidate[cover_letter], candidate[referrer], open_question_answers.
 * L'URL dell'annuncio è <careers-host>/o/<slug>[/c/new]; il careers host può
 * essere custom, ma questo adapter accetta solo <tenant>.recruitee.com verificabili.
 */
const OFFER_RE = /^\/o\/([^/?#]+)(?:\/c\/new)?\/?$/i;

export function requiresRecruiteeOriginReview(urls: string[], source: string, adapterId?: string): boolean {
  if (adapterId) return false;
  return source === "recruitee" || urls.some((raw) => {
    try { return /\/o\/[^/?#]+/i.test(new URL(raw).pathname); }
    catch { return false; }
  });
}

/** Only provider-owned HTTPS origins. Unverified custom domains must not select this adapter. */
export function recruiteeDestination(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.port
      || !/^[a-z0-9-]+\.recruitee\.com$/i.test(url.hostname)
      || !OFFER_RE.test(url.pathname)) return null;
    return url;
  } catch { return null; }
}

interface OpenQuestion { id: number; kind?: string; body?: string; required?: boolean; open_question_options?: Array<{ id: number; body: string }> }

const ADAPTER_SENT_OPTIONS = new Set(["cv", "cover_letter", "phone", "name", "email", "referrer"]);
const UNSUPPORTED_QUESTION_KINDS = new Set(["file", "photo", "attachment", "image", "video"]);

function isRequiredOption(value: unknown): boolean {
  if (value === true) return true;
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "required" || raw === "on";
}

export function recruiteeOfferValidation(
  offer: Record<string, unknown>,
  input: { phone?: string | null; coverLetterText?: string | null },
): { requiredFields: string[]; unsupportedRequired: string[]; wouldAcceptRealSubmit: boolean } {
  const requiredFields: string[] = [];
  const unsupportedRequired: string[] = [];
  for (const [key, value] of Object.entries(offer)) {
    if (!key.startsWith("options_") || !isRequiredOption(value)) continue;
    const field = key.slice("options_".length);
    requiredFields.push(field);
    if (field === "cv" || field === "name" || field === "email" || field === "referrer") continue;
    if (field === "cover_letter" && input.coverLetterText?.trim()) continue;
    if (field === "phone" && input.phone?.trim()) continue;
    if (!ADAPTER_SENT_OPTIONS.has(field) || field === "phone" || field === "cover_letter") {
      unsupportedRequired.push(field);
    }
  }
  const questions = Array.isArray(offer.open_questions) ? offer.open_questions as OpenQuestion[] : [];
  for (const question of questions) {
    if (!question.required || (question.kind ?? "") === "infobox") continue;
    const kind = (question.kind ?? "text").toLowerCase();
    requiredFields.push(`open_question:${kind}`);
    if (UNSUPPORTED_QUESTION_KINDS.has(kind)) unsupportedRequired.push(`open_question:${kind}`);
  }
  return {
    requiredFields,
    unsupportedRequired,
    wouldAcceptRealSubmit: unsupportedRequired.length === 0,
  };
}

/** Unknown/ambiguous answers must never silently become a negative assertion. */
export function recruiteeBooleanAnswer(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (["yes", "y", "sì", "si", "true", "1"].includes(normalized)) return true;
  if (["no", "n", "false", "0"].includes(normalized)) return false;
  return null;
}

export const recruiteeAdapter: PortalAdapter = {
  id: "recruitee",
  label: "Recruitee",
  requiresBrowser: false,
  matches(url: string): boolean {
    return recruiteeDestination(url) !== null;
  },
  async apply(_page, input: ApplyInput): Promise<ApplyOutcome> {
    let origin = "";
    let slug = "";
    try {
      const u = recruiteeDestination(input.jobUrl);
      if (!u) return { ok: false, status: "form_not_found", error: "Il portale Recruitee richiede un URL HTTPS verificabile." };
      origin = u.origin;
      slug = u.pathname.match(OFFER_RE)?.[1] ?? "";
    } catch { /* below */ }
    if (!origin || !slug) return { ok: false, status: "form_not_found", error: `URL Recruitee non riconosciuto: ${input.jobUrl}` };

    const headers = { Accept: "application/json", "User-Agent": "Mozilla/5.0 LavorAI/1.0" };
    // 1. Offerta: esiste ancora? domande obbligatorie? options_* required?
    let questions: OpenQuestion[] = [];
    let offerValidation: ReturnType<typeof recruiteeOfferValidation> = {
      requiredFields: [],
      unsupportedRequired: [],
      wouldAcceptRealSubmit: true,
    };
    try {
      const r = await fetch(`${origin}/api/offers/${encodeURIComponent(slug)}`, { headers, redirect: "error", signal: AbortSignal.timeout(15_000) });
      if (r.status === 404) return { ok: false, status: "job_closed", error: "Annuncio non più online (Recruitee 404)." };
      if (!r.ok) return { ok: false, status: "unknown_error", error: `Verifica annuncio Recruitee non riuscita (HTTP ${r.status}). Nessun invio eseguito.` };
      if (r.ok) {
        const j = (await r.json()) as { offer?: Record<string, unknown> & { status?: string; open_questions?: OpenQuestion[] } };
        if (!j.offer || typeof j.offer !== "object") return { ok: false, status: "form_not_found", error: "Offerta Recruitee non riconosciuta. Nessun invio eseguito." };
        if (j.offer?.status && j.offer.status !== "published" && !allowUnpublishedRecruiteeOffer(input.jobUrl)) {
          return { ok: false, status: "job_closed", error: `Annuncio Recruitee in stato ${j.offer.status}.` };
        }
        const challenge = recruiteeChallengeCompatibility(j.offer);
        if (challenge !== 'clear') {
          return {ok:false,status:'not_eligible',refusedBeforeSubmit:true,
            error:challenge==='required'
              ? 'Il portale richiede una verifica manuale. Nessun invio eseguito; non riprovare automaticamente.'
              : 'Compatibilità della verifica del portale non accertata. Revisione manuale necessaria; nessun invio eseguito.'};
        }
        if (providerPolicy().restricted && !input.atsTestAuth && classifyRecruiteeForm(j.offer) !== 'standard') {
          return {ok:false,status:'not_eligible',refusedBeforeSubmit:true,error:'Il modulo è cambiato o richiede campi non ancora supportati nel catalogo corrente. Nessun invio eseguito.'};
        }
        questions = j.offer?.open_questions ?? [];
        offerValidation = recruiteeOfferValidation(j.offer, {
          phone: input.profile.phone?.trim() || input.userPhone,
          coverLetterText: input.coverLetterText,
        });
        if (!offerValidation.wouldAcceptRealSubmit) {
          return {
            ok: false,
            status: "not_eligible",
            error: `Recruitee required fields not sent by this adapter: ${offerValidation.unsupportedRequired.join(", ")}. Required: ${offerValidation.requiredFields.join(", ") || "none"}. Nessun invio eseguito.`,
            refusedBeforeSubmit: true,
            offerValidation,
          };
        }
      }
    } catch (err) {
      return { ok: false, status: "unknown_error", error: `Recruitee offer lookup fallito: ${err instanceof Error ? err.message : err}` };
    }

    // 2. Domande obbligatorie: stessa catena degli altri adapter (risposte
    //    risposte esplicite della candidatura → fatti verificabili → narrativa CV).
    const answers: Array<{ open_question_id: number; content?: string; flag?: boolean }> = [];
    const pending: PendingQuestion[] = [];
    const req = questions.filter((q) => q.required && (q.kind ?? "") !== "infobox");
    const fields = req.map((q, idx) => {
      const kind = (q.kind ?? "").toLowerCase();
      const label = (q.body ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const options = kind === "boolean" ? ["Yes", "No"] : q.open_question_options?.map((o) => o.body);
      const fkind: "text" | "textarea" | "select" | "radio" = kind === "boolean" ? "radio" : kind.includes("choice") ? "select" : kind === "text" ? "textarea" : "text";
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
      if (kind === "boolean") {
        const flag = recruiteeBooleanAnswer(v);
        if (flag === null) { pending.push({ label: f.label, kind: f.kind, options: f.options }); continue; }
        answers.push({ open_question_id: f.q.id, flag });
      }
      else answers.push({ open_question_id: f.q.id, content: v });
    }
    if (pending.length > 0) return { ok: false, status: "needs_user_input", error: `${pending.length} domande obbligatorie richiedono la tua risposta prima dell'invio.`, pendingQuestions: pending };

    // 3. Invio multipart — build first so the ATS-test recheck can see the email field.
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
      if (!buf.length) throw new Error("empty_attachment");
      const name = input.cvLocalPath.split(/[\\/]/).pop() || "cv.pdf";
      fd.set("candidate[cv]", new Blob([buf], { type: name.endsWith(".pdf") ? "application/pdf" : "application/octet-stream" }), name);
    } catch {
      return {
        ok: false,
        status: "missing_field",
        error: "CV non leggibile o vuoto. Nessun invio eseguito.",
        refusedBeforeSubmit: true,
      };
    }
    answers.forEach((a, i) => {
      fd.set(`candidate[open_question_answers_attributes][${i}][open_question_id]`, String(a.open_question_id));
      if (a.content != null) fd.set(`candidate[open_question_answers_attributes][${i}][content]`, a.content);
      if (a.flag != null) fd.set(`candidate[open_question_answers_attributes][${i}][flag]`, String(a.flag));
    });

    // Exercise attachment construction in dry mode too, but never cross the POST boundary.
    if (input.dryRun) {
      return { ok: true, status: "submitted", confirmation: "DRY_RUN", offerValidation };
    }

    const submitGuard = recheckAtsTestBeforeSubmitHttp(input.atsTestAuth, {
      ownerUserId: input.atsTestOwnerUserId ?? "",
      destinationUrl: input.jobUrl,
      applicationId: input.applicationId ?? "",
      jobSource: input.atsTestJobSource,
      realSubmit: true,
      multipartEmail: String(typeof fd.get === "function" ? fd.get("candidate[email]") ?? "" : ""),
    });
    if (!submitGuard.ok) {
      return {
        ok: false,
        status: "not_eligible",
        error: `ATS test submit blocked: ${submitGuard.reason}. Nessun invio eseguito.`,
        refusedBeforeSubmit: true,
      };
    }

    try {
      if (input.beforeSubmit && !(await input.beforeSubmit().catch(() => false))) {
        return { ok: false, status: "submission_unconfirmed", error: "Invio bloccato: condizioni o autorizzazioni cambiate. Nessun nuovo invio eseguito." };
      }
      const endpoint = `${origin}/api/offers/${encodeURIComponent(slug)}/candidates`;
      const r = await fetch(endpoint, { method: "POST", headers, body: fd, redirect: "error", signal: AbortSignal.timeout(30_000) });
      const body = await r.text().catch(() => null);
      const proof = verifySubmissionResponse("recruitee", input.jobUrl, { url: endpoint, method: "POST", postData: null, status: r.status, body });
      if (proof.receipt) return { ok: true, status: "submitted", confirmation: `DETECTED_HTTP_${r.status}`, receipt: proof.receipt };
      return { ok: false, status: "submission_unconfirmed", error: `Ricezione Recruitee non confermata (HTTP ${r.status}). Verificare prima di un nuovo invio per evitare duplicati.` };
    } catch (err) {
      return { ok: false, status: "submission_unconfirmed", error: `Ricezione Recruitee non confermata: ${err instanceof Error ? err.message : err}` };
    }
  },
};

function norm(s: string): string {
  return s.toLowerCase().replace(/[*]/g, "").replace(/[^a-z0-9]+/g, " ").trim().slice(0, 120);
}
