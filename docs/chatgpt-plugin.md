# LavorAI ChatGPT plugin — public job discovery v0.1

This change adds a stateless Streamable HTTP MCP server to the existing Next.js app at `/api/mcp`. It keeps LavorAI's hosting, login, billing, CV processing and application pipeline intact. No schema changes, secrets or paid API calls are needed.

## Implemented

- `search_jobs`: current database listings by role/company, optional location and remote-only filter, maximum 20 results. Closed listings are excluded. There is no AI matching score.
- `get_job`: one open listing, including a bounded description and official application link.
- Initialization, discovery, ping, JSON responses, accepted notifications, explicit errors and rate limits. Public discovery never reads CVs, user profiles or applications.

Public listings require no login. Website cookies, incoming user IDs and host identity headers are not accepted as authorization for private data. Personalized CV tailoring, account history and submitting applications are **not implemented by this version**. Those require a later OAuth integration and reuse of the existing billing/consent controls.

## Deploy and verify

1. Review and merge the PR. Let the existing Vercel GitHub deployment complete.
2. Run `npm run test:mcp` and `npx tsc --noEmit`.
3. Send a POST to `https://lavorai.it/api/mcp`, with Content-Type `application/json` and Accept `application/json, text/event-stream`, containing:

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"verification","version":"1.0"}}}
```

4. With the same headers plus `MCP-Protocol-Version: 2025-11-25`, POST `tools/list` and a read-only `search_jobs` call. Ensure results come from the production database. GET returning 405 is intentional: no standalone SSE stream.
5. Only after the production endpoint responds correctly, package `plugin/lavorai/` as one directory in a ZIP and save it through Plugin Creator as a private plugin. The `mcp.json` is the intended deployment configuration, not evidence that production is already live. Install/connect and repeat a read-only search from ChatGPT.

Do not upload this as a working connection before the endpoint is verified. Private plugin creation is not public directory submission.

## Account integration follow-up

Add OAuth authorization-code + PKCE, explicit consent, narrow scopes and revocation before exposing private CVs or application history. Do not use the NextAuth browser session as a remote bearer token or map an untrusted email header to a user. Application submission must preserve the existing quota, verification and consent gates; do not enable auto-apply merely by connecting the plugin.
