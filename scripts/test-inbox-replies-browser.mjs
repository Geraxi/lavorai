/** Synthetic UI only: production and all external network requests are blocked. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { chromium } from 'playwright';
const out = resolve('output/playwright/inbox'); await mkdir(out, { recursive: true });
const stubs = {
  'next/navigation': `const router={refresh(){window.__refreshes++}}; const params=new URLSearchParams(location.search); export const useRouter=()=>router; export const useSearchParams=()=>params; export const usePathname=()=>'/inbox';`,
  'next/link': `import React from 'react'; export default function Link({prefetch,...props}){return React.createElement('a',props)}`,
  'next-auth/react': `export const signOut=()=>{};`,
  '@/components/gmail-connect-modal': `export const GmailConnectModal=()=>null;`,
};
const entry = `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {NextIntlClientProvider} from 'next-intl'; import {SWRConfig} from 'swr';
import {AppShell} from './src/components/design/app-shell'; import {GmailInboxView} from './src/components/gmail-inbox-view';
import it from './messages/it.json'; import en from './messages/en.json';
const locale = new URLSearchParams(location.search).get('locale') || 'it';
const base={source:'application_reply',from:'Sara Bianchi <sara@example.test>',subject:'Disponibilità per un colloquio · Senior Frontend Engineer',snippet:'Ci piacerebbe conoscerti. Sei disponibile per una breve call questa settimana?',bodyText:'Ciao Alex,\\n\\nAbbiamo esaminato il tuo portfolio e la candidatura per il ruolo di Senior Frontend Engineer. Ci ha colpito la tua esperienza con React e design system.\\n\\nSei disponibile per una call conoscitiva di 30 minuti questa settimana?\\n\\nGrazie,\\nSara',date:'2026-10-15T10:30:00Z',kind:'colloquio',label:'Possible interview',read:null,applicationId:'fixture-app',applicationStatus:null,company:'Example Studio',jobTitle:'Senior Frontend Engineer',jobRelated:true,location:'Milano · Italia',remote:true,salaryMin:60000,salaryMax:80000};
const names=['Marco Rossi','Elena Conti','Julian Martin','Chiara Verdi'];
const companies=['Sample Labs','Demo Cloud','Example Works','Sample Design'];
const messages=[{...base,id:'application_reply:first'},...Array.from({length:54},(_,i)=>({...base,id:'application_reply:fixture-'+i,applicationId:'fixture-app-'+i,from:names[i%4]+' <recruiter'+i+'@example.test>',company:companies[i%4],date:new Date(Date.parse('2026-10-14T10:00:00Z')-i*3600000).toISOString(),kind:i%3===0?'colloquio':'risposta',subject:['Aggiornamento sulla tua candidatura','Un primo incontro con il team','La tua esperienza con React','Informazioni sul ruolo'][i%4]})),{...base,id:'gmail:fixture',source:'gmail',gmailMessageId:'fixture-gmail',applicationId:'gmail-app',subject:'Gmail original fixture',date:'2026-09-10T10:00:00Z'}];
messages[1]={...messages[1],subject:'Einladung zum Gespräch',bodyText:'Guten Tag! Haben Sie am Donnerstag um 14 Uhr Zeit?'};
const outgoing=[{id:'00000000-0000-4000-8000-000000000099',parentReplyId:'application_reply:first',applicationId:'fixture-app',bodyText:'Ciao Sara, grazie per avermi contattato. Sono disponibile giovedì mattina o venerdì pomeriggio. Possiamo organizzare una call conoscitiva.\\n\\nA presto,\\nAlex',recipient:'sara@example.test',subject:'Re: Disponibilità per un colloquio',status:'delivered',failureCode:null,date:'2026-10-15T10:36:00Z',updatedAt:'2026-10-15T10:37:00Z'}];
window.__requests=[];window.__refreshes=0;window.__replyMode='quota';
window.fetch=async(url,options={})=>{
 window.__requests.push({url:String(url),method:options.method||'GET',body:options.body});
 if(String(url).startsWith('/api/inbox/replies')){
  if(!options.method)return Response.json({recipient:'sara@example.test',subject:'Re: Interview'});
  const input=JSON.parse(options.body);
  if(input.action==='send'&&window.__replyMode==='quota')return Response.json({error:'email_quota_reached'},{status:429});
  return Response.json({reply:{id:input.id,parentReplyId:input.parentId,applicationId:'fixture-app',bodyText:input.body,recipient:'sara@example.test',subject:'Re: Interview',status:input.action==='draft'?'draft':'accepted',failureCode:null,date:new Date().toISOString(),updatedAt:new Date().toISOString()}});
 }
 return Response.json({applications:56,inbox:3,matches:12,questions:0});
};
function Preview(){const[rows,setRows]=React.useState(messages);window.__long=()=>setRows([{...base,id:'application_reply:long',bodyText:('Long untrusted message <img src="https://tracker.invalid/pixel"><script>alert(1)</script> '+ 'https://evil.invalid ').repeat(1000)},...messages]);window.__empty=()=>setRows([]);return <GmailInboxView messages={rows} outgoing={outgoing} ownerId="fixture-owner" gmailConnected={true} userEmail="alex@example.test" locale={locale}/>;}
createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale={locale} messages={locale==='it'?it:en}><SWRConfig value={{provider:()=>new Map(),dedupingInterval:999999}}><AppShell sidebarProps={{userName:'Alex Example',userPlan:'Piano Pro',isAdmin:false}}><div style={{display:'flex',flex:1,minHeight:0}}><Preview/></div></AppShell></SWRConfig></NextIntlClientProvider>);
`;
await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'browser',format:'iife',jsx:'automatic',outfile:join(out,'preview.js'),plugins:[{name:'fixture-boundaries',setup(builder){builder.onResolve({filter:/.*/},args=>args.path in stubs?{path:args.path,namespace:'stub'}:undefined);builder.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:stubs[args.path],loader:'tsx',resolveDir:process.cwd()}));}}]});
execFileSync(process.execPath,['node_modules/tailwindcss/lib/cli.js','-i','src/app/globals.css','-o',join(out,'global.css')],{stdio:'pipe'});
await writeFile(join(out,'index.html'),'<!doctype html><html lang="it" data-theme="dark"><head><style>:root{--font-inter:Arial,sans-serif;--font-sans:Arial,sans-serif}body{font-family:Arial,sans-serif}</style><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/global.css"><link rel="stylesheet" href="/preview.css"></head><body><div id="root"></div><script src="/preview.js"></script></body></html>');
const server=createServer(async(req,res)=>{const file=['/preview.js','/preview.css','/global.css'].includes(req.url)?req.url.slice(1):'index.html';res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await readFile(join(out,file)));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
let browser;
try{
 browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,headless:true}
  : {channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[],external=[];
 page.on('pageerror',err=>errors.push(err.message)); await page.route('**/*',route=>{if(!route.request().url().startsWith('http://127.0.0.1:'+port+'/')){external.push(route.request().url());return route.abort()}return route.continue()});
 await page.goto('http://127.0.0.1:'+port+'/inbox');await page.getByRole('textbox',{name:'Testo risposta'}).waitFor();
 await page.waitForFunction(()=>document.querySelector('.mail-recipient')?.textContent.includes('sara@example.test'));
 assert.equal(await page.locator('.mail-row').count(),20);
 assert.equal(await page.locator('select').count(),0);
 const bounds=await page.evaluate(()=>({body:document.body.scrollHeight,width:document.body.scrollWidth,h:innerHeight,w:innerWidth}));assert.ok(bounds.body<=bounds.h+2,JSON.stringify(bounds));assert.ok(bounds.width<=bounds.w);
 await page.screenshot({path:join(out,'inbox-target-revised-1440.png'),fullPage:false});
 await page.setViewportSize({width:1366,height:768});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.screenshot({path:join(out,'inbox-target-revised-1366.png'),fullPage:false});
 assert.ok(await page.evaluate(()=>document.body.scrollHeight<=innerHeight+2));
 await page.getByRole('button',{name:'Pagina successiva',exact:true}).click();assert.match(await page.locator('.mail-pagination').innerText(),/21–40/);assert.equal(await page.locator('.mail-row').count(),20);await page.getByRole('button',{name:'Pagina precedente',exact:true}).click();
 await page.getByRole('textbox',{name:'Testo risposta'}).fill('Grazie Sara, giovedì mattina sono disponibile.');
 await page.getByRole('button',{name:'Invia risposta',exact:true}).click();await page.getByRole('status').filter({hasText:'Limite di invio'}).waitFor();assert.equal(await page.getByRole('textbox',{name:'Testo risposta'}).inputValue(),'Grazie Sara, giovedì mattina sono disponibile.');
 await page.screenshot({path:join(out,'inbox-quota-draft-preserved.png'),fullPage:false});
 const first=await page.evaluate(()=>JSON.parse(window.__requests.find(r=>r.method==='POST').body));await page.evaluate(()=>window.__replyMode='accepted');
 await page.getByRole('button',{name:'Invia risposta',exact:true}).click();await page.getByRole('status').filter({hasText:'Inviata · consegna in attesa'}).waitFor();
 const last=await page.evaluate(()=>JSON.parse(window.__requests.filter(r=>r.method==='POST').at(-1).body));assert.equal(first.id,last.id,'Same request identity after quota/network error');assert.ok(!('recipient'in last));
 await page.screenshot({path:join(out,'inbox-provider-accepted.png'),fullPage:false});
 await page.getByRole('textbox',{name:'Cerca nella inbox'}).fill('Gmail original fixture');await page.getByRole('link',{name:'Rispondi in Gmail'}).waitFor();assert.equal(await page.getByRole('textbox',{name:'Testo risposta'}).count(),0);assert.ok((await page.getByRole('link',{name:'Rispondi in Gmail'}).getAttribute('href')).includes('fixture-gmail'));
 await page.getByRole('textbox',{name:'Cerca nella inbox'}).fill('Einladung zum Gespräch');
 const inbound=page.locator('.mail-letter');
 const original='Guten Tag! Haben Sie am Donnerstag um 14 Uhr Zeit?';
 assert.equal(await inbound.getByTestId('message-body').textContent(),original);
 await page.evaluate(()=>{
  window.__translationCalls=[];
  Object.defineProperty(window,'Translator',{configurable:true,value:{
   async create({sourceLanguage,targetLanguage}){
    window.__translationCalls.push([sourceLanguage,targetLanguage]);
    return {
     async translate(text){
      window.__translationCalls.push(text);
      return text.startsWith('Einladung')?'Invito al colloquio':'Buongiorno! Ha tempo giovedì alle 14?';
     },
     destroy(){window.__translationCalls.push('destroy')},
    };
   },
  }});
 });
 assert.deepEqual(await page.evaluate(()=>window.__translationCalls),[],'Never translate without a click');
 const fetchCount=await page.evaluate(()=>window.__requests.length);
 await inbound.getByRole('button',{name:'Traduci dal tedesco'}).click();
 await inbound.getByRole('status').filter({hasText:'Traduzione automatica'}).waitFor();
 assert.equal(await inbound.getByTestId('message-body').textContent(),'Buongiorno! Ha tempo giovedì alle 14?');
 assert.match(await inbound.innerText(),/Invito al colloquio/);
 assert.deepEqual(await page.evaluate(()=>window.__translationCalls),[['de','it'],original,'Einladung zum Gespräch','destroy']);
 await inbound.getByRole('button',{name:'Mostra originale'}).click();
 assert.equal(await inbound.getByTestId('message-body').textContent(),original);
 await page.evaluate(()=>{
  Object.defineProperty(window,'Translator',{value:undefined});
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{async writeText(text){window.__copiedText=text}}});
 });
 // Switching threads remounts the message. No browser translation API is available now.
 await page.getByRole('textbox',{name:'Cerca nella inbox'}).fill('Gmail original fixture');
 await page.getByRole('link',{name:'Rispondi in Gmail'}).waitFor();
 await page.getByRole('textbox',{name:'Cerca nella inbox'}).fill('Einladung zum Gespräch');
 await inbound.getByRole('button',{name:'Traduci dal tedesco'}).click();
 await inbound.getByRole('status').filter({hasText:'Questo browser non può tradurre'}).waitFor();
 await inbound.getByRole('button',{name:'Copia originale'}).click();
 await inbound.getByRole('status').filter({hasText:'Originale copiato.'}).waitFor();
 assert.equal(await page.evaluate(()=>window.__copiedText),'Einladung zum Gespräch\n\n'+original);
 assert.equal(await inbound.getByTestId('message-body').textContent(),original);
 assert.ok((await page.evaluate((n)=>window.__requests.slice(n),fetchCount)).every(({url,method})=>method==='GET'&&url.startsWith('/api/inbox/replies')));
 await page.getByRole('textbox',{name:'Cerca nella inbox'}).fill('no match');await page.getByText('Nessun messaggio trovato').waitFor();
 await page.getByRole('textbox',{name:'Cerca nella inbox'}).fill('');await page.evaluate(()=>window.__long());
 await page.locator('.mail-row').first().click();assert.equal(await page.locator('[data-testid="message-body"] img,[data-testid="message-body"] script').count(),0);assert.ok(await page.evaluate(()=>document.body.scrollHeight<=innerHeight+2));assert.ok(await page.locator('.mail-conversation').evaluate(el=>el.scrollHeight>el.clientHeight));
 await page.screenshot({path:join(out,'inbox-long-message.png'),fullPage:false});
 await page.goto('http://127.0.0.1:'+port+'/inbox?locale=en');await page.setViewportSize({width:390,height:844});await page.locator('.mail-row').first().waitFor();await page.screenshot({path:join(out,'inbox-mobile-list.png'),fullPage:false});
 assert.ok(await page.evaluate(()=>document.body.scrollWidth<=innerWidth));await page.locator('.mail-row').first().click();await page.getByRole('textbox',{name:'Reply message'}).waitFor();await page.screenshot({path:join(out,'inbox-mobile-conversation.png'),fullPage:false});assert.ok(await page.evaluate(()=>document.body.scrollWidth<=innerWidth));
 await page.getByRole('button',{name:'Back to messages'}).click();await page.locator('.mail-row').first().waitFor();
 await page.getByRole('textbox',{name:'Search inbox'}).fill('Einladung zum Gespräch');await page.locator('.mail-row').first().click();
 await page.evaluate(()=>{
  window.__englishAttempts=[];
  Object.defineProperty(window,'Translator',{configurable:true,value:{async create({sourceLanguage,targetLanguage}){
   window.__englishAttempts.push([sourceLanguage,targetLanguage]);
   if(window.__englishAttempts.length===1)throw new Error('Fixture: language pack unavailable');
   return {async translate(text){return text.startsWith('Einladung')?'Interview invitation':'Hello! Are you free on Thursday at 2 PM?'},destroy(){}};
  }}});
 });
 await inbound.getByRole('button',{name:'Translate from German'}).click();
 await inbound.getByRole('status').filter({hasText:'On-device translation didn’t finish'}).waitFor();
 assert.equal(await inbound.getByTestId('message-body').textContent(),original);
 await inbound.getByRole('button',{name:'Translate from German'}).click();
 await inbound.getByRole('status').filter({hasText:'Automatic translation'}).waitFor();
 assert.equal(await inbound.getByTestId('message-body').textContent(),'Hello! Are you free on Thursday at 2 PM?');
 assert.deepEqual(await page.evaluate(()=>window.__englishAttempts),[['de','en'],['de','en']]);
 await inbound.getByRole('button',{name:'Show original'}).click();
 assert.equal(await inbound.getByTestId('message-body').textContent(),original);
 assert.ok(await page.evaluate(()=>document.body.scrollWidth<=innerWidth));
 assert.deepEqual(external,[]);assert.deepEqual(errors,[]);console.log('[inbox-browser] PASS: 56-message pagination, desktop viewport bounds, mobile list/reader, no dropdowns, quota draft retention, send identity, Gmail fallback, safe text/zero external requests, German translation into Italian/English, original toggle, translation retry and clipboard fallback. '+out);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
