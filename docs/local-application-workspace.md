# Local application workspace prototype

Review URL: http://127.0.0.1:3077/local-workspace

Start from this checkout with a clean environment:

```
env -i PATH="$PATH" HOME="$HOME" TMPDIR="$TMPDIR" LOCAL_WORKSPACE_DEMO=1 NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--no-strip-types node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3077
```

No production environment files or credentials should be copied into this checkout. The demo is development-only, explicit-flag-only, and its API restricts Host to loopback port3077 and writes to the same Origin. Its root layout omits tracking/authentication providers in demo mode. Browser subprocesses receive only PATH/HOME/TMPDIR, use disposable contexts and intercept every network request. Only a synthetic fixture page and one guarded synthetic submission endpoint are fulfilled locally; all other requests abort. No real employer is contacted.

Try: Start local session → answer the missing work-arrangement question in chat → review documents and facts → Submit local fixture. Known fields are prepared automatically. Take control is optional, or requested by the explicit synthetic verification scenario. Close destroys the browser. Uncertain fixture outcomes are terminal and cannot be retried.

Truthful limits:
- Deterministic demonstration, no chat model. One synthetic job/profile/CV, not customer data.
- Real Chromium page and refreshed screenshots, not live video. Scoped pointer/keyboard/scroll input works only on the synthetic fixture while the human owns control.
- Obscura interface reports unavailable; no binary installed or tested.
- Session ownership uses a random HttpOnly SameSite local cookie, not production user authentication. Owner checks and revision/busy guards enforce a single controller in this one-process prototype.
- Ten-minute absolute TTL; expiry closes browser. This is not a durable worker or database-backed lease. Process restart loses local evidence; production integration must use existing persistent application claims and receipt storage before any customer use.
- Existing application-ID, exclusive-lease and submit-marker patterns are modeled with demo IDs, not connected to customer tables. Unknown outcomes are terminal and do not permit another engine/retry.
- At most three active sessions. No arbitrary URLs, file reads or profile uploads exposed through the API.
- No deployment, credentials, migration or production sending changes.

Checks:
`node --import tsx scripts/test-local-workspace.ts`
`node --import tsx scripts/test-local-workspace-gates.ts`
`node scripts/test-local-workspace-ui.mjs` (requires local server)
`npx tsc --noEmit`
`npx next build --webpack`

UI captures: /tmp/lavorai-local-workspace-desktop.png and /tmp/lavorai-local-workspace-mobile.png.


## Direct browser control update
Take control now enables scaled pointer input on the actual Chromium screenshot, keyboard editing/navigation and bounded scrolling. Mobile users can focus a field by tapping the image, then use the explicit typing and key controls. Each input is owner/revision/controller checked by the server; returning control rejects stale inputs. Screenshots refresh after input. File chooser and submit controls inside the image are blocked; only the workspace's reviewed local-fixture submit action can authorize the intercepted POST. Native select arrows use explicit option selection to avoid platform popup inconsistencies. No arbitrary navigation, clipboard, remote desktop or employer interaction is provided.

## Agent-led progression
Starting a session now automatically prepares known synthetic contacts and CV. Missing work-arrangement facts are answered in chat while the agent retains control; the explicit fixture-submit button is review/authorization, not browser takeover. An optional synthetic verification demo pauses with a reason and requires a manually checked local checkbox plus explicit Return control. It does not simulate solving a real CAPTCHA or use credentials. Ordinary flow never requests takeover.


## Synthetic documents and factual questions
The fixture selects approved same-person documents with exact Product Designer role relevance; equal matches ask in chat. The default contains an approved required cover letter. Missing-letter scenario accepts only explicitly supplied synthetic content, without generating career claims. Each upload is checked by name, MIME type and exact bytes in Chromium; the intercepted multipart receipt independently records SHA-256, size and distinct CV/letter parts. These text/plain synthetic files demonstrate transport only, not production PDF/DOCX compatibility.
Text, select, radio, skill-checkbox, date and numeric fixture fields use explicit saved synthetic facts with visible provenance. A conflicting browser edit blocks before POST; explicit review can restore the saved facts/files. Unknown schemas block rather than fabricate answers. No automatic work-authorization, salary, relocation, protected-trait, legal consent or attestation inference. Scenarios cover ambiguous CV, missing required letter, unsupported question and definitive upload rejection. No claim of universal question/platform coverage.
