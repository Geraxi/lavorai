// Twitter Card image. Stesso visual dell'opengraph-image — duplicato
// inline invece di re-exportare perché Turbopack non riconosce
// `runtime` quando è ri-esportato da un altro file route segment
// (errore: "The exported configuration object ... needs to have a
// very specific format from which some properties can be statically
// parsed at compiled-time").
export { default } from "./opengraph-image";

export const runtime = "edge";
export const alt =
  "LavorAI — il copilota italiano per la ricerca del lavoro";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
