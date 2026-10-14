/** Synthetic UI test: no database, email account, provider or production traffic. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import serverChromium from '@sparticuz/chromium';

const out = join(tmpdir(), 'lavorai-inbound-inbox-preview');
await mkdir(out, { recursive: true });
const stub = {
  'next/navigation': `const router = { refresh: () => window.__refresh() }; const params = new URLSearchParams(); export const useRouter = () => router; export const useSearchParams = () => params;`,
  'next/link': `import React from 'react'; export default function Link(props) { return React.createElement('a', props); }`,
  '@/components/gmail-connect-modal': `export const GmailConnectModal = () => null;`,
  '@/components/design/company-logo': `export const CompanyLogo = () => null; export const companyColor = () => '#226644';`,
  '@/components/design/icon': `export const Icon = () => null;`,
  'sonner': `export const toast = { success: text => window.__notices.push(text), error: text => window.__notices.push(text) };`,
};
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { GmailInboxView } from './src/components/gmail-inbox-view';
const base = { from: 'Taylor Recruiter <taylor@example.test>', subject: 'Interview availability', snippet: 'Can we speak next week?', bodyText: 'Hello Alex,\\n\\nCan we speak next week?\\n\\n<img src="https://tracker.invalid/pixel" onerror="alert(1)"><script>alert(2)</script>\\nhttps://evil.invalid', date: '2026-10-13T12:00:00Z', kind: 'colloquio', label: 'Possible interview', read: null, source: 'application_reply', applicationId: 'application-a', applicationStatus: null, company: 'Example Studio', jobTitle: 'Product Designer', jobRelated: true };
const messages = [
  { ...base, id: 'application_reply:a' },
  { ...base, id: 'application_reply:receipt', subject: 'Application received', bodyText: 'Thank you for your application.', kind: 'ricevuta', label: 'Application receipt', date: '2026-10-13T11:00:00Z' },
  { ...base, id: 'application_reply:bounce', from: 'mailer-daemon@example.test', subject: 'Delivery failed', bodyText: 'The destination mailbox could not receive this email.', kind: 'bounce', label: 'Delivery failure', date: '2026-10-13T10:00:00Z' },
  { ...base, id: 'gmail:a', source: 'gmail', subject: 'Role update', bodyText: 'We have decided to proceed with another candidate.', kind: 'rifiutata', label: 'Possible rejection', read: false, applicationId: 'application-b', applicationStatus: 'offerta', date: '2026-10-13T09:00:00Z' }
];
window.__requests = []; window.__notices = []; window.__refreshCount = 0; window.__failStatus = false;
window.fetch = async (url, options) => { window.__requests.push({ url, options }); return { ok: !window.__failStatus, json: async () => ({ synced: 1 }) }; };
function Preview() {
  const [connected, setConnected] = React.useState(false);
  const [, setRefresh] = React.useState(0);
  window.__connect = () => setConnected(true);
  window.__refresh = () => { window.__refreshCount++; setRefresh(value => value + 1); };
  return <GmailInboxView messages={messages} gmailConnected={connected} userEmail="alex@example.test" />;
}
createRoot(document.getElementById('root')).render(<Preview />);
`;
await build({
  stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', outfile: join(out, 'inbox.js'),
  plugins: [{ name: 'isolated-boundaries', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => args.path in stub ? { path: args.path, namespace: 'test-stub' } : undefined);
    builder.onLoad({ filter: /.*/, namespace: 'test-stub' }, args => ({ contents: stub[args.path], loader: 'js', resolveDir: process.cwd() }));
  } }],
});
execFileSync(process.execPath, ['node_modules/tailwindcss/lib/cli.js', '-i', 'src/app/globals.css', '-o', join(out, 'inbox.css')], { stdio: 'pipe' });
await writeFile(join(out, 'index.html'), '<!doctype html><html lang="en" data-theme="light"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/inbox.css"></head><body><main id="root" style="height:100vh;min-height:0"></main><script src="/inbox.js"></script></body></html>');
const server = createServer(async (request, response) => {
  const file = request.url === '/inbox.js' ? 'inbox.js' : request.url === '/inbox.css' ? 'inbox.css' : 'index.html';
  response.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
  response.end(await readFile(join(out, file)));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
let browser;
try {
  browser = await chromium.launch({ executablePath: await serverChromium.executablePath(), args: serverChromium.args, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const externalRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    if (!route.request().url().startsWith(`http://127.0.0.1:${port}/`)) { externalRequests.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.getByRole('button', { name: 'Connect Gmail (optional)' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Sync Gmail', exact: true }).count(), 0);
  assert.equal(await page.locator('[aria-label="Messages"] button').count(), 4);
  assert.equal(await page.locator('[data-testid="message-body"] img, [data-testid="message-body"] script').count(), 0);
  assert.match(await page.getByTestId('message-body').innerText(), /<script>alert\(2\)<\/script>/);
  assert.equal(await page.locator('[data-testid="message-body"] a').count(), 0);
  await page.getByRole('button', { name: 'Refresh inbox' }).click();
  assert.equal(await page.evaluate(() => window.__requests.length), 0);
  assert.ok(await page.evaluate(() => window.__refreshCount) >= 1);
  await page.screenshot({ path: join(out, 'desktop-no-gmail.png'), fullPage: true });
  await page.getByLabel('Message type', { exact: true }).selectOption('bounce');
  assert.equal(await page.locator('[aria-label="Messages"] button').count(), 1);
  assert.match(await page.getByRole('region', { name: 'Message details' }).innerText(), /Delivery failed/);
  await page.getByLabel('Message type', { exact: true }).selectOption('all');
  await page.getByLabel('Search inbox', { exact: true }).fill('no match');
  assert.match(await page.locator('[aria-label="Messages"]').innerText(), /No messages match/);
  assert.match(await page.getByRole('region', { name: 'Message details' }).innerText(), /Select a message/);
  await page.getByLabel('Search inbox', { exact: true }).fill('');
  await page.locator('[aria-label="Messages"] button').last().click();
  assert.match(await page.getByRole('region', { name: 'Message details' }).innerText(), /Saved from Gmail/);
  assert.equal(await page.getByLabel('Manual application status', { exact: true }).inputValue(), 'offerta');
  await page.locator('[aria-label="Messages"] button').first().click();
  await page.getByLabel('Manual application status', { exact: true }).selectOption('inviata');
  await page.waitForFunction(() => window.__notices.includes('Application status updated.'));
  const first = await page.evaluate(() => window.__requests[0]);
  assert.equal(first.options.method, 'PATCH');
  assert.equal(first.url, '/api/applications/application-a');
  assert.deepEqual(JSON.parse(first.options.body), { userStatus: 'inviata' });
  await page.evaluate(() => { window.__failStatus = true; });
  await page.getByLabel('Manual application status', { exact: true }).selectOption('colloquio');
  await page.waitForFunction(() => window.__notices.includes("Couldn't update the application status."));
  assert.equal(await page.getByLabel('Manual application status', { exact: true }).inputValue(), 'inviata');
  await page.evaluate(() => { window.__failStatus = false; window.__connect(); });
  await page.getByRole('button', { name: 'Sync Gmail', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Gmail sync complete: 1 new messages.' }).waitFor();
  assert.equal(await page.evaluate(() => window.__requests.at(-1).url), '/api/gmail/sync');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(out, 'mobile.png'), fullPage: true });
  const widths = await page.evaluate(() => ({ body: document.body.scrollWidth, viewport: innerWidth }));
  assert.ok(widths.body <= widths.viewport, `Mobile horizontal overflow: ${JSON.stringify(widths)}`);
  assert.deepEqual(externalRequests, [], 'Raw email must not load tracking images or navigate to external links');
  assert.deepEqual(errors, []);
  console.log(`[inbound-inbox-browser] Desktop/mobile synthetic interaction and safe rendering passed. Screenshots: ${out}`);
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
