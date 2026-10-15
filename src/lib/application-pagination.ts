import type { PipelineLane } from "./application-pipeline";

export const APPLICATION_LANES = ["attention", "recorded", "conversation", "outcome"] as const;
export const BOARD_PAGE_SIZE = 3;
export const TABLE_PAGE_SIZE = 10;
export interface ApplicationPagination { page: number; pageSize: number; total: number; pageCount: number }
export interface ApplicationListMeta {
  total: number;
  awaitingCount: number;
  summary: { confirmed: number; attention: number; interviews: number; offers: number; pending: number };
  pagination: ApplicationPagination;
  lanes: Record<PipelineLane, ApplicationPagination>;
}

/** Retain only a requested page and the final page, so deleted/filtered pages
 * can be clamped without keeping an entire application history in memory. */
export function pageWindow(requestedPage: number, pageSize: number) {
  let total = 0;
  const requested: string[] = [];
  let last: string[] = [];
  return {
    add(id: string) {
      if (Math.floor(total / pageSize) === requestedPage - 1) requested.push(id);
      if (total % pageSize === 0) last = [];
      last.push(id);
      total++;
    },
    result() {
      const pageCount = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(requestedPage, pageCount);
      return { ids: page === requestedPage ? requested : last, pagination: { page, pageSize, total, pageCount } };
    },
  };
}
