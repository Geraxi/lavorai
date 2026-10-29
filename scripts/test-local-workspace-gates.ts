import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
import {GET,POST} from '../src/app/api/local-workspace/route';
async function main(){
 const env=process.env as Record<string,string|undefined>;const prior=env.NODE_ENV,flag=env.LOCAL_WORKSPACE_DEMO;
 try{
  env.NODE_ENV='production';env.LOCAL_WORKSPACE_DEMO='1';assert.equal((await GET(new NextRequest('http://127.0.0.1:3077/api/local-workspace',{headers:{host:'127.0.0.1:3077'}}))).status,404);
  env.NODE_ENV='development';delete env.LOCAL_WORKSPACE_DEMO;assert.equal((await GET(new NextRequest('http://127.0.0.1:3077/api/local-workspace',{headers:{host:'127.0.0.1:3077'}}))).status,404);
  env.LOCAL_WORKSPACE_DEMO='1';assert.equal((await POST(new NextRequest('http://127.0.0.1:3077/api/local-workspace',{method:'POST',headers:{host:'outside.invalid',origin:'http://outside.invalid'},body:'{"action":"create"}'}))).status,404);
  assert.equal((await POST(new NextRequest('http://127.0.0.1:3077/api/local-workspace',{method:'POST',headers:{host:'127.0.0.1:3077',origin:'https://outside.invalid'},body:'{"action":"create"}'}))).status,403);
  console.log('PASS API fail-closed: production, disabled flag, non-loopback host and cross-origin requests; no session created.');
 }finally{if(prior===undefined)delete env.NODE_ENV;else env.NODE_ENV=prior;if(flag===undefined)delete env.LOCAL_WORKSPACE_DEMO;else env.LOCAL_WORKSPACE_DEMO=flag;}
}
main().catch(e=>{console.error(e);process.exitCode=1});
