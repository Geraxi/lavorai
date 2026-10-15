import type { Prisma, PrismaClient } from "@prisma/client";
import { applicationDeliveryView } from "./application-delivery-view";
import { pipelineLane, type PipelineLane } from "./application-pipeline";
import { APPLICATION_LANES, BOARD_PAGE_SIZE, TABLE_PAGE_SIZE, pageWindow } from "./application-pagination";

const evidenceSelect = {
  id: true, createdAt: true, status: true, userStatus: true, lastReplyKind: true,
  submittedVia: true, submitConfirmation: true, submissionReceiptJson: true,
  emailAttempts: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1,
    select: { status: true, providerEmailId: true } },
} satisfies Prisma.ApplicationSelect;
const detailSelect = {
  ...evidenceSelect, portal: true, errorMessage: true, atsScore: true, suggestionsJson: true,
  completedAt: true, coverLetterText: true, cvDocxPath: true, coverLetterPath: true, cvPdfPath: true,
  cvLanguage: true, viewedAt: true, submittedAt: true, lastReplyAt: true, replyCount: true,
  emailAttempts: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1,
    select: { status: true, providerEmailId: true, acceptedAt: true, recipient: true } },
  job: { select: { id: true, title: true, company: true, location: true, url: true, source: true } },
} satisfies Prisma.ApplicationSelect;
type Detail = Prisma.ApplicationGetPayload<{ select: typeof detailSelect }>;
const positiveInteger = (value: string | null, fallback: number, maximum = 1_000_000) =>
  value && /^\d+$/.test(value) ? Math.min(maximum, Math.max(1, Number(value))) : fallback;

function serialize(a: Detail) {
  let suggestions: string[] = [];
  try { const parsed: unknown = JSON.parse(a.suggestionsJson ?? "[]"); if (Array.isArray(parsed)) suggestions = parsed.filter((v): v is string => typeof v === "string"); } catch { /* Old malformed suggestions do not block the list. */ }
  return {
    id: a.id, status: a.status, portal: a.portal, errorMessage: a.errorMessage, atsScore: a.atsScore,
    suggestions, createdAt: a.createdAt.toISOString(), completedAt: a.completedAt?.toISOString() ?? null,
    coverLetterText: a.coverLetterText, hasCvDocx: Boolean(a.cvDocxPath), hasCoverLetterDocx: Boolean(a.coverLetterPath),
    hasCvPdf: Boolean(a.cvPdfPath), cvLanguage: a.cvLanguage, userStatus: a.userStatus,
    viewedAt: a.viewedAt?.toISOString() ?? null, submittedVia: a.submittedVia, submittedAt: a.submittedAt?.toISOString() ?? null,
    lastReplyAt: a.lastReplyAt?.toISOString() ?? null, replyCount: a.replyCount, lastReplyKind: a.lastReplyKind,
    submitConfirmation: a.submitConfirmation, delivery: applicationDeliveryView(a),
    deliveryRecipient: a.emailAttempts[0]?.recipient ?? null, job: a.job,
  };
}

type ExportCursor = { createdAt: string; id: string; asOf: string };
export class InvalidApplicationCursor extends Error {}
function decodeCursor(value: string | null): ExportCursor | null {
  if (!value) return null;
  try {
    if (value.length > 1024) throw new Error();
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof cursor.id !== "string" || !cursor.id || cursor.id.length > 160 ||
      typeof cursor.createdAt !== "string" || !Number.isFinite(Date.parse(cursor.createdAt)) ||
      typeof cursor.asOf !== "string" || !Number.isFinite(Date.parse(cursor.asOf))) throw new Error();
    return cursor;
  } catch { throw new InvalidApplicationCursor("Invalid application cursor"); }
}
const before = (cursor: { createdAt: Date; id: string }): Prisma.ApplicationWhereInput => ({
  OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
});

async function exportPage(db: Pick<PrismaClient, "application">, where: Prisma.ApplicationWhereInput, lane: PipelineLane | "all", asOf: Date, after: ExportCursor | null) {
  let cursor = after ? { createdAt: new Date(after.createdAt), id: after.id } : undefined;
  const ids: string[] = [];
  let nextCursor: string | null = null;
  while (ids.length < 50) {
    const batch = await db.application.findMany({ where: cursor ? { AND: [where, before(cursor)] } : where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100, select: evidenceSelect });
    for (const app of batch) {
      cursor = app;
      if (lane === "all" || pipelineLane({ ...app, delivery: applicationDeliveryView(app) }) === lane) ids.push(app.id);
      if (ids.length === 50) {
        nextCursor = Buffer.from(JSON.stringify({ createdAt: app.createdAt.toISOString(), id: app.id, asOf: asOf.toISOString() })).toString("base64url");
        break;
      }
    }
    if (batch.length < 100 || ids.length === 50) break;
  }
  const details = ids.length ? await db.application.findMany({ where: { ...where, id: { in: ids } }, select: detailSelect, take: ids.length }) : [];
  const byId = new Map(details.map(app => [app.id, app]));
  return { applications: ids.flatMap(id => { const app = byId.get(id); return app ? [serialize(app)] : []; }), nextCursor };
}

/** Read-only, owner-scoped pagination. Stage membership needs the canonical
 * receipt validator, which cannot safely be approximated by raw status in SQL.
 * Scan only lightweight evidence in bounded keyset batches; retain only page
 * IDs, and load document/role details only for those IDs. No 500-row payload,
 * large full-record fetch, schema change or duplicated receipt rules. */
export async function listApplications(db: Pick<PrismaClient, "application">, userId: string, params: URLSearchParams, now = new Date()) {
  const id = params.get("id");
  if (id) {
    const app = await db.application.findFirst({ where: { id, userId, status: { not: "diagnostic" } }, select: detailSelect });
    return { applications: app ? [serialize(app)] : [] };
  }
  const exporting = params.get("view") === "export";
  const after = exporting ? decodeCursor(params.get("cursor")) : null;
  const asOf = after ? new Date(after.asOf) : now;
  const range = params.get("range");
  const since = range === "today" ? new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate())
    : range === "week" ? new Date(asOf.getTime() - 7 * 86400_000)
    : range === "month" ? new Date(asOf.getTime() - 30 * 86400_000) : null;
  const search = (params.get("search") ?? "").trim().slice(0, 200);
  const lane = APPLICATION_LANES.includes(params.get("lane") as PipelineLane) ? params.get("lane") as PipelineLane : "all";
  const view = params.get("view") === "board" ? "board" : params.get("view") === "attention" ? "attention" : "table";
  const size = view === "table" ? positiveInteger(params.get("pageSize"), TABLE_PAGE_SIZE, 50) : BOARD_PAGE_SIZE;
  const where: Prisma.ApplicationWhereInput = {
    userId, ...((since || exporting) ? { createdAt: { ...(since ? { gte: since } : {}), ...(exporting ? { lte: asOf } : {}) } } : {}),
    ...(params.get("includeAll") === "1" ? { status: { not: "diagnostic" } } : { status: "success", submittedVia: { not: null } }),
    ...(search ? { job: { OR: ["company", "title", "location"].map(field => ({ [field]: { contains: search, mode: "insensitive" } })) } } : {}),
  };
  if (exporting) return exportPage(db, where, lane, asOf, after);
  const windows = Object.fromEntries(APPLICATION_LANES.map(key => [key, pageWindow(positiveInteger(params.get(`${key}Page`), 1), BOARD_PAGE_SIZE)])) as Record<PipelineLane, ReturnType<typeof pageWindow>>;
  const table = pageWindow(positiveInteger(params.get("page"), 1), size);
  const summary = { confirmed: 0, attention: 0, interviews: 0, offers: 0, pending: 0 };
  let cursor: { createdAt: Date; id: string } | undefined;
  while (true) {
    const batch = await db.application.findMany({
      where: cursor ? { AND: [where, before(cursor)] } : where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100, select: evidenceSelect,
    });
    for (const app of batch) {
      const delivery = applicationDeliveryView(app);
      const stage = pipelineLane({ ...app, delivery });
      const pending = !["confirmed", "delivered", "manual"].includes(delivery.phase);
      if (["confirmed", "delivered"].includes(delivery.phase)) summary.confirmed++;
      if (stage === "attention") summary.attention++;
      if (app.userStatus === "colloquio") summary.interviews++;
      if (app.userStatus === "offerta") summary.offers++;
      if (pending && (lane === "all" || lane === stage)) summary.pending++;
      if (lane === "all" || lane === stage) {
        windows[stage].add(app.id);
        if (view !== "attention" || pending) table.add(app.id);
      }
    }
    if (batch.length < 100) break;
    cursor = batch[batch.length - 1];
  }
  const pages = Object.fromEntries(APPLICATION_LANES.map(key => [key, windows[key].result()])) as Record<PipelineLane, ReturnType<ReturnType<typeof pageWindow>["result"]>>;
  const page = table.result();
  const ids = view === "board" ? APPLICATION_LANES.flatMap(key => pages[key].ids) : page.ids;
  const [details, awaitingCount] = await Promise.all([
    ids.length ? db.application.findMany({ where: { ...where, id: { in: ids } }, select: detailSelect, take: ids.length }) : [],
    db.application.count({ where: { userId, status: "awaiting_consent" } }),
  ]);
  const byId = new Map(details.map(app => [app.id, app]));
  return {
    applications: ids.flatMap(id => { const app = byId.get(id); return app ? [serialize(app)] : []; }),
    total: page.pagination.total, summary, awaitingCount, pagination: page.pagination,
    lanes: Object.fromEntries(APPLICATION_LANES.map(key => [key, pages[key].pagination])),
  };
}
