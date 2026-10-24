/**
 * Same-page stuck detection: if navigation does not change after several
 * attempts, stop with FAILED:stuck instead of looping.
 *
 * Closed-posting detection is banner / 404 / closed-URL only. Job-description
 * words like "expired" must never mark a live form as EXPIRED.
 */

export function canonicalPageUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|gh_src|lever-source|source|ref)/i.test(key)) u.searchParams.delete(key);
    }
    u.searchParams.sort();
    return `${u.origin}${u.pathname.replace(/\/+$/, "")}${u.search}`;
  } catch {
    return url.split("#")[0] ?? url;
  }
}

export class PageProgressTracker {
  private readonly seen: string[] = [];
  constructor(private readonly maxRepeats = 3) {}

  note(url: string): "progress" | "stuck" {
    const key = canonicalPageUrl(url);
    this.seen.push(key);
    if (this.seen.length < this.maxRepeats) return "progress";
    const last = this.seen.slice(-this.maxRepeats);
    return last.every((u) => u === last[0]) ? "stuck" : "progress";
  }

  get history(): readonly string[] {
    return this.seen;
  }
}

/** Dedicated closed / 404 posting URLs — not a query flag on a live apply form. */
export function isClosedPostingUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase().replace(/\/+$/, "");
    if (/(?:^|\/)(?:404|not-found|job-not-found|job_not_found|job-closed|job_closed|position-closed|posizione-chiusa)(?:\/|$)/.test(path)) {
      return true;
    }
    if (u.searchParams.get("error") === "JobNotFound" || u.searchParams.get("error") === "job_closed") return true;
  } catch {
    return false;
  }
  return false;
}

/**
 * Clear closed-posting banner / heading / title. Requires a full phrase —
 * a lone "expired" in a job description does not match.
 */
export function isClosedPostingBanner(text: string): boolean {
  return /this job is (?:closed|no longer (?:accepting|available|open))|no longer accepting applications|position has been (?:filled|closed)|job not found|this posting is closed|annuncio (?:non più online|scaduto)|posizione (?:chiusa|non più (?:disponibile|attiva))/i.test(text);
}

/** @deprecated use isClosedPostingBanner — kept as the banner-only check. */
export function isClosedPostingText(text: string): boolean {
  return isClosedPostingBanner(text);
}
