"use client";

import { useLocale } from "next-intl";
import { Icon } from "./design/icon";
import type { ApplicationPagination } from "@/lib/application-pagination";

export function ApplicationPager({ pagination, label, busy, onPage }: {
  pagination: ApplicationPagination; label: string; busy?: boolean; onPage: (page: number) => void;
}) {
  const en = useLocale() === "en";
  const { page, pageSize, total, pageCount } = pagination;
  const first = total ? (page - 1) * pageSize + 1 : 0;
  return <nav className="application-pager" aria-label={`${label}: ${en ? "pages" : "pagine"}`}>
    <span className="application-page-range" aria-live="polite">{first}–{Math.min(page * pageSize, total)} {en ? "of" : "di"} {total}</span>
    <div>
      <button type="button" className="ds-btn" aria-disabled={busy || page <= 1} aria-label={`${label}: ${en ? "previous page" : "pagina precedente"}`} onClick={() => { if (!busy && page > 1) onPage(page - 1); }}><Icon name="chevron-left" size={13} /></button>
      <span title={en ? `Page ${page} of ${pageCount}` : `Pagina ${page} di ${pageCount}`}>{page}/{pageCount}</span>
      <button type="button" className="ds-btn" aria-disabled={busy || page >= pageCount} aria-label={`${label}: ${en ? "next page" : "pagina successiva"}`} onClick={() => { if (!busy && page < pageCount) onPage(page + 1); }}><Icon name="chevron-right" size={13} /></button>
    </div>
  </nav>;
}
