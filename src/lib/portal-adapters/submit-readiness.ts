import type { Locator, Page } from "playwright";

/**
 * Helpers per arrivare a un bottone Submit ABILITATO sui form ATS React
 * (Greenhouse job-boards in primis) e, se resta disabilitato, dire
 * ESATTAMENTE quale campo manca invece di un generico timeout del click.
 *
 * NB: dentro page.evaluate niente funzioni nominate (il bundler le avvolge
 * con __name, che non esiste nel browser). Tutto inline.
 */

export interface MissingField {
  /** Etichetta leggibile del campo (o name/id se manca la label). */
  label: string;
  /** text | textarea | select | react-select | checkbox | radio | file | error */
  kind: string;
  /** Perché lo consideriamo mancante. */
  reason: string;
  options?: string[];
}

const UPLOAD_BUSY_SELECTOR = [
  "[aria-busy='true']",
  "[role='progressbar']",
  "progress",
  "[class*='upload' i][class*='progress' i]",
  "[class*='uploading' i]",
  "[class*='spinner' i]",
  "[class*='loading' i]",
].join(", ");

/**
 * Attende che upload/validazioni asincrone finiscano: nessun indicatore di
 * caricamento visibile e nessun testo "Uploading…". Best-effort, mai throws.
 */
export async function waitForUploadsSettled(page: Page, timeoutMs = 20_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  let quietStreak = 0;
  while (Date.now() < deadline) {
    const busy = await page
      .evaluate((sel) => {
        try {
          for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
            if (el.getClientRects().length === 0) continue;
            const st = window.getComputedStyle(el);
            if (st.visibility === "hidden" || st.display === "none" || st.opacity === "0") continue;
            return true;
          }
          const txt = (document.body?.innerText || "").slice(0, 20000);
          return /\b(uploading|caricamento in corso|parsing (your )?resume)\b/i.test(txt);
        } catch {
          return false;
        }
      }, UPLOAD_BUSY_SELECTOR)
      .catch(() => false);
    quietStreak = busy ? 0 : quietStreak + 1;
    if (quietStreak >= 2) return true;
    await page.waitForTimeout(400);
  }
  return false;
}

/**
 * Ri-dispatcha input/change/blur su ogni campo già compilato del form, così
 * le validazioni React/react-hook-form ("onBlur"/"touched") registrano i
 * valori inseriti via fill/setInputFiles e ricalcolano lo stato del Submit.
 */
export async function nudgeFormValidation(page: Page): Promise<number> {
  return page
    .evaluate(() => {
      let n = 0;
      const els = Array.from(
        document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
          "input, textarea, select",
        ),
      );
      for (const el of els) {
        const type = ((el as HTMLInputElement).type || el.tagName).toLowerCase();
        if (["hidden", "submit", "button", "reset", "image", "file"].includes(type)) continue;
        if (el.disabled) continue;
        const isCheck = type === "checkbox" || type === "radio";
        const has = isCheck ? (el as HTMLInputElement).checked : !!(el.value && el.value.trim());
        if (!has) continue;
        // react-select: l'input di ricerca è vuoto dopo la selezione → skip
        // sopra; qui arrivano solo campi con valore reale.
        try {
          if (!isCheck) el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          el.dispatchEvent(new FocusEvent("blur", { bubbles: false }));
          el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
          n++;
        } catch {
          /* ignore */
        }
      }
      return n;
    })
    .catch(() => 0);
}

/**
 * Spunta le checkbox di consenso privacy/GDPR/termini (singole, non gruppi)
 * riconosciute dalla LABEL, non solo dal name. Esclude marketing/newsletter.
 * Usa la label (o un click JS) quando l'input reale è nascosto da un custom
 * checkbox. Ritorna le label spuntate.
 */
export async function checkConsentBoxes(page: Page): Promise<string[]> {
  const TAG = "data-lavorai-consent";
  const targets = await page
    .evaluate((tag) => {
      const out: Array<{ idx: number; label: string }> = [];
      const boxes = Array.from(document.querySelectorAll<HTMLInputElement>("input[type=checkbox]"));
      let idx = 0;
      for (const cb of boxes) {
        if (cb.checked || cb.disabled) continue;
        if (cb.name) {
          const group = document.querySelectorAll(`input[type=checkbox][name="${CSS.escape(cb.name)}"]`);
          if (group.length > 1) continue; // gruppo multi-scelta: non è un consenso
        }
        let label = "";
        if (cb.id) label = document.querySelector(`label[for="${CSS.escape(cb.id)}"]`)?.textContent ?? "";
        if (!label) label = cb.closest("label")?.textContent ?? "";
        if (!label) {
          const c = cb.closest("fieldset, [class*='field'], [class*='question'], [class*='checkbox']");
          label = c?.textContent ?? "";
        }
        const meta = `${label} ${cb.name} ${cb.id} ${cb.getAttribute("aria-label") ?? ""}`
          .replace(/\s+/g, " ")
          .toLowerCase();
        if (/marketing|newsletter|promotional|sms|text message|whatsapp/.test(meta)) continue;
        const required = cb.required || cb.getAttribute("aria-required") === "true" || label.includes("*");
        const isConsent =
          /privacy|gdpr|consent|acconsent|personal data|data processing|dati personali|trattamento|terms|i (have read|agree|acknowledge|accept|confirm|certify)|accett|autorizz|dichiaro/.test(
            meta,
          );
        if (!isConsent) continue;
        // Consenso privacy/GDPR: sempre; altre dichiarazioni (terms/agree): solo se obbligatorie.
        if (!required && !/privacy|gdpr|personal data|data processing|dati personali|trattamento/.test(meta)) continue;
        cb.setAttribute(tag, String(idx));
        out.push({ idx, label: label.replace(/\s+/g, " ").trim().slice(0, 120) || cb.name || cb.id });
        idx++;
      }
      return out;
    }, TAG)
    .catch(() => [] as Array<{ idx: number; label: string }>);

  const checked: string[] = [];
  for (const t of targets) {
    const loc = page.locator(`[${TAG}="${t.idx}"]`).first();
    await loc.check({ timeout: 1500 }).catch(async () => {
      // input nascosto da un checkbox custom → click JS (dispatcha click+change)
      await loc.evaluate((el) => (el as HTMLInputElement).click()).catch(() => void 0);
    });
    if (await loc.isChecked().catch(() => false)) checked.push(t.label);
  }
  return checked;
}

/**
 * Compila un campo "Location (City)" con autocomplete (Greenhouse
 * job-boards: input#candidate-location combobox; legacy: #job_application_location
 * + jQuery UI autocomplete; a volte Google Places). Digita la città, attende
 * le opzioni asincrone (fino a ~6s) e seleziona la prima. Ritorna true se il
 * campo risulta valorizzato.
 */
export async function fillLocationAutocomplete(page: Page, city: string | null | undefined): Promise<boolean> {
  const value = (city ?? "").trim();
  if (!value) return false;
  const field = page
    .locator(
      [
        "input#candidate-location",
        "input#job_application_location",
        "input[name='job_application[location]']",
        "input[role=combobox][aria-label*='location' i]",
        "input[role=combobox][id*='location' i]",
      ].join(", "),
    )
    .first();
  if ((await field.count().catch(() => 0)) === 0) return false;
  if (!(await field.isVisible().catch(() => false))) return false;

  if (await readLocationValue(field)) return true;

  const optionSel =
    "[class*='select__option'], [role='listbox'] [role='option'], ul.ui-autocomplete li, .pac-item";
  const visibleOptionSel = optionSel
    .split(",")
    .map((s) => `${s.trim()}:visible`)
    .join(", ");
  try {
    await field.click({ timeout: 2000 });
    await field.pressSequentially(value.slice(0, 40), { delay: 30 });
    let count = 0;
    for (let i = 0; i < 24 && count === 0; i++) {
      await page.waitForTimeout(250);
      count = await page.locator(visibleOptionSel).count().catch(() => 0);
    }
    if (count > 0) {
      // react-select: il click sull'opzione spesso NON registra l'onChange;
      // Enter sull'opzione evidenziata sì. jQuery UI / Places: ArrowDown+Enter.
      const isCombo = (await field.getAttribute("role").catch(() => null)) === "combobox";
      if (!isCombo) await field.press("ArrowDown").catch(() => void 0);
      await field.press("Enter").catch(() => void 0);
      await page.waitForTimeout(300);
      if (!(await readLocationValue(field))) {
        await page.locator(visibleOptionSel).first().click({ timeout: 2000 }).catch(() => void 0);
      }
    } else {
      // Nessuna opzione: un input libero mantiene il testo; un combobox no.
      await field.press("Tab").catch(() => void 0);
    }
    await page.waitForTimeout(300);
  } catch {
    return false;
  }
  return readLocationValue(field);
}

async function readLocationValue(field: Locator): Promise<boolean> {
  return field
    .evaluate((el) => {
      const shell = el.closest("[class*='select-shell'], [class*='select__control'], [class*='location']");
      const sv = shell?.querySelector("[class*='single-value']");
      if (sv && (sv.textContent ?? "").trim()) return true;
      // react-select: il value dell'input è solo il testo di ricerca, non una selezione.
      if (el.getAttribute("role") === "combobox") return false;
      return !!(el as HTMLInputElement).value?.trim();
    })
    .catch(() => false);
}

async function isSubmitEnabled(submit: Locator): Promise<boolean> {
  return submit
    .evaluate((el) => {
      const b = el as HTMLButtonElement;
      if (b.disabled) return false;
      if (el.getAttribute("aria-disabled") === "true") return false;
      const fs = el.closest("fieldset");
      if (fs && (fs as HTMLFieldSetElement).disabled) return false;
      return true;
    })
    .catch(() => false);
}

/**
 * Elenca i campi che tengono il Submit disabilitato / il form invalido:
 * required vuoti (text/select/textarea), react-select senza selezione,
 * checkbox/radio obbligatori non spuntati, file required senza file,
 * aria-invalid, e messaggi d'errore visibili accanto ai campi.
 */
export async function diagnoseMissingFields(page: Page, submit?: Locator | null): Promise<MissingField[]> {
  const scopeHandle = submit ? await submit.elementHandle().catch(() => null) : null;
  return page
    .evaluate((btn) => {
      const out: Array<{ label: string; kind: string; reason: string; options?: string[] }> = [];
      const seen = new Set<string>();
      const root: ParentNode = (btn && (btn as Element).closest("form")) || document;
      // NB: niente `const clean = () => …` (esbuild lo avvolge in __name,
      // assente nel browser): pulizia label via callback anonima inline.
      const CLEAN_RE = /SVGs? not supported by this browser\.?/gi;
      const els = Array.from(
        root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select"),
      );
      for (const el of els) {
        const type = ((el as HTMLInputElement).type || el.tagName).toLowerCase();
        if (["hidden", "submit", "button", "reset", "image"].includes(type)) continue;
        if (el.disabled) continue;
        let label = "";
        if (el.id) label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent ?? "";
        if (!label) label = el.closest("label")?.textContent ?? "";
        if (!label) {
          const c = el.closest("fieldset, [class*='field'], [class*='question']");
          label = c?.querySelector("legend, label")?.textContent ?? "";
        }
        if (!label) label = el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.name || el.id || "";
        const starred = /\*/.test(label);
        label = [label].map((s) => s.replace(CLEAN_RE, " ").replace(/\s+/g, " ").replace(/\*\s*$/, "").trim().slice(0, 140))[0];
        const required =
          (el as HTMLInputElement).required || el.getAttribute("aria-required") === "true";
        const ariaInvalid = el.getAttribute("aria-invalid") === "true";
        const nativeInvalid = el.willValidate && !el.validity.valid;
        const cls = typeof el.className === "string" ? el.className : "";
        const isCombo = el.getAttribute("role") === "combobox" || /select__input/.test(cls);
        const shell = el.closest("[class*='select-shell'], [class*='select__control']")?.parentElement ?? null;
        let kind = el.tagName === "SELECT" ? "select" : el.tagName === "TEXTAREA" ? "textarea" : type;
        if (kind !== "checkbox" && kind !== "radio" && kind !== "file" && kind !== "select" && kind !== "textarea") kind = "text";
        let empty = false;
        let reason = "";
        if (type === "file") {
          // Greenhouse azzera input.files dopo l'upload S3: consideriamo
          // mancante solo un file required senza file E senza nome mostrato.
          const area = el.closest("[class*='field'], [class*='upload'], fieldset, div");
          const shown = !!area?.querySelector("[class*='file-name'], [class*='filename'], [class*='chosen'], [class*='attachment']");
          empty = !(el as HTMLInputElement).files?.length && !shown;
          if (!(required && empty) && !ariaInvalid) continue;
          reason = ariaInvalid ? "file non valido" : "file obbligatorio non caricato";
        } else if (isCombo) {
          kind = "react-select";
          const sv = (shell || el.parentElement?.parentElement)?.querySelector("[class*='single-value'], [class*='multi-value']");
          empty = !(sv && (sv.textContent ?? "").trim());
          // react-select: il required sta spesso su un input sentinella nascosto
          const sentinel = shell?.querySelector<HTMLInputElement>("input[required], input[aria-required='true']");
          const req = required || !!sentinel || starred;
          if (!(req && empty) && !ariaInvalid) continue;
          reason = ariaInvalid ? "selezione non valida" : "selezione obbligatoria mancante";
        } else if (type === "checkbox" || type === "radio") {
          const name = (el as HTMLInputElement).name;
          const group = name
            ? Array.from(root.querySelectorAll<HTMLInputElement>(`input[type=${type}][name="${CSS.escape(name)}"]`))
            : [el as HTMLInputElement];
          const key = `${type}:${name || el.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const anyChecked = group.some((g) => g.checked);
          const req = group.some((g) => g.required || g.getAttribute("aria-required") === "true");
          if (group.length > 1) {
            const c = el.closest("fieldset, [class*='field'], [class*='question']");
            const q = c?.querySelector("legend, label")?.textContent;
            if (q) label = [q].map((s) => s.replace(CLEAN_RE, " ").replace(/\s+/g, " ").replace(/\*\s*$/, "").trim().slice(0, 140))[0];
          }
          if (!(req && !anyChecked) && !ariaInvalid && !(nativeInvalid && !anyChecked)) continue;
          reason = type === "checkbox" && group.length === 1 ? "checkbox obbligatoria non spuntata" : "scelta obbligatoria mancante";
        } else {
          if (/requiredInput/.test(cls) || el.closest("[class*='select-shell']")) continue; // sentinelle widget
          const st = window.getComputedStyle(el);
          if (st.display === "none" || st.visibility === "hidden") continue;
          empty = !(el.value && el.value.trim());
          if (!(required && empty) && !ariaInvalid && !nativeInvalid) continue;
          reason = required && empty ? "campo obbligatorio vuoto" : ariaInvalid ? "valore non valido (aria-invalid)" : `valore non valido (${el.validationMessage || "validity"})`;
        }
        const k = `${kind}:${label}`;
        if (!label || seen.has(k)) continue;
        seen.add(k);
        const options =
          el.tagName === "SELECT"
            ? Array.from((el as HTMLSelectElement).options)
                .filter((o) => o.value && !o.disabled)
                .map((o) => (o.textContent ?? "").trim() || o.value)
                .slice(0, 60)
            : undefined;
        out.push({ label, kind, reason, ...(options ? { options } : {}) });
      }
      // Messaggi d'errore visibili (Greenhouse: .helper-text--error, [role=alert]).
      const errs = Array.from(
        root.querySelectorAll<HTMLElement>(
          "[class*='error' i]:not(input):not(form), [role='alert'], [aria-live='assertive']",
        ),
      );
      for (const e of errs) {
        if (!e.getClientRects().length) continue;
        const t = [e.textContent ?? ""].map((s) => s.replace(CLEAN_RE, " ").replace(/\s+/g, " ").replace(/\*\s*$/, "").trim().slice(0, 140))[0];
        if (!t || t.length > 200 || seen.has("err:" + t)) continue;
        if (e.querySelector("input, select, textarea")) continue; // contenitore, non messaggio
        seen.add("err:" + t);
        const fieldLabel = [
          e.closest("[class*='field'], [class*='question'], fieldset")?.querySelector("label, legend")?.textContent ?? "",
        ].map((s) => s.replace(CLEAN_RE, " ").replace(/\s+/g, " ").replace(/\*\s*$/, "").trim().slice(0, 140))[0];
        out.push({ label: fieldLabel || t, kind: "error", reason: t });
      }
      return out;
    }, scopeHandle)
    .catch((err) => {
      console.warn("[submit-readiness] diagnoseMissingFields failed", err);
      return [] as MissingField[];
    })
    .finally(() => {
      void scopeHandle?.dispose().catch(() => void 0);
    });
}

export function formatMissingFields(fields: MissingField[]): string {
  return fields.map((f) => `"${f.label}" (${f.kind}: ${f.reason})`).join("; ");
}

/**
 * Attende che il Submit diventi abilitato (upload/validazione asincrona),
 * ri-dispatchando gli eventi di validazione a metà attesa. Se resta
 * disabilitato ritorna i campi che lo bloccano.
 */
export async function ensureSubmitEnabled(
  page: Page,
  submit: Locator,
  timeoutMs = 15_000,
): Promise<{ enabled: true } | { enabled: false; missing: MissingField[] }> {
  const deadline = Date.now() + timeoutMs;
  let nudged = false;
  while (Date.now() < deadline) {
    if (await isSubmitEnabled(submit)) return { enabled: true };
    if (!nudged && Date.now() > deadline - timeoutMs / 2) {
      nudged = true;
      await nudgeFormValidation(page);
    }
    await page.waitForTimeout(500);
  }
  if (await isSubmitEnabled(submit)) return { enabled: true };
  return { enabled: false, missing: await diagnoseMissingFields(page, submit) };
}
