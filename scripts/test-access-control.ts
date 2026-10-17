import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { stagedCvBelongsToBrowser, isStagingId } from "../src/lib/cv-staging";

// 1. Staged /optimize CVs are adopted only by the browser that staged them.
const id = "staging-0123456789abcdef01234567";
assert.equal(isStagingId(id), true);
assert.equal(isStagingId("staging-xyz"), false);
assert.equal(stagedCvBelongsToBrowser(`users/${id}/cv-source/cv.pdf`, id), true, "supabase key");
assert.equal(stagedCvBelongsToBrowser(`https://abc.public.blob.vercel-storage.com/users/${id}/cv-source/cv-AbC.pdf`, id), true, "vercel url");
assert.equal(stagedCvBelongsToBrowser(`/app/storage/${id}/cv-source/cv.pdf`, id), true, "fs path");
assert.equal(stagedCvBelongsToBrowser(`users/${id}/cv-source/cv.pdf`, undefined), false, "no cookie");
assert.equal(stagedCvBelongsToBrowser(`users/${id}/cv-source/cv.pdf`, "staging-ffffffffffffffffffffffff"), false, "other browser");
assert.equal(stagedCvBelongsToBrowser(`users/${id}/cv-source/cv.pdf`, "../"), false, "malformed cookie");

// 2. Every /admin page gates itself server-side. The layout check alone leaks:
//    Next renders layout and page concurrently, so page data reaches the 404 payload.
const adminDir = join(process.cwd(), "src/app/(app)/admin");
const pages: string[] = [];
(function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name === "page.tsx") pages.push(p);
  }
})(adminDir);
assert.ok(pages.length >= 10, "admin pages found");
for (const page of pages) {
  const src = readFileSync(page, "utf8");
  const redirectOnly = /export default function \w+\(\)\s*\{\s*redirect\(/.test(src);
  const gated = src.includes("requireAdminPage()") || /isAdmin\([^)]*\)\)\s*notFound\(\)/.test(src);
  assert.ok(redirectOnly || gated, `admin page without its own admin gate: ${page}`);
}

// 3. Vercel Blob uploads must not use guessable public paths.
const storage = readFileSync(join(process.cwd(), "src/lib/storage.ts"), "utf8");
assert.ok(!/addRandomSuffix:\s*false/.test(storage), "blob uploads need a random suffix");

console.log(`[test-access-control] ok (${pages.length} admin pages checked)`);
