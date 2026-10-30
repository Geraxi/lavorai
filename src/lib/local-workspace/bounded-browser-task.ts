import type {Browser, Page} from 'playwright';
import {launchBrowser} from '../browser';
import {parseVerifiedSubmissionReceipt, receiptJobId} from '../submission-receipt';
import type {ApplyInput, ApplyOutcome, PortalAdapter} from '../portal-adapters/types';

/** Local acceptance harness for the existing worker adapter contract, not a registered production route.
 * Uses the existing Chromium launcher; no model, hosted browser or fallback engine.
 * A task object is single-use even after timeout. Durable claims remain the caller's authority.
 */
export function boundedBrowserTask(options: {
  enabled: boolean;
  owner: string;
  applicationId: string;
  budgetMs: number;
  launch?: () => Promise<Browser>;
}) {
  if (!options.enabled || process.env.NODE_ENV === 'production' || !options.owner || !options.applicationId
    || !Number.isFinite(options.budgetMs) || options.budgetMs <= 0 || options.budgetMs > 240_000) {
    throw Error('Local bounded browser task disabled');
  }
  let used = false;
  return async (owner: string, adapter: PortalAdapter, input: ApplyInput, fixtureHtml: string): Promise<ApplyOutcome> => {
    if (owner !== options.owner || input.applicationId !== options.applicationId) throw Error('Application unavailable');
    if (used) throw Error('Task already consumed; reconcile outcome, never retry');
    if (input.jobUrl !== 'https://bounded-fixture.invalid/application' || !adapter.matches(input.jobUrl)
      || !input.beforeCandidateData || !input.beforeSubmit || input.atsTestAuth) throw Error('Synthetic ordinary contract required');
    used = true;
    let browser: Browser | undefined;
    let stopped = false, dataClaimed = false, submitClaimed = false;
    let dataPending = false, submitPending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + options.budgetMs;
    const alive = () => !stopped && Date.now() < deadline;
    const gate = async (kind: 'data' | 'submit') => {
      if (!alive() || (kind === 'data' ? dataClaimed || dataPending : !dataClaimed || submitClaimed || submitPending)) return false;
      if (kind === 'data') dataPending = true; else submitPending = true;
      const granted = await (kind === 'data' ? input.beforeCandidateData!() : input.beforeSubmit!());
      // A late grant is consumed but never authorizes a late browser write.
      if (kind === 'data') dataClaimed = granted; else submitClaimed = granted;
      return granted && alive();
    };
    const work = async () => {
      browser = await (options.launch ?? launchBrowser)();
      if (!alive()) { await browser.close(); throw Error('Browser deadline elapsed'); }
      const context = await browser.newContext({serviceWorkers: 'block'});
      await context.route('**/*', route => route.request().url() === input.jobUrl && route.request().method() === 'GET'
        ? route.fulfill({contentType:'text/html', body:fixtureHtml}) : route.abort());
      const page: Page = await context.newPage();
      page.setDefaultTimeout(Math.min(options.budgetMs, 10_000));
      return adapter.apply(page, {...input, beforeCandidateData: () => gate('data'), beforeSubmit: () => gate('submit'),
        beforeVerificationSubmit: async () => false});
    };
    try {
      const outcome = await Promise.race([work(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => {stopped = true; void browser?.close().catch(() => {}); reject(Error('Browser task deadline exceeded'));}, options.budgetMs);
      })]);
      if (outcome.ok) {
        const receipt = parseVerifiedSubmissionReceipt(JSON.stringify(outcome.receipt), `portal_${adapter.id}`);
        if (!submitClaimed || !receipt || receipt.jobId !== receiptJobId(adapter.id, input.jobUrl)) {
          return {ok:false,status:'submission_unconfirmed',error:'Adapter success lacks correlated receipt evidence. Reconcile; no retry.'};
        }
      }
      return outcome;
    } catch {
      return submitClaimed || submitPending
        ? {ok:false,status:'submission_unconfirmed',error:'Bounded task interrupted after submission boundary. Reconcile; no retry.'}
        : {ok:false,status:'unknown_error',refusedBeforeSubmit:true,error:'Bounded task stopped before submission. No automatic retry.'};
    } finally {
      stopped = true;
      if (timer) clearTimeout(timer);
      await browser?.close().catch(() => {});
    }
  };
}
