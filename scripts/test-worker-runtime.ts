import assert from "node:assert/strict";
import { assertWorkerRuntime } from "../src/lib/worker-runtime";
for (const version of ["24.22.1", "24.22.2", "24.23.0"]) assert.doesNotThrow(() => assertWorkerRuntime(version));
for (const version of ["24.21.0", "24.22.0", "22.23.4", "25.2.1", "26.12.1", "24.22.1-rc.1", "garbage"]) assert.throws(() => assertWorkerRuntime(version), /worker_runtime_unsupported/);
console.log("PASS worker runtime policy");
