# Candidate autofill pilot

This is an installable Manifest V3 Chrome/Edge pilot, not a deployed generic autofill service. No customer browser installation or live candidate-data fill has been performed.

## Supported workflow

1. Signed-in candidate opens `/autofill`. The server reads ONLY that user's saved CV-profile contacts/work history and CV document metadata. It does not seed a profile, generate a CV, read extracted CV text, or mutate preferences.
2. Candidate reviews contacts and saved work history, explicitly selects an existing CV, downloads that original document through an owner-scoped read-only route, and exports a versioned JSON file. The JSON includes reviewed contacts, work history and the selected filename—not CV bytes or storage URLs. Both files contain personal data; keep them local and delete them after use.
3. After separately approving installation, load `extensions/candidate-autofill` as an unpacked extension. No installation is performed by this change.
4. Open an owned ProduzioneWeb test application form at `https://produzioneweb.recruitee.com/o/lavorai-test-<slug>/c/new`, click the extension, select the downloaded file, review details and authorize sharing.
5. Check active form, verify destination, then Fill once. Exact origin/path, active tab and form fields are checked again. Existing differing values, ambiguous/hidden fields, detected CAPTCHA/password controls fail closed.
6. Select the desired CV with the employer's native file chooser. Review all screening questions, work history, consents and final submission yourself.

Supported fields: name, email, phone, using only the exact candidate/contact input names. No heuristic label matching. Structured work history is shown verbatim for manual copying because no reliable provider work-history mapping has been verified. No guessed work history, screening answers, protected traits or automatic legal consent. No file upload injection, button clicks, automatic submission, authentication or CAPTCHA bypass. Custom career domains, iframe forms, other providers and other Recruitee employers are not enabled. Site-specific adapter/permission review is needed before broadening.

## Access and data exposure

Permissions are `activeTab` and `scripting` only. No host permissions, persistent content scripts, cookies, storage, clipboard, downloads permission, background service or telemetry. Contact file is held only in popup memory and cleared after filling, on explicit Clear, or when popup closes. The selected original CV is downloaded separately, only after an explicit user action and an owner-scoped database lookup. No document is generated or uploaded by the extension. Work history stays in the popup for manual copy and is never passed to the injected contact-fill function.

Filling fields exposes their contents to the employer page. Its own scripts may transmit or save them before final submission. The review checkbox states this; the extension cannot promise zero network activity by an external page. Synthetic tests intercept all requests and prove only the extension's behavior. Installing the extension and filling a real external form require separate explicit permission; this PR does neither.

## Verification / release

`npm run test:candidate-autofill` uses synthetic fields and an intercepted owned-host fixture in a disposable browser. It also loads the actual MV3 package with Chromium’s public `Extensions.loadUnpacked` and `Extensions.triggerAction` APIs. The toolbar popup is operated through CDP target sessions with real mouse/file-input events, without mocking Chrome permissions or scripting. Playwright’s default extension-disabling flag is omitted only for this disposable profile. The profile is closed after the test; the owner’s browser is not used. Set `AUTOFILL_TEST_CHROME=1` locally to use installed Chrome; CI uses Playwright Chromium. Tests cover no mutation during preview, unchanged consent/CV/questions, no POST, no external requests, existing values, duplicate/hidden fields, CAPTCHA and origin rejection. No production services, accounts or credentials are involved.

No schema migration, production flag change or Recruitee pipeline change. PR approval and paused web deployment are separate from extension installation. This pilot does not enable Jobicy/Himalayas imports or generic auto-apply.

## Provider permission and release boundary

Reviewed 2026-10-28: https://recruitee.com/terms does not establish blanket third-party employer permission for this browser integration. https://support.recruitee.com/en/articles/1066252-recruitee-sourcing-extension describes a different, recruiter-side tool and is not permission for this candidate extension. The only enabled destination remains the owner-authorized ProduzioneWeb test paths. No other provider or employer is claimed supported. Broadening requires an exact site permission review, actual DOM/field compatibility evidence and scoped real-data validation authorization. The working local package is not a customer-ready multi-provider rollout.

Packaged tests prove own-user download isolation, selected original file/no regeneration, contact fill, reviewed history display, native synthetic CV selection, duplicate-click handling, Alice/Bob state isolation, overwrite refusal and recovery. Core tests separately cover unknown origins, hidden/ambiguous fields and CAPTCHA refusal. No real employer submission or real candidate-data transmission was used.
