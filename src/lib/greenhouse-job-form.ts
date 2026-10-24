/**
 * Public Greenhouse boards-api questions pre-check. Caches the form snapshot
 * (not the user's answers). Never invents answers; never solves captcha.
 */
import { prisma } from "@/lib/db";
import { isGreenhouseNativeHost } from "@/lib/proven-channels";
import { extractGreenhouseJobId } from "@/lib/portal-adapters/greenhouse";
import {
  isPrivacyConsentQuestion,
  resolveCandidateFact,
  type FactContext,
  type FactQuestion,
} from "@/lib/candidate-facts";

export const GREENHOUSE_FORM_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
export const GREENHOUSE_FORM_FETCH_TIMEOUT_MS = 8_000;

export type GreenhouseFormQuestion = FactQuestion & { required: boolean; name?: string };
export type GreenhouseFormStatus = "native" | "redirected" | "unavailable";
export type GreenhouseFormSnapshot = {
  cacheKey: string;
  boardToken: string;
  jobId: string;
  absoluteUrl: string | null;
  status: GreenhouseFormStatus;
  questions: GreenhouseFormQuestion[];
  checkedAt: Date;
};

export type GreenhouseFormCacheRow = {
  cacheKey: string;
  boardToken: string;
  jobId: string;
  absoluteUrl: string | null;
  status: string;
  questionsJson: string;
  checkedAt: Date;
};

export type GreenhouseFormFetchResult = {
  ok: boolean;
  status: number;
  url: string;
  json: () => Promise<unknown>;
};

export type GreenhouseFormDeps = {
  fetch: (url: string) => Promise<GreenhouseFormFetchResult>;
  cacheGet: (key: string) => Promise<GreenhouseFormCacheRow | null>;
  cacheSet: (row: GreenhouseFormCacheRow) => Promise<void>;
  now?: Date;
};

function defaultDeps(): GreenhouseFormDeps {
  return {
    fetch: async (url) => {
      const response = await fetch(url, {
        headers: { "User-Agent": "LavorAIBot/1.0 (+https://lavorai.it)", Accept: "application/json" },
        signal: AbortSignal.timeout(GREENHOUSE_FORM_FETCH_TIMEOUT_MS),
        redirect: "follow",
      });
      return { ok: response.ok, status: response.status, url: response.url || url, json: () => response.json() };
    },
    cacheGet: async (key) => {
      const row = await prisma.greenhouseJobForm.findUnique({ where: { cacheKey: key } });
      if (!row) return null;
      return {
        cacheKey: row.cacheKey, boardToken: row.boardToken, jobId: row.jobId,
        absoluteUrl: row.absoluteUrl, status: row.status, questionsJson: row.questionsJson, checkedAt: row.checkedAt,
      };
    },
    cacheSet: async (row) => {
      await prisma.greenhouseJobForm.upsert({
        where: { cacheKey: row.cacheKey },
        create: row,
        update: {
          boardToken: row.boardToken, jobId: row.jobId, absoluteUrl: row.absoluteUrl,
          status: row.status, questionsJson: row.questionsJson, checkedAt: row.checkedAt,
        },
      });
    },
  };
}

export function greenhouseFormCacheKey(boardToken: string, jobId: string): string {
  return `${boardToken.toLowerCase()}:${jobId}`;
}

export function parseGreenhouseBoardJob(
  url: string,
  sourceSlug?: string | null,
): { boardToken: string; jobId: string } | null {
  const parsed = extractGreenhouseJobId(url);
  if (!parsed) return null;
  const board = parsed.slug ?? sourceSlug?.trim();
  if (!board || !/^[a-z0-9-]+$/i.test(board)) return null;
  return { boardToken: board.toLowerCase(), jobId: parsed.id };
}

function fieldKind(type: string): FactQuestion["kind"] {
  const t = type.toLowerCase();
  if (t.includes("file")) return "file";
  if (t.includes("textarea") || t.includes("long")) return "textarea";
  if (t.includes("multi") || t.includes("select")) return "select";
  if (t.includes("check") || t.includes("boolean")) return "checkbox";
  if (t.includes("radio")) return "radio";
  return "text";
}

function optionLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") return [item];
    if (item && typeof item === "object" && typeof (item as { label?: unknown }).label === "string") {
      return [(item as { label: string }).label];
    }
    return [];
  });
}

export function collectGreenhouseQuestions(payload: unknown): GreenhouseFormQuestion[] {
  const out: GreenhouseFormQuestion[] = [];
  const walk = (items: unknown): void => {
    if (!Array.isArray(items)) return;
    for (const raw of items) {
      if (!raw || typeof raw !== "object") continue;
      const q = raw as Record<string, unknown>;
      const fields = Array.isArray(q.fields) ? q.fields : [];
      const field = (fields[0] && typeof fields[0] === "object" ? fields[0] : {}) as Record<string, unknown>;
      const label = String(q.label ?? field.label ?? "").trim();
      if (label) {
        out.push({
          label,
          required: Boolean(q.required ?? field.required),
          kind: fieldKind(String(field.type ?? q.type ?? "input_text")),
          options: optionLabels(q.values ?? field.values),
          name: typeof field.name === "string" ? field.name : undefined,
        });
      }
      walk(q.questions);
    }
  };
  if (!payload || typeof payload !== "object") return out;
  const data = payload as Record<string, unknown>;
  walk(data.questions);
  walk(data.location_questions);
  if (Array.isArray(data.compliance)) {
    for (const block of data.compliance) {
      if (block && typeof block === "object") walk((block as { questions?: unknown }).questions);
    }
  }
  return out;
}

export function greenhouseAbsoluteUrlIsNative(absoluteUrl: string | null | undefined): boolean {
  if (!absoluteUrl?.trim()) return true;
  try {
    return isGreenhouseNativeHost(new URL(absoluteUrl).hostname);
  } catch {
    return false;
  }
}

function snapshotFromRow(row: GreenhouseFormCacheRow): GreenhouseFormSnapshot {
  let questions: GreenhouseFormQuestion[] = [];
  try { questions = JSON.parse(row.questionsJson) as GreenhouseFormQuestion[]; } catch { questions = []; }
  const status: GreenhouseFormStatus = row.status === "native" || row.status === "redirected" ? row.status : "unavailable";
  return {
    cacheKey: row.cacheKey, boardToken: row.boardToken, jobId: row.jobId,
    absoluteUrl: row.absoluteUrl, status, questions: Array.isArray(questions) ? questions : [], checkedAt: row.checkedAt,
  };
}

export async function loadGreenhouseJobForm(
  input: { url: string; sourceSlug?: string | null },
  overrides: Partial<GreenhouseFormDeps> = {},
): Promise<GreenhouseFormSnapshot | null> {
  const parsed = parseGreenhouseBoardJob(input.url, input.sourceSlug);
  if (!parsed) return null;
  const deps = { ...defaultDeps(), ...overrides };
  const now = deps.now ?? new Date();
  const cacheKey = greenhouseFormCacheKey(parsed.boardToken, parsed.jobId);
  const cached = await deps.cacheGet(cacheKey).catch(() => null);
  if (cached && +now - +cached.checkedAt < GREENHOUSE_FORM_CACHE_MS) return snapshotFromRow(cached);

  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(parsed.boardToken)}/jobs/${encodeURIComponent(parsed.jobId)}?questions=true`;
  try {
    const response = await deps.fetch(url);
    if (!response.ok) {
      const miss: GreenhouseFormCacheRow = {
        cacheKey, boardToken: parsed.boardToken, jobId: parsed.jobId, absoluteUrl: null,
        status: "unavailable", questionsJson: "[]", checkedAt: now,
      };
      await deps.cacheSet(miss).catch(() => undefined);
      return snapshotFromRow(miss);
    }
    const payload = await response.json();
    const absoluteUrl = payload && typeof payload === "object" && typeof (payload as { absolute_url?: unknown }).absolute_url === "string"
      ? (payload as { absolute_url: string }).absolute_url
      : null;
    const status: GreenhouseFormStatus = greenhouseAbsoluteUrlIsNative(absoluteUrl) ? "native" : "redirected";
    const row: GreenhouseFormCacheRow = {
      cacheKey, boardToken: parsed.boardToken, jobId: parsed.jobId, absoluteUrl,
      status, questionsJson: JSON.stringify(collectGreenhouseQuestions(payload)), checkedAt: now,
    };
    await deps.cacheSet(row).catch(() => undefined);
    return snapshotFromRow(row);
  } catch {
    return cached ? snapshotFromRow(cached) : null;
  }
}

export function isResumeUploadQuestion(label: string): boolean {
  return /\b(resume|cv|curriculum(?: vitae)?)\b/i.test(label) && !/\bcover\b/i.test(label);
}

export function isCoverLetterQuestion(label: string): boolean {
  return /\b(cover letter|motivational letter|lettera di presentazione|lettera motivazionale)\b/i.test(label);
}

/** Required questions must resolve from saved facts/answers. File CV/cover are allowed. */
export function greenhouseRequiredQuestionsAnswerable(
  questions: GreenhouseFormQuestion[],
  context: FactContext,
  opts: { hasCv?: boolean; hasCoverLetter?: boolean } = {},
): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const question of questions) {
    if (!question.required) continue;
    if (question.kind === "file" || isResumeUploadQuestion(question.label)) {
      if (isCoverLetterQuestion(question.label) ? opts.hasCoverLetter !== false : opts.hasCv !== false) continue;
      missing.push(question.label);
      continue;
    }
    if (isCoverLetterQuestion(question.label)) continue;
    if (isPrivacyConsentQuestion(question.label) && context.privacyConsentAt) continue;
    const stored = context.storedAnswers?.find((row) => row.label.trim().toLowerCase() === question.label.trim().toLowerCase() && row.answer.trim());
    if (stored) continue;
    const resolved = resolveCandidateFact(question, context);
    if (resolved.answer?.trim() && !resolved.conflict) continue;
    missing.push(question.label);
  }
  return { ok: missing.length === 0, missing };
}
