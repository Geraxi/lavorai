/** Publication and form shape only; never candidate eligibility or permission to send. */
export type FormCapability = 'standard' | 'questions' | 'unsupported' | 'closed' | 'unknown';
const STANDARD = new Set(['cv', 'cover_letter', 'phone', 'name', 'email', 'referrer']);
const UPLOAD = new Set(['file', 'photo', 'attachment', 'image', 'video']);
export function classifyRecruiteeForm(offer: Record<string, unknown>): FormCapability {
  if (typeof offer.status !== 'string') return 'unknown';
  if (offer.status !== 'published') return 'closed';
  // Missing/malformed question schema is not proof of a standard form.
  if (!Array.isArray(offer.open_questions)) return 'unknown';
  if (!Object.keys(offer).some(key => key.startsWith('options_'))) return 'unknown';
  let questions = false;
  for (const [key, value] of Object.entries(offer)) {
    if (!key.startsWith('options_')) continue;
    const required = value === true || ['required', 'on'].includes(String(value).toLowerCase());
    if (required && !STANDARD.has(key.slice(8))) return 'unsupported';
  }
  for (const value of offer.open_questions) {
    if (!value || typeof value !== 'object') return 'unknown';
    const q = value as Record<string, unknown>;
    if (q.kind === 'infobox') continue;
    if (typeof q.required !== 'boolean') return 'unknown';
    if (!q.required) continue;
    if (UPLOAD.has(String(q.kind).toLowerCase())) return 'unsupported';
    questions = true;
  }
  return questions ? 'questions' : 'standard';
}
export function canonicalRecruiteeOffer(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.search || u.hash ||
      !/^[a-z0-9-]+\.recruitee\.com$/.test(u.hostname) || !/^\/o\/[a-zA-Z0-9_-]+\/?$/.test(u.pathname)) return null;
    return u.origin + u.pathname.replace(/\/$/, '');
  } catch { return null; }
}
