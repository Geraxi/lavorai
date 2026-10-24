/**
 * Derive a calling-country from a profile phone number.
 * "+39 3791720976" → Italy / +39. Longest prefix wins; ambiguous
 * shared prefixes (US/CA +1) return the dial code only.
 */

export type PhoneCountry = {
  dial: string;
  iso2: string;
  name: string;
};

/** Longest-prefix first. ISO2 is the primary country for that code. */
const DIAL_TABLE: Array<[string, string, string]> = [
  ["1242", "BS", "Bahamas"],
  ["1246", "BB", "Barbados"],
  ["1264", "AI", "Anguilla"],
  ["1268", "AG", "Antigua and Barbuda"],
  ["1284", "VG", "British Virgin Islands"],
  ["1340", "VI", "US Virgin Islands"],
  ["1441", "BM", "Bermuda"],
  ["1473", "GD", "Grenada"],
  ["1649", "TC", "Turks and Caicos Islands"],
  ["1664", "MS", "Montserrat"],
  ["1671", "GU", "Guam"],
  ["1684", "AS", "American Samoa"],
  ["1758", "LC", "Saint Lucia"],
  ["1767", "DM", "Dominica"],
  ["1784", "VC", "Saint Vincent and the Grenadines"],
  ["1787", "PR", "Puerto Rico"],
  ["1809", "DO", "Dominican Republic"],
  ["1829", "DO", "Dominican Republic"],
  ["1849", "DO", "Dominican Republic"],
  ["1868", "TT", "Trinidad and Tobago"],
  ["1869", "KN", "Saint Kitts and Nevis"],
  ["1876", "JM", "Jamaica"],
  ["1939", "PR", "Puerto Rico"],
  ["351", "PT", "Portugal"],
  ["352", "LU", "Luxembourg"],
  ["353", "IE", "Ireland"],
  ["354", "IS", "Iceland"],
  ["355", "AL", "Albania"],
  ["356", "MT", "Malta"],
  ["357", "CY", "Cyprus"],
  ["358", "FI", "Finland"],
  ["359", "BG", "Bulgaria"],
  ["370", "LT", "Lithuania"],
  ["371", "LV", "Latvia"],
  ["372", "EE", "Estonia"],
  ["373", "MD", "Moldova"],
  ["374", "AM", "Armenia"],
  ["375", "BY", "Belarus"],
  ["376", "AD", "Andorra"],
  ["377", "MC", "Monaco"],
  ["378", "SM", "San Marino"],
  ["380", "UA", "Ukraine"],
  ["381", "RS", "Serbia"],
  ["382", "ME", "Montenegro"],
  ["383", "XK", "Kosovo"],
  ["385", "HR", "Croatia"],
  ["386", "SI", "Slovenia"],
  ["387", "BA", "Bosnia and Herzegovina"],
  ["389", "MK", "North Macedonia"],
  ["420", "CZ", "Czechia"],
  ["421", "SK", "Slovakia"],
  ["423", "LI", "Liechtenstein"],
  ["852", "HK", "Hong Kong"],
  ["853", "MO", "Macau"],
  ["855", "KH", "Cambodia"],
  ["856", "LA", "Laos"],
  ["880", "BD", "Bangladesh"],
  ["886", "TW", "Taiwan"],
  ["960", "MV", "Maldives"],
  ["961", "LB", "Lebanon"],
  ["962", "JO", "Jordan"],
  ["963", "SY", "Syria"],
  ["964", "IQ", "Iraq"],
  ["965", "KW", "Kuwait"],
  ["966", "SA", "Saudi Arabia"],
  ["967", "YE", "Yemen"],
  ["968", "OM", "Oman"],
  ["970", "PS", "Palestine"],
  ["971", "AE", "United Arab Emirates"],
  ["972", "IL", "Israel"],
  ["973", "BH", "Bahrain"],
  ["974", "QA", "Qatar"],
  ["975", "BT", "Bhutan"],
  ["976", "MN", "Mongolia"],
  ["977", "NP", "Nepal"],
  ["992", "TJ", "Tajikistan"],
  ["993", "TM", "Turkmenistan"],
  ["994", "AZ", "Azerbaijan"],
  ["995", "GE", "Georgia"],
  ["996", "KG", "Kyrgyzstan"],
  ["998", "UZ", "Uzbekistan"],
  ["20", "EG", "Egypt"],
  ["27", "ZA", "South Africa"],
  ["30", "GR", "Greece"],
  ["31", "NL", "Netherlands"],
  ["32", "BE", "Belgium"],
  ["33", "FR", "France"],
  ["34", "ES", "Spain"],
  ["36", "HU", "Hungary"],
  ["39", "IT", "Italy"],
  ["40", "RO", "Romania"],
  ["41", "CH", "Switzerland"],
  ["43", "AT", "Austria"],
  ["44", "GB", "United Kingdom"],
  ["45", "DK", "Denmark"],
  ["46", "SE", "Sweden"],
  ["47", "NO", "Norway"],
  ["48", "PL", "Poland"],
  ["49", "DE", "Germany"],
  ["51", "PE", "Peru"],
  ["52", "MX", "Mexico"],
  ["53", "CU", "Cuba"],
  ["54", "AR", "Argentina"],
  ["55", "BR", "Brazil"],
  ["56", "CL", "Chile"],
  ["57", "CO", "Colombia"],
  ["58", "VE", "Venezuela"],
  ["60", "MY", "Malaysia"],
  ["61", "AU", "Australia"],
  ["62", "ID", "Indonesia"],
  ["63", "PH", "Philippines"],
  ["64", "NZ", "New Zealand"],
  ["65", "SG", "Singapore"],
  ["66", "TH", "Thailand"],
  ["81", "JP", "Japan"],
  ["82", "KR", "South Korea"],
  ["84", "VN", "Vietnam"],
  ["86", "CN", "China"],
  ["90", "TR", "Turkey"],
  ["91", "IN", "India"],
  ["92", "PK", "Pakistan"],
  ["93", "AF", "Afghanistan"],
  ["94", "LK", "Sri Lanka"],
  ["95", "MM", "Myanmar"],
  ["98", "IR", "Iran"],
  ["7", "RU", "Russia"],
  ["1", "US", "United States"],
];

const SORTED = [...DIAL_TABLE].sort((a, b) => b[0].length - a[0].length);

export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/[\s().-]/g, "").replace(/^00/, "+");
}

export function parsePhoneCountry(phone: string | null | undefined): PhoneCountry | null {
  if (!phone?.trim()) return null;
  const raw = normalizePhoneDigits(phone);
  if (!raw.startsWith("+")) return null;
  const digits = raw.slice(1);
  if (!/^\d{1,15}$/.test(digits)) return null;
  for (const [code, iso2, name] of SORTED) {
    if (digits === code || digits.startsWith(code)) {
      return { dial: `+${code}`, iso2, name };
    }
  }
  return null;
}

export function phoneCountryLabels(parsed: PhoneCountry): string[] {
  return [
    `${parsed.name} (${parsed.dial})`,
    `${parsed.name} ${parsed.dial}`,
    `${parsed.iso2} (${parsed.dial})`,
    `${parsed.iso2} ${parsed.dial}`,
    parsed.dial,
    parsed.name,
    parsed.iso2,
  ];
}

const COUNTRY_ALIASES: Array<[string, string[]]> = [
  ["italy", ["italy", "italia", "it", "ita"]],
  ["united kingdom", ["united kingdom", "uk", "gb", "gbr", "great britain", "regno unito"]],
  ["united states", ["united states", "united states of america", "us", "usa", "america", "stati uniti"]],
  ["canada", ["canada", "ca", "can"]],
  ["germany", ["germany", "deutschland", "de", "germania"]],
  ["france", ["france", "fr", "francia"]],
  ["spain", ["spain", "es", "espana", "españa", "spagna"]],
  ["portugal", ["portugal", "pt", "portogallo"]],
  ["netherlands", ["netherlands", "nl", "holland", "olanda", "paesi bassi"]],
  ["ireland", ["ireland", "ie", "irlanda"]],
  ["switzerland", ["switzerland", "ch", "svizzera", "schweiz"]],
  ["austria", ["austria", "at", "österreich", "osterreich"]],
  ["belgium", ["belgium", "be", "belgio"]],
  ["poland", ["poland", "pl", "polonia"]],
  ["sweden", ["sweden", "se", "svezia"]],
  ["norway", ["norway", "no", "norvegia"]],
  ["denmark", ["denmark", "dk", "danimarca"]],
];

function normalizeCountryToken(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase().replace(/[().+,]/g, " ").replace(/\s+/g, " ");
}

export function countryAliasTokens(country: string | null | undefined): string[] {
  if (!country?.trim()) return [];
  const needle = normalizeCountryToken(country);
  const hit = COUNTRY_ALIASES.find(([, aliases]) =>
    aliases.includes(needle) || aliases.some((a) => a.length >= 4 && (needle === a || needle.includes(a) || a.includes(needle))),
  );
  return hit ? hit[1] : [needle];
}

export function optionMatchesCountry(option: string, country: string | null | undefined): boolean {
  const aliases = countryAliasTokens(country);
  if (!aliases.length) return false;
  const needle = normalizeCountryToken(option);
  const words = needle.split(" ");
  return aliases.some((alias) => {
    if (alias.length < 2) return false;
    if (needle === alias || words.includes(alias)) return true;
    // Short codes ("it", "us") must not substring-match "united" / "lithuania".
    return alias.length >= 4 && needle.includes(alias);
  });
}

function titleCountry(name: string): string {
  return name.replace(/\b\w/g, (c) => c.toUpperCase());
}

function countryDisplayName(country: string | null | undefined): string | null {
  const tokens = countryAliasTokens(country);
  if (!tokens.length) return null;
  const canon = COUNTRY_ALIASES.find(([, aliases]) => aliases[0] === tokens[0] || aliases.includes(tokens[0]));
  if (!canon) return country!.trim();
  return titleCountry(canon[1][0]);
}

/** NANP +1 and +7 are shared; the table's primary country is not enough. */
function isSharedDial(dial: string): boolean {
  return dial === "+1" || dial === "+7";
}

/** Label to store / type when the live list is not loaded yet. */
export function derivePhoneCountryLabel(phone: string | null | undefined, country?: string | null): string | null {
  const parsed = parsePhoneCountry(phone);
  if (parsed) {
    if (isSharedDial(parsed.dial)) {
      if (!country?.trim()) return null;
      if (optionMatchesCountry(`${parsed.name} (${parsed.dial})`, country)) {
        return `${parsed.name} (${parsed.dial})`;
      }
      const named = countryDisplayName(country);
      return named ? `${named} (${parsed.dial})` : null;
    }
    return `${parsed.name} (${parsed.dial})`;
  }
  return countryDisplayName(country);
}

/** Pick the unique option whose +prefix matches the phone, longest wins.
 * Shared codes (+1) are disambiguated by profile country. No prefix → country. */
export function matchPhoneCountryOption(
  options: string[],
  phone: string,
  country?: string | null,
): string | null {
  const parsed = parsePhoneCountry(phone);
  const digits = normalizePhoneDigits(phone ?? "");
  const matches = options.flatMap((option) => {
    const found = option.match(/\+\s*(\d{1,4})\b/);
    if (found && digits.startsWith(`+${found[1]}`)) {
      return [{ option, length: found[1].length }];
    }
    if (parsed) {
      const needle = option.normalize("NFKC").trim().toLowerCase();
      if (
        needle === parsed.name.toLowerCase()
        || needle === parsed.iso2.toLowerCase()
        || needle === parsed.dial.toLowerCase()
        || needle.includes(parsed.dial.toLowerCase())
      ) {
        return [{ option, length: parsed.dial.length - 1 }];
      }
    }
    return [];
  });
  if (matches.length) {
    const longest = Math.max(...matches.map((m) => m.length));
    const exact = matches.filter((m) => m.length === longest);
    if (exact.length === 1) return exact[0].option;
    if (country?.trim()) {
      const byCountry = exact.filter((m) => optionMatchesCountry(m.option, country));
      if (byCountry.length === 1) return byCountry[0].option;
    }
    return null;
  }
  if (!parsed && country?.trim()) {
    const byCountry = options.filter((option) => optionMatchesCountry(option, country));
    return byCountry.length === 1 ? byCountry[0] : null;
  }
  return null;
}
