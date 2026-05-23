/**
 * Admin gate. Solo gli account in questa whitelist vedono /admin.
 * Separato da isLifetimeProPlus (che include anche tester): qui
 * SOLO chi ha accesso operativo completo (founder).
 *
 * Email canonicalizzata come in billing.ts (gmail dots/+tag stripped).
 */

const ADMIN_EMAILS_RAW = ["umbertogeraci0@gmail.com"];

/** Email del founder per alert operativi (esaurimento crediti, outage). */
export const FOUNDER_EMAIL = "umbertogeraci0@gmail.com";

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

/**
 * Account di test/interni da ESCLUDERE dalle metriche "utenti reali".
 * Gonfiano i conteggi e falsano conversion rate / signup trend.
 *   - domini di testing automatico (testmail.app, mailinator, ecc.)
 *   - prefissi di test DB (postdbpush-, test-, demo-)
 *   - email interne note (founder + tester whitelisted)
 */
const INTERNAL_EMAILS = new Set(
  [
    "umbertogeraci0@gmail.com",
    "geracigears@gmail.com",
    "antonella.lasalandra07@gmail.com",
  ].map(canonicalEmail),
);

const TEST_DOMAINS = [
  "inbox.testmail.app",
  "testmail.app",
  "mailinator.com",
  "example.com",
  "example.org",
];

const TEST_LOCAL_PREFIXES = ["postdbpush-", "test-", "demo-", "e2e-"];

export function isTestAccount(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  if (INTERNAL_EMAILS.has(canonicalEmail(e))) return true;
  const at = e.lastIndexOf("@");
  if (at < 0) return false;
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  if (TEST_DOMAINS.some((d) => domain === d || domain.endsWith("." + d))) return true;
  if (TEST_LOCAL_PREFIXES.some((p) => local.startsWith(p))) return true;
  return false;
}
