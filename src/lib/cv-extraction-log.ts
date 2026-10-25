import { createHash } from "node:crypto";

/** Truncated SHA-256 of a user id. Never log the raw id. */
export function hashUserRef(userId: string | null | undefined): string | undefined {
  const id = userId?.trim();
  if (!id) return undefined;
  return createHash("sha256").update(id).digest("hex").slice(0, 12);
}

export type CvFieldPresence = {
  firstName: boolean;
  lastName: boolean;
  email: boolean;
  phone: boolean;
  city: boolean;
  title: boolean;
  summary: boolean;
  experiences: boolean;
  education: boolean;
  skills: boolean;
  languages: boolean;
  links: boolean;
};

function nonempty(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return value != null && value !== "";
}

/** Booleans only — never the field values. */
export function cvFieldPresence(parsed: Record<string, unknown> | null | undefined): CvFieldPresence {
  const p = parsed ?? {};
  return {
    firstName: nonempty(p.firstName),
    lastName: nonempty(p.lastName),
    email: nonempty(p.email),
    phone: nonempty(p.phone),
    city: nonempty(p.city),
    title: nonempty(p.title),
    summary: nonempty(p.summary),
    experiences: nonempty(p.experiences),
    education: nonempty(p.education),
    skills: nonempty(p.skills),
    languages: nonempty(p.languages),
    links: nonempty(p.links),
  };
}

export type CvErrorClass =
  | "TimeoutError"
  | "QuotaError"
  | "RateLimitError"
  | "AuthError"
  | "ParseError"
  | "SchemaError"
  | "EmptyResponseError"
  | "AiCallError"
  | "ParseLibraryError"
  | "UnknownError";

export function classifyCvError(err: unknown): CvErrorClass {
  const status = typeof (err as { status?: number })?.status === "number" ? (err as { status: number }).status : undefined;
  const name = err instanceof Error ? err.name : "";
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const hay = `${name} ${msg}`.toLowerCase();
  if (status === 401 || status === 403 || /unauthorized|forbidden|invalid.?api.?key/.test(hay)) return "AuthError";
  if (status === 429 || /rate limit/.test(hay)) return "RateLimitError";
  if (status === 402 || /quota|credit|billing|insufficient/.test(hay)) return "QuotaError";
  if (/timeout|etimedout|abort/.test(hay)) return "TimeoutError";
  if (/empty response/.test(hay)) return "EmptyResponseError";
  if (/pdf|docx|mammoth|pdfjs|pdf-parse/.test(hay)) return "ParseLibraryError";
  if (/json|parse|unterminated|unexpected token/.test(hay)) return "ParseError";
  if (/schema|zod/.test(hay)) return "SchemaError";
  if (err instanceof Error) return "AiCallError";
  return "UnknownError";
}

/** Error class and optional HTTP status only. Never message, body, or stack. */
export function sanitizeCvError(err: unknown): { errorClass: CvErrorClass; status?: number; name?: string } {
  const status = typeof (err as { status?: number })?.status === "number" ? (err as { status: number }).status : undefined;
  const name = err instanceof Error ? err.name : undefined;
  return { errorClass: classifyCvError(err), ...(status != null ? { status } : {}), ...(name && name !== "Error" ? { name } : {}) };
}

export type CvExtractionDiagnostic = {
  tag: string;
  model?: string;
  provider?: string;
  latencyMs?: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  parseOk: boolean;
  errorClass?: CvErrorClass;
  status?: number;
  fields?: CvFieldPresence;
  userRef?: string;
};

/** Diagnostic line only. Never request/response bodies, CV text, or personal data. */
export function logCvExtraction(diag: CvExtractionDiagnostic): void {
  console.log(`[${diag.tag}]`, {
    model: diag.model,
    provider: diag.provider,
    latencyMs: diag.latencyMs,
    inputTokens: diag.inputTokens ?? undefined,
    outputTokens: diag.outputTokens ?? undefined,
    parseOk: diag.parseOk,
    errorClass: diag.errorClass,
    status: diag.status,
    fields: diag.fields,
    userRef: diag.userRef,
  });
}

export function logCvExtractionFailure(tag: string, err: unknown, extra: Partial<CvExtractionDiagnostic> = {}): void {
  const sanitized = sanitizeCvError(err);
  logCvExtraction({
    tag,
    ...extra,
    parseOk: false,
    errorClass: sanitized.errorClass,
    status: sanitized.status ?? extra.status,
  });
}
