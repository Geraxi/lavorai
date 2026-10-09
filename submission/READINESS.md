# LavorAI public submission preparation

Status: **incomplete; not submitted for review**. Private plugin identity and audience remain unchanged.

Publisher selected by owner: Umberto Geraci. Individual verification in the portal is pending. Country targeting: owner selected all available countries (countries=[]). This version has no commerce. Existing subscribers do not connect their accounts in this version.

## Completed

- Separate portable public package; remote HTTPS MCP endpoint https://lavorai.it/api/mcp.
- English listing, three prompts, release notes and five positive/three negative review cases.
- Existing LavorAI branding reused as square 512px PNG.
- Four current public site/policy/contact URLs inspected. Contact page supplies hello@lavorai.it.
- Live endpoint initialization, discovery and engineering search passed during deployment verification.
- Local protocol/HTTP tests and TypeScript passed.

## Still required

- Public website page explicitly describing the plugin (current home page describes the wider service).
- Privacy/terms coverage for the public plugin: describe query/location/filter inputs, public job output sent to ChatGPT, network metadata and rate limiting. Owner must confirm actual logging/retention and support arrangements before publishing commitments. Existing policies describe the wider SaaS and do not explicitly cover this connection.
- Actual reviewer-accessible recording of this version working in ChatGPT; no demo recording exists yet.
- Five positive and three negative cases run against the saved submission in ChatGPT; the drafted conversational cases are **Not run**, not passed.
- Individual/domain verification, current scans and owner-completed legal/policy attestations in the portal.

## Demo to record

Use the installed LavorAI plugin in a clean ChatGPT conversation. Record real interactions, not a mockup.

1. Select LavorAI and ask: Find engineering jobs in Milan. Show the actual returned companies/locations and links.
2. Ask: Show the description of the first offer. Show the fetched offer details.
3. Ask: Find remote developer jobs. Show results or an honest no-results response.
4. Ask: Send my CV to all these companies. Show the explanation that this version cannot submit applications.

Keep prompts and results readable, omit private conversations/passwords, and host the video at a publicly viewable or reviewer-accessible URL. A script is not a recording.

## Final portal steps

Only after preparation is complete: upload a draft to the intended verified publisher, verify imported fields and connection, run the eight cases, complete scans and owner attestations, then submit for review. Public publication is separate and follows approval.
