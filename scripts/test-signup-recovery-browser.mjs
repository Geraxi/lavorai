// Synthetic UI coverage for the approved job-entry and shared-navigation repair.
// No database, live signup, application, payment, or external communication.
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const out='scripts/tmp/navigation-fixture';
await mkdir(out,{recursive:true});
execFileSync(process.execPath,['--import','tsx','scripts/test-public-job-entry.tsx'],{stdio:'inherit'});
const stubs={
 'next/navigation':`export const usePathname=()=>location.pathname; export const useRouter=()=>({refresh(){}});`,
 'next/link':`import React from 'react'; export default function Link({prefetch,...props}){return <a {...props}/>;}`,
 'next-auth/react':`export const signOut=()=>{};`,
 '@/components/auto-apply-toggle':`export const AutoApplyToggle=()=>null;`,
 '@/components/ui/shader-aurora-veil':`export const ShaderAuroraVeil=()=>null;`
};
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {NextIntlClientProvider} from 'next-intl';import {AppShell} from './src/components/design/app-shell';import it from './messages/it.json';import en from './messages/en.json';window.fetch=async()=>Response.json({applicationsCount:0,autoApplyToday:0,autoApplyRemaining:0});const locale=new URLSearchParams(location.search).get('locale')||'it';createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale={locale} messages={locale==='en'?en:it}><AppShell sidebarProps={{userName:'Synthetic user',userPlan:'Test'}}><h1>Inbox fixture</h1></AppShell></NextIntlClientProvider>);`;
await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'browser',format:'iife',jsx:'automatic',outfile:out+'/workspace.js',plugins:[{name:'boundaries',setup(b){b.onResolve({filter:/.*/},a=>a.path in stubs?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:stubs[a.path],loader:'tsx',resolveDir:process.cwd()}));}}]});
execFileSync(process.execPath,['node_modules/tailwindcss/lib/cli.js','-i','src/app/globals.css','-o',out+'/base.css']);
const navHtml='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/base.css"><link rel="stylesheet" href="/workspace.css"></head><body><div id="root"></div><script src="/workspace.js"></script></body></html>';
const server=createServer(async(req,res)=>{let f=req.url?.split('?')[0]?.slice(1)||'unavailable';if(['workspace.js','workspace.css','base.css'].includes(f)){res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':'text/css');res.end(await readFile(out+'/'+f));}else if(['unavailable','empty','visible'].includes(f)){res.setHeader('Content-Type','text/html; charset=utf-8');res.end((await readFile('scripts/tmp/public-job-entry/'+f+'.html','utf8')).replace(/<style>[\s\S]*?<\/style>/,'<link rel="stylesheet" href="/base.css">'));}else if(f==='inbox'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(navHtml);}else{res.end('<h1>Destination fixture</h1>');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
let browser;
try { browser=await chromium.launch({...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),headless:true});
const page=await browser.newPage();const errors=[];const external=[];
await page.route('**/*',route=>{if(!route.request().url().startsWith(base)){external.push(route.request().url());return route.abort();}return route.continue();});page.on('pageerror',e=>errors.push(e.message));
for(const width of [1440,390,320]){
 await page.setViewportSize({width,height:900});
 for(const kind of ['unavailable','empty']){
  await page.goto(base+'/'+kind);await page.getByRole('heading',{name:'Questo annuncio non è disponibile'}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Crea un account →'}).getAttribute('href'),'/signup?next=%2Fjobs');
  assert.equal(await page.locator('script[type="application/ld+json"]').count(),0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),kind+' overflow '+width);
  await page.screenshot({path:'scripts/tmp/public-job-entry/'+kind+'-'+width+'.png',fullPage:true});
  await page.getByRole('link',{name:'Crea un account →'}).click();assert.match(page.url(),/\/signup\?next=%2Fjobs$/);await page.goBack();await page.getByRole('heading',{name:'Questo annuncio non è disponibile'}).waitFor();
 }
 for(const locale of ['en','it']){
  await page.goto(base+'/inbox?locale='+locale);await page.locator('.lavorai-app-shell').waitFor();
  assert.equal(await page.locator('a[href="/posta"]').count(),0);
  if(width>=1024){assert.equal(await page.locator('.lavorai-sidebar-desktop a[href="/inbox"]').count(),1);}
  else{
   await page.getByRole('button',{name:locale==='en'?'Open menu':'Apri menu'}).click();await page.getByRole('dialog').waitFor();
   assert.equal(await page.getByRole('dialog').locator('a[href="/inbox"]').count(),1);assert.equal(await page.getByRole('dialog').locator('a[href="/posta"]').count(),0);
   await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});
   await page.getByRole('button',{name:locale==='en'?'Open menu':'Apri menu'}).click();await page.getByRole('dialog').locator('a[href="/inbox"]').click();await page.waitForLoadState();await page.getByRole('dialog').waitFor({state:'detached'});await page.goto(base+'/inbox?locale='+locale);await page.locator('.lavorai-app-shell').waitFor();
  }
  await page.screenshot({path:out+'/inbox-'+locale+'-'+width+'.png'});
 }
}
assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await writeFile('scripts/tmp/release-browser-qa.json',JSON.stringify({passed:true,widths:[1440,390,320],locales:['it','en'],errors,scope:'Actual navigation components with fake service boundaries and actual public route rendered fixtures. No external state changes.'},null,2));
console.log('PASS browser: unavailable/empty pages, responsive widths, signup link/back, desktop and repeated mobile navigation, Inbox retained and Posta removed; synthetic only');
}finally{await browser?.close();server.close();}
