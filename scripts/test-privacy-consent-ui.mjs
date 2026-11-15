/** Real consent form, synthetic responses only. All non-loopback traffic blocked. */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import serverChromium from '@sparticuz/chromium';

const out = await mkdtemp(join(tmpdir(), 'lavorai-consent-ui-'));
let browser;
const server = createServer(async (request, response) => {
  const js = request.url === '/form.js';
  response.setHeader('Content-Type', js ? 'application/javascript' : 'text/html');
  response.end(await readFile(join(out, js ? 'form.js' : 'index.html')));
});
try {
  await build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {PrivacyConsentForm} from './src/components/privacy-consent-form';
      const root=createRoot(document.getElementById('root')); let key=0;
      window.__scenario=(options={})=>{window.__options=options;window.__requests=[];window.__refreshes=0;root.render(<PrivacyConsentForm key={++key} recorded={!!options.recorded} locale={options.locale||'en'}/>);};
      window.fetch=async(url,options)=>{window.__requests.push({url,body:JSON.parse(options.body)});const fixture=window.__options;
        if(fixture.delay) await new Promise(resolve=>{window.__resolve=resolve;});
        if(fixture.networkError) throw Error('Synthetic connection failure');
        return {ok:fixture.httpOk!==false,json:async()=>{if(fixture.malformed) throw Error('Synthetic malformed JSON');return fixture.body??{ok:true,privacyConsentRecorded:true,release:{status:'checked',requeuedCount:0}};}};
      };window.__scenario();`, loader: 'tsx', resolveDir: process.cwd() },
    bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', outfile: join(out, 'form.js'),
    plugins: [{ name: 'isolated-router', setup(builder) {
      builder.onResolve({filter:/^next\/navigation$/}, () => ({path:'router',namespace:'mock'}));
      builder.onLoad({filter:/.*/,namespace:'mock'}, () => ({contents:'export const useRouter=()=>({refresh(){window.__refreshes++;}});'}));
    }}],
  });
  await writeFile(join(out, 'index.html'), '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main id="root"></main><script src="/form.js"></script></body></html>');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch(process.platform === 'darwin' ? {channel:'chrome',headless:true} : {executablePath:await serverChromium.executablePath(),args:serverChromium.args,headless:true});
  const page = await browser.newPage({viewport:{width:390,height:844}});
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    if(!route.request().url().startsWith(origin+'/')) {external.push(route.request().url());return route.abort();}
    return route.continue();
  });
  await page.goto(origin);
  const scenario = async options => {await page.evaluate(options=>window.__scenario(options),options);await page.getByRole('checkbox').waitFor();};
  const submit = async () => {await page.getByRole('checkbox').check();await page.getByRole('button',{name:/Save privacy consent|Salva consenso privacy/}).click();};
  assert.equal(await page.getByRole('checkbox').isChecked(),false);
  assert.equal(await page.getByRole('button',{name:'Save privacy consent'}).isDisabled(),true);
  await submit();
  await page.getByText('No applications were returned to the queue by this save.',{exact:false}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Review applications'}).getAttribute('href'),'/applications');
  assert.equal(await page.evaluate(()=>window.__refreshes),1);

  for(const [status,count] of [['checked',2],['incomplete',1],['incomplete',0]]) {
    await scenario({body:{ok:true,privacyConsentRecorded:true,release:{status,requeuedCount:count}}});await submit();
    await page.getByText('Privacy consent recorded.',{exact:false}).waitFor();
    const text = await page.locator('form').innerText();
    if(count) {assert.match(text,new RegExp(`${count} application\\(s\\) returned to the queue`));assert.match(text,/not a delivery confirmation/);}
    if(status==='incomplete') {assert.match(text,/consent is saved, but the recovery check could not be completed/);assert.doesNotMatch(text,/No applications were returned/);}
    assert.equal(await page.getByRole('alert').count(),0);
  }

  await scenario({delay:true});await page.getByRole('checkbox').check();
  await page.locator('form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});
  await page.getByRole('button',{name:'Saving…'}).waitFor();
  assert.equal(await page.evaluate(()=>window.__requests.length),1,'repeated submission must not duplicate requests');
  await page.evaluate(()=>window.__resolve());await page.getByText('Privacy consent recorded.',{exact:false}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.__requests),[{url:'/api/account/privacy-consent',body:{privacyConsent:true}}]);

  for(const options of [{httpOk:false},{networkError:true},{malformed:true},{body:{ok:false}}]) {
    await scenario(options);await submit();await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').innerText(),/could not confirm.*Refresh/);
    assert.equal(await page.getByText('Privacy consent recorded.',{exact:false}).count(),0);
    assert.equal(await page.evaluate(()=>window.__refreshes),0);
  }
  // A refresh after a response was lost can reveal an already-saved consent.
  await page.evaluate(()=>window.__scenario({recorded:true}));
  await page.getByText('Privacy consent recorded.',{exact:false}).waitFor();
  assert.equal(await page.getByRole('button').count(),0);assert.equal(await page.evaluate(()=>window.__requests.length),0);

  // Rolling deployments without a report remain truthful, without invented counts.
  for(const body of [{ok:true},{ok:true,release:{status:'checked',requeuedCount:-1}}]) {
    await scenario({body});await submit();await page.getByText('Privacy consent recorded.',{exact:false}).waitFor();
    assert.doesNotMatch(await page.locator('form').innerText(),/returned to the queue by this save/);
  }
  await scenario({locale:'it'});await submit();await page.getByText('Consenso privacy registrato.',{exact:false}).waitFor();
  assert.match(await page.locator('form').innerText(),/non garantisce la ripresa automatica/);
  assert.match(await page.locator('form').innerText(),/non ha rimesso candidature in coda/);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('PASS privacy consent UI: zero/positive/partial recovery, uncertain failures, duplicate-submit fence, refresh recovery, legacy response, English/Italian; synthetic only.');
} finally {
  if(browser) await browser.close();
  await new Promise(resolve=>server.close(resolve));
  await rm(out,{recursive:true,force:true});
}
