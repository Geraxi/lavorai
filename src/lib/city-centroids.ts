import { COUNTRY_CENTROIDS } from "@/lib/country-centroids";

/**
 * Città più frequenti negli annunci (ATS EU/US + tech hub) con alias IT/EN.
 * `matchCity(location)` cerca la città nel testo della location; se trova
 * solo un paese usa il suo centroide. Usato dal globo della dashboard utente.
 */
export interface CityInfo {
  name: string; // label mostrata (IT)
  lat: number;
  lng: number;
  cc: string; // ISO2
  aliases: string[]; // lowercase
}

const C = (name: string, lat: number, lng: number, cc: string, ...aliases: string[]): CityInfo => ({
  name,
  lat,
  lng,
  cc,
  aliases: [name.toLowerCase(), ...aliases.map((a) => a.toLowerCase())],
});

export const CITIES: CityInfo[] = [
  C("Milano", 45.46, 9.19, "IT", "milan", "milano, it", "milan, italy"),
  C("Roma", 41.9, 12.5, "IT", "rome"),
  C("Torino", 45.07, 7.69, "IT", "turin"),
  C("Bologna", 44.49, 11.34, "IT"),
  C("Firenze", 43.77, 11.25, "IT", "florence"),
  C("Napoli", 40.85, 14.27, "IT", "naples"),
  C("Genova", 44.41, 8.93, "IT", "genoa"),
  C("Venezia", 45.44, 12.33, "IT", "venice", "padova", "padua", "treviso"),
  C("Verona", 45.44, 10.99, "IT"),
  C("Bari", 41.12, 16.87, "IT"),
  C("Palermo", 38.12, 13.36, "IT", "catania"),
  C("Trento", 46.07, 11.12, "IT", "bolzano"),
  C("Londra", 51.51, -0.13, "GB", "london"),
  C("Manchester", 53.48, -2.24, "GB"),
  C("Edimburgo", 55.95, -3.19, "GB", "edinburgh"),
  C("Dublino", 53.35, -6.26, "IE", "dublin"),
  C("Parigi", 48.86, 2.35, "FR", "paris"),
  C("Lione", 45.76, 4.84, "FR", "lyon"),
  C("Berlino", 52.52, 13.4, "DE", "berlin"),
  C("Monaco di Baviera", 48.14, 11.58, "DE", "munich", "münchen", "munchen"),
  C("Amburgo", 53.55, 9.99, "DE", "hamburg"),
  C("Francoforte", 50.11, 8.68, "DE", "frankfurt"),
  C("Colonia", 50.94, 6.96, "DE", "cologne", "köln", "düsseldorf", "dusseldorf"),
  C("Amsterdam", 52.37, 4.9, "NL", "rotterdam", "utrecht", "eindhoven"),
  C("Bruxelles", 50.85, 4.35, "BE", "brussels", "brussel", "antwerp", "anversa"),
  C("Lussemburgo", 49.61, 6.13, "LU", "luxembourg"),
  C("Zurigo", 47.38, 8.54, "CH", "zurich", "zürich"),
  C("Ginevra", 46.2, 6.14, "CH", "geneva", "lausanne", "losanna"),
  C("Vienna", 48.21, 16.37, "AT", "wien"),
  C("Madrid", 40.42, -3.7, "ES"),
  C("Barcellona", 41.39, 2.17, "ES", "barcelona"),
  C("Valencia", 39.47, -0.38, "ES", "malaga", "málaga"),
  C("Lisbona", 38.72, -9.14, "PT", "lisbon", "lisboa"),
  C("Porto", 41.15, -8.61, "PT"),
  C("Stoccolma", 59.33, 18.07, "SE", "stockholm"),
  C("Copenaghen", 55.68, 12.57, "DK", "copenhagen", "københavn"),
  C("Oslo", 59.91, 10.75, "NO"),
  C("Helsinki", 60.17, 24.94, "FI"),
  C("Varsavia", 52.23, 21.01, "PL", "warsaw", "warszawa"),
  C("Cracovia", 50.06, 19.94, "PL", "krakow", "kraków", "wroclaw", "wrocław"),
  C("Praga", 50.08, 14.44, "CZ", "prague", "praha"),
  C("Budapest", 47.5, 19.04, "HU"),
  C("Bucarest", 44.43, 26.1, "RO", "bucharest"),
  C("Atene", 37.98, 23.73, "GR", "athens"),
  C("Tallinn", 59.44, 24.75, "EE", "riga", "vilnius"),
  C("Tel Aviv", 32.08, 34.78, "IL"),
  C("Dubai", 25.2, 55.27, "AE", "abu dhabi"),
  C("Istanbul", 41.01, 28.98, "TR"),
  C("New York", 40.71, -74.01, "US", "nyc", "new york, ny", "brooklyn"),
  C("San Francisco", 37.77, -122.42, "US", "sf", "bay area", "palo alto", "mountain view", "menlo park", "san jose", "oakland"),
  C("Los Angeles", 34.05, -118.24, "US", "la, ca", "santa monica"),
  C("Seattle", 47.61, -122.33, "US", "bellevue", "redmond"),
  C("Austin", 30.27, -97.74, "US"),
  C("Chicago", 41.88, -87.63, "US"),
  C("Boston", 42.36, -71.06, "US", "cambridge, ma"),
  C("Miami", 25.76, -80.19, "US"),
  C("Denver", 39.74, -104.99, "US", "boulder"),
  C("Washington", 38.9, -77.04, "US", "washington, dc", "arlington"),
  C("Atlanta", 33.75, -84.39, "US"),
  C("Toronto", 43.65, -79.38, "CA"),
  C("Vancouver", 49.28, -123.12, "CA"),
  C("Montréal", 45.5, -73.57, "CA", "montreal"),
  C("Città del Messico", 19.43, -99.13, "MX", "mexico city", "cdmx"),
  C("San Paolo", -23.55, -46.63, "BR", "são paulo", "sao paulo"),
  C("Buenos Aires", -34.6, -58.38, "AR"),
  C("Bogotá", 4.71, -74.07, "CO", "bogota"),
  C("Tokyo", 35.68, 139.69, "JP"),
  C("Singapore", 1.35, 103.82, "SG"),
  C("Hong Kong", 22.32, 114.17, "HK"),
  C("Bangalore", 12.97, 77.59, "IN", "bengaluru", "hyderabad", "pune", "mumbai", "delhi", "gurgaon"),
  C("Sydney", -33.87, 151.21, "AU"),
  C("Melbourne", -37.81, 144.96, "AU"),
  C("Auckland", -36.85, 174.76, "NZ"),
  C("Il Cairo", 30.04, 31.24, "EG", "cairo"),
  C("Lagos", 6.52, 3.38, "NG"),
  C("Nairobi", -1.29, 36.82, "KE"),
  C("Città del Capo", -33.92, 18.42, "ZA", "cape town", "johannesburg"),
];

const COUNTRY_ALIASES: Record<string, string> = {
  italia: "IT", italy: "IT", "united kingdom": "GB", uk: "GB", england: "GB", "regno unito": "GB",
  germany: "DE", germania: "DE", deutschland: "DE", france: "FR", francia: "FR", spain: "ES", spagna: "ES", españa: "ES",
  netherlands: "NL", "paesi bassi": "NL", olanda: "NL", switzerland: "CH", svizzera: "CH", schweiz: "CH",
  ireland: "IE", irlanda: "IE", portugal: "PT", portogallo: "PT", austria: "AT", belgium: "BE", belgio: "BE",
  sweden: "SE", svezia: "SE", denmark: "DK", danimarca: "DK", norway: "NO", norvegia: "NO", finland: "FI", finlandia: "FI",
  poland: "PL", polonia: "PL", "czech republic": "CZ", czechia: "CZ", greece: "GR", grecia: "GR", romania: "RO",
  "united states": "US", usa: "US", "u.s.": "US", "stati uniti": "US", canada: "CA", mexico: "MX", messico: "MX",
  brazil: "BR", brasile: "BR", argentina: "AR", japan: "JP", giappone: "JP", india: "IN", australia: "AU",
  singapore: "SG", israel: "IL", israele: "IL", "united arab emirates": "AE", uae: "AE", emirati: "AE", turkey: "TR", turchia: "TR",
};

const cityIndex = CITIES.flatMap((c) => c.aliases.map((a) => [a, c] as const)).sort((a, b) => b[0].length - a[0].length);

/**
 * Prova a geolocalizzare una location testuale ("Milano, Italia", "Remote - EU",
 * "London, UK", "Berlin"). Ritorna la città; se trova solo il paese, un punto
 * sul suo centroide con name = paese. Null se non riconosciuta.
 */
export function matchCity(location: string | null | undefined): { key: string; name: string; lat: number; lng: number; cc: string } | null {
  if (!location) return null;
  const l = ` ${location.toLowerCase().replace(/[()\[\]]/g, " ").replace(/\s+/g, " ").trim()} `;
  for (const [alias, c] of cityIndex) {
    if (l.includes(` ${alias}`) || l.includes(`${alias},`) || l.includes(` ${alias} `)) {
      return { key: c.name, name: c.name, lat: c.lat, lng: c.lng, cc: c.cc };
    }
  }
  for (const [alias, cc] of Object.entries(COUNTRY_ALIASES)) {
    if (l.includes(` ${alias} `) || l.includes(` ${alias},`)) {
      const info = COUNTRY_CENTROIDS[cc];
      if (info) return { key: `cc:${cc}`, name: info.name, lat: info.lat, lng: info.lng, cc };
    }
  }
  return null;
}
