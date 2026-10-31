import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as form from '../src/lib/recruitee-form-capability';
const standard={id:1,status:'published',options_cv:'required',open_questions:[]};
let offer:Record<string,unknown>=standard,posts=0,reads=0;
const module={exports:{} as any};
const deps:Record<string,unknown>={
 '@/lib/recruitee-form-capability':form,
 '@/lib/application-provider-policy':{providerPolicy:()=>({restricted:true})},
 '@/lib/ats-test-capability':{allowUnpublishedRecruiteeOffer:()=>false,recheckAtsTestBeforeSubmitHttp:()=>({ok:true})},
 './submission-proof':{verifySubmissionResponse:()=>({receipt:null})},
 'node:fs/promises':{readFile:async()=>{reads++;return Buffer.from('synthetic CV')}},
 './ai-answer':{answerOffline:async()=>({given:[],answers:new Map()})},
 './web-form':{buildAnswerContext:()=>({})},
};
vm.runInNewContext(ts.transpileModule(readFileSync('src/lib/portal-adapters/recruitee.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
 module,exports:module.exports,require:(id:string)=>{assert.ok(id in deps,id);return deps[id]},URL,AbortSignal,Map,Set,FormData,Blob,
 fetch:async(_url:string,init:any)=>{if(init?.method==='POST'){posts++;return {status:500,text:async()=>''}}return {ok:true,json:async()=>({offer})};}
});
async function main(){
for(const patch of [{},{captcha:'invisible'},{captcha:true},{captcha_required:true},{captcha:false,hcaptcha:true},{captcha:'disabled',hcaptcha_required:true},{captcha:'none',hcaptcha_required:'false'}]){
 offer={...standard,...patch};assert.equal(form.classifyRecruiteeForm(offer),'unknown');
 for(const auth of [undefined,{synthetic:true}]){
 const r=await module.exports.recruiteeAdapter.apply(null,{jobUrl:'https://fixture.recruitee.com/o/example',profile:{},atsTestAuth:auth});
 assert.equal(r.ok,false);assert.equal(r.status,'not_eligible');assert.equal(r.refusedBeforeSubmit,true);
 }
}
assert.equal(posts,0);assert.equal(reads,0,'refuse before CV access');
offer={...standard,captcha:false,hcaptcha:false};assert.equal(form.classifyRecruiteeForm(offer),'standard');
const input={jobUrl:'https://fixture.recruitee.com/o/example',profile:{firstName:'Synthetic',email:'fixture@example.invalid'},cvLocalPath:'synthetic.pdf',beforeSubmit:async()=>true};
assert.equal((await module.exports.recruiteeAdapter.apply(null,{...input,dryRun:true})).confirmation,'DRY_RUN');assert.equal(posts,0);
const uncertain=await module.exports.recruiteeAdapter.apply(null,input);assert.equal(uncertain.status,'submission_unconfirmed');assert.equal(posts,1,'no internal retry after uncertain response');
const worker=readFileSync('src/lib/application-worker.ts','utf8');assert.match(worker,/outcome.status === "needs_user_input" && outcome.pendingQuestions\?\.length/,'challenge hold cannot attest an answer-resume proof');
console.log('PASS challenge required/unknown/invisible/conflicting metadata hold before CV or POST; explicit synthetic clear evidence; diagnostic cannot bypass; uncertain response one POST and no retry; no empty answer attestation');
}
main().catch(e=>{console.error(e);process.exitCode=1});
