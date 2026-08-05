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

const MODEL = "claude-sonnet-5";

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
  kind: "text" | "textarea" | "select" | "react-select" | "checkbox" | "radio";
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

  // 3b. Riempi i campi noti dal PROFILO (country/city/phone/link) anche se
  //     sono react-select searchable (le cui opzioni l'AI non vedrebbe).
  for (const f of pending) {
    if (filledIdx.has(f.idx)) continue;
    const pv = profileValueForLabel(f.label, ctx);
    if (!pv) continue;
    const ok = await fillField(page, f, pv).catch(() => false);
    if (ok) {
      answered++;
      filledIdx.add(f.idx);
      details.push(`profile:"${f.label.slice(0, 32)}"`);
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

/** Mappa una label a un valore noto del profilo (per i campi standard). */
function profileValueForLabel(label: string, ctx: CandidateContext): string | null {
  const l = label.toLowerCase();
  if (/\bcountry\b|paese|nazione/.test(l)) return ctx.country ?? null;
  if (/\bcity\b|\btown\b|location|città|citt/.test(l)) return ctx.city ?? null;
  if (/salary|ral|compensation|stipendio|retribuzione/.test(l))
    return ctx.salaryExpectationEur ? String(ctx.salaryExpectationEur) : null;
  if (/phone|telefono|mobile|cellulare/.test(l)) return ctx.phone ?? null;
  if (/linkedin/.test(l)) return ctx.linkedinUrl ?? null;
  if (/portfolio|website|personal site|sito/.test(l)) return ctx.portfolioUrl ?? null;
  if (/years?\s+of\s+(.+\s+)?experience|how many years|anni di esperienza/.test(l))
    return ctx.yearsExperience != null ? String(ctx.yearsExperience) : null;
  if (/english.+(level|proficiency)|level of english|livello di inglese|inglese livello/.test(l))
    return ctx.englishLevel ?? null;
  if (/\blanguages?\b|\blingue?\b/.test(l) && !/programming|coding|programmazione/.test(l))
    return (ctx.languages ?? [])
      .map((x) => (x.level ? `${x.name} (${x.level})` : x.name))
      .filter(Boolean)
      .join(", ") || null;
  if (/notice period|preavviso|when can you start|earliest start/.test(l))
    return ctx.noticePeriod ?? null;
  if (/highest (level of )?education|titolo di studio|diploma|degree|laurea/.test(l))
    return ctx.highestEducation ?? null;
  return null;
}

// ---------- enumerazione campi ----------

async function collectRequiredEmptyFields(page: Page): Promise<FieldDescriptor[]> {
  return page.evaluate((tag) => {
    // NB: NIENTE funzioni nominate qui dentro. I bundler (esbuild/tsx) le
    // avvolgono con un helper __name che NON esiste nel browser quando
    // Playwright serializza la funzione → "ReferenceError: __name". Tutto
    // inline per essere bulletproof su qualsiasi bundler.
    const out: Array<{ idx: number; label: string; kind: string; options?: string[] }> = [];
    let idx = 0;
    const seen = new Set<string>();

    // Tutti i controlli del form, in ordine di documento.
    const all = Array.from(
      document.querySelectorAll("input, textarea, select"),
    ) as (HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)[];

    for (const el of all) {
      const type = ((el as HTMLInputElement).type || el.tagName).toLowerCase();
      if (["hidden", "submit", "button", "reset", "image"].includes(type)) continue;
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
      if (label.replace(/[^a-z0-9]/gi, "").length < 3) continue; // senza label utile
      if (!required) continue;
      el.setAttribute(tag, String(idx));
      out.push({ idx, label, kind: el.tagName === "TEXTAREA" ? "textarea" : "text" });
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
  if (f.kind === "radio") {
    // Le opzioni e i radio taggati sono nello stesso ordine del gruppo.
    const opts = f.options ?? [];
    const v = value.toLowerCase().trim();
    let mi = opts.findIndex((o) => o.toLowerCase().trim() === v);
    if (mi < 0) mi = opts.findIndex((o) => o.toLowerCase().includes(v) || v.includes(o.toLowerCase()));
    if (mi < 0) return false;
    const radios = page.locator(`[${TAG}="${f.idx}"]`);
    const target = radios.nth(mi);
    await target.check({ timeout: 3000 }).catch(async () => {
      // radio custom nascosto → clicca la label associata o via JS
      await target.evaluate((el) => (el as HTMLElement).click()).catch(() => void 0);
    });
    return true;
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
    // Enter seleziona l'opzione evidenziata (modo affidabile per react-select).
    await loc.press("Enter").catch(() => void 0);
    await page.waitForTimeout(300);

    // verifica che la selezione si sia FISSATA — SOLO nello shell di QUESTO
    // campo (non risalire troppo: catturerebbe il single-value di un vicino).
    const ok = await loc
      .evaluate((el) => {
        const shell =
          el.closest("[class*='select-shell']") ||
          el.closest("[class*='select__value-container']") ||
          el.parentElement?.parentElement ||
          el.parentElement;
        const sv = shell?.querySelector(
          "[class*='single-value'], [class*='multi-value']",
        );
        return !!(sv && (sv.textContent ?? "").trim());
      })
      .catch(() => false);
    if (!ok) await page.keyboard.press("Escape").catch(() => void 0);
    return ok;
  }
  return false;
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
    desiredAnnualSalaryEur: ctx.salaryExpectationEur ?? null,
    yearsOfExperience: ctx.yearsExperience ?? null,
    englishLevel: ctx.englishLevel ?? null,
    languages: ctx.languages ?? null,
    noticePeriod: ctx.noticePeriod ?? null,
    highestEducation: ctx.highestEducation ?? null,
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
