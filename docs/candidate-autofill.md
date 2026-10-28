# Candidate autofill pilot

This is an installable Manifest V3 Chrome/Edge pilot, not a deployed generic autofill service. No customer browser installation or live candidate-data fill has been performed.

## Supported workflow

1. Signed-in candidate opens `/autofill`. The server reads ONLY that user's saved CV-profile name, email and phone. It does not seed a profile, generate a CV, read extracted CV text, or mutate preferences.
2. Candidate reviews those exact fields and explicitly downloads a contact JSON file. It contains personal data; keep it local and delete it after use.
3. After separately approving installation, load `extensions/candidate-autofill` as an unpacked extension. No installation is performed by this change.
4. Open an owned ProduzioneWeb test application form at `https://produzioneweb.recruitee.com/o/lavorai-test-<slug>/c/new`, click the extension, select the downloaded file, review details and authorize sharing.
5. Check active form, verify destination, then Fill once. Exact origin/path, active tab and form fields are checked again. Existing differing values, ambiguous/hidden fields, detected CAPTCHA/password controls fail closed.
6. Select the desired CV with the employer's native file chooser. Review all screening questions, work history, consents and final submission yourself.

Supported fields: name, email, phone, using only the exact candidate/contact input names. No heuristic label matching. No guessed work history, screening answers, protected traits or automatic legal consent. No file upload injection, button clicks, automatic submission, authentication or CAPTCHA bypass. Custom career domains, iframe forms, other providers and other Recruitee employers are not enabled. Site-specific adapter/permission review is needed before broadening.

## Access and data exposure

Permissions are `activeTab` and `scripting` only. No host permissions, persistent content scripts, cookies, storage, clipboard, downloads permission, background service or telemetry. Contact file is held only in popup memory and cleared after filling, on explicit Clear, or when popup closes. No CV is exported by this flow.

Filling fields exposes their contents to the employer page. Its own scripts may transmit or save them before final submission. The review checkbox states this; the extension cannot promise zero network activity by an external page. Synthetic tests intercept all requests and prove only the extension's behavior. Installing the extension and filling a real external form require separate explicit permission; this PR does neither.

## Verification / release

`npm run test:candidate-autofill` uses synthetic fields and an intercepted owned-host fixture in a disposable browser. Set `AUTOFILL_TEST_CHROME=1` locally to use installed Chrome; CI uses Playwright Chromium. Tests cover no mutation during preview, unchanged consent/CV/questions, no POST, no external requests, existing values, duplicate/hidden fields, CAPTCHA and origin rejection. No production services, accounts or credentials are involved.

No schema migration, production flag change or Recruitee pipeline change. PR approval and paused web deployment are separate from extension installation. This pilot does not enable Jobicy/Himalayas imports or generic auto-apply.
