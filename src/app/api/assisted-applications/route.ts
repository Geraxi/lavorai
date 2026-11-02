import {NextRequest,NextResponse} from 'next/server';
import {prisma} from '@/lib/db';
import {workspaceOwner,workspaceReadOwner,workspaceError,WorkspaceError} from '@/lib/workspace-mutation';
import {assistedOpportunity} from '@/lib/assisted-opportunity';
import {parsePreferenceList} from '@/lib/auto-apply-preferences';
import {hasPaidOrTrialApplicationAccess,usesFreeWeeklyQuota,isApplicationAccessPaused} from '@/lib/billing';
import {approvePacket,digest,finishPacket,parsePacket,readAssistedForm,revisePacket,type AssistedPacket} from '@/lib/assisted-packet';
import {readUserFile} from '@/lib/storage';
import {providerApplicationAllowed} from '@/lib/application-provider-policy';
import {applicationsPaused} from '@/lib/application-pause';
import {dailyApplicationLimit,effectiveTier,getLimits} from '@/lib/billing';
import {countDailyCapUsage} from '@/lib/daily-application-cap';
import {monthlyQuotaSince} from '@/lib/admin-user-actions';
import {reserveSubmissionBudget,submissionSubjectKey} from '@/lib/application-submission-budget';
export const runtime='nodejs';
function enabled(){if(process.env.ASSISTED_OPPORTUNITIES_REVIEW!=='true')throw new WorkspaceError('not_found',404);}
async function ownerContext(id:string){
 const u=await prisma.user.findUnique({where:{id},include:{preferences:true}});const p=u?.preferences;
 if(!u||u.suspendedAt||!u.privacyConsentAt||!u.emailVerified||!p||!['auto','hybrid','manual'].includes(p.autoApplyMode)||u.subscriptionStatus==='paused'||u.pausedUntil&&u.pausedUntil>new Date()||isApplicationAccessPaused(u)||!hasPaidOrTrialApplicationAccess(u)&&!usesFreeWeeklyQuota(u))throw new WorkspaceError('account_action_required',403);
 return {u,p};
}
function safe(error:unknown){if(error instanceof WorkspaceError)return workspaceError(error);const code=error instanceof Error?error.message:'';return workspaceError(new WorkspaceError(['offer_unavailable','form_unknown','form_too_large','invalid_destination','form_changed','review_changed','answers_incomplete','invalid_answers','invalid_option','already_handed_off','handoff_required','outcome_unconfirmed'].includes(code)?code:'service_unavailable',409));}
function view(app:{id:string;suggestionsJson:string|null;status:string},packet:AssistedPacket){return {id:app.id,packet,reviewDigest:digest(packet),status:app.status,verifiedAcceptance:false};}
export async function GET(req:NextRequest){try{enabled();const owner=await workspaceReadOwner();await ownerContext(owner);const id=req.nextUrl.searchParams.get('id');const jobId=req.nextUrl.searchParams.get('jobId');
 if(!id){if(!jobId)throw new WorkspaceError('missing_job');const job=await prisma.job.findUnique({where:{id:jobId}});if(!job)throw new WorkspaceError('not_found',404);const {u,p}=await ownerContext(owner);if(!assistedOpportunity(job,{...p,roles:parsePreferenceList(p.rolesJson)??[],locations:parsePreferenceList(p.locationsJson)??[],seniority:u.seniority,avoidCompanies:u.avoidCompanies}))throw new WorkspaceError('job_not_eligible',409);
 const existing=await prisma.application.findFirst({where:{userId:owner,jobId},orderBy:{createdAt:'desc'},select:{id:true,status:true,suggestionsJson:true}});
 const cvs=await prisma.cVDocument.findMany({where:{userId:owner},select:{id:true,originalFilename:true},orderBy:{createdAt:'desc'}});
 return NextResponse.json({job:{id:job.id,title:job.title,company:job.company},cvs,existing:existing?.suggestionsJson?.includes('"kind":"assisted"')?view(existing,parsePacket(existing.suggestionsJson)):existing?{blocked:true}:null},{headers:{'Cache-Control':'no-store'}});}
 const app=await prisma.application.findFirst({where:{id,userId:owner}});if(!app)throw new WorkspaceError('not_found',404);const packet=parsePacket(app.suggestionsJson);const kind=req.nextUrl.searchParams.get('download');
 if(kind==='cv'){const cv=await prisma.cVDocument.findFirst({where:{id:packet.cvId,userId:owner}});if(!cv)throw new WorkspaceError('document_unavailable',409);const bytes=await readUserFile(cv.storagePath);return new NextResponse(new Uint8Array(bytes),{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(cv.originalFilename)}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
 if(kind==='cover'){if(!packet.cover)throw new WorkspaceError('document_unavailable',409);return new NextResponse(packet.cover,{headers:{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':'attachment; filename="cover-letter.txt"','Cache-Control':'no-store'}});}
 return NextResponse.json(view(app,packet),{headers:{'Cache-Control':'no-store'}});
 }catch(e){return safe(e);}}
export async function POST(req:NextRequest){try{enabled();const owner=await workspaceOwner(req);const {u,p}=await ownerContext(owner);
 if(!req.headers.get('content-type')?.startsWith('application/json'))throw new WorkspaceError('invalid_payload');
 const reader=req.body?.getReader();if(!reader)throw new WorkspaceError('invalid_payload');let size=0;const chunks:Uint8Array[]=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>32000){await reader.cancel();throw new WorkspaceError('payload_too_large',413);}chunks.push(value);}const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 if(body.action==='prepare'){
 if(typeof body.jobId!=='string'||typeof body.cvId!=='string')throw new WorkspaceError('invalid_payload');
 const job=await prisma.job.findUnique({where:{id:body.jobId}});const cv=await prisma.cVDocument.findFirst({where:{id:body.cvId,userId:owner}});
 if(!job||!cv||!assistedOpportunity(job,{...p,roles:parsePreferenceList(p.rolesJson)??[],locations:parsePreferenceList(p.locationsJson)??[],seniority:u.seniority,avoidCompanies:u.avoidCompanies}))throw new WorkspaceError('job_or_document_not_eligible',409);
 const snapshot=await readAssistedForm(job.url,job.externalId);
 const packet:AssistedPacket={version:1,kind:'assisted',state:'draft',url:job.url,...snapshot,cvId:cv.id,cvName:cv.originalFilename,cover:'',answers:{}};
 const app=await prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${owner}))`;const existing=await tx.application.findFirst({where:{userId:owner,jobId:job.id}});if(existing){if(existing.portal==='assisted_recruitee')return existing;throw new WorkspaceError('existing_application',409);}return tx.application.create({data:{userId:owner,jobId:job.id,portal:'assisted_recruitee',status:'assisted_draft',sendStatus:'needs_user',submitConfirmation:'NOT_SUBMITTED',startedAt:new Date(),suggestionsJson:JSON.stringify(packet),errorMessage:'Preparazione assistita: nessuna candidatura inviata.'}});});
 return NextResponse.json(view(app,parsePacket(app.suggestionsJson)),{headers:{'Cache-Control':'no-store'}});
 }
 if(typeof body.id!=='string')throw new WorkspaceError('invalid_payload');const app=await prisma.application.findFirst({where:{id:body.id,userId:owner,portal:'assisted_recruitee'},include:{job:true}});if(!app)throw new WorkspaceError('not_found',404);
 if(app.submittedAt||app.submittedVia||app.submissionReceiptJson||app.status==='success')throw new WorkspaceError('outcome_recorded',409);
 const packet=parsePacket(app.suggestionsJson);let next:AssistedPacket;
 if(body.action==='save'){next=revisePacket(packet,body.answers,body.cover);if(body.cvId){const selected=await prisma.cVDocument.findFirst({where:{id:body.cvId,userId:owner}});if(!selected)throw new WorkspaceError('document_unavailable',409);next={...next,cvId:selected.id,cvName:selected.originalFilename};}}
 else if(body.action==='refresh'){if(packet.state!=='draft')throw new WorkspaceError('already_handed_off',409);const fresh=await readAssistedForm(app.job.url,app.job.externalId);next={...packet,...fresh,answers:{}};}
 else if(body.action==='approve'){
 if(body.approve!==true||typeof body.reviewDigest!=='string')throw new WorkspaceError('explicit_approval_required');
 if(!assistedOpportunity(app.job,{...p,roles:parsePreferenceList(p.rolesJson)??[],locations:parsePreferenceList(p.locationsJson)??[],seniority:u.seniority,avoidCompanies:u.avoidCompanies}))throw new WorkspaceError('job_not_eligible',409);
 const cv=await prisma.cVDocument.findFirst({where:{id:packet.cvId,userId:owner},select:{id:true}});if(!cv)throw new WorkspaceError('document_unavailable',409);
 const fresh=await readAssistedForm(app.job.url,app.job.externalId);next=approvePacket(packet,body.reviewDigest,fresh.formHash);
 }else if(body.action==='report'||body.action==='cancel')next=finishPacket(packet,body.action);else throw new WorkspaceError('invalid_action');
 const result=await prisma.$transaction(async tx=>{
 await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${owner}))`;
 const current=await tx.application.findUnique({where:{id:app.id}});if(!current||current.suggestionsJson!==app.suggestionsJson||current.status!==app.status)throw new WorkspaceError('review_changed',409);
 if(body.action==='approve'){
  if(!providerApplicationAllowed(app))throw new WorkspaceError('provider_not_enabled',409);
  if(await tx.application.count({where:{userId:owner,jobId:app.jobId,id:{not:app.id}}}))throw new WorkspaceError('existing_application',409);
  if(applicationsPaused())throw new WorkspaceError('applications_paused',409);
  const currentUser=await tx.user.findUnique({where:{id:owner},include:{preferences:true}});
  if(!currentUser||!currentUser.privacyConsentAt||!currentUser.emailVerified||currentUser.suspendedAt||!['auto','hybrid','manual'].includes(currentUser.preferences?.autoApplyMode??'')||!hasPaidOrTrialApplicationAccess(currentUser)||currentUser.subscriptionStatus==='paused'||currentUser.pausedUntil&&currentUser.pausedUntil>new Date())throw new WorkspaceError('account_action_required',403);
  if(await countDailyCapUsage(tx,owner)>=dailyApplicationLimit(currentUser,currentUser.preferences?.dailyCap))throw new WorkspaceError('daily_cap',409);
  const monthly=await tx.application.count({where:{userId:owner,id:{not:app.id},createdAt:{gte:monthlyQuotaSince(currentUser.quotaResetAt)},status:{notIn:['failed','diagnostic','assisted_cancelled']}}});
  if(monthly>=getLimits(effectiveTier(currentUser)).monthlyApplications)throw new WorkspaceError('monthly_quota',409);
  const budget=await reserveSubmissionBudget(tx,{applicationId:app.id,subjectKey:submissionSubjectKey(owner,app.jobId),attemptStartedAt:new Date(next.approvedAt!),channel:'portal_recruitee'},'begin');if(budget)throw new WorkspaceError(budget,409);
 }
 return tx.application.updateMany({where:{id:app.id,userId:owner,portal:'assisted_recruitee',suggestionsJson:app.suggestionsJson,submittedAt:null,submittedVia:null,submissionReceiptJson:null,status:app.status},data:{suggestionsJson:JSON.stringify(next),status:next.state==='draft'?'assisted_draft':next.state==='cancelled'&&packet.state==='draft'?'assisted_cancelled':'assisted_unconfirmed',sendStatus:'needs_user',submitConfirmation:next.state==='draft'||next.state==='cancelled'&&packet.state==='draft'?'NOT_SUBMITTED':'UNCONFIRMED',...(body.action==='approve'?{consentGrantedAt:new Date()}:{}),errorMessage:next.state==='reported'?'Invio dichiarato dal candidato, non verificato dal datore di lavoro.':next.state==='cancelled'?'Preparazione interrotta. Nessun nuovo invio automatico.':'Completamento manuale richiesto. Nessuna accettazione verificata.'}});});
 if(result.count!==1)throw new WorkspaceError('review_changed',409);return NextResponse.json(view({...app,status:next.state},next),{headers:{'Cache-Control':'no-store'}});
 }catch(e){return safe(e);}}
