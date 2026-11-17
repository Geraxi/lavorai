/** recordConversionEvent: deduped events never throw or log a unique-key error. No DB. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const calls: Array<{ op: string; args: any }> = [];
const keys = new Set<string>();
const prisma = {
  conversionEvent: {
    create: async (args: any) => {
      calls.push({ op: "create", args });
      if (args.data.dedupeKey && keys.has(args.data.dedupeKey)) throw new Error("Unique constraint failed on the fields: (`dedupeKey`)");
      if (args.data.dedupeKey) keys.add(args.data.dedupeKey);
      return args.data;
    },
    createMany: async (args: any) => {
      calls.push({ op: "createMany", args });
      let count = 0;
      for (const row of args.data) {
        if (keys.has(row.dedupeKey)) { assert.equal(args.skipDuplicates, true); continue; }
        keys.add(row.dedupeKey); count++;
      }
      return { count };
    },
  },
};
const output = ts.transpileModule(readFileSync("src/lib/conversion-events.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const mod = { exports: {} as any };
vm.runInNewContext(output, { module: mod, exports: mod.exports, require: (id: string) => (id === "@/lib/db" ? { prisma } : {}) });
const { recordConversionEvent } = mod.exports;

(async () => {
  await recordConversionEvent("application_created", { userId: "u1", dedupeKey: "application_created:app-1" });
  await recordConversionEvent("application_created", { userId: "u1", dedupeKey: "application_created:app-1" });
  assert.deepEqual(calls.map((c) => c.op), ["createMany", "createMany"], "deduped events use ON CONFLICT DO NOTHING");
  assert.equal(keys.size, 1);
  assert.equal(calls[0].args.data[0].name, "application_created");
  await recordConversionEvent("page_view", { path: "/x".repeat(300) });
  assert.equal(calls.at(-1)?.op, "create", "events without a dedupe key keep a plain insert");
  assert.equal(calls.at(-1)?.args.data.path.length, 250);
  prisma.conversionEvent.createMany = async () => { throw new Error("db down"); };
  await recordConversionEvent("application_created", { dedupeKey: "k2" }); // never throws
  console.log("PASS conversion events: dedupe via skipDuplicates, no unique-key errors, best-effort");
})().catch((err) => { console.error(err); process.exitCode = 1; });
