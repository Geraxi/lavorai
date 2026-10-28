# Candidate-reviewed autofill pilot

## Supported destinations and fields

- `https://optics11.recruitee.com/o/senior-customer-experience-designer/c/new` (optional trailing slash): narrowly allowlisted customer-form pilot.
- `https://produzioneweb.recruitee.com/o/lavorai-test-<slug>/c/new`: owned test forms.

Exact origin and path are checked in the popup and again in the injected function. Other Optics11 jobs, employers, custom domains and providers are rejected. The live public forms were inspected read-only on 2026-10-28: `offer-application-form`, `candidate.name` (text), `candidate.email` (email), `candidate.phone` (tel), and native `candidate.cv` file input. Only the three contact inputs are filled. Unknown/ambiguous/hidden/read-only fields, differing existing values, detected CAPTCHA/password controls and iframe execution fail closed.

This is an installable MV3 Chrome/Edge extension, not generic website autofill. Live dynamic employer behavior has not been tested with candidate data. The extension never clicks Submit or consent, guesses questions, uploads files, solves CAPTCHA or bypasses authentication. Saved work history is reviewed verbatim and available for manual copying because no reliable provider work-history mapping has been established.

## Complete candidate flow

1. Sign in and open `/autofill`. The server reads only that user's saved contact/work-history fields and original CV document metadata. No profile seeding, tailoring, document generation or settings mutation occurs.
2. Review the displayed facts, explicitly select the intended original CV, and download it through `/api/autofill/cv/<id>`. The route requires the current user to own that exact document; it never returns storage URLs. Review the downloaded document.
3. Export the reviewed JSON. It contains contact fields, saved work history and the selected filename, not document bytes, credentials or consent. Keep the personal files locally and delete them after use.
4. After separately approving installation, load `extensions/candidate-autofill` as an unpacked extension. Open the supported employer form, invoke the extension (toolbar or Command/Ctrl+Shift+Y), and load the export.
5. Review the displayed facts and sharing warning, check the form/destination, and click Fill once. Fill shares only name/email/phone with that page. Site scripts may transmit/save filled values before final submission; this warning is explicit.
6. Use the employer's native file picker to attach the chosen CV. Review remaining questions, work history, consent and final submission yourself. Filling is not proof that an application was sent or accepted.

## Permissions and evidence

The extension requests only `activeTab` and `scripting`: temporary access to the user-invoked tab. No host permissions, storage, cookies, clipboard access, persistent content scripts, background service or telemetry. Loaded data stays in popup memory and is cleared after Fill, on Clear, or popup close. Work history/CV metadata is not passed to the injected contact function.

Reviewed https://recruitee.com/terms (15 June 2026 terms) and the Optics11 public form. The terms address subscriber access and prohibit abusive/unauthorized use; no concrete prohibition specific to a candidate's user-initiated contact autofill was identified. No bespoke employer authorization is asserted or required solely because blanket permission was not found. This is not a legal assurance or permission for bulk sending, scraping, recruiter-side access or submission. Any new site-specific restriction must be respected. The separate recruiter sourcing extension is not evidence for this candidate tool.

Remaining action-time approvals: specific PR/web release, installation in the owner's personal browser with the two declared permissions, and any agent-operated live pilot specifying whose data and exact destination. Each candidate must explicitly initiate and review their own use. No real candidate data has been transmitted for QA; no customer browser installation or production release has occurred.

## Verification

Run `npx playwright install chromium`, then `npm run test:candidate-autofill`. Tests include owner-only export/download, cross-user denial, core form guards and two actual packaged MV3 runs (owned form and Optics11 field fixture). The Optics11 URL is intercepted and fulfilled locally; no employer page scripts or network calls are loaded. Fixtures retain observed factual input names/types and form ID, not employer content.

The package is loaded in disposable Chromium using public `Extensions.loadUnpacked`/`Extensions.triggerAction` test APIs. Real popup mouse/file events exercise Chrome activeTab/scripting—not mocked permissions. Tests cover preview/no-write, duplicate clicks, synthetic Alice/Bob isolation, overwrite refusal/recovery, native synthetic CV selection, cleared state and zero POST/external requests. Contexts close after testing; personal browser profiles are never used. Core tests also cover unsupported pages, hidden/ambiguous fields and CAPTCHA refusal. `AUTOFILL_TEST_CHROME=1` can use installed Chrome for the core tests only; packaged tests require bundled Chromium.

No migration, provider policy, application cap, notification behavior, catalogue import or auto-apply change is included. PR/release approval remains separate from local implementation/testing.
