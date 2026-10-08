import type { Page } from "playwright";
import type { PendingQuestion } from "./types";

/** Read native and custom validation failures, including hidden react-select sentinels. */
export async function collectInvalidFields(page: Page): Promise<PendingQuestion[]> {
  return page.evaluate(() => {
    const result: Array<{label: string; kind: string; options?: string[]}> = [];
    const seen = new Set<string>();
    for (const node of Array.from(document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea'))) {
      if (node.disabled || node.type === 'hidden' || node.type === 'file') continue;
      if (node.getAttribute('aria-invalid') !== 'true' && !(node.willValidate && !node.validity.valid)) continue;
      const shell = node.closest('[class*="select-shell"]');
      const control = shell?.querySelector<HTMLInputElement>('[role="combobox"]') ?? node;
      if (!control.getClientRects().length) continue;
      const label = (control.labels?.[0]?.textContent || control.getAttribute('aria-label') || '').replace(/\s+/g, ' ').replace(/\*$/, '').trim();
      if (!label || seen.has(label)) continue;
      seen.add(label);
      const kind = control.getAttribute('role') === 'combobox' ? 'react-select' : control.tagName === 'SELECT' ? 'select' : control.tagName === 'TEXTAREA' ? 'textarea' : control.type === 'checkbox' ? 'checkbox' : 'text';
      const options = control.tagName === 'SELECT' ? Array.from((control as HTMLSelectElement).options).filter(o => o.value && !o.disabled).map(o => o.textContent?.trim() || o.value) : undefined;
      result.push({label, kind, ...(options ? {options} : {})});
    }
    return result;
  });
}
