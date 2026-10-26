import {NextRequest,NextResponse} from 'next/server';
import {createHash} from 'node:crypto';
import {getCurrentUser} from '@/lib/session';
import {isAdmin} from '@/lib/admin';
import {prisma} from '@/lib/db';
import {ordinaryValidationPreflight} from '@/lib/ordinary-validation-preflight';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
/** Exact signed-in owner only. Metadata review, no setup/seed/provider calls. */
export async function GET(request:NextRequest){
 const user=await getCurrentUser();
 if(!user||user.email!=='umbertogeraci0@gmail.com'||!isAdmin(user.email))return json({error:'exact_owner_session_required'},403);
 if(request.nextUrl.search)return json({error:'scope_is_fixed'},400);
 const [report,docs,profile]=await Promise.all([
  ordinaryValidationPreflight(prisma,new Date(),{userId:user.id,email:user.email}),
  prisma.cVDocument.findMany({where:{userId:user.id},orderBy:{createdAt:'desc'},take:3,select:{id:true,originalFilename:true,createdAt:true,extractedText:true}}),
  prisma.cVProfile.findUnique({where:{userId:user.id},select:{firstName:true,lastName:true,summary:true,experiencesJson:true,educationJson:true,skillsJson:true}}),
 ]);
 const current=docs[0];
 const ambiguous=!!(docs[1]&&current&&+docs[1].createdAt===+current.createdAt);
 const text=[current?.extractedText??'',profile?.summary??'',profile?.experiencesJson??'',profile?.educationJson??''].join('\n');
 // A flag means human review, never a conclusion about the owner. No matched
 // passages or personal details are returned. Absence is not a content audit.
 const markers=[
  ['health_or_disability',/\b(disability|disabled|diagnosis|medical condition|disabilit[aà]|diagnosi|patologia)\b/i],
  ['religion_or_politics',/\b(religion|religione|political affiliation|partito politico|union membership|iscrizione sindacale)\b/i],
  ['government_identifier',/\b(passport number|numero passaporto|codice fiscale|social security number)\b/i],
 ].filter(([,pattern])=>(pattern as RegExp).test(text)).map(([name])=>name);
 return json({ ...report,
  profile:report.profile?{exists:report.profile.exists,cvDocumentCount:report.profile.cvDocumentCount,phonePresent:report.profile.phonePresent,source:'existing_real_profile'}:null,
  unknowns:report.unknowns?.map(x=>x==='synthetic_document_content_not_inspected'?'real_document_content_requires_owner_review':x),
  scope:'main_account_real_cv_review_only',selectedAccount:{id:user.id,email:user.email},
  cvSelection:{policy:'ordinary_worker_uses_latest_createdAt',ambiguous,requiresOwnerConfirmation:true,
   selected:current?{id:current.id,filename:current.originalFilename,createdAt:current.createdAt,textPresent:!!current.extractedText.trim(),textSha256:createHash('sha256').update(current.extractedText).digest('hex')}:null,
   recentDocuments:docs.map(d=>({id:d.id,filename:d.originalFilename,createdAt:d.createdAt})),
   profileWouldRequireSeeding:!profile||(!profile.firstName&&!profile.lastName&&profile.experiencesJson==='[]'),
   possibleSensitiveMarkers:markers,contentReviewComplete:false},
  action:'Review selected real CV and existing settings; no application or scope created. Internal synthetic preparation must not be used.',
 });
}
