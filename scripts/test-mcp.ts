import assert from "node:assert/strict";
import { handleMcp, type JobRepository } from "../src/lib/mcp-server";
import { GET, POST } from "../src/app/api/mcp/route";

async function main() {
  let calls = 0;
  const jobs: JobRepository = {
    async search(input) { calls++; assert.equal(input.limit, 10); return [{ id: "public-job", title: input.query }]; },
    async get(id) { calls++; return id === "public-job" ? { id } : null; },
  };
  const rpc = (method: string, params?: Record<string, unknown>) => ({ jsonrpc: "2.0", id: 1, method, params });
  const init = await handleMcp(rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } }), jobs);
  assert.equal((init as any).result.protocolVersion, "2025-11-25");
  assert.equal((await handleMcp(rpc("initialize", {}), jobs) as any).error.code, -32602);
  const discovery = await handleMcp(rpc("tools/list"), jobs);
  assert.equal((discovery as any).result.tools.length, 2);
  assert.equal(calls, 0, "discovery must not access data");
  assert.equal(await handleMcp({ jsonrpc: "2.0", method: "tools/call", params: { name: "search_jobs", arguments: { query: "ignored" } } }, jobs), null);
  assert.equal(calls, 0, "tool notifications must never execute");
  const search = await handleMcp(rpc("tools/call", { name: "search_jobs", arguments: { query: "Engineer" } }), jobs);
  assert.equal((search as any).result.structuredContent.jobs[0].title, "Engineer");
  assert.equal((search as any).result.structuredContent.personalized, false);
  for (const args of [{ query: "x", limit: 21 }, { query: "" }, { query: "x", userId: "victim" }, { query: "x", remoteOnly: "true" }]) {
    assert.equal((await handleMcp(rpc("tools/call", { name: "search_jobs", arguments: args }), jobs) as any).error.code, -32602);
  }
  assert.equal(calls, 1, "invalid arguments must not hit the repository");
  assert.equal((await handleMcp(rpc("tools/call", { name: "get_job", arguments: { jobId: "missing" } }), jobs) as any).result.structuredContent.job, null);
  assert.equal((await handleMcp(rpc("tools/call", { name: "submit_application", arguments: {} }), jobs) as any).error.code, -32602);
  assert.equal((await handleMcp([], jobs) as any).error.code, -32600);
  assert.equal((await handleMcp(rpc("unknown"), jobs) as any).error.code, -32601);
  const failed = await handleMcp(rpc("tools/call", { name: "get_job", arguments: { jobId: "x" } }), { ...jobs, async get() { throw new Error("DATABASE_SECRET"); } });
  assert.equal((failed as any).result.isError, true);
  assert.ok(!JSON.stringify(failed).includes("DATABASE_SECRET"));
  const request = (body: string, headers: Record<string, string> = {}) => new Request("http://localhost:3000/api/mcp", {
    method: "POST", body,
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
  });
  assert.equal((await GET(new Request("http://localhost:3000/api/mcp"))).status, 405);
  assert.equal((await POST(request("{}", { origin: "https://attacker.example" }))).status, 403);
  assert.equal((await POST(request("{}", { accept: "text/html" }))).status, 406);
  assert.equal((await POST(request("{}", { "content-type": "text/plain" }))).status, 415);
  assert.equal((await POST(request("{}", { "mcp-protocol-version": "invalid" }))).status, 400);
  assert.equal((await POST(request("x".repeat(16385)))).status, 413);
  assert.equal((await POST(request("{"))).status, 400);
  assert.equal((await POST(request(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })))).status, 202);
  const discovered = await POST(request(JSON.stringify(rpc("tools/list"))));
  assert.equal(discovered.status, 200);
  assert.equal((await discovered.json()).result.tools.length, 2);
  console.log("MCP protocol, validation, no private-data access and error redaction: passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
