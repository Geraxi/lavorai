/**
 * Same-page stuck detection: if navigation does not change after several
 * attempts, stop with FAILED:stuck instead of looping.
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

export function isClosedPostingText(text: string): boolean {
  return /no longer (accepting|available|open)|position (has been )?(filled|closed)|job not found|this job is closed|posizione (chiusa|non più)|non più (disponibile|attiva)|annuncio scaduto|\bexpired\b/i.test(text);
}
