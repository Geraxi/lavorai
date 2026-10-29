import type {Page} from 'playwright';
import {ProviderFixtureAdapter,fixtureOrigin,type FixtureProvider,type ExplicitAnswers} from './provider-fixtures';
import {checkControl} from './control';
import {fillObservedContact,knownContactObserver,type ContactSnapshot,type FieldObserver} from './contact-observer';
/** Disabled local integration seam: never a production adapter registration. */
export class LocalProviderCoordinator {
 private adapter:ProviderFixtureAdapter;
 private state:{owner:string;revision:number;busy:boolean;expiresAt:number;status:string};
 constructor(private page:Page,provider:FixtureProvider,owner:string,enabled=false,ttl=60_000){
  if(!enabled||!['lever','greenhouse','ashby'].includes(provider)||process.env.NODE_ENV==='production'||page.url()!==fixtureOrigin+'/'+provider)throw Error('Local provider integration disabled');
  this.adapter=new ProviderFixtureAdapter(page,provider);
  this.state={owner,revision:0,busy:false,expiresAt:Date.now()+ttl,status:'ready'};
 }
 snapshot(owner:string){if(owner!==this.state.owner)throw Error('Session unavailable');return {revision:this.state.revision,status:this.state.status,expiresAt:this.state.expiresAt};}
 /** Optional recovery for contact fields only; observation has no submit capability. */
 async observeContact(owner:string,revision:number,snapshot:ContactSnapshot,field:'name'|'email'|'phone',observe:FieldObserver=knownContactObserver){
  checkControl(this.state,owner,revision);
  this.state.busy=true;this.state.revision++;
  const reservedRevision=this.state.revision;
  try{return await fillObservedContact({enabled:true,page:this.page,owner,revision:reservedRevision,snapshot,field,observe,
   guard:()=>({owner:this.state.owner,revision:this.state.revision,controller:'agent',terminal:Date.now()>=this.state.expiresAt||['submitting','accepted','rejected','unknown','closed'].includes(this.state.status)})});}
  finally{this.state.busy=false;}
 }
 async act(owner:string,revision:number,action:'prepare'|'answer'|'letter'|'submit',answers?:ExplicitAnswers){
  checkControl(this.state,owner,revision);
  this.state.busy=true;this.state.revision++;
  let crossing=false;
  try{
   if(action==='prepare'){await this.adapter.prepare();this.state.status='awaiting_answers';}
   else if(action==='answer'){const pending=await this.adapter.answer(answers??{});this.state.status=pending.length?'awaiting_answers':'prepared';}
   else if(action==='letter')await this.adapter.attachLetter();
   else if(action==='submit'){
    if(this.state.status!=='prepared')throw Error('Explicit answers required');
    await this.adapter.validate();
    if(Date.now()>=this.state.expiresAt)throw Error('Session expired before submission');
    crossing=true;this.state.status='submitting';
    const outcome=await this.adapter.submit();
    this.state.status=outcome==='accepted'||outcome==='rejected'?outcome:'unknown';
   }else throw Error('Unknown local action');
   return this.snapshot(owner);
  }catch(e){if(crossing)this.state.status='unknown';throw e;}finally{this.state.busy=false;}
 }
}
