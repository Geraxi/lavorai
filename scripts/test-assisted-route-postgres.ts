import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {resolve} from 'node:path';import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';
import {NextRequest,NextResponse} from 'next/server';
async function main(){
 const url=new URL(process.env.ASSISTED_TEST_DATABASE_URL??'');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/lavorai_assisted_test');
 const keep={PATH:process.env.PATH,HOME:process.env.HOME};for(const k of Object.keys(process.env))delete process.env[k];Object.assign(process.env,keep,{NODE_ENV:'test',DATABASE_URL:url.href,DIRECT_URL:url.href,ASSISTED_OPPORTUNITIES_REVIEW:'true',APPLICATIONS_PAUSED:'false',APPLICATION_SENDING_MODE:'automatic',APPLICATION_PROVIDER_POLICY:'recruitee_only',APPLICATION_PROVIDER_NOT_BEFORE:'2026-10-27T23:16:58.626Z',APPLICATION_ROLLOUT_START_AT:'2026-10-27T23:16:58.626Z',APPLY_GLOBAL_DAILY_CAP:'5'});
 const req=createRequire(resolve('src/lib/db.ts'));const {prisma:db}=req('./db');assert.equal(Number((await db.$queryRawUnsafe("SELECT count(*) FROM pg_tables WHERE schemaname='public'"))[0].count),0);execFileSync(process.execPath,[resolve('node_modules/prisma/build/index.js'),'db','push','--skip-generate'],{env:process.env,stdio:'pipe'});
 function mock(path:string,exports:object){const id=req.resolve(path);req.cache[id]={id,filename:id,loaded:true,exports} as any;}
 let owner='synthetic-owner';class WError extends Error{constructor(public code:string,public status=400){super(code);}}
 mock('./workspace-mutation',{WorkspaceError:WError,workspaceReadOwner:async()=>{if(!owner)throw new WError('unauthenticated',401);return owner;},workspaceOwner:async(r:NextRequest)=>{if(r.headers.get('origin')!==r.nextUrl.origin)throw new WError('invalid_origin',403);if(!owner)throw new WError('unauthenticated',401);return owner;},workspaceError:(e:any)=>NextResponse.json({error:e.code??'service_unavailable'},{status:e.status??503})});
 mock('./storage',{readUserFile:async(path:string)=>{assert.equal(path,'synthetic-owned-cv');return Buffer.from('synthetic exact CV bytes');}});
 let gets=0;globalThis.fetch=async(input,init)=>{assert.equal(init?.method,'GET');assert.equal(String(input),'https://example.recruitee.com/api/offers/designer');gets++;return new Response(JSON.stringify({offer:{id:42,status:'published',options_cv:'required',open_questions:[{id:1,body:'Portfolio',kind:'string',required:true}]}}));};
 const route=req('../app/api/assisted-applications/route');
 const user=await db.user.create({data:{id:owner,email:'synthetic@example.test',name:'Synthetic',tier:'pro',subscriptionStatus:'active',currentPeriodEnd:new Date(Date.now()+86400000),emailVerified:new Date(),privacyConsentAt:new Date(),preferences:{create:{autoApplyMode:'hybrid',rolesJson:'["Graphic Designer"]',locationsJson:'["Milano"]',sourcesJson:'["recruitee"]',salaryMin:0}}}});
 await db.user.create({data:{id:'another-owner',email:'other-synthetic@example.test',tier:'pro',subscriptionStatus:'active',currentPeriodEnd:new Date(Date.now()+86400000),emailVerified:new Date(),privacyConsentAt:new Date(),preferences:{create:{autoApplyMode:'hybrid'}}}});
 const job=await db.job.create({data:{externalId:'42',source:'recruitee',title:'Graphic Designer',url:'https://example.recruitee.com/o/designer',description:'Synthetic design role',location:'Milano',applicationFormCapability:'questions',publicationVerifiedAt:new Date()}});
 const cv=await db.cVDocument.create({data:{userId:owner,originalFilename:'synthetic.pdf',storagePath:'synthetic-owned-cv',extractedText:'Synthetic'}});
 const call=(body:any,origin='http://localhost')=>route.POST(new NextRequest('http://localhost/api/assisted-applications',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}));
 try{
 assert.equal((await call({action:'prepare',jobId:job.id,cvId:cv.id},'https://evil.test')).status,403);
 const first=await call({action:'prepare',jobId:job.id,cvId:cv.id});assert.equal(first.status,200);let v=await first.json();assert.equal(await req('./application-worker-gates').reserveApplicationWork(v.id,db),null,'ordinary worker cannot claim assisted draft');
 const duplicate=await call({action:'prepare',jobId:job.id,cvId:cv.id});assert.equal((await duplicate.json()).id,v.id);assert.equal(await db.application.count(),1);
 assert.equal((await call({action:'approve',id:v.id,approve:true,reviewDigest:v.reviewDigest})).status,409);
 owner='another-owner';assert.equal((await route.GET(new NextRequest('http://localhost/api/assisted-applications?id='+v.id))).status,404);assert.equal((await call({action:'save',id:v.id,answers:{},cover:''})).status,404);owner=user.id;
 const saved=await call({action:'save',id:v.id,answers:{'1':'https://portfolio.example'},cover:'Candidate-written synthetic letter'});assert.equal(saved.status,200);v=await saved.json();
 await db.user.update({where:{id:owner},data:{privacyConsentAt:null}});assert.equal((await call({action:'approve',id:v.id,approve:true,reviewDigest:v.reviewDigest})).status,403);await db.user.update({where:{id:owner},data:{privacyConsentAt:new Date()}});
 const [a,b]=await Promise.all([call({action:'approve',id:v.id,approve:true,reviewDigest:v.reviewDigest}),call({action:'approve',id:v.id,approve:true,reviewDigest:v.reviewDigest})]);assert.deepEqual([a.status,b.status].sort(),[200,409]);
 assert.equal(await db.applicationSubmissionReservation.count(),1);
 const quotas=req('./daily-application-cap');assert.equal(await quotas.countDailyCapUsage(db,owner),1);
 await db.application.update({where:{id:v.id},data:{createdAt:new Date(Date.now()-86400000*3)}});assert.equal(await quotas.countDailyCapUsage(db,owner),1,'old draft approved today counts today');
 const cvResponse=await route.GET(new NextRequest('http://localhost/api/assisted-applications?id='+v.id+'&download=cv'));assert.equal(await cvResponse.text(),'synthetic exact CV bytes');
 const reported=await call({action:'report',id:v.id});assert.equal(reported.status,200);assert.equal((await reported.json()).verifiedAcceptance,false);
 assert.equal((await call({action:'report',id:v.id})).status,200);
 const row=await db.application.findUnique({where:{id:v.id}});assert.equal(row.status,'assisted_unconfirmed');assert.equal(await req('./application-worker-gates').reserveApplicationWork(row.id,db),null,'ordinary worker cannot retry external handoff');assert.equal(row.submittedAt,null);assert.equal(row.submissionReceiptJson,null);assert.equal(row.submitConfirmation,'UNCONFIRMED');
 assert.equal(await db.application.count({where:{status:'queued'}}),0);assert.equal(await db.applicationSubmissionReservation.count(),1);
 assert.equal((await call({action:'cancel',id:v.id})).status,409);
 process.env.ASSISTED_OPPORTUNITIES_REVIEW='false';assert.equal((await route.GET(new NextRequest('http://localhost/api/assisted-applications?id='+v.id))).status,404);
 // Fresh synthetic run of the actual React workspace against these actual routes and PG.
 process.env.ASSISTED_OPPORTUNITIES_REVIEW='true';
 await db.applicationSubmissionReservation.deleteMany();await db.application.deleteMany();
 const bundled=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {AssistedWorkspace} from './src/app/(app)/jobs/review/[id]/workspace';createRoot(document.getElementById('root')).render(<AssistedWorkspace jobId=${JSON.stringify(job.id)}/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic'});
 const server=createServer(async(request,response)=>{try{
  if(request.url==='/bundle.js'){response.setHeader('Content-Type','text/javascript');response.end(bundled.outputFiles[0].text);return;}
  if(!request.url?.startsWith('/api/')){response.setHeader('Content-Type','text/html');response.end('<!doctype html><div id="root"></div><script src="/bundle.js"></script>');return;}
  const chunks:Buffer[]=[];for await(const chunk of request)chunks.push(Buffer.from(chunk));
  const input=new NextRequest('http://'+request.headers.host+request.url,{method:request.method,headers:request.headers as Record<string,string>,...(request.method==='POST'?{body:Buffer.concat(chunks).toString()}: {})});
  const out=request.method==='POST'?await route.POST(input):await route.GET(input);response.writeHead(out.status,Object.fromEntries(out.headers));response.end(Buffer.from(await out.arrayBuffer()));
 }catch{response.statusCode=500;response.end('synthetic failure');}});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const base='http://localhost:'+(server.address() as any).port;
 const browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})});try{const page=await browser.newPage();await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 await page.goto(base);await page.getByLabel('CV da utilizzare').selectOption(cv.id);const preparedResponse=page.waitForResponse(r=>r.url().endsWith('/api/assisted-applications')&&r.request().method()==='POST');await page.getByRole('button',{name:'Prepara senza inviare'}).click();const preparedHTTP=await preparedResponse;assert.equal(preparedHTTP.status(),200,await preparedHTTP.text());console.log('PASS browser prepared');
 await page.getByLabel('Portfolio', {exact:false}).fill('https://synthetic.example/portfolio');await page.getByRole('button',{name:'Salva risposte'}).click();
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Conferma preparazione'}).click();
 await page.getByRole('link',{name:'Apri modulo del datore di lavoro'}).waitFor();assert.equal(await page.getByRole('link',{name:'Apri modulo del datore di lavoro'}).getAttribute('href'),'https://example.recruitee.com/o/designer/c/new');
 await page.reload();await page.getByRole('button',{name:'Dichiaro di aver inviato — non verificato'}).click();await page.getByText('Hai dichiarato l’invio.',{exact:false}).waitFor();
 mkdirSync('output/playwright',{recursive:true});await page.screenshot({path:'output/playwright/assisted-unconfirmed.png',fullPage:true});
 const final=await db.application.findFirst();assert.equal(final.status,'assisted_unconfirmed');assert.equal(final.submissionReceiptJson,null);assert.equal(await db.applicationSubmissionReservation.count(),1);
 console.log('PASS actual React browser → actual API handlers → PostgreSQL → return/reload → reported, not verified. All browser external requests blocked.');
 }finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
 console.log(JSON.stringify({result:'PASS',applications:1,reservations:1,verifiedSubmissions:0,queued:0,providerGETs:gets,providerPOSTs:0,checks:'real route + disposable PostgreSQL; auth identity/storage/provider GET boundaries faked; origin, ownership, duplicate preparation, required answer, concurrent approval, exact download bytes, repeated report, disabled gate'}));
 }finally{await db.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
