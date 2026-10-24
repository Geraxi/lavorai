/**
 * Phone country-code derivation and adapter wiring.
 * No browser, no network.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchPhoneCountryOption, parsePhoneCountry } from "../src/lib/phone-country";

const it = parsePhoneCountry("+39 3791720976");
assert.ok(it);
assert.equal(it.dial, "+39");
assert.equal(it.iso2, "IT");
assert.equal(it.name, "Italy");

assert.equal(parsePhoneCountry("+44 7911 123456")?.iso2, "GB");
assert.equal(parsePhoneCountry("0039 3791720976")?.iso2, "IT");
assert.equal(parsePhoneCountry("3791720976"), null, "National number without + is not guessed");
assert.equal(parsePhoneCountry(""), null);

const options = ["Italy (+39)", "United Kingdom (+44)", "United States (+1)"];
assert.equal(matchPhoneCountryOption(options, "+39 3791720976"), "Italy (+39)");
assert.equal(matchPhoneCountryOption(options, "+44 20 7946 0000"), "United Kingdom (+44)");
assert.equal(matchPhoneCountryOption(["USA (+1)", "Canada (+1)"], "+1 212 555 1234"), null);

for (const file of [
  "src/lib/portal-adapters/greenhouse.ts",
  "src/lib/portal-adapters/lever.ts",
  "src/lib/portal-adapters/ashby.ts",
  "src/lib/portal-adapters/workable.ts",
]) {
  const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  assert.match(src, /fillPhoneCountryCode/, `${file} fills the country-code widget from the profile phone`);
}

console.log("phone-country: ok");
