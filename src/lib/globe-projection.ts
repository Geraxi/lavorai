/**
 * Proiezione lat/lng → coordinate (0..1) sull'immagine del globo
 * (public/hero-globe.webp, 1254×1254). L'immagine è un'illustrazione con
 * geografia stilizzata: usiamo una proiezione ortografica calibrata più una
 * correzione locale (IDW) su punti di controllo posizionati a mano, così le
 * città note cadono esatte e le altre vengono interpolate.
 */
const IMG = 1254;
const P = { lat0: -6.635, lng0: -23.336, cx: 680.10, cy: 694.07, rx: 481.15, ry: 452.87 };
/** [nome, lat, lng, x, y] — pixel misurati sull'immagine. */
const CONTROL: Array<[string, number, number, number, number]> = [["London", 51.5, -0.1, 835, 300], ["Milano", 45.5, 9.2, 905, 395], ["Lisbon", 38.7, -9.1, 815, 400], ["Cairo", 30, 31.2, 1000, 470], ["Dubai", 25.2, 55.3, 1120, 520], ["Nairobi", -1.3, 36.8, 1080, 720], ["Cape", -33.9, 18.4, 935, 905], ["NewYork", 40.7, -74, 335, 425], ["Miami", 25.8, -80.2, 385, 490], ["Mexico", 19.4, -99.1, 250, 545], ["SaoPaulo", -23.5, -46.6, 470, 800], ["BuenosAires", -34.6, -58.4, 415, 900], ["Reykjavik", 64, -22, 620, 205], ["Greenland", 72, -40, 640, 160], ["Berlin", 52.5, 13.4, 940, 330], ["Rome", 41.9, 12.5, 915, 435], ["Toronto", 43.7, -79.4, 305, 385], ["Lagos", 6.5, 3.4, 870, 610], ["Bogota", 4.7, -74.1, 330, 640]];

function ortho(lat: number, lng: number) {
  const r = Math.PI / 180;
  const p = lat * r, l = lng * r, p0 = P.lat0 * r, l0 = P.lng0 * r;
  const c = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l - l0);
  const x = Math.cos(p) * Math.sin(l - l0);
  const y = Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l - l0);
  return { x: P.cx + P.rx * x, y: P.cy - P.ry * y, c };
}
const RES = CONTROL.map(([, lat, lng, x, y]) => { const o = ortho(lat, lng); return { lat, lng, dx: x - o.x, dy: y - o.y }; });

export interface GlobePoint { x: number; y: number; visible: boolean }

/** Ritorna x/y in frazione (0..1) dell'immagine e se il punto è sull'emisfero visibile. */
export function projectToGlobe(lat: number, lng: number): GlobePoint {
  const o = ortho(lat, lng);
  let sw = 0, dx = 0, dy = 0;
  for (const rp of RES) {
    const d = Math.hypot(rp.lat - lat, (rp.lng - lng) * Math.cos((lat * Math.PI) / 180));
    if (d < 0.01) return { x: (o.x + rp.dx) / IMG, y: (o.y + rp.dy) / IMG, visible: o.c > 0 };
    const w = 1 / Math.pow(d, 2.2);
    sw += w; dx += w * rp.dx; dy += w * rp.dy;
  }
  return { x: (o.x + dx / sw) / IMG, y: (o.y + dy / sw) / IMG, visible: o.c > 0.02 };
}

/** Centro del globo nell'immagine (frazione), per orientare le card verso l'esterno. */
export const GLOBE_CENTER = { x: 0.5423, y: 0.5535 };
/** Zona occupata dalla persona (frazione), da tenere libera da card. */
export const PERSON_BOX = { x0: 0.42, y0: 0.36, x1: 0.62, y1: 0.7 };
