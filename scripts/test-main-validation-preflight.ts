import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {createHash} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
let email='umbertogeraci0@gmail.com',reads=0;
const secretText='Sensitive fixture text: passport number. Do not expose this content.';
const docs=[{id:'cv-one',originalFilename:'current-cv.pdf',createdAt:new Date(),extractedText:secretText}];
const read=(value:any)=>(args:any)=>{assert.equal(args.where.userId,'owner-id');reads++;return Promise.resolve(value);};
const db={cVDocument:{findMany:read(docs)},cVProfile:{findUnique:read({firstName:'Owner',lastName:'Name',summary:'',experiencesJson:'[]',educationJson:'[]',skillsJson:'[]'})}};
const js=ts.transpileModule(fs.readFileSync('src/app/api/admin/ordinary-validation/main-account/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports:any={};
new Function('require','exports',js)((name:string)=>{
 if(name==='next/server')return{NextRequest,NextResponse};
 if(name==='node:crypto')return{createHash};
 if(name.endsWith('/session'))return{getCurrentUser:async()=>({id:'owner-id',email})};
 if(name.endsWith('/admin'))return{isAdmin:()=>true};
 if(name.endsWith('/db'))return{prisma:db};
 if(name.endsWith('/ordinary-validation-preflight'))return{ordinaryValidationPreflight:async(_db:any,_now:any,scope:any)=>{assert.deepEqual(scope,{userId:'owner-id',email:'umbertogeraci0@gmail.com'});return{status:'unknown',profile:{exists:true,cvDocumentCount:1,phonePresent:true},unknowns:['synthetic_document_content_not_inspected']};}};
 throw Error('unexpected dependency '+name);
},exports);
async function main(){
 const url='https://lavorai.it/api/admin/ordinary-validation/main-account';
 email='umbertogeraci0+lavorai-ats@gmail.com';assert.equal((await exports.GET(new NextRequest(url))).status,403);assert.equal(reads,0);
 email='umbertogeraci0@gmail.com';assert.equal((await exports.GET(new NextRequest(url+'?userId=other'))).status,400);assert.equal(reads,0);
 const response=await exports.GET(new NextRequest(url));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
 const body=await response.json();assert.equal(body.selectedAccount.id,'owner-id');assert.equal(body.cvSelection.selected.filename,'current-cv.pdf');assert.ok(body.cvSelection.possibleSensitiveMarkers.includes('government_identifier'));
 assert.ok(!JSON.stringify(body).includes(secretText));assert.equal(body.cvSelection.contentReviewComplete,false);assert.equal(body.cvSelection.ambiguous,false);
 docs.push({...docs[0],id:'cv-two'});const second=await (await exports.GET(new NextRequest(url))).json();assert.equal(second.cvSelection.ambiguous,true);
 assert.equal(typeof exports.POST,'undefined');
 console.log('PASS exact main-account metadata GET: no writes/providers, aliases denied, source selection/ambiguity, sensitive content withheld');
}
main().catch(e=>{console.error(e);process.exitCode=1});
