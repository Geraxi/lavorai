import { Stagehand } from '@browserbasehq/stagehand';
import type { FieldObserver } from '../../src/lib/local-workspace/contact-observer';

type Model = NonNullable<ConstructorParameters<typeof Stagehand>[0]['model']>;
/** Explicitly configured local observation only. No implicit model/account selection. */
export async function createStagehandObserver(options: {
 enabled: boolean; cdpUrl: string; model: Model; syntheticOnly: true;
}) {
 if (!options.enabled || process.env.NODE_ENV === 'production' || options.syntheticOnly !== true) throw Error('Observer disabled');
 const url = new URL(options.cdpUrl);
 if (url.protocol !== 'ws:' || !['127.0.0.1','localhost'].includes(url.hostname) || url.username || url.password) throw Error('Local CDP required');
 if (!options.model || typeof options.model === 'string' || !('apiKey' in options.model) || !options.model.apiKey) throw Error('Explicit model configuration required; ambient credentials are not used');
 const modelEndpoint = 'baseURL' in options.model && options.model.baseURL ? new URL(options.model.baseURL) : null;
 if (!modelEndpoint || modelEndpoint.protocol !== 'http:' || !['127.0.0.1','localhost'].includes(modelEndpoint.hostname) || modelEndpoint.username || modelEndpoint.password) throw Error('Free local model endpoint required; paid providers disabled');
 const stagehand = new Stagehand({env:'LOCAL',model:options.model,
  localBrowserLaunchOptions:{cdpUrl:options.cdpUrl},disableAPI:true,serverCache:false,
  verbose:0,disablePino:true,logger:()=>{},logInferenceToFile:false,selfHeal:false,waitForCaptchaSolves:false});
 try {await stagehand.init();} catch {await stagehand.close().catch(()=>{});throw new Error('Local observer initialization failed');}
 let timedOut=false;
 const observe:FieldObserver=async(page,field)=>{
  if(timedOut)throw Error('Observer unavailable after timeout; use deterministic mapping or review');
  if (!/^https:\/\/compatibility\.invalid\/(lever|greenhouse|ashby)$/.test(page.url())) throw Error('Synthetic fixture required');
  // Do not send candidate values in the prompt. The page must contain only synthetic data.
  const actions=await boundedObservation(stagehand.observe(`Locate only the editable applicant ${field} contact input. Return fill actions only. Do not interact, submit, answer screening questions, or select consent.`,{page,timeout:10_000,serverCache:false}),()=>{timedOut=true;});
  return actions.map(({selector,method})=>({selector,method:method ?? 'unsupported'}));
 };
 return {observe,close:()=>stagehand.close()};
}

/** A stalled SDK call cannot hold the coordinator indefinitely. Underlying inference may finish later; never reuse this observer after expiry. */
export async function boundedObservation<T>(work:Promise<T>,expire:()=>void,ms=15_000):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 return Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{expire();reject(Error('Local observation deadline exceeded'));},ms);})]).finally(()=>{if(timer)clearTimeout(timer);});
}
