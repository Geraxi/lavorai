/** One opportunity per configured UTC hour in this worker process. A late
 * startup may use the current hour, but never replays earlier hours/days.
 * Application deduplication and submission reservations remain DB-owned. */
export function parseAutoApplyHours(value = "8,12,16"): number[] {
  const parts = value.split(",").map(part => part.trim());
  if (parts.some(part => !/^\d{1,2}$/.test(part) || Number(part) > 23)) return [];
  return [...new Set(parts.map(Number))].sort((a, b) => a - b);
}

export function createAutoApplyTick(options: {
  hours: number[];
  blocked: () => boolean;
  run: () => Promise<void>;
  now?: () => Date;
}) {
  let lastRunKey = "";
  let running = false;
  return async () => {
    const now = (options.now ?? (() => new Date()))();
    const key = now.toISOString().slice(0, 13);
    if (running || options.blocked() || !options.hours.includes(now.getUTCHours()) || key === lastRunKey) return;
    // Failed/uncertain runs are not blindly retried within the hour.
    lastRunKey = key;
    running = true;
    try { await options.run(); } finally { running = false; }
  };
}
