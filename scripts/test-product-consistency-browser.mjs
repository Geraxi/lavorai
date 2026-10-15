/** Synthetic browser fixtures around real product components. Every API and
 * identity is local; all external browser requests are blocked. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {join,resolve,extname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {chromium} from 'playwright';
const out=resolve('output/playwright/product-consistency');await mkdir(out,{recursive:true});
const fontFile=process.env.WORKSPACE_FONT_FILE;
const fixtureFont=fontFile?'WorkspaceInter':'Arial';
const fontCss=fontFile?'@font-face{font-family:WorkspaceInter;font-style:normal;font-weight:100 900;font-display:block;src:url(data:font/woff2;base64,'+(await readFile(fontFile)).toString('base64')+') format("woff2");}':'';
const stubs={
 'next/navigation':`export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);export const redirect=(url)=>{throw new Error('Unexpected fixture redirect: '+url)};export const useRouter=()=>({push(url){window.__navigation=url},replace(url){window.__navigation=url},refresh(){window.__refreshes++}});`,
 'next/link':`import React from 'react';export default function Link({prefetch,...p}){return <a {...p}/>}`,
 'next/image':`import React from 'react';export default function Image({fill,priority,unoptimized,quality,loader,...p}){return <img {...p}/>} `,
 'next/font/local':`export default function font(){return {variable:'fixture-display-font',className:'fixture-display-font'}}`,
 'next-auth/react':`export const signIn=async()=>({error:'CredentialsSignin'});export const signOut=()=>{};export const useSession=()=>({data:null,update:async()=>{}});`,
 '@/lib/session':`export const getCurrentUser=async()=>({id:'fixture',name:'Alex Example',email:'alex@example.test',emailVerified:new Date(),tier:['/start-membership','/trial-expired'].includes(location.pathname)?'free':'pro',subscriptionStatus:location.pathname==='/start-membership'?null:'active',createdAt:location.pathname==='/trial-expired'?new Date('2020-01-01'):new Date(),trialEndsAt:location.pathname==='/trial-expired'?new Date('2020-01-08'):null,stripeSubscriptionId:location.pathname==='/settings'?'fixture-subscription':null,stripeCustomerId:null,onboardedAt:null});`,
 '@/lib/admin':`export const isAdmin=()=>false;`,
 '@/lib/db':`export const getDemoUser=async()=>{throw new Error('Demo user forbidden')};export const prisma={user:{findUnique:async()=>({passwordHash:'fixture-hash'})},application:{count:async()=>0,findMany:async()=>[]},cVProfile:{findUnique:async()=>null}};`,
 '@/lib/analytics':`export const AnalyticsEvent=new Proxy({},{get:(_,key)=>key});export const trackEvent=()=>{};`,
 '@/components/user-popup':`export const UserPopup=()=>null;`,
 '@/components/design/company-logo-image':`import React from 'react';export const CompanyLogoImage=({initials,size,color})=><span style={{display:'grid',placeItems:'center',width:size,height:size,background:color,flexShrink:0}}>{initials}</span>;`,
};
const entry=`
import React from 'react';import {createRoot} from 'react-dom/client';import {NextIntlClientProvider} from 'next-intl';import {SWRConfig} from 'swr';import {Toaster} from 'sonner';
import {AppShell} from './src/components/design/app-shell';import {AppTopbar} from './src/components/design/topbar';import {CommandPalette} from './src/components/design/command-palette';
import {PreferencesClient} from './src/app/(app)/preferences/preferences-client';import {QuestionsView} from './src/app/(app)/questions/questions-view';import './src/app/(app)/questions/questions.css';
import {CVBuilder} from './src/app/(app)/cv/cv-builder';import {EMPTY_PROFILE} from './src/lib/cv-profile-types';import {CVUpload} from './src/components/cv-upload';
import Analytics from './src/app/(app)/analytics/page';import SettingsPage from './src/app/(app)/settings/page';import AppLoading from './src/app/(app)/loading';import AppError from './src/app/(app)/error';
import Onboarding from './src/app/onboarding/onboarding-client';import Membership from './src/app/start-membership/page';import Expired from './src/app/trial-expired/page';
import Login from './src/app/login/page';import Signup from './src/app/signup/page';import Forgot from './src/app/forgot-password/page';import Reset from './src/app/reset-password/page';import Verify from './src/app/verify-email/page';
import {LandingHomepage} from './src/components/landing/landing-homepage';
import it from './messages/it.json';import en from './messages/en.json';
const params=new URLSearchParams(location.search), locale=params.get('locale')||'it';window.__requests=[];window.__refreshes=0;window.__fail=params.has('error');window.__settingsFail=params.has('settings-error');
const response=(data,status=200)=>Promise.resolve(new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}}));
window.fetch=async (url,options={})=>{const path=String(url);window.__requests.push({path,method:options.method||'GET',body:typeof options.body==='string'?options.body:null});
 if(path==='/api/questions')return window.__fail?response({message:'Fixture unavailable'},503):response({locale,waitingApplications:24,continuations:[],questions:Array.from({length:24},(_,i)=>({id:'question-'+i,labelKey:'question-'+i,applicationId:'application-'+i,fingerprint:'f'+i,requiresApplicationScope:true,label:'Quanti anni di esperienza hai con React? '+i,kind:'text',answer:'',source:'none',applications:[{id:'application-'+i,company:'Example Studio',title:'Frontend Engineer'}]}))});
 if(path==='/api/preferences'&&window.__holdPreferences)await new Promise(resolve=>window.__resolveSave=resolve);
 if(options.method && options.method!=='GET')return window.__fail?response({message:'Errore simulato. Riprova.'},503):response({ok:true,skipped:true});
 if(path==='/api/sidebar-stats')return response({applicationsCount:24,autoApplyToday:0,autoApplyRemaining:0});
 if(path==='/api/stripe/subscription')return window.__settingsFail?response({message:'Unavailable'},503):response({subscription:{status:'active',cancelAtPeriodEnd:false,paused:false,currentPeriodEnd:'2030-01-01',discount:null}});
 if(path==='/api/referral/me')return window.__settingsFail?response({message:'Unavailable'},503):response({link:'https://example.test/r/fixture',stats:{total:0,paying:0,credits:0}});
 if(path==='/api/auth/providers')return response({});
 if(path==='/api/sessions')return response({sessions:[]});
 return response({});};
const profile={...EMPTY_PROFILE,firstName:'Alex',lastName:'Example',email:'alex@example.test',title:'Frontend Engineer',experiences:Array.from({length:10},()=>({role:'Engineer',company:'Example Company',location:'Milano',startDate:'2020',endDate:'2025',description:'Synthetic experience',bullets:['Built accessible products.']}))};
const initial={roles:['Frontend Developer'],locations:['Italia'],salaryMin:40,autoApplyOn:false,autoApplyMode:'manual',dailyCap:5,matchMin:65,employmentType:'employee',protectedCategory:false,dailyRate:null,availableFrom:null,vatNumber:null,portfolioUrl:null,applicationAnswers:{},modeSel:{remoto:true,ibrido:false,sede:false},excludedCompanies:[]};
async function main(){let content;let app=true;
 switch(location.pathname){
 case '/preferences':content=<PreferencesClient initial={initial}/>;break;
 case '/questions':content=<QuestionsView/>;break;
 case '/settings':content=await SettingsPage();break;
 case '/analytics':content=await Analytics({searchParams:Promise.resolve({})});break;
 case '/cv':content=<><AppTopbar title="Il tuo CV" breadcrumb="Profilo"/><div className="profile-workspace cv-workspace">{params.has('empty')?<CVUpload/>:<CVBuilder initial={profile}/>}</div></>;break;
 case '/loading':content=<AppLoading/>;break;
 case '/error':content=<AppError error={new Error('fixture')} reset={()=>window.__refreshes++}/>;break;
 case '/login':content=<Login/>;app=false;break;
 case '/signup':content=<Signup/>;app=false;break;
 case '/forgot-password':content=<Forgot/>;app=false;break;
 case '/reset-password':content=<Reset/>;app=false;break;
 case '/verify-email':content=<Verify/>;app=false;break;
 case '/onboarding':content=<Onboarding initial={{cv:null,profile:null}}/>;app=false;break;
 case '/trial-expired':content=await Expired({searchParams:Promise.resolve({})});app=false;break;
 case '/start-membership':content=await Membership({searchParams:Promise.resolve({})});app=false;break;
 case '/':content=<LandingHomepage/>;app=false;break;
 default:throw new Error('Unexpected fixture route');}
 createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale={locale} messages={locale==='en'?en:it}><SWRConfig value={{provider:()=>new Map(),shouldRetryOnError:false,revalidateOnFocus:false}}>{app?<><AppShell sidebarProps={{userName:'Alex Example',userPlan:'Local fixture'}}>{content}</AppShell><CommandPalette/></>:content}<Toaster/></SWRConfig></NextIntlClientProvider>);}
 main();`;
await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'browser',format:'iife',jsx:'automatic',outfile:join(out,'fixture.js'),define:{'process.env':'{}'},plugins:[{name:'local-boundaries',setup(b){b.onResolve({filter:/.*/},a=>{if(a.kind==='url-token'&&a.path.startsWith('/'))return {path:a.path,external:true};const path=a.path==='./company-logo-image'?'@/components/design/company-logo-image':a.path;return path in stubs?{path,namespace:'fixture'}:undefined});b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:stubs[a.path],loader:'tsx',resolveDir:process.cwd()}))}}]});
execFileSync(process.execPath,['node_modules/tailwindcss/lib/cli.js','-i','src/app/globals.css','-o',join(out,'base.css')],{stdio:'pipe'});
await writeFile(join(out,'index.html'),'<!doctype html><html lang="it" data-theme="dark" style="--font-inter:'+fixtureFont+'"><head><style>'+fontCss+'</style><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/base.css"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
const server=createServer(async(req,res)=>{const path=new URL(req.url,'http://localhost').pathname;let file=['/fixture.js','/fixture.css','/base.css'].includes(path)?join(out,path):/\.(webp|jpg|png|mp4|svg)$/.test(path)?join(process.cwd(),'public',path):join(out,'index.html');const types={'.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.mp4':'video/mp4'};res.setHeader('Content-Type',types[extname(file)]||'text/html');try{res.end(await readFile(file))}catch{res.statusCode=404;res.end()}});
await new Promise(yes=>server.listen(0,'127.0.0.1',yes));const base='http://127.0.0.1:'+server.address().port;
if(process.argv.includes('--serve')){console.log(base);await new Promise(()=>{})}
let browser;try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});const page=await browser.newPage({viewport:{width:1366,height:768},reducedMotion:'reduce'});const errors=[],external=[],geometry=[];
 page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(12000);page.on('pageerror',e=>{errors.push(e.message);console.log('BROWSER ERROR',e.message)});await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():(external.push(route.request().url()),route.abort()));
 const go=async path=>{console.log('Checking',path);await page.goto(base+path,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.getElementById('root').children.length>0);await page.evaluate(()=>document.fonts.ready);};
 const shot=async name=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));return page.screenshot({path:join(out,name+'.png'),animations:'disabled'})};
 for(const [width,height] of [[1366,768],[1440,900],[390,844],[320,740]]){
  await page.setViewportSize({width,height});
  for(const route of ['/preferences','/questions','/settings','/analytics','/cv','/loading','/error','/login','/signup','/forgot-password','/reset-password','/verify-email','/onboarding','/start-membership','/trial-expired','/']){
   await go(route);if(route==='/questions')await page.locator('.qa-row').first().waitFor();
   const size=await page.evaluate(()=>{const main=document.querySelector('.lavorai-main');return {width:innerWidth,height:innerHeight,docWidth:document.documentElement.scrollWidth,docHeight:document.documentElement.scrollHeight,mainHeight:main?.clientHeight,mainScrollHeight:main?.scrollHeight}});
   assert.ok(size.docWidth<=width+1,route+' horizontal overflow '+JSON.stringify(size));
   if(width>=1024&&route!=='/'){assert.ok(size.docHeight<=height+1,route+' document overflow '+JSON.stringify(size));if(size.mainHeight)assert.ok(size.mainScrollHeight<=size.mainHeight+1,route+' main overflow '+JSON.stringify(size));}
   if(['/settings','/preferences'].includes(route)){const clipped=await page.locator('.profile-scroll > .ds-section-card').evaluateAll(cards=>cards.filter(el=>el.scrollHeight>el.clientHeight+1).length);assert.equal(clipped,0,route+' must not clip card contents');if(await page.locator('.ds-input').count())assert.equal(await page.locator('.ds-input').first().evaluate(el=>getComputedStyle(el).backgroundImage),'none');}
   geometry.push({route,...size});await shot((route==='/'?'landing':route.slice(1))+'-'+width+'x'+height);
  }
 }
 await page.setViewportSize({width:1366,height:768});await go('/reset-password');assert.equal(await page.locator('.auth-submit').evaluate(el=>getComputedStyle(el).color),'rgb(0, 42, 40)');await go('/reset-password?token=synthetic');await page.locator('#password').waitFor();await shot('reset-password-form-1366');await go('/questions?error=1');await page.getByRole('heading',{name:'Impossibile caricare le domande'}).waitFor();assert.equal(await page.getByText('Nessuna domanda in sospeso').count(),0);await page.evaluate(()=>window.__fail=false);await page.getByRole('button',{name:'Riprova',exact:true}).click();await page.locator('.qa-row').first().waitFor();assert.equal(await page.locator('.qa-row').count(),24);
 await go('/settings');assert.equal(await page.locator('#account-name').getAttribute('readonly'),'');await page.locator('#billing').evaluate(el=>el.scrollIntoView());const billing=await page.locator('#billing').boundingBox();assert.ok(billing.y>=0&&billing.y<768);assert.equal(await page.locator('.app-sidebar a[aria-current=page]').innerText(),'Impostazioni');
 const trigger=page.getByRole('button',{name:'Vai a una sezione (⌘K)'});await trigger.click();const dialog=page.getByRole('dialog');await dialog.waitFor();await page.getByRole('textbox',{name:'Cerca una sezione'}).fill('CV per posizione');assert.equal(await dialog.getByRole('button',{name:'CV per posizione'}).count(),1);await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>window.__navigation),'/materiali');await trigger.click();await page.keyboard.press('Escape');assert.equal(await trigger.evaluate(el=>document.activeElement===el),true);
 await go('/cv?empty=1');await page.locator('#profile-cv-upload').setInputFiles({name:'synthetic.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 synthetic')});await page.evaluate(()=>window.__fail=true);await page.getByRole('button',{name:'Carica il CV',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await page.locator('#profile-cv-upload').evaluate(el=>el.files.length),1);await page.evaluate(()=>window.__fail=false);await page.getByRole('button',{name:'Carica il CV',exact:true}).click();await page.getByRole('status').filter({hasText:'CV caricato'}).waitFor();assert.equal(await page.evaluate(()=>window.__refreshes),1);assert.equal(await page.evaluate(()=>window.__requests.some(r=>/trigger-first|applications/.test(r.path))),false);
 await go('/cv');await page.getByRole('button',{name:'Esperienza',exact:true}).click();await page.getByRole('button',{name:'Aggiungi',exact:true}).first().waitFor();assert.ok(await page.locator('.profile-scroll').evaluate(el=>el.scrollHeight>el.clientHeight));

 await go('/preferences');await page.getByRole('button',{name:'Off Nessun invio',exact:true}).click();await page.evaluate(()=>window.__holdPreferences=true);await page.getByRole('button',{name:'Salva',exact:true}).click();await page.getByRole('button',{name:'Manuale Chiede sempre conferma',exact:true}).click();await page.evaluate(()=>{window.__holdPreferences=false;window.__resolveSave()});await page.getByRole('button',{name:'Salva',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Salva',exact:true}).isEnabled(),true);await page.getByRole('button',{name:'Salva',exact:true}).click();await page.getByRole('button',{name:'Salvato',exact:true}).waitFor();
 await go('/settings?settings-error=1');await page.getByRole('alert').filter({hasText:'Stato del pagamento non disponibile'}).waitFor();await page.getByRole('alert').filter({hasText:'Il link di invito non è disponibile'}).waitFor();await page.evaluate(()=>window.__settingsFail=false);await page.getByRole('alert').filter({hasText:'Stato del pagamento'}).getByRole('button',{name:'Riprova'}).click();await page.getByRole('button',{name:'Carta e fatture',exact:true}).waitFor();await page.getByRole('alert').filter({hasText:'Il link di invito'}).getByRole('button',{name:'Riprova'}).click();await page.getByRole('textbox',{name:'Il tuo link di invito'}).waitFor();await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('fixture denial')}}}));await page.getByRole('button',{name:'Copia',exact:true}).click();await page.getByText('Copia fallita — copia manualmente',{exact:true}).waitFor();assert.equal(await page.getByText('Link copiato!',{exact:true}).count(),0);const cancel=page.getByRole('button',{name:'Cancella',exact:true});await cancel.click();await page.getByRole('dialog',{name:'Gestisci abbonamento'}).waitFor();await page.keyboard.press('Shift+Tab');assert.equal(await page.getByRole('dialog').evaluate(el=>el.contains(document.activeElement)),true);await page.keyboard.press('Escape');assert.equal(await cancel.evaluate(el=>document.activeElement===el),true);
 await page.setViewportSize({width:390,height:844});await go('/settings');const menu=page.getByRole('button',{name:'Apri menu',exact:true});await menu.click();await page.getByRole('dialog',{name:'Navigazione'}).waitFor();assert.equal(await page.locator('#main-content').getAttribute('inert'),'');await page.keyboard.press('Shift+Tab');assert.equal(await page.getByRole('dialog').evaluate(el=>el.contains(document.activeElement)),true);await page.keyboard.press('Escape');assert.equal(await menu.evaluate(el=>document.activeElement===el),true);
 await page.setViewportSize({width:1366,height:768});await go('/preferences');await page.getByRole('button',{name:'Tema chiaro',exact:true}).first().click();assert.equal(await page.locator('html').getAttribute('data-theme'),'light');await shot('preferences-light');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 await writeFile(join(out,'qa-result.json'),JSON.stringify({passed:true,fixtureOnly:true,font:fixtureFont,geometry,errors,external,checks:['16 real product/public views at 4 sizes','desktop main/document bounds','profile cards keep full content height and legible solid inputs','mobile horizontal fit','question failed load and retry','settings anchors and readonly identity','unified navigation','palette keyboard entry/escape/focus return','mobile focus trap','CV upload failure preservation/retry without sending','CV internal scrolling','light palette','save revision preserves concurrent edits','billing and referral load recovery','clipboard failure is truthful','subscription modal focus trap and escape']},null,2));
 console.log('PASS product consistency: 16 real views, 4 viewports, local interaction/recovery/keyboard checks; zero external requests.');
}finally{if(browser)await browser.close();await new Promise(yes=>server.close(yes))}
