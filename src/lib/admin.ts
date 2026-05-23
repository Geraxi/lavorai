/**
 * Admin gate. Solo gli account in questa whitelist vedono /admin.
 * Separato da isLifetimeProPlus (che include anche tester): qui
 * SOLO chi ha accesso operativo completo (founder).
 *
 * Email canonicalizzata come in billing.ts (gmail dots/+tag stripped).
 */

const ADMIN_EMAILS_RAW = ["umbertogeraci0@gmail.com"];

function canonicalEmail(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at < 0) return trimmed;
  let local = trimmed.slice(0, at);
  let domain = trimmed.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus >= 0) local = local.slice(0, plus);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

const ADMIN_EMAILS = new Set(ADMIN_EMAILS_RAW.map(canonicalEmail));

export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.has(canonicalEmail(email));
}
