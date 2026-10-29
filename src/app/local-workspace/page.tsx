import {notFound} from 'next/navigation';
import Workspace from './workspace';
export const dynamic='force-dynamic';
export default function Page(){if(process.env.NODE_ENV!=='development'||process.env.LOCAL_WORKSPACE_DEMO!=='1')notFound();return <Workspace/>;}
