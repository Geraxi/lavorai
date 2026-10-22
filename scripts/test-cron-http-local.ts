import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Execute the actual workflow shell against localhost only; no real cron/auth.
async function main() {
  const workflow = readFileSync(".github/workflows/cron-auto-apply.yml", "utf8");
  const block = workflow.split("        run: |\n")[1];
  assert.ok(block);
  let status = 200, requests = 0;
  const server = createServer((_request, response) => { requests++; response.writeHead(status); response.end("fixture"); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const dir = mkdtempSync(join(tmpdir(), "lavorai-cron-fixture-"));
  try {
    const script = block.split("\n").map(line => line.slice(10)).join("\n")
      .replaceAll("https://lavorai.it/api/cron/auto-apply", `http://127.0.0.1:${address.port}/fixture`)
      .replaceAll("${{ secrets.CRON_SECRET }}", "fixture-only")
      .replaceAll("/tmp/out", join(dir, "response"));
    assert.ok(!script.includes("https://"));
    for (status of [200, 401, 500]) {
      const code = await new Promise<number | null>((resolve, reject) => {
        const child = spawn("bash", ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", script], { stdio: "ignore" });
        child.once("error", reject); child.once("exit", resolve);
      });
      assert.equal(code, status === 200 ? 0 : 22, `HTTP ${status}`);
    }
    assert.equal(requests, 3, "one request per run, no automatic retries");
    console.log("PASS actual workflow shell: 200 succeeds; 401/500 fail; localhost only; no retries");
  } finally { server.close(); rmSync(dir, { recursive: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
