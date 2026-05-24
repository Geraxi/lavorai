import type { Page } from "playwright";
import Anthropic from "@anthropic-ai/sdk";

/**
 * AI answerer per i campi OBBLIGATORI di un form ATS che il fill
 * deterministico (generic-fill) non è riuscito a compilare.
 *
 * Filosofia (coerente col resto del prodotto): MAI inventare. Claude può
 * rispondere SOLO usando i dati reali del candidato (profilo + CV). Se una
 * domanda richiede info che non abbiamo, ritorna null → il campo resta
 * vuoto → il submit resterà UNCONFIRMED e l'utente finisce a mano. Meglio
 * onesti che fabbricare credenziali (es. "sì, ho diritto al lavoro UK").
 *
 * Gestisce: input text/url/tel/email/number, textarea, <select> nativi e
 * widget react-select (Greenhouse nuovo, Lever, Ashby), checkbox di
 * consenso. Tutto best-effort: ogni step in try/catch, non lancia mai.
 */

const MODEL = "claude-sonnet-4-20250514";

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
  /** Estratto del CV (testo) per rispondere a domande tipo "hai esperienza con X?". */
  cvText?: string | null;
  jobTitle?: string | null;
  company?: string | null;
  /** Risposte già date dall'utente a domande precedenti (riutilizzabili). */
  storedAnswers?: Array<{ label: string; answer: string; kind?: string }>;
}

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
  kind: "text" | "textarea" | "select" | "react-select" | "checkbox";
  options?: string[];
}

interface AiAnswer {
  idx: number;
  value: string | null;
}

const TAG = "data-lavorai-idx";

/**
 * Scansiona i campi required ancora vuoti, chiede a Claude, compila.
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
}> {
  const details: string[] = [];

  // 1. Enumera + tagga i campi candidati (required & vuoti).
  let pending: FieldDescriptor[] = [];
  try {
    pending = await collectRequiredEmptyFields(page);
  } catch (err) {
    console.warn("[ai-answer] collect failed", err);
    return { answered: 0, remainingRequired: 0, details: ["collect_failed"], unanswered: [] };
  }
  if (pending.length === 0) {
    return { answered: 0, remainingRequired: 0, details: ["no_required_empty"], unanswered: [] };
  }

  // 2. Per i react-select, apri e leggi le opzioni (best-effort) così l'AI
  //    e l'utente possono scegliere tra valori reali.
  for (const f of pending) {
    if (f.kind === "react-select" && !f.options) {
      f.options = await readReactSelectOptions(page, f.idx).catch(() => undefined);
    }
  }

  let answered = 0;

  // 3. Riempi PRIMA dalle risposte già date dall'utente (riutilizzabili),
  //    match per label normalizzata. Niente AI per queste.
  const stored = new Map(
    (ctx.storedAnswers ?? [])
      .filter((s) => s.answer && s.answer.trim())
      .map((s) => [normalizeLabel(s.label), s.answer]),
  );
  const filledIdx = new Set<number>();
  if (stored.size > 0) {
    for (const f of pending) {
      const v = stored.get(normalizeLabel(f.label));
      if (v == null) continue;
      const ok = await fillField(page, f, v).catch(() => false);
      if (ok) {
        answered++;
        filledIdx.add(f.idx);
        details.push(`stored:"${f.label.slice(0, 36)}"`);
      }
    }
  }

  // 4. Per il resto, chiedi a Claude (solo dai dati reali).
  const remaining = pending.filter((f) => !filledIdx.has(f.idx));
  let answers: AiAnswer[] = [];
  if (remaining.length > 0) {
    try {
      answers = await askClaude(ctx, remaining);
    } catch (err) {
      console.warn("[ai-answer] claude failed", err);
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

  return { answered, remainingRequired: stillEmpty.length, details, unanswered };
}

// ---------- enumerazione campi ----------

async function collectRequiredEmptyFields(page: Page): Promise<FieldDescriptor[]> {
  return page.evaluate((tag) => {
    function labelFor(el: Element): string {
      const id = el.getAttribute("id");
      let txt = "";
      if (id) {
        const l = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (l) txt = l.textContent ?? "";
      }
      if (!txt) {
        const wrap = el.closest("label");
        if (wrap) txt = wrap.textContent ?? "";
      }
      if (!txt) {
        // Greenhouse: label è sibling nel container ".field"/"div"
        const container =
          el.closest("[class*='field'], [class*='question'], .form-field, div");
        const l = container?.querySelector("label");
        if (l) txt = l.textContent ?? "";
      }
      if (!txt) txt = el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.getAttribute("name") || "";
      return txt.replace(/\s+/g, " ").trim();
    }
    function isRequired(el: Element, label: string): boolean {
      if ((el as HTMLInputElement).required) return true;
      if (el.getAttribute("aria-required") === "true") return true;
      if (/\*\s*$/.test(label) || label.includes("*")) return true;
      return false;
    }

    const out: Array<{ idx: number; label: string; kind: string; options?: string[] }> = [];
    let idx = 0;

    // a) input text-like + textarea
    const textEls = Array.from(
      document.querySelectorAll(
        "input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=submit]):not([type=button]), textarea",
      ),
    ) as (HTMLInputElement | HTMLTextAreaElement)[];
    for (const el of textEls) {
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      if (el.value && el.value.trim() !== "") continue; // già pieno
      const label = labelFor(el);
      if (!isRequired(el, label)) continue;
      el.setAttribute(tag, String(idx));
      out.push({ idx, label, kind: el.tagName === "TEXTAREA" ? "textarea" : "text" });
      idx++;
    }

    // b) <select> nativi
    const selects = Array.from(document.querySelectorAll("select")) as HTMLSelectElement[];
    for (const el of selects) {
      const style = window.getComputedStyle(el);
      if (style.display === "none") continue;
      if (el.value && el.value.trim() !== "") continue;
      const label = labelFor(el);
      if (!isRequired(el, label)) continue;
      el.setAttribute(tag, String(idx));
      const options = Array.from(el.options)
        .map((o) => o.textContent?.trim() ?? "")
        .filter((t) => t && !/^select/i.test(t));
      out.push({ idx, label, kind: "select", options });
      idx++;
    }

    // c) react-select (Greenhouse nuovo / Lever / Ashby): container .select__control
    const rsControls = Array.from(
      document.querySelectorAll(
        "[class*='select__control'], [class*='-control'][class*='select']",
      ),
    );
    for (const ctrl of rsControls) {
      // vuoto se non c'è single-value/multi-value
      const hasValue = ctrl.querySelector(
        "[class*='single-value'], [class*='multi-value']",
      );
      if (hasValue) continue;
      const container = ctrl.closest("[class*='field'], [class*='question'], div");
      const label = (container?.querySelector("label")?.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim();
      // required se label ha * (react-select non espone required nativo)
      if (!label.includes("*") && ctrl.getAttribute("aria-required") !== "true")
        continue;
      ctrl.setAttribute(tag, String(idx));
      out.push({ idx, label, kind: "react-select" });
      idx++;
    }

    // d) checkbox required (consenso/privacy)
    const checks = Array.from(
      document.querySelectorAll("input[type=checkbox]"),
    ) as HTMLInputElement[];
    for (const el of checks) {
      if (el.checked) continue;
      const label = labelFor(el);
      if (!isRequired(el, label)) continue;
      el.setAttribute(tag, String(idx));
      out.push({ idx, label, kind: "checkbox" });
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
      .locator("[class*='select__option'], [role='option']")
      .allTextContents();
    // chiudi il menu
    await page.keyboard.press("Escape").catch(() => void 0);
    const clean = opts.map((o) => o.replace(/\s+/g, " ").trim()).filter(Boolean);
    return clean.length ? clean.slice(0, 25) : undefined;
  } catch {
    return undefined;
  }
}

// ---------- fill ----------

async function fillField(page: Page, f: FieldDescriptor, value: string): Promise<boolean> {
  const loc = page.locator(`[${TAG}="${f.idx}"]`).first();
  if (f.kind === "text" || f.kind === "textarea") {
    await loc.fill(value, { timeout: 3000 });
    return true;
  }
  if (f.kind === "checkbox") {
    const yes = /^(y|yes|true|si|sì|agree|accept|consent|1)/i.test(value.trim());
    if (yes) {
      await loc.check({ timeout: 3000 }).catch(async () => {
        await loc.click({ timeout: 3000 });
      });
      return true;
    }
    return false;
  }
  if (f.kind === "select") {
    // match opzione per testo (case-insensitive contains)
    const target = value.toLowerCase();
    const optText = (f.options ?? []).find((o) => o.toLowerCase().includes(target))
      ?? (f.options ?? []).find((o) => target.includes(o.toLowerCase()));
    if (!optText) return false;
    await loc.selectOption({ label: optText }, { timeout: 3000 });
    return true;
  }
  if (f.kind === "react-select") {
    await loc.click({ timeout: 3000 });
    await page.waitForTimeout(300);
    // digita per filtrare
    await page.keyboard.type(value.slice(0, 40), { delay: 10 }).catch(() => void 0);
    await page.waitForTimeout(400);
    const option = page
      .locator("[class*='select__option'], [role='option']")
      .filter({ hasText: new RegExp(escapeRe(value.slice(0, 25)), "i") })
      .first();
    if (await option.count()) {
      await option.click({ timeout: 3000 });
      return true;
    }
    // Nessuna opzione corrisponde: NON scegliamo a caso (sarebbe inventare).
    // Chiudiamo il menu e lasciamo il campo vuoto → resterà UNCONFIRMED.
    await page.keyboard.press("Escape").catch(() => void 0);
    return false;
  }
  return false;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------- Claude ----------

async function askClaude(
  ctx: CandidateContext,
  fields: FieldDescriptor[],
): Promise<AiAnswer[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];

  const profile = {
    name: [ctx.firstName, ctx.lastName].filter(Boolean).join(" ") || null,
    email: ctx.email ?? null,
    phone: ctx.phone ?? null,
    city: ctx.city ?? null,
    country: ctx.country ?? null,
    linkedin: ctx.linkedinUrl ?? null,
    portfolio: ctx.portfolioUrl ?? null,
    workAuthorization: ctx.workAuth ?? null,
  };
  const fieldList = fields.map((f) => ({
    idx: f.idx,
    question: f.label,
    type: f.kind,
    options: f.options ?? undefined,
  }));

  const system =
    "Sei un assistente che compila form di candidatura per conto di un candidato reale. " +
    "REGOLA ASSOLUTA: usa SOLO i dati forniti del candidato (profilo + estratto CV). " +
    "NON inventare MAI fatti, qualifiche, autorizzazioni al lavoro, o esperienze non presenti nei dati. " +
    "Se una domanda richiede un'informazione che non hai, rispondi value=null. " +
    "Per domande sì/no su esperienze: rispondi 'Yes' solo se il CV lo supporta, altrimenti 'No' o null. " +
    "Per work authorization: rispondi onestamente in base a workAuthorization/country del candidato; se il paese del ruolo differisce e non hai prova del diritto al lavoro, NON dichiarare 'Yes'. " +
    "Per i campi 'select'/'react-select' scegli ESATTAMENTE una delle options fornite (testo identico). " +
    "Per checkbox di consenso privacy/GDPR rispondi 'Yes'. " +
    'Rispondi SOLO con JSON: {"answers":[{"idx":N,"value":"..."|null}]}.';

  const userMsg =
    `CANDIDATO:\n${JSON.stringify(profile, null, 2)}\n\n` +
    `RUOLO: ${ctx.jobTitle ?? "-"}${ctx.company ? ` @ ${ctx.company}` : ""}\n\n` +
    (ctx.cvText
      ? `ESTRATTO CV (per domande su esperienze):\n${ctx.cvText.slice(0, 4000)}\n\n`
      : "") +
    `CAMPI DA COMPILARE (rispondi a ciascuno per idx):\n${JSON.stringify(fieldList, null, 2)}`;

  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system,
    messages: [{ role: "user", content: userMsg }],
  });
  const text = res.content?.[0]?.type === "text" ? res.content[0].text : "";
  const json = extractJson(text);
  if (!json || !Array.isArray(json.answers)) return [];
  return json.answers
    .filter((a: unknown): a is AiAnswer => {
      return (
        !!a &&
        typeof a === "object" &&
        typeof (a as AiAnswer).idx === "number"
      );
    })
    .map((a: AiAnswer) => ({ idx: a.idx, value: a.value ?? null }));
}

function extractJson(text: string): { answers?: unknown[] } | null {
  try {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}
