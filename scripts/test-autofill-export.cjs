const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const ts=require('typescript');
let currentUser=null,reads=[];
const source=fs.readFileSync('src/app/(app)/autofill/page.tsx','utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
const moduleExports={};
const localRequire=name=>{
 if(name==='next/navigation')return{redirect:()=>{throw Error('redirect')}};
 if(name==='@/lib/session')return{getCurrentUser:async()=>currentUser};
 if(name==='@/lib/cv-profile-types')return{ExperienceSchema:require('zod').z.object({role:require('zod').z.string()})};
 if(name==='@/lib/db')return{prisma:{cVDocument:{findMany:async args=>{assert.equal(args.where.userId,currentUser.id);return[]}},cVProfile:{findUnique:async args=>{reads.push(args);return{firstName:'Synthetic',lastName:'Owner',email:currentUser.id+'@example.invalid',phone:'000',experiencesJson:'[]'}}}}};
 if(name==='@/components/autofill/contact-export')return{ContactExport:'ContactExport'};
 return require(name);
};
vm.runInNewContext(js,{exports:moduleExports,require:localRequire});
(async()=>{await assert.rejects(moduleExports.default(),/redirect/);assert.equal(reads.length,0);currentUser={id:'owner'};const result=await moduleExports.default();assert.deepEqual(JSON.parse(JSON.stringify(reads)),[{where:{userId:'owner'},select:{firstName:true,lastName:true,email:true,phone:true,experiencesJson:true}}]);const body=JSON.stringify(result);assert(body.includes('owner@example.invalid'));assert(!body.includes('storagePath'));currentUser={id:'another-user'};const second=JSON.stringify(await moduleExports.default());assert(second.includes('another-user@example.invalid'));assert(!second.includes('owner@example.invalid'));assert.equal(reads[1].where.userId,'another-user');console.log('PASS: unauthenticated export denied before DB; own-user projection only; no CV contents, secrets or write interfaces.');})().catch(e=>{console.error(e);process.exitCode=1});
