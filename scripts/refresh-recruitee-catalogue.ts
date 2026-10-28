/** Explicit metadata-only execution. No connection strings accepted on CLI; existing runtime config only. */
import {PrismaClient} from '@prisma/client';
import {refreshRecruiteeCatalogue,refreshTenants} from '../src/lib/recruitee-catalogue-refresh';
async function main(){
 if(!process.argv.includes('--execute-metadata-only'))throw Error('Use --execute-metadata-only only after database/tenant authorization');
 const tenants=refreshTenants(process.env.RECRUITEE_CATALOGUE_REFRESH_TENANTS);
 const db=new PrismaClient();try{console.log(JSON.stringify(await refreshRecruiteeCatalogue(db,{tenants})));}finally{await db.$disconnect()}
}
main().catch(()=>{console.error('Metadata refresh failed; no automatic retry. Inspect recorded metadata before another run.');process.exitCode=1});
