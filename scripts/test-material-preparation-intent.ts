import assert from "node:assert/strict";
import {
  isMaterialPreparationRequested,
  materialPreparationRequestJson,
} from "../src/lib/application-material-preparation";

const marker = materialPreparationRequestJson();
assert.equal(isMaterialPreparationRequested(marker), true);
assert.equal(isMaterialPreparationRequested(JSON.stringify(["rewrite this CV"])), false);
assert.equal(isMaterialPreparationRequested('{"kind":"material_preparation_request","version":2}'), false);
assert.equal(isMaterialPreparationRequested("not-json"), false);
console.log("PASS material-preparation-intent");
