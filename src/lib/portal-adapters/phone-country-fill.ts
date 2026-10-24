import type { Page } from "playwright";
import { matchPhoneCountryOption, parsePhoneCountry } from "../phone-country";

const SELECTORS = [
  'select[autocomplete="tel-country-code"]',
  'select[name*="phone_country" i]',
  'select[id*="phone_country" i]',
  'select[name*="country_code" i]',
  'select[id*="country-code" i]',
  'select[aria-label*="country code" i]',
  'select[aria-label*="Phone country" i]',
  'select[name*="countryCode" i]',
  'input[autocomplete="tel-country-code"]',
  'input[name*="phone_country" i]',
  'input[id*="phone_country" i]',
  'input[name*="country_code" i]',
  'input[id*="country-code" i]',
  'input[aria-label*="country code" i]',
  'input[aria-label*="Phone country" i]',
  'input[name*="countryCode" i]',
];

const PHONE_NEAR = [
  '[class*="phone" i] select',
  '[class*="Phone" i] select',
  '[class*="tel-input" i] select',
  '[data-ui*="phone" i] select',
  'fieldset:has(input[type="tel"]) select',
  '[class*="phone" i] input:not([type="tel"]):not([type="hidden"])',
];

/** Fill Greenhouse / Lever / Ashby / Workable country-code widgets from the profile phone. */
export async function fillPhoneCountryCode(page: Page, phone: string | null | undefined): Promise<boolean> {
  const parsed = parsePhoneCountry(phone ?? "");
  if (!parsed || !phone) return false;

  for (const sel of [...SELECTORS, ...PHONE_NEAR]) {
    const loc = page.locator(sel);
    const n = await loc.count().catch(() => 0);
    for (let i = 0; i < Math.min(n, 6); i++) {
      const el = loc.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      const tag = (await el.evaluate((node) => node.tagName).catch(() => "")).toLowerCase();
      if (tag === "select") {
        const labels = await el.locator("option").allTextContents().catch(() => []);
        const match = matchPhoneCountryOption(labels, phone);
        if (!match) continue;
        const ok = await el.selectOption({ label: match }).then(() => true).catch(async () => {
          return el.selectOption({ value: parsed.dial }).then(() => true).catch(() => false);
        });
        if (ok) return true;
        continue;
      }
      const current = await el.inputValue().catch(() => "");
      if (current && /(?:\+\d{1,4}|[A-Za-z]{2,})/.test(current) && matchPhoneCountryOption([current], phone)) {
        return true;
      }
      const filled = await el.fill(parsed.dial).then(() => true).catch(() => false);
      if (filled) return true;
    }
  }
  return false;
}
