import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { readUserFile } from '@/lib/storage';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: {params: Promise<{id:string}>}) {
 const user = await getCurrentUser();
 if (!user) return Response.json({error:'unauthenticated'},{status:401});
 const {id} = await context.params;
 const doc = await prisma.cVDocument.findFirst({where:{id,userId:user.id},select:{originalFilename:true,storagePath:true}});
 if (!doc) return Response.json({error:'not_found'},{status:404});
 const types:Record<string,string>={pdf:'application/pdf',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};
 const extension=doc.originalFilename.split('.').pop()?.toLowerCase()??'';
 if (!types[extension]) return Response.json({error:'unsupported_document_type'},{status:409});
 try {
  const bytes=await readUserFile(doc.storagePath);
  return new Response(new Uint8Array(bytes),{headers:{'Content-Type':types[extension],'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(doc.originalFilename)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 } catch { return Response.json({error:'document_unavailable'},{status:503}); }
}
