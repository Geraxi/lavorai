import {createHash} from 'node:crypto';
import type {Prisma} from '@prisma/client';
export const MAIN_VALIDATION_USER='cmo9z6ueg0000ie042ksa0i31';
export const MAIN_VALIDATION_EMAIL='umbertogeraci0@gmail.com';
export const MAIN_VALIDATION_APP='ordinary_validation_main_produzioneweb_20261026';
export const MAIN_VALIDATION_OFFER='https://produzioneweb.recruitee.com/o/lavorai-test-ordinary-validation';
export type MainValidationMeta={kind:'main-ordinary-validation-v1';state:'prepared'|'verified'|'running'|'closed';preparedAt:string;cvId:string;cvHash:string;profileHash:string;recipient?:string;receivingEvidence?:string;verifiedAt?:string;closedAt?:string};
export const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export function mainMeta(raw:string|null|undefined):MainValidationMeta|null{try{const m=JSON.parse(raw??'').ordinaryValidation;return m?.kind==='main-ordinary-validation-v1'?m:null;}catch{return null;}}
export function encodeMainMeta(m:MainValidationMeta){return JSON.stringify({version:1,applicationId:MAIN_VALIDATION_APP,answers:[],ordinaryValidation:m});}
export async function mainSourceSnapshot(db:Pick<Prisma.TransactionClient,'cVDocument'|'cVProfile'>){
 const [docs,profile]=await Promise.all([
  db.cVDocument.findMany({where:{userId:MAIN_VALIDATION_USER},orderBy:{createdAt:'desc'},take:2,select:{id:true,extractedText:true,createdAt:true,originalFilename:true}}),
  db.cVProfile.findUnique({where:{userId:MAIN_VALIDATION_USER}}),
 ]);
 const doc=docs[0];
 if(!doc?.extractedText.trim()||!profile||(!profile.firstName&&!profile.lastName&&profile.experiencesJson==='[]')||(docs[1]&&+docs[1].createdAt===+doc.createdAt))return null;
 return {cvId:doc.id,cvHash:digest(doc.extractedText),profileHash:digest(JSON.stringify(profile)),filename:doc.originalFilename};
}
export async function mainSourceMatches(db:Pick<Prisma.TransactionClient,'cVDocument'|'cVProfile'>,meta:MainValidationMeta){
 const current=await mainSourceSnapshot(db);
 return !!current&&current.cvId===meta.cvId&&current.cvHash===meta.cvHash&&current.profileHash===meta.profileHash;
}
