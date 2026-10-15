import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusChip } from "../src/components/design/status-chip";
import { ReplyKindChip } from "../src/components/reply-kind-chip";
import { globeCopy, regionDisplayName } from "../src/lib/globe-presentation";
import { pipelineLane } from "../src/lib/application-pipeline";
import { discoverMatchScore } from "../src/lib/discover-match-score";
import { deliveryCopy } from "../src/lib/application-presentation";
import { materialSent, type MaterialItem } from "../src/app/(app)/materiali/materiali-view";
import type { DeliveryView } from "../src/lib/application-delivery-view";
import type { CVProfile } from "../src/lib/cv-profile-types";

const delivery = (phase: DeliveryView["phase"]): DeliveryView => ({ phase, label: "Esito da verificare", detail: "No proof", tone: "neutral" });
for (const phase of ["accepted", "unconfirmed", "failed", "pending"] as const) {
  assert.equal(pipelineLane({ delivery: delivery(phase) }), "attention");
  assert.equal(materialSent({ status: "success", submittedVia: "portal_greenhouse", delivery: delivery(phase) } as MaterialItem), false);
}
for (const phase of ["confirmed", "delivered"] as const) {
  assert.equal(pipelineLane({ delivery: delivery(phase) }), "recorded");
  assert.equal(materialSent({ delivery: delivery(phase) } as MaterialItem), true);
}
assert.equal(materialSent({ status: "success", submittedVia: "portal_greenhouse" } as MaterialItem), false);
assert.equal(materialSent({ delivery: delivery("manual") } as MaterialItem), false);
assert.equal(pipelineLane({ delivery: delivery("manual") }), "recorded");
assert.equal(pipelineLane({ delivery: delivery("failed"), userStatus: "offerta" }), "outcome");
assert.equal(pipelineLane({ lastReplyKind: "rifiutata" }), "conversation", "An inferred rejection stays a message classification");
assert.equal(pipelineLane({ lastReplyKind: "ricevuta" }), "attention", "Automatic receipts are not recruiter conversations");
assert.equal(pipelineLane({ lastReplyKind: "bounce" }), "attention");
assert.equal(pipelineLane({ userStatus: "colloquio" }), "conversation");
assert.equal(pipelineLane({ userStatus: "vista", delivery: delivery("unconfirmed") }), "attention", "Viewed status does not verify delivery");
assert.equal(discoverMatchScore(null, "Engineer"), null);
assert.equal(discoverMatchScore({ title: "", summary: "", skills: [], experiences: [] } as unknown as CVProfile, "Engineer"), null);
const score = discoverMatchScore({ title: "Engineer", summary: "", skills: [{ name: "TypeScript" }], experiences: [] } as unknown as CVProfile, "Engineer TypeScript React");
assert.ok(score != null && score < 100 && score > 0);
assert.equal(deliveryCopy(delivery("unconfirmed"), "en")?.label, "Outcome unverified");
assert.equal(deliveryCopy(delivery("unconfirmed"), "it")?.label, "Esito da verificare");
console.log("PASS pipeline evidence, manual vs automatic outcomes, material sent counts, missing CV scores and localized delivery presentation.");

for (const [status, english, italian] of [["colloquio", "Interview", "Colloquio"], ["offerta", "Offer", "Offerta"], ["rifiutata", "Rejected", "Rifiutata"], ["needs_session", "Sign in again", "Ri-login"]]) {
  assert.ok(renderToStaticMarkup(createElement(StatusChip, { status, locale: "en" })).includes(english));
  assert.ok(renderToStaticMarkup(createElement(StatusChip, { status, locale: "it" })).includes(italian));
}
assert.match(renderToStaticMarkup(createElement(ReplyKindChip, { lastReplyKind: "rifiutata", locale: "en" })), /Possible rejection/);
assert.match(renderToStaticMarkup(createElement(ReplyKindChip, { lastReplyKind: "rifiutata", locale: "it" })), /Possibile rifiuto/);
assert.equal(renderToStaticMarkup(createElement(ReplyKindChip, { replyCount: 0, locale: "en" })), "");
assert.equal(globeCopy("en").cta.saved, "Approve and submit");
assert.equal(globeCopy("it").cta.saved, "Approva e invia");
assert.equal(regionDisplayName({ key: "regno-unito", name: "Regno Unito" }, "en"), "United Kingdom");
console.log("PASS shared status chips preserve heuristic qualifiers and support English/Italian; globe copy is localized.");
