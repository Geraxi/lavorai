const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const ts=require('typescript');
let user=null,reads=0,queries=[];
const output=ts.transpileModule(fs.readFileSync('src/app/api/autofill/cv/[id]/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const moduleExports={};
const localRequire=name=>{
 if(name==='@/lib/session')return{getCurrentUser:async()=>user};
 if(name==='@/lib/db')return{prisma:{cVDocument:{findFirst:async args=>{queries.push(args);return args.where.userId==='alice'&&args.where.id==='alice-doc'?{originalFilename:'synthetic.pdf',storagePath:'owned-file'}:null}}}};
 if(name==='@/lib/storage')return{readUserFile:async p=>{assert.equal(p,'owned-file');reads++;return Buffer.from('%PDF-synthetic')}};
 throw Error(name);
};
vm.runInNewContext(output,{exports:moduleExports,require:localRequire,Response,Uint8Array,encodeURIComponent});
const get=id=>moduleExports.GET(new Request('https://local.invalid'),{params:Promise.resolve({id})});
(async()=>{assert.equal((await get('alice-doc')).status,401);assert.equal(queries.length,0);user={id:'bob'};assert.equal((await get('alice-doc')).status,404);assert.equal(reads,0);user={id:'alice'};const r=await get('alice-doc');assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(await r.text(),'%PDF-synthetic');assert.equal(reads,1);assert(queries.every(q=>q.select.storagePath&&Object.keys(q.select).length===2));console.log('PASS CV download: unauthenticated and other-owner denied before file read; explicit own document only; no generation or writes.');})().catch(e=>{console.error(e);process.exitCode=1});
