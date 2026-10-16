import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAdmin } from "@/lib/admin";
import { checkOrigin } from "@/lib/csrf";
import { ReportError } from "./feedback-errors";
import { MAX_ACCOUNT_ATTACHMENT_BYTES, type PreparedAttachment } from "./feedback-attachments";
export { ReportError } from "./feedback-errors";
import { REPORT_CATEGORIES, REPORT_STATUSES, type ReportInput } from "@/lib/feedback";

export function reportJson(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", ...headers } });
}
export async function reportHandler(run: () => Promise<Response>): Promise<Response> {
  try { return await run(); } catch (error) {
    if (error instanceof ReportError) return reportJson({ error: error.code }, error.status, error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {});
    // Do not log payloads, SQL parameters, account data or diagnostics.
    console.error("[feedback] request failed");
    return reportJson({ error: "unavailable" }, 503);
  }
}
export async function requireReportActor(adminOnly = false) {
  // Require a real session, including in development; no demo-user fallback.
  const session = await auth();
  if (!session?.user?.id) throw new ReportError("unauthorized", 401);
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, email: true, suspendedAt: true } });
  if (!user || user.suspendedAt) throw new ReportError("forbidden", 403);
  const admin = isAdmin(user.email);
  if (adminOnly && !admin) throw new ReportError("forbidden", 403);
  // Support is independent of billing. A genuine suspension still denies access.
  return user;
}
export function requireReportOrigin(request: NextRequest) {
  if ((!request.headers.get("origin") && !request.headers.get("referer")) || !checkOrigin(request)) throw new ReportError("forbidden", 403);
}
export async function readReportBody(request: NextRequest) {
  const maxBytes = 24_000; // Fits 4,000 Unicode characters plus JSON framing.
  if (Number(request.headers.get("content-length")) > maxBytes) throw new ReportError("too_large", 413);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new ReportError("invalid_json", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new ReportError("invalid_json", 400);
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new ReportError("too_large", 413); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch (error) {
    if (error instanceof ReportError) throw error;
    throw new ReportError("invalid_json", 400);
  } finally { reader.releaseLock(); }
}

export const attachmentSelect = { id: true, filename: true, contentType: true, byteLength: true, scanStatus: true } satisfies Prisma.FeedbackAttachmentSelect;
export const reportSelect = { attachments: { select: attachmentSelect, orderBy: { position: "asc" as const } }, id: true, category: true, subject: true, description: true, pageContext: true, locale: true, status: true, createdAt: true, updatedAt: true } satisfies Prisma.FeedbackReportSelect;
export const adminReportSelect = { ...reportSelect, user: { select: { name: true, email: true } } } satisfies Prisma.FeedbackReportSelect;

export async function createReport(userId: string, input: ReportInput, attachments: PreparedAttachment[] = []) {
  // Durable, per-user limits across all instances. Lock + count + insert are
  // atomic so concurrent requests cannot race past the limits. DB failure closes.
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('feedback-report'), hashtext(${userId}))::text`;
    const now = Date.now();
    const recent = await tx.feedbackReport.findMany({ where: { userId, createdAt: { gt: new Date(now - 86_400_000) } }, orderBy: { createdAt: "desc" }, take: 20, select: { createdAt: true } });
    const hour = recent.filter(r => r.createdAt.getTime() > now - 3_600_000);
    if (hour.length >= 5 || recent.length >= 20) {
      const resets = [hour.length >= 5 ? hour[4].createdAt.getTime() + 3_600_000 : 0, recent.length >= 20 ? recent[19].createdAt.getTime() + 86_400_000 : 0];
      throw new ReportError("rate_limited", 429, Math.max(1, Math.ceil((Math.max(...resets) - now) / 1000)));
    }
    if (attachments.length) {
      const usage = await tx.feedbackAttachment.aggregate({ where: { report: { userId } }, _sum: { byteLength: true } });
      if ((usage._sum.byteLength ?? 0) + attachments.reduce((sum, a) => sum + a.byteLength, 0) > MAX_ACCOUNT_ATTACHMENT_BYTES) throw new ReportError("attachment_quota", 413);
    }
    // Bytes and metadata commit with the report. Failures leave no staged files;
    // report/account deletion removes bytes through the same database cascade.
    return tx.feedbackReport.create({ data: { ...input, userId, attachments: { create: attachments.map((a, position) => ({ ...a, position })) } }, select: reportSelect });
  }, { isolationLevel: "ReadCommitted" });
}

export async function listReports(request: NextRequest, userId?: string) {
  const params = request.nextUrl.searchParams;
  const pageText = params.get("page") ?? "1";
  if (!/^[1-9]\d{0,3}$/.test(pageText)) throw new ReportError("invalid_report", 400);
  const page = Number(pageText);
  const where: Prisma.FeedbackReportWhereInput = userId ? { userId } : {};
  if (!userId) {
    const category = params.get("category"), status = params.get("status");
    if (category && !REPORT_CATEGORIES.some(value => value === category)) throw new ReportError("invalid_report", 400);
    if (status && !REPORT_STATUSES.some(value => value === status)) throw new ReportError("invalid_status", 400);
    if (category) where.category = category;
    if (status) where.status = status;
  }
  const reports = await prisma.feedbackReport.findMany({ where, select: userId ? reportSelect : adminReportSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 21 });
  return reportJson({ reports: reports.slice(0, 20), page, hasMore: reports.length > 20 });
}

export async function reserveFeedbackUpload(userId: string) {
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('feedback-report'), hashtext(${userId}))::text`;
    const now = new Date();
    const budget = await tx.feedbackUploadBudget.findUnique({ where: { userId } });
    const hourStart = budget && now.getTime() - budget.hourStart.getTime() < 3_600_000 ? budget.hourStart : now;
    const dayStart = budget && now.getTime() - budget.dayStart.getTime() < 86_400_000 ? budget.dayStart : now;
    const hourCount = hourStart === now ? 0 : budget!.hourCount;
    const dayCount = dayStart === now ? 0 : budget!.dayCount;
    if (hourCount >= 20 || dayCount >= 60) {
      const until = Math.max(hourCount >= 20 ? hourStart.getTime() + 3_600_000 : 0, dayCount >= 60 ? dayStart.getTime() + 86_400_000 : 0);
      throw new ReportError("upload_rate_limited", 429, Math.max(1, Math.ceil((until - now.getTime()) / 1000)));
    }
    const data = { hourStart, dayStart, hourCount: hourCount + 1, dayCount: dayCount + 1 };
    await tx.feedbackUploadBudget.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  }, { isolationLevel: "ReadCommitted" });
}
