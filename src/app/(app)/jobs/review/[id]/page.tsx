import {notFound} from 'next/navigation';
import {AssistedWorkspace} from './workspace';
export default async function Page({params}:{params:Promise<{id:string}>}){
 if(process.env.ASSISTED_OPPORTUNITIES_REVIEW!=='true')notFound();
 return <AssistedWorkspace jobId={(await params).id}/>;
}
