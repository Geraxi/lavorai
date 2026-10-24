import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { chromium } from "playwright";
import * as facts from "../src/lib/candidate-facts";
import * as safety from "../src/lib/portal-adapters/answer-safety";
import * as formLabels from "../src/lib/portal-adapters/form-labels";

// Actual ATS scanner/filler and browser DOM, with no employer, AI or DB access.
const module = { exports: {} as any };
const dependencies: Record<string, unknown> = {
  "../candidate-facts": facts, "./answer-safety": safety, "./form-labels": formLabels,
  "@/lib/ai-router": { complete: () => { throw new Error("AI forbidden in factual browser tests"); } },
};
vm.runInNewContext(ts.transpileModule(readFileSync("src/lib/portal-adapters/ai-answer.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module, exports: module.exports, process: { env: {} }, console,
  require: (id: string) => { assert.ok(id in dependencies, id); return dependencies[id]; } });

async function main() {
  const browser = await chromium.launch(process.platform === "darwin" ? { channel: "chrome", headless: true } : { headless: true });
  try {
    const page = await browser.newPage();
    const external: string[] = [], errors: string[] = [];
    await page.route("**/*", route => { external.push(route.request().url()); return route.abort(); });
    page.on("pageerror", error => errors.push(error.message));
    const widget = async (label: string, initial: string[], delayed: string[], phone = false) => {
      await page.setContent(`<form><div class="${phone ? "phone-field" : "field"}"><label for="${phone ? "phone-country" : "city"}">${label}</label>
        <div class="select-shell"><input required id="${phone ? "phone-country" : "city"}" role="combobox" aria-controls="options" aria-autocomplete="list"><span class="single-value"></span></div>
        <div id="options" role="listbox"></div></div><button type="submit">Submit</button></form>
        <script>(() => {
        const input = document.querySelector('input'), list = document.querySelector('#options'), value = document.querySelector('.single-value');
        const render = values => { list.replaceChildren(...values.map(text => { const el = document.createElement('div'); el.setAttribute('role','option'); el.textContent = text;
          el.onclick = () => { value.textContent = text; input.value = ''; list.replaceChildren(); }; return el; })); };
        input.onclick = () => render(${JSON.stringify(initial)});
        input.oninput = () => { render(['Unrelated stale result']); setTimeout(() => render(${JSON.stringify(delayed)}), 1100); };
        input.onkeydown = e => { if (e.key === 'Escape') list.replaceChildren(); };
        document.querySelector('form').onsubmit = e => { e.preventDefault(); throw new Error('No submissions allowed'); };
        })();</script>`);
    };
    await widget("Location (City)", ["Roma"], ["Milano"]);
    const city = await module.exports.answerRequiredFields(page, { city: "Milano", country: "Italy" });
    assert.equal(city.answered, 1); assert.equal(city.remainingRequired, 0);
    assert.equal(await page.locator(".single-value").textContent(), "Milano");
    await widget("Location (City)", ["Roma"], ["Milano Marittima"]);
    const absent = await module.exports.answerRequiredFields(page, { city: "Milano" });
    assert.equal(absent.answered, 0); assert.equal(absent.remainingRequired, 1);
    assert.equal(await page.locator(".single-value").textContent(), "");
    await widget("Location (City)", ["Roma"], ["Milano Marittima"]);
    await page.locator(".single-value").evaluate(el => { el.textContent = "Roma"; });
    const preset = await module.exports.answerRequiredFields(page, { city: "Milano" }, { includePopulated: true });
    assert.equal(preset.answered, 0); assert.equal(preset.remainingRequired, 1, "An unapplied candidate fact cannot be replaced by an employer default");
    assert.equal(preset.unanswered[0].label, "Location (City)");
    await widget("Country", ["Italy (+39)", "United Kingdom (+44)"], ["Italy (+39)", "United Kingdom (+44)"], true);
    const phone = await module.exports.answerRequiredFields(page, { phone: "+44 7911 123456", country: "Italy" });
    assert.equal(phone.answered, 1); assert.equal(phone.remainingRequired, 0);
    assert.equal(await page.locator(".single-value").textContent(), "United Kingdom (+44)");
    await widget("Country", ["United States (+1)", "Canada (+1)"], ["United States (+1)", "Canada (+1)"], true);
    const nanp = await module.exports.answerRequiredFields(page, { phone: "+1 212 555 1234", country: "Canada" });
    assert.equal(nanp.answered, 1); assert.equal(nanp.remainingRequired, 0);
    assert.equal(await page.locator(".single-value").textContent(), "Canada (+1)");
    await widget("Country", ["United States (+1)", "Canada (+1)"], ["United States (+1)", "Canada (+1)"], true);
    const ambiguous = await module.exports.answerRequiredFields(page, { phone: "+1 212 555 1234" });
    assert.equal(ambiguous.answered, 0); assert.equal(ambiguous.remainingRequired, 1);
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
    console.log("PASS real browser: delayed city option, stale unrelated results, phone-country metadata, prefix versus residence, shared +1 disambiguated by country. No external requests or submissions.");
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
