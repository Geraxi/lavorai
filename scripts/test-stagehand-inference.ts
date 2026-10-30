import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {fillObservedContact} from '../src/lib/local-workspace/contact-observer';
import {createStagehandObserver} from '../tools/stagehand-observer/adapter';
async function main(){
 const config={enabled:true,syntheticOnly:true as const,cdpUrl:'ws://127.0.0.1:1',model:{modelName:'openai/qwen2.5:3b' as const,apiKey:'synthetic-local-placeholder',baseURL:'http://127.0.0.1:11439/v1'}};
 await assert.rejects(createStagehandObserver({...config,enabled:false}),/disabled/);
 await assert.rejects(createStagehandObserver({...config,model:{...config.model,baseURL:'https://api.openai.com/v1'}}),/Free local/);
 const ownedBrowser=await chromium.launch({headless:true,args:['--remote-debugging-port=19377','--remote-debugging-address=127.0.0.1']});
 let observer:Awaited<ReturnType<typeof createStagehandObserver>>|undefined;
 try{
 const metadata=await (await fetch('http://127.0.0.1:19377/json/version')).json() as {webSocketDebuggerUrl:string};
 observer=await createStagehandObserver({...config,cdpUrl:metadata.webSocketDebuggerUrl});
 const browser=await chromium.connectOverCDP('http://127.0.0.1:19377');const page=await browser.contexts()[0].newPage();
 await assert.rejects(observer.observe(page,'name'),/Synthetic fixture/);
 let external=0,posts=0;
 await page.context().route('**/*',r=>{if(r.request().method()!=='GET'){posts++;return r.abort();}if(r.request().url()!=='https://compatibility.invalid/lever'){external++;return r.abort();}return r.fulfill({contentType:'text/html',body:'<form><label for="name">Full name</label><input id="name" autocomplete="name"><button>Submit</button></form>'});});
 await page.goto('https://compatibility.invalid/lever');
 const started=Date.now();
 const result=await fillObservedContact({enabled:true,page,owner:'synthetic',revision:1,snapshot:{owner:'synthetic',facts:{name:{value:'Synthetic Alex',provenance:'Synthetic fixture'}}},field:'name',observe:observer.observe,guard:()=>({owner:'synthetic',revision:1,controller:'agent',terminal:false})});
 assert.equal(result.status,'filled');assert.equal(await page.locator('#name').inputValue(),'Synthetic Alex');assert.equal(external,0);assert.equal(posts,0);
 console.log('PASS actual local qwen2.5:3b observation and guarded fill; latencyMs='+String(Date.now()-started)+'; external=0; posts=0');
 }finally{await observer?.close();await ownedBrowser.close();}
}
void main();
