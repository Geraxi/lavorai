/**
 * Helper puri per il periodo dei report admin (importabili da server e client).
 * "h" = ultima ora (1/24 giorni); gli altri valori sono giorni interi.
 */
export const HOUR = 1 / 24;
export const RANGE_OPTIONS = [HOUR, 1, 7, 14, 30, 90];
/** Etichetta corta: "1h", "24h", "7g". */
export function rangeLabel(days: number): string {
  return days < 1 ? "1h" : days === 1 ? "24h" : `${days}g`;
}
export function rangeLabelLong(days: number): string {
  return days < 1 ? "Ultima ora" : days === 1 ? "Ultime 24 ore" : `Ultimi ${days} giorni`;
}
/** Parsa ?range= ("h", "1", "7", …) in giorni, con default. */
export function parseRange(raw: string | undefined, def: number, allowed: number[] = RANGE_OPTIONS): number {
  if (raw === "h") return HOUR;
  const n = Number(raw);
  return allowed.includes(n) ? n : def;
}
