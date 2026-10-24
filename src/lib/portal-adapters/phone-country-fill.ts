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
  '[class*="phone" i] [role="combobox"]',
  '[class*="Phone" i] [role="combobox"]',
  'input[role="combobox"][aria-label*="country" i]',
  'input[role="combobox"][aria-label*="Phone" i]',
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
export async function fillPhoneCountryCode(
  page: Page,
  phone: string | null | undefined,
  country?: string | null,
): Promise<boolean> {
  const parsed = parsePhoneCountry(phone ?? "");
  if (!parsed && !country?.trim()) return false;

  for (const sel of [...SELECTORS, ...PHONE_NEAR]) {
    const loc = page.locator(sel);
    const n = await loc.count().catch(() => 0);
    for (let i = 0; i < Math.min(n, 6); i++) {
      const el = loc.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      const tag = (await el.evaluate((node) => node.tagName).catch(() => "")).toLowerCase();
      const role = (await el.getAttribute("role").catch(() => ""))?.toLowerCase() ?? "";
      if (tag === "select") {
        const labels = await el.locator("option").allTextContents().catch(() => []);
        const match = matchPhoneCountryOption(labels, phone ?? "", country);
        if (!match) continue;
        const ok = await el.selectOption({ label: match }).then(() => true).catch(async () => {
          return parsed
            ? el.selectOption({ value: parsed.dial }).then(() => true).catch(() => false)
            : false;
        });
        if (ok) return true;
        continue;
      }
      const current = await el.inputValue().catch(() => "");
      if (current && /(?:\+\d{1,4}|[A-Za-z]{2,})/.test(current) && matchPhoneCountryOption([current], phone ?? "", country)) {
        return true;
      }
      if (role === "combobox") {
        const labels = await el.evaluate((node) => {
          const id = node.getAttribute("aria-controls");
          const root = id ? document.getElementById(id) : node.closest("form") ?? document;
          return Array.from(root?.querySelectorAll("[role='option']") ?? []).map((o) => (o.textContent ?? "").trim()).filter(Boolean);
        }).catch(() => [] as string[]);
        const match = matchPhoneCountryOption(labels, phone ?? "", country);
        const typed = match ?? parsed?.dial ?? country ?? "";
        if (!typed) continue;
        await el.click().catch(() => undefined);
        await el.fill(typed).catch(() => undefined);
        const picked = await el.evaluate((node, expected) => {
          const id = node.getAttribute("aria-controls");
          const root = id ? document.getElementById(id) : node.closest("form") ?? document;
          const opt = Array.from(root?.querySelectorAll("[role='option']") ?? []).find((o) =>
            (o.textContent ?? "").trim().toLowerCase() === expected.toLowerCase(),
          ) as HTMLElement | undefined;
          opt?.click();
          return Boolean(opt);
        }, match ?? typed).catch(() => false);
        if (picked) return true;
        continue;
      }
      if (parsed) {
        const filled = await el.fill(parsed.dial).then(() => true).catch(() => false);
        if (filled) return true;
      }
    }
  }
  return false;
}
