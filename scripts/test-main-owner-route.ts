import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {NextRequest,NextResponse} from 'next/server';
let admin=true,mutations=0,claims=0,sends=0,closes=0,throwSend=false,allowClaim=true;
const js=ts.transpileModule(fs.readFileSync('src/app/api/admin/ordinary-validation/main-owner/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
class MainOwnerError extends Error{}
const owner={MAIN_VALIDATION_APP:'fixed',MainOwnerError,mainOwnerState:async()=>({readOnly:true}),prepareMainApplication:async()=>{mutations++;return{};},verifyMainRecipient:async()=>{mutations++;return{};},closeMainInvocation:async()=>{closes++;return{};},claimMainInvocation:async()=>{if(!allowClaim)throw new MainOwnerError('not_verified');claims++;}};
const exports:any={};
new Function('require','exports',js)((name:string)=>{
 if(name==='next/server')return{NextRequest,NextResponse};
 if(name.endsWith('/session'))return{getCurrentUser:async()=>admin?{id:'actor',email:'admin@example.test'}:null};
 if(name.endsWith('/admin'))return{isAdmin:(email:string)=>email==='admin@example.test'};
 if(name.endsWith('/csrf'))return{checkOrigin:(r:NextRequest)=>r.headers.get('origin')==='https://lavorai.it'};
 if(name.endsWith('/db'))return{prisma:{}};
 if(name.endsWith('/ordinary-main-validation-owner'))return owner;
 if(name.endsWith('/ordinary-main-validation-scope'))return{MAIN_VALIDATION_USER:'actor',MAIN_VALIDATION_EMAIL:'admin@example.test'};
 if(name.endsWith('/application-worker'))return{processApplication:async(id:string,...args:any[])=>{assert.equal(id,'fixed');assert.equal(args.length,0,'no diagnostic token or force options');sends++;if(throwSend)throw Error('uncertain');}};
 throw Error(name);
},exports);
const url='https://lavorai.it/api/admin/ordinary-validation/owner';
const post=(body:any,origin='https://lavorai.it')=>new NextRequest(url,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
async function main(){
 assert.equal((await exports.GET(new NextRequest(url))).status,200);assert.equal(mutations+sends+claims+closes,0);
 admin=false;assert.equal((await exports.POST(post({action:'prepare',cvId:'cv',cvHash:'hash',confirmCurrentRealCV:true}))).status,403);assert.equal((await exports.GET(new NextRequest(url))).status,403);admin=true;
 assert.equal((await exports.POST(post({action:'prepare',cvId:'cv',cvHash:'hash',confirmCurrentRealCV:true},'https://evil.invalid'))).status,403);
 assert.equal((await exports.POST(post({action:'prepare',cvId:'cv',cvHash:'hash',confirmCurrentRealCV:false}))).status,400);
 assert.equal((await exports.POST(post({action:'prepare',cvId:'cv',cvHash:'hash',confirmCurrentRealCV:true,userId:'other'}))).status,400);
 assert.equal(mutations+sends+claims+closes,0);
 assert.equal((await exports.POST(post({action:'prepare',cvId:'cv',cvHash:'hash',confirmCurrentRealCV:true}))).status,200);assert.equal(mutations,1);assert.equal(sends,0);
 assert.equal((await exports.POST(post({action:'run',confirmOneSubmission:false}))).status,400);
 allowClaim=false;assert.equal((await exports.POST(post({action:'run',confirmOneSubmission:true}))).status,409);assert.equal(sends,0);allowClaim=true;
 throwSend=true;assert.equal((await exports.POST(post({action:'run',confirmOneSubmission:true}))).status,409);assert.equal(sends,1);assert.equal(closes,1,'finally closes after uncertainty');
 throwSend=false;assert.equal((await exports.POST(post({action:'run',confirmOneSubmission:true}))).status,200);assert.equal(closes,2);
 const panel=fs.readFileSync('src/app/(app)/admin/ordinary-validation/main/panel.tsx','utf8');
 assert.ok(!panel.includes('useEffect'));assert.ok(panel.includes("useState('')"));assert.ok(panel.includes("window.confirm"));assert.ok(panel.includes('disabled={busy||!ready}'));
 console.log('PASS owner route: auth/origin/explicit consent, fixed scope, GET inert, no diagnostic bypass, closure on failure, UI has no load effects');
}
main().catch(e=>{console.error(e);process.exitCode=1});
