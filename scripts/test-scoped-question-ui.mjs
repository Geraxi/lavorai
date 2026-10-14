/** Real QuestionsView with synthetic owned forms and isolated API boundaries. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import serverChromium from '@sparticuz/chromium';
const out = join(tmpdir(), 'lavorai-scoped-question-preview');
await mkdir(out, { recursive: true });
const fingerprint = (label, kind, options) => createHash('sha256').update(JSON.stringify([label, kind, options])).digest('hex');
const card = (applicationId, company, title, label, kind, options) => {
  const fp = fingerprint(label, kind, options);
  return { id: `${applicationId}:${fp}`, applicationId, fingerprint: fp, labelKey: label.toLowerCase(), label, kind, options,
    answer: '', source: 'pending', suggestion: null, suggestionSource: null, requiresApplicationScope: true,
    applications: [{ id: applicationId, company, title, location: 'Milano', description: 'Synthetic role for local verification' }] };
};
const cards = [card('alpha', 'Alpha Studio', 'Product Designer', 'I agree', 'checkbox', []),
  card('beta', 'Beta Company', 'UX Researcher', 'I agree', 'checkbox', []),
  card('gamma', 'Gamma Team', 'Engineer', 'Work arrangement', 'radio', ['Onsite', 'Remote']),
  card('delta', 'Delta Agency', 'Developer', 'Work arrangement', 'radio', ['Hybrid', 'Remote'])];
const stub = {
  'next/link': `import React from 'react'; export default function Link(props) { return React.createElement('a', props); }`,
  '@/components/design/topbar': `export const AppTopbar = () => null;`,
  '@/components/design/company-logo': `export const CompanyLogo = () => null; export const companyColor = () => '#226644';`,
};
await build({
  stdin: { contents: `import React from 'react'; import { createRoot } from 'react-dom/client'; import { QuestionsView } from './src/app/(app)/questions/questions-view';
  window.__requests = []; window.__fail = false; window.__cards = ${JSON.stringify(cards)};
  window.fetch = async (url, options) => { window.__requests.push({url, options});
    if (!options?.method) return { ok: true, json: async () => ({ questions: window.__cards, waitingApplications: 4, locale: 'en' }) };
    const body = JSON.parse(options.body);
    if (body.reuseCvOnly) return {ok:true,json:async()=>({ok:true})};
    if(window.__fail) return {ok:false,status:409,json:async()=>({error:'questions_changed_reload'})};
    return {ok:true,json:async()=>({saved:body.answers.length,requeued:body.answers[0].answer==='No'?0:1,remainingApplications:3})};
  };
  createRoot(document.getElementById('root')).render(<QuestionsView />);`, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', outfile: join(out, 'questions.js'),
  plugins: [{ name: 'isolated-boundaries', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => args.path in stub ? { path: args.path, namespace: 'test-stub' } : undefined);
    builder.onLoad({ filter: /.*/, namespace: 'test-stub' }, args => ({ contents: stub[args.path], loader: 'js', resolveDir: process.cwd() }));
  } }],
});
execFileSync(process.execPath, ['node_modules/tailwindcss/lib/cli.js', '-i', 'src/app/globals.css', '-o', join(out, 'base.css')], { stdio: 'pipe' });
await writeFile(join(out, 'questions.css'), await readFile(join(out, 'base.css'), 'utf8') + '\n' + await readFile('src/app/(app)/questions/questions.css', 'utf8'));
await writeFile(join(out, 'index.html'), '<!doctype html><html lang="it" data-theme="light"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/questions.css"></head><body style="font-family:Arial,sans-serif"><main id="root"></main><script src="/questions.js"></script></body></html>');
const server = createServer(async (request, response) => {
  const file = request.url === '/questions.js' ? 'questions.js' : request.url === '/questions.css' ? 'questions.css' : 'index.html';
  response.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
  response.end(await readFile(join(out, file)));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
let browser;
try {
  browser = await chromium.launch({ executablePath: await serverChromium.executablePath(), args: serverChromium.args, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    if (!route.request().url().startsWith(`http://127.0.0.1:${port}/`)) { external.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.locator('article.qa-row').nth(3).waitFor();
  const alpha = page.locator('article.qa-row').filter({ hasText: 'Alpha Studio' });
  const beta = page.locator('article.qa-row').filter({ hasText: 'Beta Company' });
  assert.equal(await alpha.count(), 1); assert.equal(await beta.count(), 1);
  assert.match(await alpha.innerText(), /I agree/); assert.match(await beta.innerText(), /I agree/);
  assert.match(await alpha.innerText(), /Product Designer/); assert.match(await beta.innerText(), /UX Researcher/);
  await page.screenshot({ path: join(out, 'desktop-distinct-employers.png'), fullPage: true });
  await alpha.locator('.qa-row-head').click();
  assert.equal(await alpha.locator('input:checked').count(), 0, 'Generic legal consent must not be preselected');
  await alpha.locator('input[value="Yes"]').locator('..').click();
  await alpha.getByRole('button', { name: 'Salva risposta', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'candidatura ripartita' }).waitFor();
  let submissions = await page.evaluate(() => window.__requests.filter(request => request.options?.body && JSON.parse(request.options.body).answers).map(request => JSON.parse(request.options.body)));
  assert.deepEqual(submissions[0].answers, [{ applicationId: 'alpha', fingerprint: cards[0].fingerprint, answer: 'Yes' }]);
  await beta.locator('.qa-row-head').click();
  assert.equal(await beta.locator('input:checked').count(), 0, 'Saving Alpha consent must not select Beta consent');
  await beta.locator('input[value="No"]').locator('..').click();
  await beta.getByRole('button', { name: 'Salva risposta', exact: true }).click();
  await page.waitForFunction(() => window.__requests.filter(request => request.options?.body && JSON.parse(request.options.body).answers).length === 2);
  submissions = await page.evaluate(() => window.__requests.filter(request => request.options?.body && JSON.parse(request.options.body).answers).map(request => JSON.parse(request.options.body)));
  assert.deepEqual(submissions[1].answers, [{ applicationId: 'beta', fingerprint: cards[1].fingerprint, answer: 'No' }]);
  const delta = page.locator('article.qa-row').filter({ hasText: 'Delta Agency' });
  await delta.locator('.qa-row-head').click();
  assert.equal(await delta.locator('input[value="Hybrid"]').count(), 1);
  assert.equal(await delta.locator('input[value="Onsite"]').count(), 0);
  await delta.locator('input[value="Hybrid"]').locator('..').click();
  await page.evaluate(() => { window.__fail = true; });
  await delta.getByRole('button', { name: 'Salva risposta', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Il form o le risposte sono cambiati' }).waitFor();
  assert.equal(await delta.count(), 1, 'A failed CAS must not make the question look completed');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(out, 'mobile-scoped-question.png'), fullPage: true });
  const widths = await page.evaluate(() => ({ body: document.body.scrollWidth, viewport: innerWidth }));
  assert.ok(widths.body <= widths.viewport, `Mobile overflow: ${JSON.stringify(widths)}`);
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log(`[scoped-question-ui] Real desktop/mobile rendering, independent employer consent, app+fingerprint payloads, distinct options and conflict state passed. Screenshots: ${out}`);
} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
