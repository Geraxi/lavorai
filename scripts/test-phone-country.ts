/**
 * Phone country-code derivation and adapter wiring.
 * No browser, no network.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { derivePhoneCountryLabel, matchPhoneCountryOption, parsePhoneCountry } from "../src/lib/phone-country";

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
assert.equal(matchPhoneCountryOption(["USA (+1)", "Canada (+1)"], "+1 212 555 1234", "Canada"), "Canada (+1)");
assert.equal(matchPhoneCountryOption(["USA (+1)", "Canada (+1)"], "+1 212 555 1234", "United States"), "USA (+1)");
assert.equal(matchPhoneCountryOption(["Italy (+39)", "UK (+44)"], "02079460000", "UK"), "UK (+44)");
assert.equal(matchPhoneCountryOption(["Italy (+39)", "UK (+44)"], "+39 3791720976", "UK"), "Italy (+39)");
assert.equal(matchPhoneCountryOption(["Italy (+39)", "United Kingdom (+44)", "United States (+1)"], "3791720976", "Italy"), "Italy (+39)");
assert.equal(derivePhoneCountryLabel("+39 3791720976"), "Italy (+39)");
assert.equal(derivePhoneCountryLabel("3791720976", "Italy"), "Italy");
assert.equal(derivePhoneCountryLabel("+1 212 555 1234"), null, "+1 without country stays ambiguous");
assert.equal(derivePhoneCountryLabel("+1 212 555 1234", "Canada"), "Canada (+1)");
assert.equal(derivePhoneCountryLabel("+1 212 555 1234", "United States"), "United States (+1)");

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
