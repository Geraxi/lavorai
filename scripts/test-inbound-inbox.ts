import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { formatInboxEmailText } from "../src/lib/inbox-email-text";
import { isApplicationVerificationMessage } from "../src/lib/reply-security-message";
import { filterInboxMessages, inboxKindLabel, inboxSourceLabel, inboxThreadKey, type InboxMessage } from "../src/lib/inbox-message";

// All storage, auth, network, navigation and visual dependencies are isolated.
// These tests cannot read production messages or send a recruiter email.
function loadModule(path: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const output = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} as Record<string, any> };
  vm.runInNewContext(output, {
    module, exports: module.exports,
    require(id: string) { assert.ok(id in dependencies, `Unexpected dependency: ${id}`); return dependencies[id]; },
    console, Date, Map, Set, URL, ...globals,
  }, { filename: path });
  return module.exports;
}

const presentation = { filterInboxMessages, inboxKindLabel, inboxSourceLabel, inboxThreadKey };
const owner = { userId: "owner", userStatus: null, job: { company: "Acme", title: "Engineer" } };
const reply = (id: string, overrides: Record<string, unknown> = {}) => ({
  id, applicationId: "owned-app", fromAddress: "Recruiter <recruiter@example.test>",
  subject: "Let's talk", bodyText: "Please send your availability.",
  receivedAt: new Date("2026-10-13T11:00:00Z"), kind: "colloquio", isSecurityCode: false,
  application: owner, ...overrides,
});
const gmail = (id: string, overrides: Record<string, unknown> = {}) => ({
  id, fromAddress: "recruiter@example.test", subject: "Application received", snippet: "Thanks",
  bodyText: "Thanks for applying.", date: new Date("2026-10-13T10:00:00Z"),
  kind: "ricevuta", read: false, applicationId: "owned-app", application: owner, ...overrides,
});

async function testRepository() {
  let replyQuery: any;
  let gmailQuery: any;
  const api = loadModule("src/lib/inbox-repository.ts", {
    "@/lib/release-email-canary": { RELEASE_CANARY: { applicationId: "release_canary_email_20261013_owner" } },
    "@/lib/db": { prisma: {
      applicationReply: { async findMany(query: any) {
        replyQuery = query;
        return [reply("shared-id"), reply("receipt", { kind: "ricevuta" }), reply("bounce", { kind: "bounce" }),
          reply("flagged-secret", { isSecurityCode: true, bodyText: "SECRET-123" }),
          reply("legacy-secret", { fromAddress: "no-reply@us.greenhouse-mail.io", subject: "Security code", bodyText: "Your security code is ABC123" }),
          reply("generic-secret", { fromAddress: "no-reply@workable.test", subject: "One-time code", bodyText: "Your one-time code is 654321" }),
          reply("encoded-secret", { fromAddress: "no-reply@workable.test", subject: "Verification&#32;code", bodyText: "Your verification&#32;code is 999888" }),
          reply("foreign", { application: { ...owner, userId: "other-user" }, bodyText: "Private other-user message" })];
      } },
      gmailMessage: { async findMany(query: any) {
        gmailQuery = query;
        return [gmail("shared-id"), gmail("cross-user-link", { applicationId: "private-id", application: { userId: "other-user", userStatus: "offerta", job: { company: "Private Company", title: "Private Title" } } }),
          gmail("legacy-secret", { fromAddress: "no-reply@greenhouse.io", subject: "Verification code", bodyText: "Your verification code is 123456" }),
          gmail("non-job", { application: null, applicationId: null, subject: "Weekend news", bodyText: "Non-job content" })];
      } },
    } },
    "@/lib/reply-security-message": { isApplicationVerificationMessage },
    "@/lib/inbox-email-text": { formatInboxEmailText },
    "@/lib/inbox-message": presentation,
    "@/lib/gmail-match": { isLikelyJobMail: (_from: string, subject: string) => subject.includes("Application") },
  });
  const messages: InboxMessage[] = await api.getInboxMessages("owner");
  assert.deepEqual(JSON.parse(JSON.stringify(replyQuery.where)), { application: { userId: "owner" }, isSecurityCode: false });
  assert.deepEqual(JSON.parse(JSON.stringify(gmailQuery.where)), { userId: "owner", archived: false });
  assert.equal(replyQuery.take, 200);
  assert.equal(gmailQuery.take, 200);
  assert.equal(messages.length, 6);
  assert.ok(messages.find((message) => message.id === "application_reply:shared-id"));
  assert.ok(messages.find((message) => message.id === "gmail:shared-id"));
  assert.equal(new Set(messages.map((message) => message.id)).size, messages.length);
  assert.ok(!JSON.stringify(messages).includes("SECRET"));
  assert.ok(!JSON.stringify(messages).includes("ABC123"));
  assert.ok(!JSON.stringify(messages).includes("123456"));
  assert.ok(!JSON.stringify(messages).includes("654321"));
  assert.ok(!JSON.stringify(messages).includes("999888"));
  assert.ok(!JSON.stringify(messages).includes("Private"));
  const crossUser = messages.find((message) => message.id === "gmail:cross-user-link")!;
  assert.equal(crossUser.applicationId, null);
  assert.equal(crossUser.applicationStatus, null);
  assert.equal(crossUser.company, null);
  assert.equal(crossUser.jobTitle, null);
  assert.equal(messages.find((message) => message.id === "application_reply:shared-id")?.read, null);
  assert.equal(messages.find((message) => message.kind === "bounce")?.label, "Delivery failure");
  assert.equal(messages.find((message) => message.kind === "ricevuta")?.label, "Application receipt");
  assert.equal(messages.find((message) => message.id === "gmail:non-job")?.jobRelated, false);
  await assert.rejects(api.getInboxMessages(""), /owner/);
  console.log("[inbound-inbox] Ownership, security-code exclusion, mixed sources and classification passed.");
  return messages;
}

async function testPage(messages: InboxMessage[]) {
  let authenticated = true;
  let messageCalls = 0;
  let connectionCalls = 0;
  const api = loadModule("src/app/(app)/inbox/page.tsx", {
    "@/lib/db": { prisma: { inboxReply: { findMany: async () => [] } } },
    "@/lib/inbox-replies": { publicReply: (row: unknown) => row },
    "next-intl/server": { getLocale: async () => "en" },
    "react/jsx-runtime": jsx,
    "next/navigation": { redirect: (path: string) => { throw new Error(`redirect:${path}`); } },
    "@/lib/session": { getCurrentUser: async () => authenticated ? { id: "owner", email: "owner@example.test" } : null },
    "@/components/gmail-inbox-view": { GmailInboxView: "InboxView" },
    "@/lib/gmail-client": { hasGmailConnected: async (userId: string) => { assert.equal(userId, "owner"); connectionCalls++; return false; } },
    "@/lib/inbox-repository": { getInboxMessages: async (userId: string) => { assert.equal(userId, "owner"); messageCalls++; return messages; } },
    "@/components/design/topbar": { AppTopbar: "AppTopbar" },
    "@/lib/dashboard-metrics-shared": {
      countUnreadJobMessages: loadModule("src/lib/inbox-counts.ts", {}).countUnreadJobMessages,
      getRecruiterReplies: async (userId: string) => { assert.equal(userId, "owner"); return 3; },
      getDraftReplies: async (userId: string) => { assert.equal(userId, "owner"); return 0; },
    },
    "lucide-react": new Proxy({}, { get: (_t, name) => String(name) }),
    "./inbox.css": {},
  });
  const page = await api.default();
  const find = (node: any, type: unknown): any => {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) { for (const n of node) { const hit = find(n, type); if (hit) return hit; } return null; }
    if (node.type === type) return node;
    return find(node.props?.children, type);
  };
  const view = find(page, "InboxView");
  assert.ok(view, "Inbox renders the mailbox view");
  assert.equal(view.props.gmailConnected, false);
  assert.equal(view.props.messages.length, messages.length, "No Gmail connection must not blank the inbox or discard cached Gmail");
  const stat = (key: string) => find(page.props.children, "section")?.props.children.find((d: any) => d.props["data-stat"] === key);
  assert.ok(find(page, "AppTopbar"), "Inbox has the standard top bar");
  assert.ok(stat("replies") && stat("unread") && stat("drafts"), "Replies, unread and drafts are separate stats");
  authenticated = false;
  await assert.rejects(api.default(), /redirect:\/login\?next=\/inbox/);
  assert.equal(messageCalls, 1, "No inbox query before auth");
  assert.equal(connectionCalls, 1);
  console.log("[inbound-inbox] Disconnected inbox and unauthenticated page isolation passed.");
}

function componentDependencies(react: unknown, router: unknown, fetch: unknown) {
  return {
    dependencies: {
      react, "react/jsx-runtime": jsx,
      "lucide-react": new Proxy({}, { get: () => () => null }),
      "./design/inbox-mailbox.css": {},
      "./design/inbox-premium.css": {},
      "@/lib/inbox-counts": loadModule("src/lib/inbox-counts.ts", {}),
      "next/navigation": { useRouter: () => router, useSearchParams: () => new URLSearchParams() },
      "next/link": { __esModule: true, default: ({ children, ...props }: any) => React.createElement("a", props, children) },
      sonner: { toast: { error() {}, success() {} } },
      "@/components/design/icon": { Icon: () => null },
      "@/components/design/company-logo": { CompanyLogo: () => null, companyColor: () => "#000" },
      "@/components/gmail-connect-modal": { GmailConnectModal: () => null },
      "@/lib/inbox-message": presentation,
    },
    globals: { fetch, URLSearchParams },
  };
}

function testSafeRendering(messages: InboxMessage[]) {
  const deps = componentDependencies(React, { refresh() {} }, () => { throw new Error("No network during render"); });
  const { GmailInboxView } = loadModule("src/components/gmail-inbox-view.tsx", deps.dependencies, deps.globals);
  const malicious: InboxMessage = {
    ...messages[0], bodyText: '<img src="https://tracker.invalid/pixel" onerror="alert(1)"><script>alert(2)</script> https://evil.invalid',
    subject: '<script>alert("subject")</script>', from: '<svg onload="alert(3)">',
  };
  const html = renderToStaticMarkup(React.createElement(GmailInboxView, { messages: [malicious], gmailConnected: false, userEmail: "owner@example.test" }));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("&lt;img"));
  assert.ok(!html.includes("<script"));
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes('href="https://evil.invalid'));
  assert.ok(html.includes("LavorAI"));
  assert.ok(html.includes("Connect Gmail"));
  assert.ok(!html.includes(">Sync Gmail<"));
  assert.ok(html.includes("Reply composer"));
  assert.ok(!html.includes("<select"));
  assert.ok(html.includes("Message labels are estimates"));
  const empty = renderToStaticMarkup(React.createElement(GmailInboxView, { messages: [], gmailConnected: false, userEmail: null }));
  assert.ok(empty.includes("Select an email"));
  const { ReplyKindChip } = loadModule("src/components/reply-kind-chip.tsx", { "react/jsx-runtime": jsx });
  const renderBadge = (kind: string | null, count = 1) => renderToStaticMarkup(React.createElement(ReplyKindChip, { lastReplyKind: kind, replyCount: count }));
  assert.ok(renderBadge(null).includes("Messaggio ricevuto"));
  assert.ok(!renderBadge(null).includes(">Risposta<"));
  assert.ok(renderBadge("ricevuta").includes("Ricevuta automatica"));
  assert.ok(renderBadge("bounce").includes("Mancata consegna"));
  assert.equal(renderBadge(null, 0), "");
  console.log("[inbound-inbox] Real React rendering escapes content; honest source, action and legacy badges passed.");
}

function findElements(tree: any, predicate: (element: any) => boolean): any[] {
  const found: any[] = [];
  const visit = (node: any) => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!node || typeof node !== "object" || !node.props) return;
    if (predicate(node)) found.push(node);
    visit(node.props.children);
  };
  visit(tree);
  return found;
}
const textOf = (tree: any): string => Array.isArray(tree) ? tree.map(textOf).join("") : tree && typeof tree === "object" ? textOf(tree.props?.children) : tree == null ? "" : String(tree);

async function testInteractions(messages: InboxMessage[]) {
  const states: any[] = [];
  let cursor = 0;
  let refreshCalls = 0;
  let request: { url: string; options: any } | null = null;
  let requests = 0;
  let finish: (value: unknown) => void = () => {};
  const react = {
    useState(initial: any) {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], (value: any) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
    },
    useRef(initial: any) { const index = cursor++; return states[index] ?? (states[index] = { current: initial }); },
    useMemo: (factory: () => unknown) => factory(), useEffect() {},
    useTransition: () => [false, (callback: () => void) => callback()],
  };
  const deps = componentDependencies(react, { refresh: () => { refreshCalls++; } }, (url: string, options: any) => {
    requests++; request = { url, options };
    return new Promise((resolve) => { finish = resolve; });
  });
  const { GmailInboxView } = loadModule("src/components/gmail-inbox-view.tsx", deps.dependencies, deps.globals);
  let props = { messages, gmailConnected: false, userEmail: "owner@example.test" };
  const render = () => { cursor = 0; return GmailInboxView(props); };
  const button = (tree: any, label: string) => findElements(tree, (element) => element.type === "button" && (textOf(element) === label || element.props["aria-label"] === label))[0];
  let tree = render();
  assert.equal(button(tree, "Sync Gmail"), undefined);
  button(tree, "Refresh inbox").props.onClick();
  assert.equal(refreshCalls, 1);
  assert.equal(requests, 0, "Refreshing inbound must never call Gmail APIs");
  props = { ...props, gmailConnected: true };
  tree = render();
  const syncing = button(tree, "Sync Gmail").props.onClick();
  await button(tree, "Sync Gmail").props.onClick();
  assert.equal(requests, 1, "Double sync must be guarded");
  assert.equal(request!.url, "/api/gmail/sync");
  finish({ ok: true, json: async () => ({ synced: 2 }) });
  await syncing;
  assert.equal(refreshCalls, 2);
  const filterOptions = { kind: "all" as const, search: "", jobOnly: true, oldestFirst: false };
  assert.ok(filterInboxMessages(messages, filterOptions).every((message) => message.jobRelated));
  assert.equal(filterInboxMessages(messages, { ...filterOptions, kind: "bounce" }).length, 1);
  assert.equal(filterInboxMessages(messages, { ...filterOptions, search: "no-match" }).length, 0);
  assert.equal(filterInboxMessages(messages, { ...filterOptions, search: "Engineer" }).length, 4);
  assert.equal(filterInboxMessages(messages, { ...filterOptions, oldestFirst: true })[0].source, "gmail");
  console.log("[inbound-inbox] Source-specific refresh, repeat-click guards, application switching and filters passed.");
}

async function main() {
  const messages = await testRepository();
  await testPage(messages);
  testSafeRendering(messages);
  await testInteractions(messages);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
