import * as form from '../src/lib/recruitee-form-capability';
import * as policy from '../src/lib/application-provider-policy';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
let calls=0;let answer='not sure';
const module={exports:{} as any};
const deps:Record<string,unknown>={
 '@/lib/recruitee-form-capability':form,
 '@/lib/application-provider-policy':policy,
 '@/lib/ats-test-capability':{allowUnpublishedRecruiteeOffer:()=>false},
 './submission-proof':{},
 'node:fs/promises':{readFile:()=>{throw Error('pending answer must stop before attachment/transmission')}},
 './ai-answer':{answerOffline:async()=>({given:[],answers:new Map([[0,answer]])})},
 './web-form':{buildAnswerContext:()=>({})},
};
vm.runInNewContext(ts.transpileModule(readFileSync('src/lib/portal-adapters/recruitee.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
 module,exports:module.exports,require:(id:string)=>{assert.ok(id in deps,id);return deps[id]},URL,AbortSignal,Map,Set,
 fetch:async(_url:string,init:any)=>{assert.notEqual(init?.method,'POST');calls++;return{ok:true,json:async()=>({offer:{status:'published',captcha:false,open_questions:[{id:1,required:true,kind:'boolean',body:'Are you authorized to work here?'}]}})}}
});
(async()=>{for(answer of ['unknown','yes, if sponsored','no idea']){const result=await module.exports.recruiteeAdapter.apply(null,{jobUrl:'https://fixture.recruitee.com/o/engineer',profile:{}});assert.equal(result.status,'needs_user_input');assert.equal(result.pendingQuestions.length,1);}assert.equal(calls,3);console.log('PASS actual Recruitee adapter: ambiguous required booleans hand off before files/POST; fake GET only');})().catch(e=>{console.error(e);process.exitCode=1});
