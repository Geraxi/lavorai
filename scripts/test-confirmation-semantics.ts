/**
 * Confirmation statuses stay distinct. MAILBOX_NO_BOUNCE / "no bounce"
 * never counts as ATS-accepted. Legacy success without a stored receipt
 * keeps the limited-evidence label and is never upgraded. Fakes only.
 */
import assert from "node:assert/strict";
import {
  confirmationStatus,
  confirmationStatusOf,
  deliveryEvidence,
  isConfirmedDelivery,
  isSentUnverified,
} from "../src/lib/application-evidence";
import { applicationStage } from "../src/lib/application-stage";
import { applicationDeliveryView } from "../src/lib/application-delivery-view";
import { deriveApplicationLifecycle } from "../src/lib/application-lifecycle";
import { deriveAttemptOutcome } from "../src/lib/attempt-outcome";
import { STAGE_LABEL } from "../src/lib/ui-application-status";

const now = new Date("2026-10-24T12:00:00.000Z");
const receipt = JSON.stringify({
  version: 1, provider: "greenhouse", kind: "http", capturedAt: now.toISOString(),
  jobId: "1", endpoint: "https://boards-api.greenhouse.io/v1/boards/acme/jobs/1",
  operation: "application.create", httpStatus: 201, signal: "application_id", receiptId: "c1",
});

const ats = {
  status: "success", submittedVia: "portal_greenhouse", submitConfirmation: "DETECTED_HTTP_201",
  submissionReceiptJson: receipt, submittedAt: now,
};
assert.equal(deliveryEvidence(ats), "confirmed_portal");
assert.equal(confirmationStatusOf(ats), "ats_accepted");
assert.equal(isConfirmedDelivery(deliveryEvidence(ats)), true);
assert.equal(applicationStage(ats), "sent");
assert.equal(deriveAttemptOutcome(ats), "APPLIED");

const destination = {
  status: "success", submittedVia: "email_recruiter", submitConfirmation: "EMAIL_SENT",
  confirmedAt: now, submittedAt: now, emailAttempts: [{ status: "delivered", providerEmailId: "re_1" }],
};
assert.equal(deliveryEvidence(destination), "confirmed_email");
assert.equal(confirmationStatusOf(destination), "ats_accepted");

const accepted = {
  status: "success", submittedVia: "email_recruiter", submitConfirmation: "EMAIL_SENT",
  submittedAt: now, emailAttempts: [{ status: "accepted", providerEmailId: "re_acc" }],
};
assert.equal(deliveryEvidence(accepted), "provider_accepted");
assert.equal(confirmationStatusOf(accepted), "provider_accepted");
assert.equal(isConfirmedDelivery(deliveryEvidence(accepted)), false);
assert.equal(applicationStage(accepted), "submitted");

const delivered = {
  status: "success", submittedVia: "email_recruiter", submitConfirmation: "EMAIL_SENT",
  submittedAt: now, emailAttempts: [{ status: "delivered", providerEmailId: "re_del" }],
};
assert.equal(deliveryEvidence(delivered), "provider_delivered");
assert.equal(confirmationStatusOf(delivered), "email_delivered");
assert.equal(isConfirmedDelivery(deliveryEvidence(delivered)), false);
assert.equal(applicationStage(delivered), "email_delivered");

const noBounce = {
  status: "success", submittedVia: "mailbox_gmail", submitConfirmation: "MAILBOX_NO_BOUNCE",
  submittedAt: now,
};
assert.equal(deliveryEvidence(noBounce), "sent_no_bounce");
assert.equal(confirmationStatusOf(noBounce), "sent_no_bounce");
assert.equal(isConfirmedDelivery(deliveryEvidence(noBounce)), false);
assert.equal(isSentUnverified(noBounce), false, "no-bounce is its own status, not the legacy limited-evidence bucket");
assert.equal(applicationStage(noBounce), "sent_no_bounce");
assert.equal(deriveAttemptOutcome(noBounce), null);
assert.equal(deriveApplicationLifecycle(noBounce).status, "submitted_unverified");
assert.equal(deriveApplicationLifecycle(noBounce).evidence.type, "email_no_bounce");
assert.match(applicationDeliveryView(noBounce).label, /nessun rimbalzo/i);
assert.notEqual(applicationDeliveryView(noBounce).phase, "confirmed");

const unknown = {
  status: "success", submittedVia: "email_recruiter", submitConfirmation: "EMAIL_SENT",
  submittedAt: now, emailAttempts: [{ status: "unknown", providerEmailId: "re_x" }],
};
assert.equal(deliveryEvidence(unknown), "outcome_unknown");
assert.equal(confirmationStatusOf(unknown), "outcome_unknown");
assert.equal(applicationStage(unknown), "outcome_unknown");

const legacy = {
  status: "success", submittedVia: "portal_greenhouse", submitConfirmation: "DETECTED_HTTP_200",
  submittedAt: now, submissionReceiptJson: null,
};
assert.equal(deliveryEvidence(legacy), "legacy_unverified");
assert.equal(confirmationStatus(deliveryEvidence(legacy)), null, "legacy is not upgraded to a current confirmation status");
assert.equal(isSentUnverified(legacy), true);
assert.equal(applicationStage(legacy), "sent_unverified");
assert.equal(deriveAttemptOutcome(legacy), null);
assert.equal(deriveApplicationLifecycle(legacy).status, "submitted_unverified");
assert.equal(STAGE_LABEL.sent_unverified.it, "Invii registrati, senza conferma");

for (const marker of [null, "DETECTED", "DETECTED_DOM", "EMAIL_SENT", "SENT_EMAIL"]) {
  const row = { status: "success", submittedVia: "portal_greenhouse", submitConfirmation: marker, submittedAt: now };
  assert.equal(isSentUnverified(row), true, String(marker));
  assert.equal(isConfirmedDelivery(deliveryEvidence(row)), false, String(marker));
}

assert.deepEqual(
  ["ats_accepted", "provider_accepted", "email_delivered", "sent_no_bounce", "outcome_unknown"],
  [confirmationStatusOf(ats), confirmationStatusOf(accepted), confirmationStatusOf(delivered), confirmationStatusOf(noBounce), confirmationStatusOf(unknown)],
);

console.log("PASS confirmation semantics: ATS / provider-accepted / delivered / no-bounce / unknown stay distinct; no-bounce never confirmed; legacy never upgraded.");
