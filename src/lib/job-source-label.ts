/** Visible credit on the original listing link for public-feed partners. */
export function jobSourceLabel(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    if (host === "himalayas.app") return "Himalayas";
    if (host === "weworkremotely.com") return "We Work Remotely";
  } catch { /* malformed legacy URL */ }
  return null;
}
