import { observeSubmission } from "./submission-proof";
import type { Page } from "playwright";
import type { ApplyInput, ApplyOutcome, PendingQuestion } from "./types";
import { detectBlockingCaptcha } from "./captcha";
import { answerRequiredFields, type CandidateContext } from "./ai-answer";

/**
 * Routine condivisa per i form di candidatura pubblici "semplici"
 * (Personio, Teamtailor, BambooHR e simili): niente login, campi standard
 * (nome, email, telefono, CV), consensi, qualche domanda custom.
 *
 * Ogni adapter fornisce solo selettori e regole; qui vive il flusso:
 * apri → (click "Candidati") → compila → CV → consensi → AI per i campi
 * obbligatori → captcha? → submit → ricevuta verificata per questo annuncio.
 */
export interface WebFormConfig {
  id: string;
  /** Prefisso log, es. "[personio]" */
  tag: string;
  /** Dominio/i su cui cercare la POST di conferma. */
  hostRe: RegExp;
  /** URL da aprire (default: input.jobUrl). */
  formUrl?: (jobUrl: string) => string;
  /** Azione per far comparire il form (es. click su "Apply"). Ritorna true se fatto. */
  openForm?: (page: Page) => Promise<boolean>;
  /** Selettori (in ordine di preferenza) per i campi standard. */
  fields: {
    firstName?: string[];
    lastName?: string[];
    fullName?: string[];
    email: string[];
    phone?: string[];
    coverLetter?: string[];
    linkedin?: string[];
  };
  /** Regex del testo del bottone di invio. */
  submitRe: RegExp;
  /** Testo che indica annuncio chiuso. */
  closedRe?: RegExp;
}

const DEFAULT_CLOSED_RE = /no longer (accepting|available|open)|position (has been )?(filled|closed)|job not found|posizione (chiusa|non più)|non più (disponibile|attiva)|annuncio scaduto|expired/i;

export async function applyOnPublicForm(page: Page, input: ApplyInput, cfg: WebFormConfig): Promise<ApplyOutcome> {
  const T = cfg.tag;
  const url = cfg.formUrl ? cfg.formUrl(input.jobUrl) : input.jobUrl;
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  } catch (err) {
    return { ok: false, status: "unknown_error", error: `Pagina non raggiungibile: ${err instanceof Error ? err.message.split("\n")[0] : err}` };
  }
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => void 0);
  await dismissCookies(page);

  const bodyEarly = ((await page.locator("body").innerText().catch(() => "")) ?? "").slice(0, 4000);
  if ((cfg.closedRe ?? DEFAULT_CLOSED_RE).test(bodyEarly)) {
    return { ok: false, status: "job_closed", error: "Annuncio non più online." };
  }

  if (cfg.openForm) {
    await cfg.openForm(page).catch(() => false);
    await page.waitForTimeout(800);
  }

  // Firma del form: campo email visibile.
  const email = await firstVisible(page, cfg.fields.email, 15_000);
  if (!email) {
    return { ok: false, status: "form_not_found", error: `Form ${cfg.id} non rilevato su ${page.url()}.` };
  }

  try {
    const p = input.profile;
    const first = (p.firstName || "").trim();
    const last = (p.lastName || "").trim();
    const full = [first, last].filter(Boolean).join(" ");
    const emailToUse = p.email?.trim() || input.userEmail;
    const phoneToUse = p.phone?.trim() || input.userPhone || "";

    const fn = await firstVisible(page, cfg.fields.firstName ?? [], 1500);
    const ln = await firstVisible(page, cfg.fields.lastName ?? [], 1500);
    if (fn) await fn.fill(first).catch(() => void 0);
    if (ln) await ln.fill(last).catch(() => void 0);
    if (!fn && !ln) {
      const nm = await firstVisible(page, cfg.fields.fullName ?? [], 1500);
      if (nm) await nm.fill(full).catch(() => void 0);
    }
    await email.fill(emailToUse).catch(() => void 0);
    if (phoneToUse) {
      const ph = await firstVisible(page, cfg.fields.phone ?? [], 1500);
      if (ph) await ph.fill(phoneToUse).catch(() => void 0);
    }
    const li = await firstVisible(page, cfg.fields.linkedin ?? [], 800);
    const linkedin = input.answers?.linkedinUrl || (p.links ?? []).find((l) => /linkedin/i.test(`${l.url} ${l.label}`))?.url;
    if (li && linkedin) await li.fill(linkedin).catch(() => void 0);

    // CV
    const cvOk = await attachCv(page, input.cvLocalPath, T);
    if (!cvOk) {
      return { ok: false, status: "missing_field", error: `CV non attaccato al form ${cfg.id}: nessun input file ha registrato il file.` };
    }

    // Cover letter (textarea) se presente
    const cl = await firstVisible(page, cfg.fields.coverLetter ?? [], 800);
    if (cl && input.coverLetterText) await cl.fill(input.coverLetterText.slice(0, 4000)).catch(() => void 0);

    // Unknown consent/declaration boxes stay unanswered.

    // Campi obbligatori residui → AI (stessa logica di Greenhouse/Workable).
    let pending: PendingQuestion[] = [];
    try {
      const ai = await answerRequiredFields(page, buildAnswerContext(input));
      pending = ai.unanswered;
      if (ai.given.length > 0) input.onAiAnswers?.(ai.given);
      console.log(`${T} ai-answer: answered=${ai.answered} remaining=${ai.remainingRequired} | ${ai.details.join(" ; ")}`);
    } catch (err) {
      console.warn(`${T} ai-answer failed`, err);
      pending = [{ label: "Verifica dei campi obbligatori non disponibile: controlla il form prima di inviare.", kind: "text" }];
    }
    // Unknown consent/declaration boxes stay unanswered.

    const captcha = await detectBlockingCaptcha(page);
    if (captcha.blocking) {
      return { ok: false, status: "captcha", error: `Il form ha un captcha interattivo (${captcha.kind}): completa l'invio a mano, CV e risposte sono pronti.` };
    }
    if (pending.length > 0) {
      return { ok: false, status: "needs_user_input", error: `${pending.length} domande obbligatorie richiedono la tua risposta prima dell'invio.`, pendingQuestions: pending };
    }
    if (input.dryRun) return { ok: true, status: "submitted", confirmation: "DRY_RUN" };

    // Submit once + verified receipt
    let submit = page.locator('button[type="submit"], input[type="submit"]').filter({ hasText: cfg.submitRe });
    if ((await submit.count()) === 0) submit = page.getByRole("button", { name: cfg.submitRe });
    if ((await submit.count()) === 0) submit = page.locator('form button[type="submit"], form input[type="submit"]');
    if ((await submit.count()) === 0) return { ok: false, status: "missing_field", error: `Bottone di invio ${cfg.id} non trovato.` };

    await submit.first().scrollIntoViewIfNeeded().catch(() => void 0);
    return (await observeSubmission(page, cfg.id, input.jobUrl,
      () => submit.first().click({ timeout: 8_000 }), input.beforeSubmit)).outcome;
  } catch (err) {
    return { ok: false, status: "unknown_error", error: err instanceof Error ? err.message : `Errore imprevisto ${cfg.id}` };
  }
}

// ---------- helpers ----------

async function firstVisible(page: Page, selectors: string[], timeout: number) {
  const deadline = Date.now() + timeout;
  do {
    for (const sel of selectors) {
      const loc = page.locator(sel).first();
      if ((await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false))) return loc;
    }
    await page.waitForTimeout(250);
  } while (Date.now() < deadline);
  return null;
}

async function dismissCookies(page: Page) {
  for (const re of [/decline all|reject all|rifiuta|solo (necessari|essenziali)/i, /accept all|accetta( tutti)?|agree|ok/i]) {
    const b = page.getByRole("button", { name: re });
    if ((await b.count().catch(() => 0)) > 0) {
      await b.first().click({ timeout: 1500 }).catch(() => void 0);
      await page.waitForTimeout(300);
      return;
    }
  }
}

async function attachCv(page: Page, cvPath: string, T: string): Promise<boolean> {
  const inputs = page.locator('input[type="file"]');
  const n = await inputs.count();
  const ranked: number[] = [];
  for (let i = 0; i < n; i++) {
    const el = inputs.nth(i);
    const meta = `${await el.getAttribute("name").catch(() => "")} ${await el.getAttribute("id").catch(() => "")} ${await el.getAttribute("accept").catch(() => "")} ${await el.getAttribute("aria-label").catch(() => "")}`.toLowerCase();
    const isImage = /image\//.test(meta) && !/pdf|doc/.test(meta);
    if (isImage) continue;
    if (/resume|cv|curriculum|pdf|doc/.test(meta)) ranked.unshift(i);
    else ranked.push(i);
  }
  const base = (cvPath.split(/[\\/]/).pop() || "").toLowerCase();
  // Molti uploader (Teamtailor, Personio) caricano il file su storage
  // esterno e SVUOTANO l'input, salvando un URL in un campo nascosto o
  // mostrando il nome file: consideriamo "attaccato" anche questi casi.
  const attached = async (el: ReturnType<Page["locator"]>) => {
    for (let k = 0; k < 16; k++) {
      const direct = (await el.evaluate((e) => ((e as HTMLInputElement).files?.length ?? 0) > 0).catch(() => false)) as boolean;
      if (direct) return true;
      const indirect = (await page
        .evaluate(
          ({ b }) => {
            const hidden = Array.from(document.querySelectorAll('input[type="hidden"], input[type="text"]')) as HTMLInputElement[];
            if (hidden.some((h) => /resume|cv|curriculum|attachment|remote_url|file/i.test(`${h.name} ${h.id}`) && /^https?:\/\/|\.pdf|\.docx?$/i.test(h.value))) return true;
            const txt = (document.body.innerText || "").toLowerCase();
            return !!b && txt.includes(b);
          },
          { b: base },
        )
        .catch(() => false)) as boolean;
      if (indirect) return true;
      await page.waitForTimeout(500);
    }
    return false;
  };
  for (const i of ranked) {
    const el = inputs.nth(i);
    await el.setInputFiles(cvPath).catch(() => void 0);
    if (await attached(el)) { console.log(`${T} CV attaccato all'input file #${i + 1}/${n}`); return true; }
  }
  // Fallback: filechooser via bottone/label/dropzone di upload
  const triggers = [
    page.getByRole("button", { name: /upload|carica|allega|attach|resume|cv|curriculum|browse|sfoglia|choose file|scegli file/i }).first(),
    page.locator('label[for*="resume" i], label[for*="cv" i], label[for*="file" i], [class*="dropzone" i], [class*="upload" i], [data-testid*="upload" i]').first(),
  ];
  for (const trig of triggers) {
    if ((await trig.count().catch(() => 0)) === 0) continue;
    try {
      const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 5000 }), trig.click({ timeout: 3000 })]);
      await chooser.setFiles(cvPath);
      const el = inputs.first();
      if ((await inputs.count()) === 0 || (await attached(el))) { console.log(`${T} CV attaccato via filechooser`); return true; }
    } catch { /* prossimo trigger */ }
  }
  return false;
}

/** Contesto per l'AI answerer, uguale a quello usato da Greenhouse/Workable. */
export function buildAnswerContext(input: ApplyInput): CandidateContext {
  const p = input.profile;
  const current = (p.experiences ?? []).find((experience) => /^(?:present|current|now|oggi|presente|attuale|in corso)?$/i.test((experience.endDate ?? "").trim()));
  const recent = p.experiences?.[0];
  const links = p.links ?? [];
  const findLink = (re: RegExp) => links.find((l) => re.test(`${l.url} ${l.label}`))?.url;
  const cvText = [p.summary, ...(p.experiences ?? []).map((e) => `${e.role} @ ${e.company} (${e.startDate}-${e.endDate || "Present"}): ${e.description || (e.bullets ?? []).join("; ")}`)].filter(Boolean).join("\n");
  return {
    firstName: p.firstName,
    lastName: p.lastName,
    email: p.email || input.userEmail,
    phone: p.phone || input.userPhone,
    city: input.answers?.city || p.city,
    country: input.answers?.country,
    currentEmployer: current?.company || null,
    mostRecentEmployer: recent?.company || null,
    currentJobTitle: current?.role || null,
    mostRecentJobTitle: recent?.role || null,
    school: p.education?.[0]?.school || null,
    linkedinUrl: input.answers?.linkedinUrl || findLink(/linkedin/i),
    portfolioUrl: input.answers?.portfolioUrl || findLink(/portfolio|dribbble|behance/i),
    workAuth: input.answers?.workAuthEU,
    salaryExpectationEur: input.answers?.salaryExpectationEur,
    yearsExperience: input.answers?.yearsExperience ?? input.userYearsExperience,
    englishLevel: input.answers?.englishLevel ?? input.userEnglishLevel,
    languages: p.languages,
    noticePeriod: input.answers?.noticePeriod ?? input.userNoticePeriod,
    highestEducation: input.answers?.highestEducation,
    cvText,
    jobTitle: input.jobTitle ?? p.title,
    company: input.company ?? null,
    jobDescription: input.jobDescription,
    jobLocation: input.jobLocation,
    protectedCategory: input.protectedCategory,
    autonomous: input.autonomous === true,
    storedAnswers: input.storedAnswers,
  };
}

/** Required unknown facts/consents stop before any final submission attempt. */
export async function prepareRequiredAnswers(page: Page, input: ApplyInput): Promise<ApplyOutcome | null> {
  try {
    const result = await answerRequiredFields(page, buildAnswerContext(input));
    if (result.given.length) input.onAiAnswers?.(result.given);
    if (result.unanswered.length) return {
      ok: false, status: "needs_user_input", pendingQuestions: result.unanswered,
      error: `${result.unanswered.length} domande obbligatorie richiedono una risposta esplicita prima dell'invio.`,
    };
    return null;
  } catch {
    return { ok: false, status: "needs_user_input", pendingQuestions: [{ label: "Verifica dei campi obbligatori non disponibile: controlla il form prima di inviare.", kind: "text" }], error: "Impossibile verificare i campi obbligatori. Nessun invio eseguito." };
  }
}
