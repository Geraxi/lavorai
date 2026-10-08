/**
 * DOM test (Playwright headless) per submit-readiness: Submit disabilitato
 * finché mancano campi obbligatori → diagnosi esplicita; consensi via label;
 * nudge degli eventi; attesa upload.
 *
 * Richiede un Chromium Playwright installato. Se manca → SKIP (exit 0),
 * così `npm test` resta verde su macchine senza browser.
 */
import assert from "node:assert/strict";
import { chromium, type Browser } from "playwright";
import {
  checkConsentBoxes,
  diagnoseMissingFields,
  ensureSubmitEnabled,
  fillLocationAutocomplete,
  nudgeFormValidation,
  waitForUploadsSettled,
} from "../src/lib/portal-adapters/submit-readiness";

const FORM = `
<form id="application-form">
  <label for="first_name">First Name*</label><input id="first_name" name="first_name" required>
  <label for="email">Email*</label><input id="email" name="email" type="email" required>
  <div class="field"><label for="question_1">Why us?*</label><textarea id="question_1" required></textarea></div>
  <div class="field"><label for="question_2">Visa sponsorship*</label>
    <select id="question_2" required><option value="">Select...</option><option value="y">Yes</option><option value="n">No</option></select></div>
  <div class="field"><label for="gdpr_q">I consent to the processing of my personal data*</label>
    <input type="checkbox" id="gdpr_q" name="question_99" required></div>
  <div class="field"><label for="mkt">Send me marketing emails</label><input type="checkbox" id="mkt" name="mkt"></div>
  <div class="field"><label for="candidate-location">Location (City)*</label>
    <input id="candidate-location" role="combobox" aria-required="true"><ul id="opts"></ul></div>
  <div class="field"><label for="question_3">Notice period*</label>
    <div class="select-shell"><div class="select__control"><div class="select__value-container">
      <input id="question_3" role="combobox" class="select__input"></div></div>
      <input class="requiredInput" tabindex="-1" aria-hidden="true" required style="opacity:0;height:0" value="x"></div></div>
  <div id="uploading" class="uploading">Uploading...</div>
  <button type="submit" id="submit" disabled>Submit application</button>
</form>
<script>
  const f = document.getElementById('application-form');
  const btn = document.getElementById('submit');
  let blurred = false;
  document.getElementById('first_name').addEventListener('blur', () => { blurred = true; recompute(); });
  function recompute() {
    const ok = f.checkValidity() && blurred && !document.getElementById('uploading');
    btn.disabled = !ok;
  }
  f.addEventListener('change', recompute);
  f.addEventListener('input', recompute);
  setTimeout(() => { document.getElementById('uploading').remove(); recompute(); }, 900);
  const loc = document.getElementById('candidate-location');
  loc.addEventListener('input', () => {
    setTimeout(() => {
      document.getElementById('opts').innerHTML = loc.value ? '<li role="option" class="select__option">Milano, Lombardia, Italy</li>' : '';
    }, 400);
  });
  loc.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); loc.value = 'Milano, Lombardia, Italy'; loc.removeAttribute('role'); document.getElementById('opts').innerHTML=''; }
  });
</script>`;

async function main() {
  let browser: Browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    console.log(`SKIP test-greenhouse-submit-readiness: Chromium Playwright non disponibile (${(err as Error).message.split("\n")[0]})`);
    return;
  }
  try {
    const page = await browser.newPage();
    await page.setContent(FORM);

    // 1. upload in corso → poi si risolve
    assert.equal(await waitForUploadsSettled(page, 5000), true, "upload settle");
    assert.equal(await page.locator("#uploading").count(), 0);

    // 2. Submit disabilitato: diagnosi elenca i campi mancanti
    const submit = page.locator("#submit");
    const r1 = await ensureSubmitEnabled(page, submit, 1500);
    assert.equal(r1.enabled, false);
    if (r1.enabled) throw new Error("unreachable");
    const labels = r1.missing.map((m) => m.label);
    for (const want of ["Location (City)", "Notice period", "First Name", "Email", "Why us?", "Visa sponsorship", "I consent to the processing of my personal data"]) {
      assert.ok(labels.includes(want), `missing should include "${want}", got ${JSON.stringify(labels)}`);
    }
    assert.ok(!labels.includes("Send me marketing emails"), "optional marketing not listed");
    assert.equal(r1.missing.find((m) => m.label === "Notice period")?.kind, "react-select");
    const visa = r1.missing.find((m) => m.label === "Visa sponsorship");
    assert.deepEqual(visa?.options, ["Yes", "No"]);

    // 3. consenso GDPR spuntato via label, marketing NO
    const consents = await checkConsentBoxes(page);
    assert.equal(consents.length, 1, JSON.stringify(consents));
    assert.equal(await page.locator("#gdpr_q").isChecked(), true);
    assert.equal(await page.locator("#mkt").isChecked(), false);

    // 4. location autocomplete: digita, attende opzioni async, seleziona
    assert.equal(await fillLocationAutocomplete(page, "Milano"), true, "location filled");
    assert.equal(await page.locator("#candidate-location").inputValue(), "Milano, Lombardia, Italy");

    // 5. compila il resto (fill programmatico SENZA blur) → ancora disabilitato
    // (niente funzioni nominate dentro evaluate: tsx/esbuild aggiunge __name)
    await page.evaluate(() => {
      for (const [id, v] of [["first_name", "Umberto"], ["email", "u@example.com"], ["question_1", "Because."], ["question_2", "n"]]) {
        (document.getElementById(id) as HTMLInputElement).value = v;
      }
      // react-select: la selezione si vede come single-value nello shell
      document.querySelector(".select__value-container")!.insertAdjacentHTML("afterbegin", '<div class="select__single-value">2 weeks</div>');
    });
    assert.equal(await submit.isDisabled(), true, "still disabled without events");
    // nudge → input/change/blur → validazione React-like → abilitato
    assert.ok((await nudgeFormValidation(page)) >= 4);
    const r2 = await ensureSubmitEnabled(page, submit, 3000);
    assert.equal(r2.enabled, true, JSON.stringify(r2));
    assert.deepEqual(await diagnoseMissingFields(page, submit), []);

    console.log("PASS test-greenhouse-submit-readiness");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
