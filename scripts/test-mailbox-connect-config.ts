/** Outlook/Gmail senza credenziali OAuth: niente pulsanti rotti, callback con esito chiaro. Nessuna rete. */
import assert from "node:assert/strict";
globalThis.fetch = (async () => { throw new Error("NETWORK_FORBIDDEN_IN_TESTS"); }) as typeof fetch;
delete process.env.MS_CLIENT_ID; delete process.env.MS_CLIENT_SECRET;
process.env.GOOGLE_CLIENT_ID = "test-google-id"; process.env.GOOGLE_CLIENT_SECRET = "test-google-secret";

import { connectAction } from "../src/lib/mailbox/connect-ui";
import { providerConfigured } from "../src/lib/mailbox/oauth";

const cfg = { gmail: providerConfigured("gmail"), outlook: providerConfigured("outlook") };
assert.deepEqual(cfg, { gmail: true, outlook: false });
const none = { connections: [], configured: cfg };
assert.equal(connectAction("outlook", none), "soon");
assert.equal(connectAction("gmail", none), "connect");
assert.equal(connectAction("outlook", undefined), "loading", "no link while status loads");
assert.equal(connectAction("gmail", { connections: [], configured: { gmail: false, outlook: false } }), "unavailable");
assert.equal(connectAction("gmail", { connections: [{ provider: "gmail", status: "active" }], configured: cfg }), "disconnect");
assert.equal(connectAction("gmail", { connections: [{ provider: "gmail", status: "error" }], configured: cfg }), "reconnect");
// Una vecchia connessione Outlook attiva resta scollegabile anche senza credenziali.
assert.equal(connectAction("outlook", { connections: [{ provider: "outlook", status: "active" }], configured: cfg }), "disconnect");
assert.equal(connectAction("outlook", { connections: [{ provider: "outlook", status: "error" }], configured: cfg }), "soon");

async function main() {
  const { NextRequest } = await import("next/server");
  const { GET } = await import("../src/app/api/mailbox/callback/[provider]/route");
  const res = await GET(new NextRequest("http://localhost:3000/api/mailbox/callback/outlook?code=abc&state=xyz"), { params: Promise.resolve({ provider: "outlook" }) });
  assert.ok([302, 307].includes(res.status));
  assert.equal(new URL(res.headers.get("location")!).search, "?mailbox=not_configured");
  console.log("mailbox connect config: all tests passed");
}
main().catch((e) => { console.error(e); process.exit(1); });
