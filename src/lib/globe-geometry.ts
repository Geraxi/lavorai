/**
 * Geometria pura del globo (nessuna dipendenza server).
 *
 * Separata da dashboard-globe-data.ts perché i client component (mappa,
 * pannello regioni, globo) la importano: importarla da lì trascinava nel
 * bundle del browser anche Prisma, l'adapter Neon e zod (~480 KB di JS).
 */

/** Distanza angolare (gradi) tra due punti, per tenere le card lontane dalla persona. */
export function angularDistance(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = Math.PI / 180;
  const d = Math.sin(aLat * r) * Math.sin(bLat * r) + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.cos((aLng - bLng) * r);
  return Math.acos(Math.max(-1, Math.min(1, d))) / r;
}

/** Punto in cui è ancorata la persona sdraiata (Atlantico, come nel riferimento). */
export const PERSON_ANCHOR = { lat: 4, lng: -24 };
