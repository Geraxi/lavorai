/** Utility condivise dai fetcher dei feed ATS. */

export async function runPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R[]>): Promise<R[]> {
  const out: R[] = [];
  const queue = [...items];
  async function worker() {
    while (queue.length > 0) {
      const it = queue.shift();
      if (it === undefined) return;
      out.push(...(await fn(it)));
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));
  return out;
}

/** Annuncio rilevante per il nostro pubblico: Italia/Europa o remoto, non "US only". */
export function isEuRelevant(loc: string, description: string): boolean {
  const c = `${loc} ${description.slice(0, 400)}`.toLowerCase();
  const no = ["us only", "usa only", "canada only", "us-based", "anywhere in the us", "united states only"];
  if (no.some((n) => c.includes(n))) return false;
  const yes = [
    "italy", "italia", "milan", "milano", "rome", "roma", "torino", "turin", "firenze", "bologna", "napoli", "padova", "verona", "genova",
    "europe", "europa", "emea", "germany", "deutschland", "berlin", "munich", "münchen", "hamburg", "france", "francia", "paris",
    "spain", "spagna", "madrid", "barcelona", "netherlands", "amsterdam", "portugal", "lisbon", "ireland", "dublin", "belgium",
    "austria", "vienna", "switzerland", "svizzera", "zurich", "uk", "united kingdom", "london", "londra", "sweden", "stockholm",
    "denmark", "copenhagen", "poland", "warsaw", "remote", "remoto",
  ];
  return yes.some((y) => c.includes(y));
}

export function stripHtml(s: string | null | undefined): string {
  return (s ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}
