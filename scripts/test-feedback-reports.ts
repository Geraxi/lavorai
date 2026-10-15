/** Real route handlers + real ephemeral localhost PostgreSQL. Only auth identity
 * is stubbed. No ambient connection strings, provider calls or production data. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import vm from 'node:vm';
import ts from 'typescript';
import { PrismaClient } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import * as feedback from '../src/lib/feedback';
import * as billing from '../src/lib/billing';
import * as admin from '../src/lib/admin';
import * as csrf from '../src/lib/csrf';
import * as selects from '../src/lib/user-selects';

async function main() {
  const dir = await mkdtemp(join(tmpdir(), 'lavorai-feedback-'));
  const portProbe = createServer();
  await new Promise<void>((resolve, reject) => { portProbe.once('error', reject); portProbe.listen(0, '127.0.0.1', resolve); });
  const port = (portProbe.address() as { port: number }).port;
  await new Promise<void>(resolve => portProbe.close(() => resolve()));
  const pgBin = process.env.FEEDBACK_TEST_PG_BIN ?? '/opt/homebrew/opt/postgresql@16/bin';
  const databaseUrl = `postgresql://postgres@127.0.0.1:${port}/postgres?connection_limit=24`;
  const env = { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl };
  const dataDir = join(dir, 'data');
  const runPg = (binary: string, args: string[]) => execFileSync(join(pgBin, binary), args, { env, stdio: 'pipe' });
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } }, log: [] });
  let started = false;
  try {
    runPg('initdb', ['-D', dataDir, '-U', 'postgres', '-A', 'trust', '--no-locale', '-E', 'UTF8']);
    runPg('pg_ctl', ['-D', dataDir, '-l', join(dir, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${dir}`, '-w', 'start']); started = true;
    // Generate the pre-change schema, then apply the exact checked-in migration.
    const schema = await readFile('prisma/schema.prisma', 'utf8');
    const baseline = join(dir, 'baseline.prisma');
    await writeFile(baseline, schema.replace(/^  feedbackReports FeedbackReport\[\]\n/m, '').replace(/\/\/\/ User-initiated, text-only reports\.[\s\S]*?\n}\n\n(?=model UserPreferences)/, ''));
    const sql = execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', baseline, '--script'], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    for (const statement of sql.split(/;\s*(?:\n|$)/).filter(s => s.trim())) await db.$executeRawUnsafe(statement);
    await db.user.createMany({ data: [
      { id: 'alice', email: 'alice@example.invalid', tier: 'pro', subscriptionStatus: 'active' },
      { id: 'bob', email: 'bob@example.invalid', tier: 'pro', subscriptionStatus: 'active' },
      { id: 'admin', email: 'umbertogeraci0@gmail.com', tier: 'pro' },
      { id: 'suspended', email: 'suspended@example.invalid', tier: 'pro', suspendedAt: new Date() },
      { id: 'nocard', email: 'nocard@example.invalid', createdAt: new Date() },
      { id: 'expired', email: 'expired@example.invalid', createdAt: new Date('2026-01-01') },
    ] });
    const before = await db.user.findMany({ orderBy: { id: 'asc' } });
    const migration = await readFile('prisma/migrations/20261015120000_feedback_reports/migration.sql', 'utf8');
    for (const statement of migration.split(/;\s*(?:\n|$)/).filter(s => s.trim())) await db.$executeRawUnsafe(statement);
    assert.deepEqual(await db.user.findMany({ orderBy: { id: 'asc' } }), before, 'Migration preserves all existing users');
    assert.equal(await db.feedbackReport.count(), 0);
    console.log('PASS exact additive migration against populated pre-change schema.');

    let signedIn: string | null = null;
    const load = async (path: string, dependencies: Record<string, unknown>) => {
      const module = { exports: {} as any };
      const code = ts.transpileModule(await readFile(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
      vm.runInNewContext(code, { module, exports: module.exports, Date, Buffer, URL, console: { error() {} },
        require: (name: string) => { if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`); return dependencies[name]; },
        fetch: () => { throw new Error('External calls forbidden'); },
      }); return module.exports;
    };
    const dependencies = {
      'next/server': { NextResponse }, '@/lib/auth': { auth: async () => signedIn ? { user: { id: signedIn, email: 'umbertogeraci0@gmail.com' } } : null },
      '@/lib/db': { prisma: db }, '@/lib/admin': admin, '@/lib/csrf': csrf, '@/lib/user-selects': selects, '@/lib/billing': billing, '@/lib/feedback': feedback,
    };
    const server = await load('src/lib/feedback-server.ts', dependencies);
    const routes = { '@/lib/feedback-server': server, '@/lib/feedback': feedback, '@/lib/db': { prisma: db } };
    const user = await load('src/app/api/feedback/route.ts', routes);
    const inbox = await load('src/app/api/admin/reports/route.ts', routes);
    const detail = await load('src/app/api/admin/reports/[id]/route.ts', routes);
    const request = (path: string, method = 'GET', body?: unknown, extraHeaders: Record<string, string> = {}) => new NextRequest(`http://localhost${path}`, { method, headers: { host: 'localhost', origin: 'http://localhost', 'content-type': 'application/json', ...extraHeaders }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const valid = { category: 'bug', subject: 'Save does not work', description: 'Steps: select a role, press save. Expected confirmation; nothing happens.', pageContext: 'preferences', locale: 'en' };
    const context = (id: string) => ({ params: Promise.resolve({ id }) });
    const post = (body: unknown = valid) => user.POST(request('/api/feedback', 'POST', body)) as Promise<Response>;
    const expectStatus = async (promise: Promise<Response>, status: number) => { const result = await promise; assert.equal(result.status, status, await result.clone().text()); assert.match(result.headers.get('cache-control')!, /no-store/); return result; };
    await expectStatus(post(), 401);
    await expectStatus(user.GET(request('/api/feedback')), 401);
    await expectStatus(inbox.GET(request('/api/admin/reports')), 401);
    await expectStatus(detail.GET(request('/api/admin/reports/missing'), context('missing')), 401);
    await expectStatus(detail.PATCH(request('/api/admin/reports/missing', 'PATCH', { status: 'resolved' }), context('missing')), 401);
    for (const [id, status] of [['suspended', 403], ['nocard', 402], ['expired', 402], ['missing', 403]] as const) {
      signedIn = id; await expectStatus(post(), status); await expectStatus(user.GET(request('/api/feedback')), status);
    }
    signedIn = 'alice';
    const csrfRequest = request('/api/feedback', 'POST', valid, { origin: 'https://evil.invalid' });
    await expectStatus(user.POST(csrfRequest), 403);
    const missingOrigin = request('/api/feedback', 'POST', valid); missingOrigin.headers.delete('origin');
    await expectStatus(user.POST(missingOrigin), 403);
    await expectStatus(user.POST(request('/api/feedback', 'POST', valid, { 'content-type': 'text/plain' })), 415);
    const invalid = [null, [], {}, { ...valid, category: 'admin' }, { ...valid, subject: '  ' }, { ...valid, subject: 'x'.repeat(121) }, { ...valid, description: 'short' }, { ...valid, description: 'x'.repeat(4001) }, { ...valid, description: 'control\u0000bad' }, { ...valid, locale: 'fr' }, { ...valid, userId: 'bob' }, { ...valid, status: 'resolved' }, { ...valid, pageContext: 'https://lavorai.it/?token=secret' }, { ...valid, debugLogs: 'private' }, { ...valid, attachment: 'file' }];
    for (const body of invalid) await expectStatus(post(body), 400);
    await expectStatus(user.POST(new NextRequest('http://localhost/api/feedback', { method: 'POST', headers: { host: 'localhost', origin: 'http://localhost', 'content-type': 'application/json' }, body: '{bad json' })), 400);
    await expectStatus(post({ ...valid, description: 'x'.repeat(25_000) }), 413);
    const large = request('/api/feedback', 'POST', valid, { 'content-length': '25001' }); await expectStatus(user.POST(large), 413);
    const encoder = new TextEncoder();
    const chunks = new ReadableStream({ start(controller) { for (let i = 0; i < 4; i++) controller.enqueue(encoder.encode('x'.repeat(7000))); controller.close(); } });
    await expectStatus(user.POST(new NextRequest('http://localhost/api/feedback', { method: 'POST', headers: { host: 'localhost', origin: 'http://localhost', 'content-type': 'application/json', 'content-length': '1' }, body: chunks, duplex: 'half' } as ConstructorParameters<typeof NextRequest>[1])), 413);
    assert.equal(await db.feedbackReport.count(), 0, 'Rejected inputs create no reports');
    const created = await expectStatus(post({ ...valid, subject: '  Save does not work  ' }), 201);
    const report = (await created.json()).report;
    assert.equal(report.subject, valid.subject); assert.equal(report.status, 'new'); assert.equal(report.pageContext, 'preferences');
    assert.equal((await db.feedbackReport.findUniqueOrThrow({ where: { id: report.id } })).userId, 'alice');
    const own = await expectStatus(user.GET(request('/api/feedback?userId=bob')), 200);
    const ownBody = await own.json(); assert.equal(ownBody.reports.length, 1); assert.equal(ownBody.reports[0].user, undefined);
    signedIn = 'bob';
    assert.equal((await (await user.GET(request('/api/feedback?userId=alice'))).json()).reports.length, 0);
    await expectStatus(inbox.GET(request('/api/admin/reports')), 403);
    await expectStatus(detail.GET(request('/api/admin/reports/' + report.id), context(report.id)), 403);
    await expectStatus(detail.PATCH(request('/api/admin/reports/' + report.id, 'PATCH', { status: 'resolved' }), context(report.id)), 403);
    console.log('PASS authentication, suspension/card/trial gates, CSRF, bounded JSON, strict validation and report ownership.');

    signedIn = 'admin';
    const all = await expectStatus(inbox.GET(request('/api/admin/reports?category=bug&status=new')), 200);
    assert.equal((await all.json()).reports[0].user.email, 'alice@example.invalid');
    await expectStatus(detail.GET(request('/api/admin/reports/' + report.id), context(report.id)), 200);
    await expectStatus(detail.GET(request('/api/admin/reports/missing'), context('missing')), 404);
    await expectStatus(detail.PATCH(request('/api/admin/reports/missing', 'PATCH', { status: 'closed' }), context('missing')), 404);
    for (const body of [{ status: 'unknown' }, { status: 'resolved', userId: 'bob' }, { status: 'resolved', description: 'overwrite' }]) await expectStatus(detail.PATCH(request('/api/admin/reports/' + report.id, 'PATCH', body), context(report.id)), 400);
    await expectStatus(detail.PATCH(request('/api/admin/reports/' + report.id, 'PATCH', { status: 'resolved' }, { origin: 'https://evil.invalid' }), context(report.id)), 403);
    for (const status of feedback.REPORT_STATUSES) await expectStatus(detail.PATCH(request('/api/admin/reports/' + report.id, 'PATCH', { status }), context(report.id)), 200);
    assert.equal((await db.feedbackReport.findUniqueOrThrow({ where: { id: report.id } })).status, 'closed');
    await expectStatus(inbox.GET(request('/api/admin/reports?category=unknown')), 400);
    await expectStatus(inbox.GET(request('/api/admin/reports?status=unknown')), 400);
    for (const page of ['0', '-1', '1.5', '10000', 'junk']) await expectStatus(inbox.GET(request('/api/admin/reports?page=' + page)), 400);
    console.log('PASS admin list/detail/status updates, filters, status-only writes and non-admin rejection.');

    signedIn = 'alice';
    const simultaneous = await Promise.all(Array.from({ length: 12 }, () => post()));
    assert.equal(simultaneous.filter(r => r.status === 201).length, 4, 'Exactly five accepted including the earlier report');
    assert.equal(simultaneous.filter(r => r.status === 429).length, 8);
    assert.ok(Number(simultaneous.find(r => r.status === 429)!.headers.get('retry-after')) > 0);
    const afterRestart = await load('src/lib/feedback-server.ts', dependencies);
    await assert.rejects(() => afterRestart.createReport('alice', valid), (e: any) => e.code === 'rate_limited');
    await db.feedbackReport.updateMany({ where: { userId: 'alice' }, data: { createdAt: new Date(Date.now() - 2 * 3_600_000) } });
    await db.feedbackReport.createMany({ data: Array.from({ length: 15 }, (_, i) => ({ ...valid, userId: 'alice', subject: 'Daily fixture ' + i, createdAt: new Date(Date.now() - 2 * 3_600_000) })) });
    await expectStatus(post(), 429);
    // Other users have an independent allowance; Unicode at the boundary succeeds.
    signedIn = 'bob'; await expectStatus(post({ ...valid, category: 'feedback', locale: 'it', pageContext: null, description: '好'.repeat(4000) }), 201);
    await db.feedbackReport.updateMany({ where: { userId: 'alice' }, data: { createdAt: new Date(Date.now() - 25 * 3_600_000) } });
    signedIn = 'alice'; await expectStatus(post({ ...valid, pageContext: undefined }), 201);
    const page1 = await (await user.GET(request('/api/feedback'))).json();
    const page2 = await (await user.GET(request('/api/feedback?page=2'))).json();
    assert.equal(page1.reports.length, 20); assert.equal(page1.hasMore, true); assert.equal(page2.reports.length, 1);
    assert.equal(new Set([...page1.reports, ...page2.reports].map(r => r.id)).size, 21);
    console.log('PASS concurrent hourly limits, daily limit, independent users, restart durability, expiry and bounded pagination.');

    for (const invalidData of [{ category: 'oops' }, { status: 'oops' }, { pageContext: '/private?secret=1' }, { subject: 'x'.repeat(121) }]) {
      await assert.rejects(() => db.feedbackReport.create({ data: { ...valid, userId: 'alice', ...invalidData } }));
    }
    await db.user.delete({ where: { id: 'bob' } });
    assert.equal(await db.feedbackReport.count({ where: { userId: 'bob' } }), 0);
    const failedServer = await load('src/lib/feedback-server.ts', { ...dependencies, '@/lib/db': { prisma: { user: { findUnique: async () => { throw new Error('synthetic secret'); } } } } });
    const failedRoute = await load('src/app/api/feedback/route.ts', { ...routes, '@/lib/feedback-server': failedServer });
    const failed = await expectStatus(failedRoute.POST(request('/api/feedback', 'POST', valid)), 503);
    assert.deepEqual(await failed.json(), { error: 'unavailable' });
    console.log('PASS database constraints, account deletion cascade, fail-closed outage without leaked error details.');
  } finally {
    await db.$disconnect();
    if (started) runPg('pg_ctl', ['-D', dataDir, '-m', 'immediate', '-w', 'stop']);
    await rm(dir, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
