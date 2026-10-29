import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createStagehandObserver} from '../tools/stagehand-observer/adapter';
async function main(){
 const config={enabled:true,syntheticOnly:true as const,cdpUrl:'ws://127.0.0.1:1',model:{modelName:'openai/local-fixture' as const,apiKey:'synthetic-local-placeholder',baseURL:'http://127.0.0.1:1/v1'}};
 await assert.rejects(createStagehandObserver({...config,enabled:false}),/disabled/);
 await assert.rejects(createStagehandObserver({...config,model:{...config.model,baseURL:'https://api.openai.com/v1'}}),/Free local/);
 const ownedBrowser=await chromium.launch({headless:true,args:['--remote-debugging-port=19377','--remote-debugging-address=127.0.0.1']});
 let observer:Awaited<ReturnType<typeof createStagehandObserver>>|undefined;
 try{
 const metadata=await (await fetch('http://127.0.0.1:19377/json/version')).json() as {webSocketDebuggerUrl:string};
 observer=await createStagehandObserver({...config,cdpUrl:metadata.webSocketDebuggerUrl});
 const browser=await chromium.connectOverCDP('http://127.0.0.1:19377');const page=await browser.contexts()[0].newPage();
 await assert.rejects(observer.observe(page,'name'),/Synthetic fixture/);
 console.log('PASS real Stagehand 3.7.3 initialization/CDP attachment and page rejection; no model inference attempted');
 }finally{await observer?.close();await ownedBrowser.close();}
}
void main();
