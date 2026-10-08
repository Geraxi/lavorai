import assert from "node:assert/strict";
import type { Page } from "playwright";
import { collectInvalidFields } from "../src/lib/portal-adapters/validation-fields";
async function main() {
  const node = (label: string, extra: Record<string, unknown> = {}) => ({
    disabled: false, type: "text", tagName: "INPUT", willValidate: true, validity: {valid:false},
    labels: [{textContent: label}], getAttribute: () => null, closest: () => null, getClientRects: () => [{}], ...extra,
  });
  const city = node("Location (City)*", { getAttribute: (key:string) => key === "role" ? "combobox" : null });
  const sentinel = node("", {getClientRects: () => [], closest: () => ({querySelector: () => city})});
  const controls = [node("Email*"), node("Valid",{validity:{valid:true}}), node("Disabled",{disabled:true}), node("Hidden",{type:"hidden"}), node("Resume",{type:"file"}), sentinel, sentinel, node("Offscreen",{getClientRects:()=>[]})];
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {configurable:true, value:{querySelectorAll:()=>controls}});
  try {
    const page = {evaluate: async (fn:()=>unknown) => fn()} as unknown as Page;
    assert.deepEqual(await collectInvalidFields(page), [{label:"Email",kind:"text"},{label:"Location (City)",kind:"react-select"}]);
    console.log("Validation checks passed: missing fields, widget sentinels, deduplication and hidden/disabled exclusions");
  } finally { if(previous) Object.defineProperty(globalThis,"document",previous); else Reflect.deleteProperty(globalThis,"document"); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
