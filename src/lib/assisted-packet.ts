import {createHash} from 'node:crypto';
import {canonicalRecruiteeOffer} from './recruitee-form-capability';
export type ReviewQuestion={id:string;label:string;options:string[];required:boolean;unsupported:boolean};
export type AssistedPacket={version:1;kind:'assisted';state:'draft'|'handoff'|'reported'|'cancelled';url:string;formHash:string;questions:ReviewQuestion[];cvId:string;cvName:string;coverRequired:boolean;cover:string;answers:Record<string,string>;approvedAt?:string};
export function digest(value:unknown){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
const plain=(value:unknown)=>String(value??'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,2000);
export function formSnapshot(offer:Record<string,unknown>,externalId:string){
 if(String(offer.id)!==externalId||offer.status!=='published'||!Array.isArray(offer.open_questions))throw Error('offer_unavailable');
 const questions:ReviewQuestion[]=offer.open_questions.filter((q:any)=>q.kind!=='infobox').map((q:any)=>{
  if(!q||!q.id||typeof q.required!=='boolean')throw Error('form_unknown');
  const kind=String(q.kind);const options=kind==='boolean'?['Yes','No']:Array.isArray(q.open_question_options)?q.open_question_options.map((x:any)=>plain(x.body)):[];
  return {id:String(q.id),label:plain(q.body),required:q.required,options,unsupported:!['text','string','single_line','single_choice','multiple_choice','boolean'].includes(kind)||kind==='multiple_choice'};
 });
 if(questions.length>50||new Set(questions.map(q=>q.id)).size!==questions.length)throw Error('form_unknown');
 const required=(v:unknown)=>v===true||v==='required'||v==='on';
 for(const [k,v] of Object.entries(offer))if(k.startsWith('options_')&&required(v)&&!['options_cv','options_cover_letter','options_phone','options_name','options_email','options_referrer'].includes(k))questions.push({id:k,label:plain(k),options:[],required:true,unsupported:true});
 const coverRequired=required(offer.options_cover_letter);
 return {questions,coverRequired,formHash:digest([questions,coverRequired,offer.options_cv,offer.options_phone])};
}
export async function readAssistedForm(url:string,externalId:string,fetcher:typeof fetch=fetch){
 const canonical=canonicalRecruiteeOffer(url);if(!canonical)throw Error('invalid_destination');
 const u=new URL(canonical);const r=await fetcher(`${u.origin}/api/offers/${encodeURIComponent(u.pathname.split('/')[2])}`,{method:'GET',redirect:'error',signal:AbortSignal.timeout(12000),headers:{Accept:'application/json'}});
 if(!r.ok||!r.body)throw Error('offer_unavailable');const reader=r.body.getReader();const chunks:Uint8Array[]=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1_000_000){await reader.cancel();throw Error('form_too_large');}chunks.push(value);}
 return formSnapshot(JSON.parse(Buffer.concat(chunks).toString('utf8')).offer,externalId);
}
export function parsePacket(raw:string|null):AssistedPacket {const p=JSON.parse(raw??'null');if(p?.version!==1||p.kind!=='assisted'||!canonicalRecruiteeOffer(p.url))throw Error('not_assisted');return p;}
export function revisePacket(p:AssistedPacket,answers:Record<string,string>,cover:string){
 if(p.state!=='draft')throw Error('already_handed_off');
 if(typeof cover!=='string'||cover.length>10000||!answers||Array.isArray(answers)||typeof answers!=='object')throw Error('invalid_answers');
 const valid=new Set(p.questions.map(q=>q.id));const clean:Record<string,string>={};
 for(const [id,value] of Object.entries(answers)){if(!valid.has(id)||typeof value!=='string'||value.length>2000)throw Error('invalid_answers');const q=p.questions.find(x=>x.id===id)!;if(value&&q.options.length&&!q.options.includes(value))throw Error('invalid_option');clean[id]=value.trim();}
 return {...p,answers:clean,cover:cover.trim()};
}
export function approvePacket(p:AssistedPacket,expectedDigest:string,formHash:string,now=new Date()){
 if(p.state!=='draft')throw Error('already_handed_off');if(expectedDigest!==digest(p))throw Error('review_changed');if(formHash!==p.formHash)throw Error('form_changed');
 if(p.questions.some(q=>q.required&&(q.unsupported||!p.answers[q.id]))||p.coverRequired&&!p.cover.trim())throw Error('answers_incomplete');
 return {...p,state:'handoff' as const,approvedAt:now.toISOString()};
}
export function finishPacket(p:AssistedPacket,action:'report'|'cancel'){
 if(action==='report'){if(p.state!=='handoff'&&p.state!=='reported')throw Error('handoff_required');return {...p,state:'reported' as const};}
 if(p.state==='reported')throw Error('outcome_unconfirmed');return {...p,state:'cancelled' as const};
}
