import assert from "node:assert/strict";
const base=process.env.PROBE_URL || "http://127.0.0.1:8080";
assert.equal(new URL(base).hostname,"127.0.0.1","Local isolated target only");
const r=await fetch(base+"/api/runtime"); assert.equal(r.status,200); assert.equal(r.headers.get("x-probe-proxy"),"passed"); assert.equal((await r.json()).node,"v24.22.1");
assert.match(await (await fetch(base)).text(),/isolated-runtime-probe/);
assert.equal(await (await fetch(base+"/probe.txt")).text(),"isolated-static-asset\n");
console.log("Node, route handler, proxy, page and public asset passed");
