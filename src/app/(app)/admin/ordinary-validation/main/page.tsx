import {getCurrentUser} from '@/lib/session';
import {isAdmin} from '@/lib/admin';
import {notFound} from 'next/navigation';
import {MAIN_VALIDATION_USER,MAIN_VALIDATION_EMAIL} from '@/lib/ordinary-main-validation-scope';
import {MainValidationPanel} from './panel';
export const dynamic='force-dynamic';
export default async function Page(){const u=await getCurrentUser();if(u?.id!==MAIN_VALIDATION_USER||u.email!==MAIN_VALIDATION_EMAIL||!isAdmin(u.email))notFound();return <main><h1>One ordinary application — your existing CV</h1><MainValidationPanel/></main>;}
