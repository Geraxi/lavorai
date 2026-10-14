import { questionKey, exactOption, isTotalExperienceQuestion, isAnnualEurExpectation, isNarrativeQuestion, matchingScopedAnswer } from "./answer-safety";
import type { Page } from "playwright";
import { complete } from "@/lib/ai-router";

/**
 * AI answerer per i campi OBBLIGATORI di un form ATS che il fill
 * deterministico (generic-fill) non è riuscito a compilare.
 *
 * Filosofia (coerente col resto del prodotto): MAI inventare. Il modello può
 * rispondere SOLO usando i dati reali del candidato (profilo + CV). Se una
 * domanda richiede info che non abbiamo, ritorna null → il campo resta
 * vuoto → needs_user_input prima del submit. Meglio
 * onesti che fabbricare credenziali (es. "sì, ho diritto al lavoro UK").
 *
 * Gestisce: input text/url/tel/email/number, textarea, <select> nativi e
 * widget react-select (Greenhouse nuovo, Lever, Ashby), checkbox di
 * consenso. Tutto best-effort: ogni step in try/catch, non lancia mai.
 */

export interface CandidateContext {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  country?: string | null;
  linkedinUrl?: string | null;
  portfolioUrl?: string | null;
  workAuth?: string | null;
  /** Aspettativa RAL annua in euro (per "desired salary" ecc.). */
  salaryExpectationEur?: number | null;
  /** Anni di esperienza professionale totali. */
  yearsExperience?: number | null;
  /** Livello di inglese: "A1"|"A2"|"B1"|"B2"|"C1"|"C2"|"Native" */
  englishLevel?: string | null;
  /** Lingue parlate (es. [{name:"Italiano",level:"Madrelingua"}]). */
  languages?: Array<{ name: string; level?: string }>;
  /** Notice period / disponibilità (es. "2 weeks", "Immediate"). */
  noticePeriod?: string | null;
  /** Titolo di studio più alto (es. "Bachelor", "Master"). */
  highestEducation?: string | null;
  /** Ultimo datore di lavoro / ruolo / scuola dal CV (domande "current or previous employer"). */
  currentEmployer?: string | null;
  currentJobTitle?: string | null;
  mostRecentEmployer?: string | null;
  mostRecentJobTitle?: string | null;
  school?: string | null;
  /** Estratto del CV (testo) per rispondere a domande tipo "hai esperienza con X?". */
  cvText?: string | null;
  jobTitle?: string | null;
  company?: string | null;
  /** Risposte già date dall'utente a domande precedenti (riutilizzabili). */
  storedAnswers?: Array<{ label: string; answer: string; kind?: string; options?: string[]; fingerprint?: string }>;
  /** Autonomous mode never permits guessed facts or commitments. */
  autonomous?: boolean;
  /** Descrizione dell'annuncio, per le domande aperte ("perché noi?"). */
  jobDescription?: string | null;
  /** Search preference only; never evidence or permission for a form disclosure. */
  protectedCategory?: boolean | null;
  /** Job location is role context, never evidence of work authorization. */
  jobLocation?: string | null;
}

/** Risposta data dall'AI o dalle regole, da persistere per riuso/revisione. */
export interface GivenAnswer {
  label: string;
  kind: string;
  answer: string;
  /** "user" = risposta data dall'utente in /questions, "profile" = dal profilo,
   *  "rule" = explicit fact mapping, "ai" = CV-grounded narrative.
   *  "assumed" remains only for compatibility with historical records. */
  source: "user" | "profile" | "ai" | "rule" | "assumed";
}

export type AnswerSource = GivenAnswer["source"];

/** Normalizza una label di domanda per il match cross-job (UserAnswer.labelKey). */
export function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[*]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 120);
}

interface FieldDescriptor {
  idx: number;
  label: string;
  kind: "text" | "textarea" | "select" | "react-select" | "checkbox" | "radio";
  options?: string[];
  /** type HTML dell'input (number, url, tel…): guida il formato della risposta. */
  inputType?: string;
}

interface AiAnswer {
  idx: number;
  value: string | null;
}

const TAG = "data-lavorai-idx";

/**
 * Scansiona i campi required ancora vuoti, chiede al provider AI, compila.
 * Ritorna quanti ne ha riempiti e quanti restano obbligatori-vuoti.
 */
export async function answerRequiredFields(
  page: Page,
  ctx: CandidateContext,
): Promise<{
  answered: number;
  remainingRequired: number;
  details: string[];
  /** Domande obbligatorie rimaste senza risposta → da chiedere all'utente. */
  unanswered: Array<{ label: string; kind: string; options?: string[] }>;
  /** Risposte generate (AI/regole) da salvare come UserAnswer riutilizzabili. */
  given: GivenAnswer[];
}> {
  const details: string[] = [];
  const given: GivenAnswer[] = [];

  // 1. Enumera + tagga i campi candidati (required & vuoti).
  let pending: FieldDescriptor[] = [];
  try {
    pending = await collectRequiredEmptyFields(page);
  } catch (err) {
    console.warn("[ai-answer] collect failed", err);
    return { answered: 0, remainingRequired: 1, details: ["collect_failed"], unanswered: [{ label: "Verifica dei campi obbligatori non disponibile: controlla il form prima di inviare.", kind: "text" }], given };
  }
  if (pending.length === 0) {
    return { answered: 0, remainingRequired: 0, details: ["no_required_empty"], unanswered: [], given };
  }

  // 2. Per i react-select, apri e leggi le opzioni (best-effort) così l'AI
  //    e l'utente possono scegliere tra valori reali.
  for (const f of pending) {
    if (f.kind === "react-select" && !f.options) {
      f.options = await readReactSelectOptions(page, f.idx).catch(() => undefined);
    }
  }

  let answered = 0;

  // Reuse only answers bound to this exact application question. The worker
  // validates applicationId; fingerprint validation here protects changed forms.
  const filledIdx = new Set<number>();
  for (const f of pending) {
    const value = matchingScopedAnswer(ctx.storedAnswers, f);
    if (value == null) continue;
    const ok = await fillField(page, f, value).catch(() => false);
    if (ok) {
      answered++;
      filledIdx.add(f.idx);
      details.push(`stored:"${f.label.slice(0, 36)}"`);
      given.push({ label: f.label, kind: f.kind, answer: value, source: "user" });
    }
  }

  // 3b. Riempi i campi noti dal PROFILO (country/city/phone/link) anche se
  //     sono react-select searchable (le cui opzioni l'AI non vedrebbe).
  for (const f of pending) {
    if (filledIdx.has(f.idx) || f.kind === "checkbox") continue;
    const pv = profileValueForLabel(f.label, ctx);
    if (!pv) continue;
    const ok = await fillField(page, f, pv).catch(() => false);
    if (ok) {
      answered++;
      filledIdx.add(f.idx);
      details.push(`profile:"${f.label.slice(0, 32)}"`);
      given.push({ label: f.label, kind: f.kind, answer: pv, source: "profile" });
    }
  }

  // 4. Per il resto, chiedi al provider AI (solo dai dati reali).
  const remaining = pending.filter((f) => !filledIdx.has(f.idx));
  let answers: AiAnswer[] = [];
  if (remaining.length > 0) {
    try {
      answers = await askAi(ctx, remaining);
    } catch (err) {
      console.warn("[ai-answer] provider failed", err);
      answers = [];
    }
  }
  const byIdx = new Map(answers.map((a) => [a.idx, a.value]));
  for (const f of remaining) {
    const val = byIdx.get(f.idx);
    if (val == null || String(val).trim() === "") continue;
    const ok = await fillField(page, f, String(val)).catch(() => false);
    if (ok) {
      answered++;
      filledIdx.add(f.idx);
      details.push(`ai:"${f.label.slice(0, 36)}"=${String(val).slice(0, 24)}`);
      // Riportata al chiamante: mostrata all'utente in /inbox e, in modalità
      // autonoma, salvata come UserAnswer per coerenza tra candidature.
      given.push({ label: f.label, kind: f.kind, answer: String(val), source: "ai" });
    }
  }

  // 5. Ricalcola i required-vuoti rimasti e mappa le domande da chiedere.
  let stillEmpty: FieldDescriptor[] = [];
  try {
    stillEmpty = await collectRequiredEmptyFields(page);
  } catch {
    stillEmpty = pending.filter((f) => !filledIdx.has(f.idx));
  }
  // Per arricchire con le opzioni react-select già lette.
  const optByLabel = new Map(pending.map((f) => [normalizeLabel(f.label), f.options]));
  const unanswered = stillEmpty.map((f) => ({
    label: f.label,
    kind: f.kind,
    options: f.options ?? optByLabel.get(normalizeLabel(f.label)) ?? undefined,
  }));

  return { answered, remainingRequired: stillEmpty.length, details, unanswered, given };
}

/**
 * Variante SENZA browser: risponde a un elenco di domande (API JSON come
 * Recruitee) con la stessa catena utente → profilo → narrativa dal CV. Ritorna la risposta per idx (null = da chiedere all'utente).
 */
export async function answerOffline(
  ctx: CandidateContext,
  fields: Array<{ idx: number; label: string; kind: FieldDescriptor["kind"]; options?: string[] }>,
): Promise<{ answers: Map<number, string>; given: GivenAnswer[] }> {
  const answers = new Map<number, string>();
  const given: GivenAnswer[] = [];
  const pick = (f: (typeof fields)[number], v: string | null | undefined): string | null => {
    if (!v) return null;
    if (f.options?.length) {
      const lv = v.toLowerCase().trim();
      return exactOption(f.options, lv);
    }
    return v;
  };
  const remaining: typeof fields = [];
  for (const f of fields) {
    const s = pick(f, matchingScopedAnswer(ctx.storedAnswers, f));
    if (s) { answers.set(f.idx, s); given.push({ label: f.label, kind: f.kind, answer: s, source: "user" }); continue; }
    const pv = f.kind === "checkbox" ? null : pick(f, profileValueForLabel(f.label, ctx));
    if (pv) { answers.set(f.idx, pv); given.push({ label: f.label, kind: f.kind, answer: pv, source: "profile" }); continue; }
    remaining.push(f);
  }
  if (remaining.length > 0) {
    let ai: AiAnswer[] = [];
    try { ai = await askAi(ctx, remaining as FieldDescriptor[]); } catch (err) { console.warn("[ai-answer] offline provider failed", err); }
    for (const a of ai) {
      const f = remaining.find((x) => x.idx === a.idx);
      const v = f ? pick(f, a.value ?? null) : null;
      if (f && v) { answers.set(f.idx, v); given.push({ label: f.label, kind: f.kind, answer: v, source: "ai" }); }
    }
  }
  return { answers, given };
}

/** Exact semantic mappings only: never substitute totals or preferences. */
function profileValueForLabel(label: string, ctx: CandidateContext): string | null {
  const key = questionKey(label);
  if (/^(?:first name|given name|nome)$/.test(key)) return ctx.firstName ?? null;
  if (/^(?:last name|family name|surname|cognome)$/.test(key)) return ctx.lastName ?? null;
  if (/^(?:full name|nome e cognome)$/.test(key)) return [ctx.firstName, ctx.lastName].filter(Boolean).join(" ") || null;
  if (/^(?:email|e-mail|email address|indirizzo email)$/.test(key)) return ctx.email ?? null;
  if (/^(?:current employer|current company|azienda attuale|datore di lavoro attuale)$/.test(key)) return ctx.currentEmployer ?? null;
  if (/^(?:current or previous employer|most recent employer|last employer|ultima azienda)$/.test(key)) return ctx.mostRecentEmployer ?? ctx.currentEmployer ?? null;
  if (/^(?:current job title|current position|ruolo attuale|posizione attuale)$/.test(key)) return ctx.currentJobTitle ?? null;
  if (/^(?:current or previous job title|most recent job title|last job title)$/.test(key)) return ctx.mostRecentJobTitle ?? ctx.currentJobTitle ?? null;
  if (/^(?:most recent school|most recent university|ultima università|ultima universita)$/.test(key)) return ctx.school ?? null;
  if (/^(?:country|country of residence|current country|paese di residenza|paese|nazione)$/.test(key)) return ctx.country ?? null;
  if (/^(?:city|current city|city of residence|current location|città|citta|città di residenza|citta di residenza|where do you live|where are you based|dove vivi|dove risiedi)$/.test(key)) return ctx.city ?? null;
  if (isAnnualEurExpectation(label)) return ctx.salaryExpectationEur != null ? String(ctx.salaryExpectationEur) : null;
  if (/^(?:phone|phone number|telephone|mobile|telefono|numero di telefono|cellulare)$/.test(key)) return ctx.phone ?? null;
  if (/^(?:linkedin|linkedin url|linkedin profile|profilo linkedin)$/.test(key)) return ctx.linkedinUrl ?? null;
  if (/^(?:portfolio|portfolio url|personal website|sito web personale)$/.test(key)) return ctx.portfolioUrl ?? null;
  if (isTotalExperienceQuestion(label)) return ctx.yearsExperience != null ? String(ctx.yearsExperience) : null;
  if (/^(?:english level|level of english|english proficiency|livello di inglese)$/.test(key)) return ctx.englishLevel ?? null;
  if (/^(?:languages|languages spoken|spoken languages|lingue|lingue parlate)$/.test(key)) return (ctx.languages ?? []).map((x) => x.level ? `${x.name} (${x.level})` : x.name).filter(Boolean).join(", ") || null;
  if (/^(?:notice period|preavviso|periodo di preavviso)$/.test(key)) return ctx.noticePeriod ?? null;
  if (/^(?:highest education|highest level of education|titolo di studio|titolo di studio più alto)$/.test(key)) return ctx.highestEducation ?? null;
  return null;
}

// ---------- enumerazione campi ----------

async function collectRequiredEmptyFields(page: Page): Promise<FieldDescriptor[]> {
  return page.evaluate((tag) => {
    // NB: NIENTE funzioni nominate qui dentro. I bundler (esbuild/tsx) le
    // avvolgono con un helper __name che NON esiste nel browser quando
    // Playwright serializza la funzione → "ReferenceError: __name". Tutto
    // inline per essere bulletproof su qualsiasi bundler.
    const out: Array<{ idx: number; label: string; kind: string; options?: string[]; inputType?: string }> = [];
    let idx = 0;
    const seen = new Set<string>();

    // Tutti i controlli del form, in ordine di documento.
    const all = Array.from(
      document.querySelectorAll("input, textarea, select"),
    ) as (HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)[];

    for (const el of all) {
      if (el.disabled) continue;
      const type = ((el as HTMLInputElement).type || el.tagName).toLowerCase();
      // I file (CV) sono gestiti dall'adapter, non sono "domande".
      if (["hidden", "submit", "button", "reset", "image", "file"].includes(type)) continue;
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;

      // --- label (inline) ---
      let label = "";
      const id = el.getAttribute("id");
      if (id) {
        const l = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (l) label = l.textContent ?? "";
      }
      if (!label) {
        const wrap = el.closest("label");
        if (wrap) label = wrap.textContent ?? "";
      }
      if (!label) {
        const c = el.closest("[class*='field'], [class*='question'], .form-field, div");
        const l = c?.querySelector("label");
        if (l) label = l.textContent ?? "";
      }
      if (!label)
        label =
          el.getAttribute("aria-label") ||
          el.getAttribute("placeholder") ||
          el.getAttribute("name") ||
          "";
      label = label
        .replace(/SVGs? not supported by this browser\.?/gi, " ")
        // Workable: il selettore paesi del telefono dumpa l'intera lista
        // (+1United States+44United Kingdom...) dentro la label. Taglia.
        .split(/\s*\+\d{1,4}[A-Z]/)[0]
        .replace(/\s+/g, " ")
        .trim();

      // --- required (inline) ---
      const required =
        (el as HTMLInputElement).required ||
        el.getAttribute("aria-required") === "true" ||
        label.includes("*");

      const cls = typeof el.className === "string" ? el.className : "";
      const role = el.getAttribute("role") || "";
      const isCombo =
        role === "combobox" ||
        /select__input/.test(cls) ||
        el.getAttribute("aria-autocomplete") === "list";

      // a) react-select combobox
      if (isCombo) {
        if (!required) continue;
        // Il single-value (valore selezionato) sta nel container largo
        // .select-shell, NON nell'input-container stretto → usa quello.
        const shell =
          el.closest("[class*='select-shell']") ||
          el.parentElement?.parentElement ||
          el.parentElement;
        const sv = shell?.querySelector(
          "[class*='single-value'], [class*='multi-value']",
        );
        if (sv && (sv.textContent ?? "").trim()) continue; // già selezionato
        el.setAttribute(tag, String(idx));
        out.push({ idx, label, kind: "react-select" });
        idx++;
        continue;
      }

      // input interni dei widget (requiredInput nascosto, ecc.) → skip
      if (/requiredInput/.test(cls) || el.closest("[class*='select-shell']")) continue;

      // a2) radio group (es. Workable sì/no obbligatori)
      if (type === "radio") {
        const gname = (el as HTMLInputElement).name;
        if (!gname || seen.has("radio:" + gname)) continue;
        seen.add("radio:" + gname);
        const group = Array.from(
          document.querySelectorAll(`input[type=radio][name="${CSS.escape(gname)}"]`),
        ) as HTMLInputElement[];
        if (group.some((r) => r.checked)) continue;
        const req =
          group.some((r) => r.required || r.getAttribute("aria-required") === "true") ||
          label.includes("*");
        if (!req) continue;
        // Etichette delle singole opzioni (Yes/No/…)
        const opts = group
          .map((r) => {
            const rid = r.getAttribute("id");
            let t = rid
              ? document.querySelector(`label[for="${CSS.escape(rid)}"]`)?.textContent ?? ""
              : "";
            if (!t) t = r.closest("label")?.textContent ?? r.value ?? "";
            return t
              .replace(/SVGs? not supported by this browser\.?/gi, " ")
              .split(/\s*\+\d{1,4}[A-Z]/)[0]
              .replace(/\s+/g, " ")
              .trim();
          })
          .filter(Boolean);
        // Domanda del gruppo: legend/label del container
        const cont = el.closest("fieldset, [class*='field'], [class*='question']");
        let q =
          cont?.querySelector("legend")?.textContent ??
          cont?.querySelector("label")?.textContent ??
          gname;
        q = (q || gname)
          .replace(/SVGs? not supported by this browser\.?/gi, " ")
          .replace(/\s+/g, " ")
          .trim();
        group.forEach((r) => r.setAttribute(tag, String(idx)));
        out.push({ idx, label: q, kind: "radio", options: opts });
        idx++;
        continue;
      }

      // b) checkbox
      if (type === "checkbox") {
        // b1) GRUPPO di checkbox con lo stesso name (Greenhouse multi-select:
        //     es. lista paesi, "in quali sedi puoi lavorare"). Una sola
        //     domanda con le opzioni — NON N domande obbligatorie separate
        //     (bug: 30 checkbox "Australia/Belgium/…" → 30 pending questions).
        //     Trattato come radio: la fill sceglie l'opzione con label uguale.
        const cname = (el as HTMLInputElement).name;
        const cgroup = cname
          ? (Array.from(
              document.querySelectorAll(`input[type=checkbox][name="${CSS.escape(cname)}"]`),
            ) as HTMLInputElement[])
          : [];
        if (cgroup.length >= 2) {
          if (seen.has("cbg:" + cname)) continue;
          seen.add("cbg:" + cname);
          if (cgroup.some((c) => c.checked)) continue;
          const creq =
            cgroup.some((c) => c.required || c.getAttribute("aria-required") === "true") ||
            label.includes("*");
          if (!creq) continue;
          const copts = cgroup
            .map((c) => {
              const cid = c.getAttribute("id");
              let t = cid
                ? document.querySelector(`label[for="${CSS.escape(cid)}"]`)?.textContent ?? ""
                : "";
              if (!t) t = c.closest("label")?.textContent ?? c.value ?? "";
              return t.replace(/\s+/g, " ").trim();
            })
            .filter(Boolean);
          const ccont = el.closest("fieldset, [class*='field'], [class*='question']");
          let cq =
            ccont?.querySelector("legend")?.textContent ??
            ccont?.querySelector("label")?.textContent ??
            cname;
          cq = (cq || cname).replace(/\s+/g, " ").trim();
          cgroup.forEach((c) => c.setAttribute(tag, String(idx)));
          out.push({ idx, label: cq, kind: "radio", options: copts });
          idx++;
          continue;
        }
        // b2) checkbox singola (consenso, dichiarazione)
        if ((el as HTMLInputElement).checked) continue;
        if (!required) continue;
        el.setAttribute(tag, String(idx));
        out.push({ idx, label, kind: "checkbox" });
        idx++;
        continue;
      }

      // c) <select> nativo
      if (el.tagName === "SELECT") {
        if ((el as HTMLSelectElement).value.trim()) continue;
        if (!required) continue;
        el.setAttribute(tag, String(idx));
        const options = Array.from((el as HTMLSelectElement).options)
          .map((o) => (o.textContent ?? "").trim())
          .filter((t) => t && !/^select/i.test(t));
        out.push({ idx, label, kind: "select", options });
        idx++;
        continue;
      }

      // d) text / textarea
      if ((el as HTMLInputElement).value && (el as HTMLInputElement).value.trim())
        continue;
      if (required && label.replace(/[^a-z0-9]/gi, "").length < 3) label = `Campo obbligatorio senza etichetta (${idx + 1})`;
      if (!required) continue;
      el.setAttribute(tag, String(idx));
      out.push({ idx, label, kind: el.tagName === "TEXTAREA" ? "textarea" : "text", inputType: type });
      idx++;
    }

    return out;
  }, TAG) as Promise<FieldDescriptor[]>;
}

// ---------- react-select helpers ----------

async function readReactSelectOptions(page: Page, idx: number): Promise<string[] | undefined> {
  const control = page.locator(`[${TAG}="${idx}"]`).first();
  try {
    await control.click({ timeout: 2000 });
    await page.waitForTimeout(350);
    const opts = await page
      .locator("[class*='select__option']")
      .allTextContents();
    // chiudi il menu
    await page.keyboard.press("Escape").catch(() => void 0);
    const clean = opts.map((o) => o.replace(/\s+/g, " ").trim()).filter(Boolean);
    return clean.length ? clean.slice(0, 60) : undefined;
  } catch {
    return undefined;
  }
}

// ---------- fill ----------

async function fillField(page: Page, f: FieldDescriptor, value: string): Promise<boolean> {
  const loc = page.locator(`[${TAG}="${f.idx}"]`).first();
  if (f.kind === "text" || f.kind === "textarea") {
    let v = value;
    if (f.inputType === "number") {
      // Preserve numeric meaning: 3.5 years must never become 35.
      if (!/^-?\d+(?:\.\d+)?$/.test(value.trim())) return false;
      v = value.trim();
    }
    await loc.fill(v, { timeout: 3000 });
    return true;
  }
  if (f.kind === "checkbox") {
    const yes = /^(y|yes|true|si|sì|agree|accept|consent|1)/i.test(value.trim());
    if (yes) {
      await loc.check({ timeout: 3000 });
      return loc.isChecked().catch(() => false);
    }
    return false;
  }
  if (f.kind === "radio") {
    // Le opzioni e i radio taggati sono nello stesso ordine del gruppo.
    const opts = f.options ?? [];
    const v = value.toLowerCase().trim();
    const mi = opts.findIndex((o) => o.toLowerCase().trim() === v);
    if (mi < 0) return false;
    const radios = page.locator(`[${TAG}="${f.idx}"]`);
    const target = radios.nth(mi);
    await target.check({ timeout: 3000 });
    return target.isChecked().catch(() => false);
  }
  if (f.kind === "select") {
    // match opzione per testo (case-insensitive contains)
    const optText = exactOption(f.options, value);
    if (!optText) return false;
    await loc.selectOption({ label: optText }, { timeout: 3000 });
    return true;
  }
  if (f.kind === "react-select") {
    // react-select (Greenhouse): NON basta cliccare l'opzione (il click non
    // registra l'onChange). Il modo affidabile: apri → digita per filtrare →
    // premi Enter (seleziona l'opzione evidenziata) → verifica single-value.
    const optsSel = "[class*='select__option']";
    await loc.click({ timeout: 3000 });
    await page.waitForTimeout(350);
    // digita per filtrare (NON usare fill(""): chiuderebbe il menu)
    await loc.pressSequentially(value.slice(0, 40), { delay: 22 }).catch(() => void 0);
    // Attendi il caricamento opzioni (alcuni select cercano async: città,
    // paese). Poll fino a ~2.5s invece di un wait fisso troppo corto.
    let optCount = 0;
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(250);
      optCount = await page.locator(optsSel).count();
      if (optCount > 0) break;
    }
    if (optCount === 0) {
      // nessuna opzione corrisponde al valore: non inventiamo, chiudiamo.
      await page.keyboard.press("Escape").catch(() => void 0);
      return false;
    }
    const options = await page.locator(optsSel).allTextContents();
    const exact = options.findIndex((option) => option.trim().toLowerCase() === value.trim().toLowerCase());
    if (exact < 0) { await page.keyboard.press("Escape").catch(() => void 0); return false; }
    await page.locator(optsSel).nth(exact).click({ timeout: 3000 });
    await page.waitForTimeout(300);

    // verifica che la selezione si sia FISSATA — SOLO nello shell di QUESTO
    // campo (non risalire troppo: catturerebbe il single-value di un vicino).
    const ok = await loc
      .evaluate((el, expected) => {
        const shell =
          el.closest("[class*='select-shell']") ||
          el.closest("[class*='select__value-container']") ||
          el.parentElement?.parentElement ||
          el.parentElement;
        const sv = shell?.querySelector(
          "[class*='single-value'], [class*='multi-value']",
        );
        return !!(sv && (sv.textContent ?? "").trim().toLowerCase() === expected.trim().toLowerCase());
      }, value)
      .catch(() => false);
    if (!ok) await page.keyboard.press("Escape").catch(() => void 0);
    return ok;
  }
  return false;
}

// ---------- Provider AI ----------

async function askAi(
  ctx: CandidateContext,
  fields: FieldDescriptor[],
): Promise<AiAnswer[]> {
  fields = fields.filter((field) => isNarrativeQuestion(field.label, field.kind));
  if (!fields.length || !ctx.cvText?.trim()) return [];
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) return [];

  const profile = {
    name: [ctx.firstName, ctx.lastName].filter(Boolean).join(" ") || null,
    email: ctx.email ?? null,
    phone: ctx.phone ?? null,
    city: ctx.city ?? null,
    country: ctx.country ?? null,
    linkedin: ctx.linkedinUrl ?? null,
    portfolio: ctx.portfolioUrl ?? null,
    workAuthorization: ctx.workAuth ?? null,
    desiredAnnualSalaryEur: ctx.salaryExpectationEur ?? null,
    yearsOfExperience: ctx.yearsExperience ?? null,
    englishLevel: ctx.englishLevel ?? null,
    languages: ctx.languages ?? null,
    noticePeriod: ctx.noticePeriod ?? null,
    highestEducation: ctx.highestEducation ?? null,
  };
  // Lingua della domanda (euristica): il prompt è in italiano e il modello
  // tende a rispondere in italiano anche a domande inglesi. Un hint esplicito
  // per campo risolve il problema in modo affidabile.
  const langOf = (label: string): "en" | "it" =>
    /\b(perch[eé]|cosa|come|descrivi|raccont|quali|sei|hai|vorresti|motivo)\b/i.test(label) &&
    !/\b(why|what|how|do you|tell us|describe|are you|please|would you|have you)\b/i.test(label)
      ? "it"
      : "en";
  const fieldList = fields.map((f) => ({
    idx: f.idx,
    question: f.label,
    type: f.kind,
    options: f.options ?? undefined,
    ...(f.kind === "text" || f.kind === "textarea" ? { answerLanguage: langOf(f.label) } : {}),
  }));

  const system =
    "Write only the requested application narrative using facts explicitly present in the supplied candidate CV. " +
    "Never invent or estimate experience durations, credentials, achievements, residence, work authorization, sponsorship, salary, availability, consent or personal history. " +
    "Do not infer a negative answer from missing information. If the supplied CV cannot support an answer, return null. " +
    "Write in the field's answerLanguage. The job description is context, never evidence about the candidate. " +
    'Return JSON only: {"answers":[{"idx":N,"value":"..."|null}]}. Answer only the supplied field indexes.';

  const userMsg =
    `CANDIDATO:\n${JSON.stringify(profile, null, 2)}\n\n` +
    `RUOLO: ${ctx.jobTitle ?? "-"}${ctx.company ? ` @ ${ctx.company}` : ""}\n\n` +
    (ctx.jobDescription ? `DESCRIZIONE ANNUNCIO (per le domande aperte):\n${ctx.jobDescription.slice(0, 3000)}\n\n` : "") +
    (ctx.cvText
      ? `ESTRATTO CV (per domande su esperienze):\n${ctx.cvText.slice(0, 4000)}\n\n`
      : "") +
    `CAMPI DA COMPILARE (rispondi a ciascuno per idx):\n${JSON.stringify(fieldList, null, 2)}`;

  const ai = await complete({ task: "form_answers", system, user: userMsg, maxTokens: ctx.autonomous ? 3500 : 1500, json: true });
  const text = ai.text;
  const res = { stop_reason: ai.provider, content: [{ type: "text" }] } as { stop_reason: string; content: Array<{ type: string }> };
  const json = extractJson(text);
  if (!json || !Array.isArray(json.answers)) {
    console.warn(
      `[ai-answer] risposta AI non parsabile (${text.length} char, provider=${res.stop_reason}, blocks=${(res.content ?? []).map((c) => c.type).join(",")}): ${text.slice(0, 200).replace(/\s+/g, " ")}`,
    );
    return [];
  }
  return json.answers
    .filter((a: unknown): a is AiAnswer => {
      return (
        !!a &&
        typeof a === "object" &&
        typeof (a as AiAnswer).idx === "number" &&
        fields.some((field) => field.idx === (a as AiAnswer).idx) &&
        ((a as AiAnswer).value == null || typeof (a as AiAnswer).value === "string")
      );
    })
    .map((a: AiAnswer) => ({ idx: a.idx, value: a.value ?? null }));
}

function extractJson(text: string): { answers?: unknown[] } | null {
  const m = text.replace(/```(?:json)?/gi, "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    // Riparazione: i testi lunghi (domande aperte) arrivano spesso con a capo
    // letterali dentro le stringhe → JSON non valido. Sostituisci i newline
    // che si trovano DENTRO una stringa con "\n" escapato e riprova.
    try {
      let inStr = false;
      let out = "";
      for (let i = 0; i < m[0].length; i++) {
        const ch = m[0][i];
        if (ch === '"' && m[0][i - 1] !== "\\") inStr = !inStr;
        if (inStr && (ch === "\n" || ch === "\r")) out += "\\n";
        else if (inStr && ch === "\t") out += " ";
        else out += ch;
      }
      return JSON.parse(out);
    } catch {
      return null;
    }
  }
}
