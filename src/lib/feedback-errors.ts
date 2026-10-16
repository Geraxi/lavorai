export class ReportError extends Error {
  constructor(public code: string, public status: number, public retryAfter?: number) { super(code); }
}
