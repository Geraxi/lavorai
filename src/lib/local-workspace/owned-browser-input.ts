import {createHash} from 'node:crypto';
import type {ContactSnapshot} from './contact-observer';
/** Inject existing owner-filtered readers; no DB/client/environment access in this module. */
export async function loadOwnedBrowserInput(input:{enabled:boolean;owner:string;applicationId:string;documentId:string;leaseToken:string;expectedDocumentHash:string}, readers:{
 application:(id:string,owner:string)=>Promise<{id:string;userId:string;leaseToken:string|null;leaseExpiresAt:Date|null;submitStartedAt:Date|null;completedAt:Date|null}|null>;
 profile:(owner:string)=>Promise<{userId:string;firstName:string;lastName:string;email:string;phone:string|null}|null>;
 document:(id:string,owner:string)=>Promise<{id:string;userId:string;originalFilename:string;storagePath:string}|null>;
 file:(path:string)=>Promise<Buffer>;
}) {
 if(!input.enabled||process.env.NODE_ENV==='production')throw Error('Browser input disabled');
 const check=async()=>{const app=await readers.application(input.applicationId,input.owner);
 if(!app||app.id!==input.applicationId||app.userId!==input.owner||!input.leaseToken||app.leaseToken!==input.leaseToken||!app.leaseExpiresAt||+app.leaseExpiresAt<=Date.now()||app.submitStartedAt||app.completedAt)throw Error('Live owned pre-submission lease required');};
 await check();
 const [profile,doc]=await Promise.all([readers.profile(input.owner),readers.document(input.documentId,input.owner)]);
 if(!profile||profile.userId!==input.owner||!doc||doc.id!==input.documentId||doc.userId!==input.owner)throw Error('Owned profile/document unavailable');
 const type=doc.originalFilename.toLowerCase().endsWith('.pdf')?'application/pdf':null;
 if(!type)throw Error('Unsupported document type');
 const bytes=await readers.file(doc.storagePath);
 if(bytes.length>10_000_000||bytes.subarray(0,5).toString()!=='%PDF-')throw Error('Invalid PDF');
 const sha256=createHash('sha256').update(bytes).digest('hex');
 if(sha256!==input.expectedDocumentHash)throw Error('Selected document changed; review required');
 await check();
 const snapshot:ContactSnapshot={owner:input.owner,facts:{name:{value:[profile.firstName,profile.lastName].filter(Boolean).join(' '),provenance:'Owned CV profile'},email:{value:profile.email,provenance:'Owned CV profile'},...(profile.phone?{phone:{value:profile.phone,provenance:'Owned CV profile'}}:{})}};
 return {snapshot,document:{id:input.documentId,name:doc.originalFilename,type,bytes,sha256}};
}
