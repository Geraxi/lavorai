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
import * as attachmentHelpers from '../src/lib/feedback-attachments';
import * as reportErrors from '../src/lib/feedback-errors';
import sharp from 'sharp';
import { syntheticPdf } from './feedback-file-fixtures';
import { requiresTrialAccess } from '../src/lib/trial-access';

async function main() {
  delete process.env.FEEDBACK_CLAMD_HOST; delete process.env.FEEDBACK_CLAMD_SOCKET;
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
    await writeFile(baseline, schema.replace(/^  feedbackReports FeedbackReport\[\]\n/m, '').replace(/^  feedbackUploadBudget FeedbackUploadBudget\?\n/m, '').replace(/\/\/\/ User-initiated reports\.[\s\S]*?(?=model UserPreferences)/, ''));
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
    const oldReport = await db.feedbackReport.create({ data: { userId: 'alice', category: 'bug', subject: 'Existing report', description: 'Existing text survives migration', locale: 'en' } });
    const attachmentMigration = await readFile('prisma/migrations/20261016120000_feedback_attachments/migration.sql', 'utf8');
    for (const statement of attachmentMigration.split(/;\s*(?:\n|$)/).filter(s => s.trim())) await db.$executeRawUnsafe(statement);
    assert.deepEqual(await db.feedbackReport.findUnique({ where: { id: oldReport.id } }), oldReport);
    assert.deepEqual(await db.user.findMany({ orderBy: { id: 'asc' } }), before);
    await db.feedbackReport.delete({ where: { id: oldReport.id } });
    assert.equal(await db.feedbackAttachment.count(), 0);
    console.log('PASS exact additive migration against populated pre-change schema.');

    let signedIn: string | null = null;
    const load = async (path: string, dependencies: Record<string, unknown>) => {
      const module = { exports: {} as any };
      const code = ts.transpileModule(await readFile(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
      vm.runInNewContext(code, { module, exports: module.exports, Date, Buffer, URL, Response, Uint8Array, console: { error() {} },
        require: (name: string) => { if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`); return dependencies[name]; },
        fetch: () => { throw new Error('External calls forbidden'); },
      }); return module.exports;
    };
    const dependencies = {
      'next/server': { NextResponse }, '@/lib/auth': { auth: async () => signedIn ? { user: { id: signedIn, email: 'umbertogeraci0@gmail.com' } } : null },
      '@/lib/db': { prisma: db }, '@/lib/admin': admin, '@/lib/csrf': csrf, '@/lib/user-selects': selects, '@/lib/billing': billing, '@/lib/feedback': feedback, './feedback-errors': reportErrors, './feedback-attachments': attachmentHelpers,
    };
    const server = await load('src/lib/feedback-server.ts', dependencies);
    const upload = await load('src/lib/feedback-upload.ts', { './feedback': feedback, './feedback-server': server, './feedback-errors': reportErrors, './feedback-attachments': attachmentHelpers });
    let scanResult = 'unavailable';
    const routes = { '@/lib/feedback-upload': upload, '@/lib/admin': admin, '@/lib/feedback-scanner': { scanFeedbackFile: async () => { if (scanResult === 'infected') throw new reportErrors.ReportError('attachment_rejected', 400); return scanResult; } }, '@/lib/feedback-server': server, '@/lib/feedback': feedback, './feedback-errors': reportErrors, './feedback-attachments': attachmentHelpers, '@/lib/db': { prisma: db } };
    const fileRoute = await load('src/app/api/feedback/[reportId]/attachments/[id]/route.ts', routes);
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
    for (const [id, status] of [['suspended', 403], ['missing', 403]] as const) {
      signedIn = id; await expectStatus(post(), status); await expectStatus(user.GET(request('/api/feedback')), status);
    }
    for (const id of ['nocard', 'expired']) {
      signedIn = id; await expectStatus(post(), 201); await expectStatus(user.GET(request('/api/feedback')), 200);
      await expectStatus(inbox.GET(request('/api/admin/reports')), 403);
    }
    await db.feedbackReport.deleteMany();
    assert.equal(requiresTrialAccess('/feedback'), false); assert.equal(requiresTrialAccess('/api/feedback/report/attachments/file'), false);
    for (const path of ['/dashboard', '/onboarding', '/applications', '/api/applications', '/api/sidebar-stats', '/api/cv']) assert.equal(requiresTrialAccess(path), true);
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
    console.log('PASS real authentication and suspension gate, free/no-card/expired support access with paid routes still gated, CSRF, bounded JSON, strict validation and report ownership.');

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

    // Attachments: real route parsing, validation, SQL, ownership, cascades and quotas.
    await db.feedbackReport.deleteMany();
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#19af78' } }).png().toBuffer();
    const file = (data: Buffer, name = 'evidence.png', type = 'image/png') => new File([new Uint8Array(data)], name, { type });
    const multipart = (files: File[], alter?: (form: FormData) => void) => {
      const form = new FormData(); form.append('report', JSON.stringify(valid)); files.forEach(f => form.append('files', f)); alter?.(form);
      return new NextRequest('http://localhost/api/feedback', { method: 'POST', headers: { host: 'localhost', origin: 'http://localhost' }, body: form });
    };
    const uploadFiles = (files: File[], alter?: (form: FormData) => void) => user.POST(multipart(files, alter));
    const fileContext = (reportId: string, id: string) => ({ params: Promise.resolve({ reportId, id }) });
    signedIn = 'nocard';
    const uploadResult = await expectStatus(uploadFiles([file(png), file(syntheticPdf(), 'evidence.pdf', 'application/pdf')]), 201);
    const withFiles = (await uploadResult.json()).report;
    const imageFile = withFiles.attachments[0], pdfFile = withFiles.attachments[1];
    assert.equal(imageFile.scanStatus, 'sanitized'); assert.equal(pdfFile.scanStatus, 'quarantined');
    assert.equal(imageFile.data, undefined); assert.equal(imageFile.reportId, undefined);
    assert.ok(!JSON.stringify(withFiles).includes('storagePath'));
    const imageCtx = fileContext(withFiles.id, imageFile.id), pdfCtx = fileContext(withFiles.id, pdfFile.id);
    const getFile = (ctx = imageCtx) => fileRoute.GET(request('/api/feedback/file'), ctx);
    const download = await expectStatus(getFile(), 200);
    assert.equal(download.headers.get('content-type'), 'image/png'); assert.match(download.headers.get('content-disposition')!, /^attachment;/);
    assert.equal(download.headers.get('x-content-type-options'), 'nosniff'); assert.match(download.headers.get('content-security-policy')!, /sandbox/);
    assert.ok((await download.arrayBuffer()).byteLength > 0);
    await expectStatus(getFile(pdfCtx), 423);
    await expectStatus(getFile(fileContext('wrongreport', imageFile.id)), 404);
    await expectStatus(fileRoute.POST(request('/api/feedback/file', 'POST'), pdfCtx), 403);
    signedIn = 'expired'; await expectStatus(getFile(), 404);
    await expectStatus(fileRoute.DELETE(request('/api/feedback/file', 'DELETE'), imageCtx), 404);
    signedIn = 'alice'; await expectStatus(getFile(), 404);
    signedIn = null; await expectStatus(getFile(), 401);
    signedIn = 'suspended'; await expectStatus(getFile(), 403);
    signedIn = 'admin'; await expectStatus(getFile(), 200); await expectStatus(getFile(pdfCtx), 423);
    await expectStatus(fileRoute.POST(request('/api/feedback/file', 'POST'), pdfCtx), 503);
    await expectStatus(fileRoute.POST(request('/api/feedback/file', 'POST', undefined, { origin: 'https://evil.invalid' }), pdfCtx), 403);
    scanResult = 'clean'; await expectStatus(fileRoute.POST(request('/api/feedback/file', 'POST'), pdfCtx), 200);
    signedIn = 'nocard'; await expectStatus(getFile(pdfCtx), 200);
    await expectStatus(fileRoute.DELETE(request('/api/feedback/file', 'DELETE', undefined, { origin: 'https://evil.invalid' }), imageCtx), 403);
    await expectStatus(fileRoute.DELETE(request('/api/feedback/file', 'DELETE'), imageCtx), 200);
    await expectStatus(getFile(), 404);
    assert.equal(await db.feedbackAttachment.count(), 1);
    await db.feedbackReport.delete({ where: { id: withFiles.id } }); assert.equal(await db.feedbackAttachment.count(), 0);

    signedIn = 'alice';
    for (const files of [[file(Buffer.from('<svg onload="alert(1)"/>'))], [file(png, 'wrong.pdf', 'application/pdf')], [file(png), file(png), file(png), file(png)], [file(Buffer.alloc(feedback.MAX_ATTACHMENT_BYTES + 1))]]) await expectStatus(uploadFiles(files), files[0].size > feedback.MAX_ATTACHMENT_BYTES ? 413 : 400);
    await expectStatus(uploadFiles([file(png)], form => form.append('report', JSON.stringify(valid))), 400);
    await expectStatus(uploadFiles([file(png)], form => form.append('userId', 'admin')), 400);
    await expectStatus(uploadFiles([file(png)], form => form.append('files', 'not a file')), 400);
    const evilUpload = multipart([file(png)]); evilUpload.headers.set('origin', 'https://evil.invalid');
    await expectStatus(user.POST(evilUpload), 403);
    const oversizedEnvelope = multipart([file(png)]); oversizedEnvelope.headers.set('content-length', String(feedback.MAX_ATTACHMENT_BYTES + 32_001));
    await expectStatus(user.POST(oversizedEnvelope), 413);
    const uploadStream = new ReadableStream({ start(controller) { for (let n = 0; n < 4; n++) controller.enqueue(new Uint8Array(1024 * 1024)); controller.close(); } });
    await expectStatus(user.POST(new NextRequest('http://localhost/api/feedback', { method: 'POST', headers: { host: 'localhost', origin: 'http://localhost', 'content-type': 'multipart/form-data; boundary=synthetic', 'content-length': '1' }, body: uploadStream, duplex: 'half' } as ConstructorParameters<typeof NextRequest>[1])), 413);
    assert.equal(await db.feedbackAttachment.count(), 0); assert.equal(await db.feedbackReport.count(), 0);
    const spent = await db.feedbackUploadBudget.findUniqueOrThrow({ where: { userId: 'alice' } });
    const attempts = await Promise.all(Array.from({ length: 20 }, () => uploadFiles([file(Buffer.from('invalid'))])));
    assert.equal((await Promise.all(attempts.map(r => r.clone().json()))).filter(body => body.error === 'upload_rate_limited').length, spent.hourCount);
    assert.ok(Number(attempts.find(r => r.status === 429).headers.get('retry-after')) > 0);
    await expectStatus(post(), 201); // Upload abuse budget never disables text support.
    await db.feedbackReport.deleteMany();
    await db.feedbackUploadBudget.deleteMany();

    const prepared = (await attachmentHelpers.prepareFeedbackAttachments([file(png)]))[0];
    // Use direct SQL fixtures to reach storage cap without real uploads or report spam.
    for (let i = 0; i < 10; i++) await db.feedbackReport.create({ data: { ...valid, userId: 'nocard', createdAt: new Date(Date.now() - 25 * 3_600_000), attachments: { create: { ...prepared, data: new Uint8Array(feedback.MAX_ATTACHMENT_BYTES), byteLength: feedback.MAX_ATTACHMENT_BYTES, position: 0 } } } });
    signedIn = 'nocard'; await expectStatus(uploadFiles([file(png)]), 413);
    assert.equal(await db.feedbackReport.count(), 10); assert.equal(await db.feedbackAttachment.count(), 10);
    const old = await db.feedbackReport.findFirstOrThrow({ where: { userId: 'nocard' } });
    await db.feedbackReport.delete({ where: { id: old.id } }); await expectStatus(uploadFiles([file(png)]), 201);
    await db.user.delete({ where: { id: 'nocard' } });
    assert.equal(await db.feedbackAttachment.count(), 0); assert.equal(await db.feedbackUploadBudget.count({ where: { userId: 'nocard' } }), 0);
    // True suspension also rejects an allowlisted admin.
    await db.user.update({ where: { id: 'admin' }, data: { suspendedAt: new Date() } });
    signedIn = 'admin'; await expectStatus(post(), 403); await expectStatus(inbox.GET(request('/api/admin/reports')), 403);
    if (process.argv.includes('--runtime')) { const { runtimeCheck } = await import('./feedback-runtime-check'); await runtimeCheck(db, databaseUrl); }
    console.log('PASS atomic multipart uploads, no leaked bytes/URLs, owner/admin downloads, free/expired/other-user/suspended authorization, quarantine release, CSRF, safe headers, removal, report/account cascades, failed-upload cleanup, durable concurrent attempt budget and 30 MB account cap.');

  } finally {
    await db.$disconnect();
    if (started) runPg('pg_ctl', ['-D', dataDir, '-m', 'immediate', '-w', 'stop']);
    await rm(dir, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
