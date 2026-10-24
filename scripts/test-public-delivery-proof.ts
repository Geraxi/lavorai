import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { applicationEvidenceDate, deliveryEvidence, isConfirmedDelivery } from "../src/lib/application-evidence";

function loadModule(path: string, dependencies: Record<string, unknown>) {
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const module = { exports: {} as Record<string, any> };
  vm.runInNewContext(code, {
    module, exports: module.exports, Date, Map, Set,
    require(id: string) { assert.ok(id in dependencies, `Unexpected dependency ${id}`); return dependencies[id]; },
  }, { filename: path });
  return module.exports;
}
const now = new Date("2026-10-13T12:00:00Z");
const sent = new Date("2026-10-12T12:00:00Z");
const answered = new Date("2026-10-13T11:00:00Z");
const receipt = JSON.stringify({ version: 1, provider: "greenhouse", kind: "dom", capturedAt: sent.toISOString(), jobId: "12345", signal: "new_receipt_and_form_removed" });
const base = {
  id: "first", userId: "owner", status: "success", submittedVia: "portal_greenhouse", submitConfirmation: "DETECTED_HTTP_200",
  submissionReceiptJson: null as string | null, createdAt: sent, completedAt: sent, submittedAt: sent,
  emailAttempts: [] as { status: string; providerEmailId: string; createdAt: Date }[],
  replies: [] as { receivedAt: Date }[], gmailMessages: [] as { date: Date; userId: string }[],
};
const firstBatch = Array.from({ length: 499 }, (_, index) => ({ ...base, id: `legacy-${index}` }));
firstBatch.push({ ...base, id: "valid-portal", submissionReceiptJson: receipt, replies: [{ receivedAt: answered }] });
const email = (status: string) => ({ ...base, id: status, submittedVia: "email_recruiter", emailAttempts: [{ status, providerEmailId: "PRIVATE-PROVIDER-ID", createdAt: sent }] });
const secondBatch = [
  email("accepted"), email("delayed"), email("delivered"), email("bounced"), email("failed"), email("complained"), email("unknown"),
  { ...base, id: "second-portal", submissionReceiptJson: receipt, gmailMessages: [{ date: answered, userId: "different-owner" }] },
  { ...base, id: "old-portal", submissionReceiptJson: receipt, submittedAt: new Date("2026-09-01T12:00:00Z"), gmailMessages: [{ date: answered, userId: "owner" }] },
  { ...base, id: "dry", submissionReceiptJson: receipt, submitConfirmation: "DRY_RUN" },
];

async function main() {
  const queries: any[] = [];
  const { getPublicDeliveryProof } = loadModule("src/lib/public-delivery-proof.ts", {
    "@/lib/db": { prisma: { application: { findMany: async (query: any) => {
      queries.push(query); return queries.length === 1 ? firstBatch : secondBatch;
    } } } },
    "@/lib/application-evidence": { applicationEvidenceDate, deliveryEvidence, isConfirmedDelivery },
  });
  const proof = await getPublicDeliveryProof(now);
  assert.equal(queries.length, 2, "Public evidence must paginate, not silently truncate");
  assert.equal(queries[0].take, 500);
  assert.equal(queries[1].cursor.id, "valid-portal");
  assert.equal(queries[1].skip, 1);
  assert.equal(queries[0].select.replies.where.isSecurityCode, false);
  assert.equal(queries[0].select.replies.where.isHuman, true);
  assert.equal(proof.confirmed, 3, "Resend delivered is not an employer confirmation");
  assert.equal(proof.confirmedMonth, 2);
  assert.equal(proof.portalConfirmed, 3);
  assert.equal(proof.emailDelivered, 1);
  assert.equal(proof.providerAccepted, 2);
  assert.equal(proof.deliveryProblems, 3);
  assert.equal(proof.legacyUnverified, 499);
  assert.equal(proof.pending, 1);
  assert.equal(proof.replies, 2, "A foreign-linked Gmail message must not inflate the public response numerator");
  assert.ok(!JSON.stringify(proof).includes("PRIVATE-PROVIDER-ID"));
  assert.ok(!JSON.stringify(proof).includes("owner"));
  assert.ok(!JSON.stringify(proof).includes("12345"));
  assert.equal(proof.recent.length, 3);
  const { default: Page } = loadModule("src/app/(marketing)/proof/page.tsx", {
    "react/jsx-runtime": jsx,
    "next/link": { __esModule: true, default: (props: any) => React.createElement("a", props) },
    "@/lib/public-delivery-proof": { getPublicDeliveryProof: async () => proof },
  });
  const html = renderToStaticMarkup(await Page());
  assert.ok(html.includes("Accettate dal provider"));
  assert.ok(html.includes("Storico non verificato"));
  assert.ok(html.includes("Problemi di consegna"));
  assert.ok(html.includes("67%"), "Response rate must use confirmed cohort only");
  assert.ok(!html.includes("HTTP 2xx/3xx"));
  assert.ok(!html.includes("DETECTED_HTTP_200"));
  assert.ok(!html.includes("PRIVATE-PROVIDER-ID"));
  console.log("Public proof: structured evidence, pagination, failure separation, owner-safe response cohort and private-field exclusion passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
