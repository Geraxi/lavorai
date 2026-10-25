/**
 * Local fake Recruitee careers API for ATS-test e2e.
 *
 * Host detection (production, unchanged):
 *   recruiteeAdapter.matches() accepts *.recruitee.com OR pathname /o/<slug>.
 *   apply() requires https: and calls `${jobUrl.origin}/api/offers/<slug>`.
 *   Job liveness uses https://<tenant>.recruitee.com/api/offers/ only when
 *   the job host is recruitee.com.
 *
 * Why a fetch rewrite (not a production env var):
 *   Production must keep talking to the job URL origin over HTTPS. A
 *   RECRUITEE_ORIGIN override could be set in prod and silently send to
 *   the wrong host. Tests keep allowlisted URLs as
 *   https://<tenant>.recruitee.com/o/<slug> and, in this process only,
 *   rewrite those HTTPS requests to 127.0.0.1 with a test-generated CA.
 *   NODE_TLS_REJECT_UNAUTHORIZED is never cleared.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";
import realOfferFixture from "./fixtures/recruitee-lavorai-test-dry-run.offer.json";

/** Options captured from the published trial GET (never POSTed). */
export const REAL_RECRUITEE_OFFER_OPTIONS = {
  options_phone: realOfferFixture.offer.options_phone,
  options_cv: realOfferFixture.offer.options_cv,
  options_cover_letter: realOfferFixture.offer.options_cover_letter,
  options_photo: realOfferFixture.offer.options_photo,
  options_salutation: realOfferFixture.offer.options_salutation,
  options_title: realOfferFixture.offer.options_title,
} as const;

export type FakeRecruiteeFile = { field: string; filename: string; size: number };

export type FakeRecruiteeRequest = {
  method: string;
  path: string;
  slug: string | null;
  fields: Record<string, string>;
  files: FakeRecruiteeFile[];
};

export type FakePostBehavior = "ok" | "error500" | "timeout";

const OFFER_PATH = /^\/api\/offers\/([^/]+)\/?$/;
const CANDIDATE_PATH = /^\/api\/offers\/([^/]+)\/candidates\/?$/;
const PAGE_PATH = /^\/o\/([^/]+)\/?/;

function offerPayload(slug: string): Record<string, unknown> | null {
  if (slug === "missing-offer") return null;
  return {
    id: realOfferFixture.offer.id,
    slug,
    title: slug === "cv-required" ? "Fake Recruitee CV required" : realOfferFixture.offer.title,
    status: realOfferFixture.offer.status,
    ...REAL_RECRUITEE_OFFER_OPTIONS,
    // Variant used only by the missing-CV refusal case. Default slugs keep
    // the published trial shape (phone/CV/cover_letter optional, photo off).
    ...(slug === "cv-required" ? { options_cv: "required" } : {}),
    open_questions: [],
  };
}

async function readForm(req: import("node:http").IncomingMessage): Promise<{
  fields: Record<string, string>;
  files: FakeRecruiteeFile[];
}> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const body = Buffer.concat(chunks);
  const contentType = String(req.headers["content-type"] ?? "");
  const fields: Record<string, string> = {};
  const files: FakeRecruiteeFile[] = [];
  if (!/multipart\/form-data/i.test(contentType)) {
    return { fields, files };
  }
  const request = new Request("https://fake-recruitee.invalid/parse", {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
  const form = await request.formData();
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") {
      fields[key] = value;
      continue;
    }
    const blob = value as Blob & { name?: string };
    files.push({ field: key, filename: blob.name || "upload", size: blob.size });
  }
  return { fields, files };
}

export async function startFakeRecruiteeServer(): Promise<{
  port: number;
  ca: string;
  requests: FakeRecruiteeRequest[];
  postBehavior: Map<string, FakePostBehavior>;
  close: () => Promise<void>;
}> {
  const dir = await mkdtemp(join(tmpdir(), "lavorai-fake-recruitee-"));
  const keyPath = join(dir, "key.pem");
  const certPath = join(dir, "cert.pem");
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", keyPath, "-out", certPath, "-days", "1",
    "-subj", "/CN=127.0.0.1",
    "-addext", "subjectAltName=IP:127.0.0.1,DNS:localhost",
  ], { stdio: "pipe" });
  const [key, cert] = await Promise.all([readFile(keyPath, "utf8"), readFile(certPath, "utf8")]);
  const requests: FakeRecruiteeRequest[] = [];
  const postBehavior = new Map<string, FakePostBehavior>();
  let candidateSeq = 0;

  const server: Server = createServer({ key, cert }, async (req, res) => {
    const url = new URL(req.url ?? "/", "https://127.0.0.1");
    const method = (req.method ?? "GET").toUpperCase();
    const candidate = url.pathname.match(CANDIDATE_PATH);
    const offer = !candidate ? url.pathname.match(OFFER_PATH) : null;
    const page = url.pathname.match(PAGE_PATH);
    const slug = decodeURIComponent(candidate?.[1] ?? offer?.[1] ?? page?.[1] ?? "");
    const record: FakeRecruiteeRequest = { method, path: url.pathname, slug: slug || null, fields: {}, files: [] };

    try {
      if (method === "GET" && url.pathname === "/api/offers/") {
        requests.push(record);
        const offers = ["dry-optional", "real-optional", "race-two", "race-ten", "cv-required", "server-500"]
          .map((item) => offerPayload(item));
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ offers }));
        return;
      }
      if (method === "GET" && offer) {
        requests.push(record);
        const payload = offerPayload(slug);
        if (!payload) {
          res.writeHead(404, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "not_found" }));
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ offer: payload }));
        return;
      }
      if (method === "GET" && page) {
        requests.push(record);
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(`<!doctype html><title>${slug}</title><h1>Fake offer ${slug}</h1>`);
        return;
      }
      if (method === "POST" && candidate) {
        const parsed = await readForm(req);
        record.fields = parsed.fields;
        record.files = parsed.files;
        requests.push(record);
        const behavior = postBehavior.get(slug) ?? (slug === "server-500" ? "error500" : "ok");
        if (behavior === "timeout") {
          req.destroy();
          return;
        }
        if (behavior === "error500") {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "synthetic_server_error" }));
          return;
        }
        candidateSeq += 1;
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify({ candidate: { id: `fake-candidate-${candidateSeq}` } }));
        return;
      }
      requests.push(record);
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unknown_route" }));
    } catch (error) {
      requests.push(record);
      res.writeHead(500, { "content-type": "text/plain" });
      res.end(error instanceof Error ? error.message : "fake recruitee failure");
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const port = (server.address() as AddressInfo).port;

  return {
    port,
    ca: cert,
    requests,
    postBehavior,
    async close() {
      await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
      await rm(dir, { recursive: true, force: true });
    },
  };
}

export function installFakeRecruiteeFetch(input: {
  port: number;
  ca: string;
  onForbidden?: (url: string) => void;
}): () => void {
  assert.ok(process.env.NODE_ENV !== "production", "Fake Recruitee fetch seam cannot be installed in production");
  const agent = new Agent({ connect: { ca: input.ca, rejectUnauthorized: true } });
  const original = globalThis.fetch;
  globalThis.fetch = (async (resource: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      typeof resource === "string" || resource instanceof URL
        ? String(resource)
        : resource.url,
    );
    const recruitee = url.hostname === "recruitee.com" || url.hostname.endsWith(".recruitee.com");
    const localFake = url.protocol === "https:" && url.hostname === "127.0.0.1" && url.port === String(input.port);
    if (url.protocol === "https:" && (recruitee || localFake)) {
      const local = new URL(url.href);
      local.hostname = "127.0.0.1";
      local.port = String(input.port);
      const headers = new Headers(init?.headers ?? (resource instanceof Request ? resource.headers : undefined));
      const method = init?.method ?? (resource instanceof Request ? resource.method : "GET");
      const body = init?.body ?? (resource instanceof Request && method !== "GET" && method !== "HEAD" ? resource.body : undefined);
      return undiciFetch(local, {
        method,
        headers,
        body: body as import("undici").RequestInit["body"],
        signal: init?.signal ?? (resource instanceof Request ? resource.signal : undefined),
        dispatcher: agent,
        redirect: init?.redirect ?? "manual",
        duplex: body && typeof body === "object" && "pipe" in (body as object) ? "half" : undefined,
      } as import("undici").RequestInit) as unknown as Response;
    }
    input.onForbidden?.(url.href);
    throw new Error(`NETWORK_FORBIDDEN_IN_ATS_TEST_E2E ${url.href}`);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
    void agent.close();
  };
}

/** Visible so tests can write the CA when debugging TLS. */
export async function writeFakeCa(ca: string, dest: string) {
  await writeFile(dest, ca);
}
