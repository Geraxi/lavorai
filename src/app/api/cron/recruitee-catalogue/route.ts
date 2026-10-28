import {NextResponse} from 'next/server';
import {prisma} from '@/lib/db';
import {refreshRecruiteeCatalogue,refreshTenants} from '@/lib/recruitee-catalogue-refresh';
export const runtime='nodejs';
export const maxDuration=300;
/** Not scheduled/enabled by this patch. Explicit tenant approval and later activation required. */
export async function GET(request:Request){
 if(!process.env.CRON_SECRET||request.headers.get('authorization')!==`Bearer ${process.env.CRON_SECRET}`)return NextResponse.json({error:'unauthorized'},{status:401});
 if(process.env.RECRUITEE_CATALOGUE_REFRESH_ENABLED!=='true')return NextResponse.json({enabled:false});
 try{return NextResponse.json(await refreshRecruiteeCatalogue(prisma,{tenants:refreshTenants(process.env.RECRUITEE_CATALOGUE_REFRESH_TENANTS)}));}
 catch{return NextResponse.json({error:'catalogue_refresh_failed'},{status:500});}
}
