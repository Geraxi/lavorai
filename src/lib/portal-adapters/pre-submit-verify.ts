/**
 * Re-read filled fields immediately before the final submit and compare them
 * to the candidate profile. Fix once when we can; otherwise abort with
 * NEEDS_ANSWERS rather than submitting wrong data.
 */
import type { Page } from "playwright";

export type ExpectedSubmitFields = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  workAuth?: string | null;
  resumeUploaded: boolean;
  coverLetterRequired?: boolean;
  coverLetterPresent?: boolean;
};

export type VerifyResult =
  | { ok: true; fixes: string[] }
  | { ok: false; missing: string[]; fixes: string[] };

const EMAIL_SEL = [
  'input[type="email"]', 'input[name*="email" i]', 'input[id*="email" i]',
  'input[autocomplete="email"]',
];
const FIRST_SEL = [
  'input[name*="first" i]', 'input[id*="first" i]', 'input[autocomplete="given-name"]',
];
const LAST_SEL = [
  'input[name*="last" i]', 'input[id*="last" i]', 'input[autocomplete="family-name"]',
];
const PHONE_SEL = [
  'input[type="tel"]', 'input[name*="phone" i]', 'input[id*="phone" i]', 'input[autocomplete="tel"]',
];
const CITY_SEL = [
  'input[name*="city" i]', 'input[id*="city" i]', 'input[autocomplete="address-level2"]',
];
const WORK_AUTH_SEL = [
  'input[name*="authorization" i]', 'input[id*="authorization" i]',
  'select[name*="authorization" i]', 'select[id*="work-auth" i]',
  'input[name*="workAuth" i]', 'input[name*="visa" i]',
];

function norm(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function digits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

async function visibleValue(page: Page, selectors: string[]): Promise<{ selector: string; value: string } | null> {
  for (const selector of selectors) {
    const loc = page.locator(selector).first();
    if ((await loc.count().catch(() => 0)) === 0) continue;
    if (!(await loc.isVisible().catch(() => false))) continue;
    const value = await loc.inputValue().catch(() => "");
    return { selector, value };
  }
  return null;
}

async function refill(page: Page, selector: string, value: string): Promise<boolean> {
  const loc = page.locator(selector).first();
  try {
    await loc.fill("");
    await loc.fill(value);
    const next = await loc.inputValue();
    return norm(next) === norm(value) || (digits(value).length >= 6 && digits(next).endsWith(digits(value).slice(-6)));
  } catch {
    return false;
  }
}

export async function verifyFilledFields(page: Page, expected: ExpectedSubmitFields): Promise<VerifyResult> {
  const missing: string[] = [];
  const fixes: string[] = [];

  const email = expected.email?.trim();
  if (email) {
    const field = await visibleValue(page, EMAIL_SEL);
    if (field && norm(field.value) !== norm(email)) {
      if (await refill(page, field.selector, email)) fixes.push("email");
      else missing.push("email");
    } else if (field && !field.value.trim()) missing.push("email");
  }

  const first = expected.firstName?.trim();
  if (first) {
    const field = await visibleValue(page, FIRST_SEL);
    if (field && field.value.trim() && norm(field.value) !== norm(first)) {
      if (await refill(page, field.selector, first)) fixes.push("firstName");
      else missing.push("firstName");
    }
  }

  const last = expected.lastName?.trim();
  if (last) {
    const field = await visibleValue(page, LAST_SEL);
    if (field && field.value.trim() && norm(field.value) !== norm(last)) {
      if (await refill(page, field.selector, last)) fixes.push("lastName");
      else missing.push("lastName");
    }
  }

  const phone = expected.phone?.trim();
  if (phone && digits(phone).length >= 6) {
    const field = await visibleValue(page, PHONE_SEL);
    if (field && field.value.trim() && !digits(field.value).endsWith(digits(phone).slice(-6))) {
      if (await refill(page, field.selector, phone)) fixes.push("phone");
      else missing.push("phone");
    }
  }

  const city = expected.city?.trim();
  if (city) {
    const field = await visibleValue(page, CITY_SEL);
    if (field && field.value.trim() && !norm(field.value).includes(norm(city)) && !norm(city).includes(norm(field.value))) {
      if (await refill(page, field.selector, city)) fixes.push("city");
      else missing.push("location");
    }
  }

  const workAuth = expected.workAuth?.trim();
  if (workAuth) {
    const field = await visibleValue(page, WORK_AUTH_SEL);
    if (field && field.value.trim() && !norm(field.value).includes(norm(workAuth)) && !norm(workAuth).includes(norm(field.value))) {
      if (await refill(page, field.selector, workAuth)) fixes.push("workAuth");
      else missing.push("workAuth");
    }
  }

  if (expected.coverLetterRequired && !expected.coverLetterPresent) missing.push("coverLetter");
  if (!expected.resumeUploaded) missing.push("resume");

  if (missing.length) return { ok: false, missing, fixes };
  return { ok: true, fixes };
}

export function expectedFieldsFrom(input: {
  profile?: { firstName?: string | null; lastName?: string | null; email?: string | null; phone?: string | null; city?: string | null };
  userEmail?: string | null;
  userPhone?: string | null;
  coverLetterText?: string | null;
  resumeUploaded?: boolean;
  answers?: { workAuthEU?: string | null } | null;
}): ExpectedSubmitFields {
  const p = input.profile ?? {};
  return {
    firstName: p.firstName ?? null,
    lastName: p.lastName ?? null,
    email: p.email?.trim() || input.userEmail || null,
    phone: p.phone?.trim() || input.userPhone || null,
    city: p.city ?? null,
    workAuth: input.answers?.workAuthEU ?? null,
    resumeUploaded: input.resumeUploaded !== false,
    coverLetterRequired: false,
    coverLetterPresent: !!input.coverLetterText?.trim(),
  };
}
