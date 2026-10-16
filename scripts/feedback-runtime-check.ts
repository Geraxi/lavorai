/** Run the compiled Next app only against the caller's ephemeral local database. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { encode } from 'next-auth/jwt';
import { chromium } from 'playwright';
import type { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import { syntheticPdf } from './feedback-file-fixtures';

export async function runtimeCheck(db: PrismaClient, databaseUrl: string) {
  assert.match(databaseUrl, /^postgresql:\/\/postgres@127\.0\.0\.1:/);
  const probe = createServer(); await new Promise<void>(r => probe.listen(0, '127.0.0.1', r));
  const port = (probe.address() as { port: number }).port; await new Promise<void>(r => probe.close(() => r()));
  const base = `http://127.0.0.1:${port}`, secret = 'synthetic-local-feedback-runtime-secret-only';
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, NODE_ENV: 'production', AUTH_SECRET: secret, AUTH_TRUST_HOST: 'true', AUTH_URL: base, NEXTAUTH_URL: base, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl, NEXT_PUBLIC_SITE_URL: base };
  const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { env, cwd: process.env.FEEDBACK_RUNTIME_BUILD_DIR ?? process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; app.stdout.on('data', d => { logs += d; }); app.stderr.on('data', d => { logs += d; });
  let browser;
  const out = resolve('output/playwright/feedback-runtime'); await mkdir(out, { recursive: true });
  try {
    let ready = false;
    for (let n = 0; n < 100; n++) {
      if (app.exitCode !== null) throw Error(`Local app exited: ${logs}`);
      try { const response = await fetch(base + '/api/feedback'); if (response.status === 401) { ready = true; break; } } catch {}
      await new Promise(r => setTimeout(r, 200));
    }
    assert.ok(ready, logs);
    await db.user.createMany({ data: [
      { id: 'runtime-free', email: 'runtime-free@example.invalid', tier: 'free', createdAt: new Date(), emailVerified: new Date() },
      { id: 'runtime-expired', email: 'runtime-expired@example.invalid', tier: 'free', createdAt: new Date('2026-01-01'), trialEndsAt: new Date('2026-01-08'), emailVerified: new Date() },
      { id: 'runtime-paid', email: 'runtime-paid@example.invalid', tier: 'pro', subscriptionStatus: 'active', emailVerified: new Date() },
      { id: 'runtime-suspended', email: 'runtime-suspended@example.invalid', tier: 'pro', suspendedAt: new Date(), emailVerified: new Date() },
    ] });
    const tokens: Record<string, string> = {};
    for (const id of ['runtime-free', 'runtime-expired', 'runtime-paid', 'runtime-suspended']) tokens[id] = await encode({ token: { sub: id, email: `${id}@example.invalid`, name: 'Synthetic Local' }, secret, salt: 'authjs.session-token' });
    const req = (id: string, path: string, init: RequestInit = {}) => fetch(base + path, { ...init, redirect: 'manual', headers: { Cookie: `authjs.session-token=${tokens[id]}`, Origin: base, ...init.headers } });
    for (const id of ['runtime-free', 'runtime-expired', 'runtime-paid']) {
      assert.equal((await req(id, '/feedback')).status, 200);
      assert.equal((await req(id, '/api/feedback')).status, 200);
      assert.equal((await req(id, '/api/admin/reports')).status, 403);
    }
    for (const id of ['runtime-free', 'runtime-expired']) {
      assert.equal((await req(id, '/api/sidebar-stats')).status, 402);
      const gated = await req(id, '/dashboard'); assert.ok([307, 308].includes(gated.status)); assert.match(gated.headers.get('location')!, /start-membership|trial-expired/);
    }
    assert.equal((await req('runtime-suspended', '/api/feedback')).status, 403);
    assert.match((await req('runtime-suspended', '/feedback')).headers.get('location')!, /AccountSuspended/);
    const data = new FormData(); data.append('report', JSON.stringify({ category: 'bug', subject: 'Local runtime test', description: 'Synthetic local upload test only, no production data.', locale: 'en' }));
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#18b980' } }).png().toBuffer();
    data.append('files', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'screen.png');
    data.append('files', new Blob([new Uint8Array(syntheticPdf())], { type: 'application/pdf' }), 'note.pdf');
    const deniedPdf = await req('runtime-free', '/api/feedback', { method: 'POST', body: data });
    assert.equal(deniedPdf.status, 415); assert.equal((await deniedPdf.json()).error, 'pdf_disabled');
    assert.equal(await db.feedbackReport.count({ where: { userId: 'runtime-free' } }), 0);
    data.delete('files'); data.append('files', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'screen.png');
    const posted = await req('runtime-free', '/api/feedback', { method: 'POST', body: data });
    assert.equal(posted.status, 201, await posted.clone().text());
    const report = (await posted.json()).report;
    const imagePath = `/api/feedback/${report.id}/attachments/${report.attachments[0].id}`;
    assert.equal((await req('runtime-free', imagePath)).status, 200);
    assert.equal((await req('runtime-paid', imagePath)).status, 404);
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext();
    await context.addCookies([{ name: 'authjs.session-token', value: tokens['runtime-free'], url: base }, { name: 'NEXT_LOCALE', value: 'en', url: base }]);
    const page = await context.newPage(); const requested: string[] = [], errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => { if (!route.request().url().startsWith(base)) return route.abort(); requested.push(route.request().url()); return route.continue(); });
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      await page.setViewportSize({ width, height }); await page.goto(base + '/feedback');
      await page.getByRole('heading', { name: 'Help shape a better LavorAI' }).waitFor();
      await page.getByRole('heading', { name: 'Local runtime test' }).waitFor();
      assert.equal(await page.locator('input[type=file]').getAttribute('accept'), '.png,.jpg,.jpeg,.webp');
      await page.getByText(/PDF upload is currently unavailable/).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: resolve(out, `real-support-${width}.png`) });
    }
    assert.equal(requested.some(url => url.includes('/api/sidebar-stats') || url.includes('/api/preferences')), false);
    assert.deepEqual(errors, []);
    await writeFile(resolve(out, 'qa-result.json'), JSON.stringify({ passed: true, realNextProductionRuntime: true, realAuthJsSyntheticSessions: true, ephemeralLocalPostgres: true, checks: ['free/no-card/expired/paid support access', 'paid page/API gates remain', 'suspension', 'admin denial', 'multipart images with PDFs rejected before storage when scanner is absent', 'owner image download and cross-user denial', 'desktop/mobile support rendering and no paid feature requests'] }, null, 2));
    console.log('PASS compiled Next runtime + real Auth.js synthetic sessions + ephemeral PostgreSQL, real multipart images, disabled unconfigured PDFs and owner downloads, free/expired/paid/suspended gates, desktop/mobile Chrome.');
  } finally {
    if (browser) await browser.close();
    app.kill('SIGTERM'); await new Promise<void>(resolve => { if (app.exitCode !== null) resolve(); else app.once('exit', () => resolve()); });
    await writeFile(resolve(out, 'server.log'), logs);
  }
}
