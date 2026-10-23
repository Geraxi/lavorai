import { build } from 'esbuild';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
const output='output/playwright';
mkdirSync(output,{recursive:true});
const messages=JSON.parse(readFileSync('messages/it.json','utf8'));
const preview={target:{title:'Product Designer',company:'Azienda esempio',location:'Milano',matchedJob:true},offers:[{title:'Product Designer',company:'Azienda esempio',location:'Milano'}],atsScore:78,summary:'Designer con esperienza nella ricerca utenti e nella progettazione di prodotti digitali.',skills:['Figma','Ricerca utenti','Prototipazione'],suggestions:['Descrivi i risultati misurabili.'],coverLetter:'Gentile team,\nvorrei contribuire alla progettazione dei vostri prodotti digitali. Questa lettera è un esempio sintetico e non è stata inviata.'};
const mocks={
'next/navigation':`export const useRouter=()=>({push(path){document.body.dataset.navigation=path;},refresh(){}});`,
'next-auth/react':`export const useSession=()=>({update:async()=>({})});`,
'next-intl':`const messages=${JSON.stringify(messages)};export const useTranslations=(scope)=>(key,values={})=>{let text=messages[scope]?.[key]??key;for(const [k,v] of Object.entries(values))text=text.replaceAll('{'+k+'}',String(v));return text};export const useLocale=()=> 'it';`,
'next/link':`import React from 'react';export default function Link({prefetch,children,...props}){return React.createElement('a',props,children)}`,
'sonner':`export const toast={error(message){document.body.dataset.error=message},success(){}};`,
};
for(const name of ['preview','upload','actions']){
 const code=`import React from 'react';import{createRoot}from'react-dom/client';import Onboarding from './src/app/onboarding/onboarding-client';import{StartMembershipActions}from'./src/app/start-membership/start-membership-actions';
 window.fixtureRequests=[];window.fetch=async(url,opts)=>{window.fixtureRequests.push({url,body:opts?.body});return {ok:!window.fixtureFail,json:async()=>window.fixtureFail?{message:'Errore simulato. Riprova.'}:{ok:true}}};
 const initial={saved:{rolesJson:'["Product Designer"]',locationsJson:'["Milano"]',sourcesJson:'["sede"]',salaryMin:45,employmentType:'employee',seniority:'mid',yearsExperience:4,englishLevel:'b2',italianNative:true,euAuthorized:true,noticePeriod:'1m',avoidCompanies:null},cv:${name==='upload'?'null':JSON.stringify({filename:'cv-esempio.pdf',chars:500,preview:'CV sintetico'})},profile:null,demo:${name==='upload'?'null':JSON.stringify(preview)}};
 createRoot(document.getElementById('root')).render(${name==='actions'?`React.createElement(StartMembershipActions,{eligible:true,confirming:false,canceled:true})`:`React.createElement(Onboarding,{initial})`});`;
 const result=await build({stdin:{contents:code,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'offline-boundaries',setup(b){b.onResolve({filter:/^(next\/navigation|next-auth\/react|next-intl|next\/link|sonner)$/},args=>({path:args.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'jsx',resolveDir:process.cwd()}));}}]});
 writeFileSync(`${output}/value-first-${name}.html`,`<!doctype html><html lang="it" style="--font-inter:Arial;--font-jetbrains-mono:monospace"><meta charset="utf-8"><link rel="icon" href="data:,"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="qa.css"><body><div id="root" ${name==='actions'?'style="padding:24px;max-width:480px;margin:auto"':''}></div><script>${result.outputFiles[0].text.replaceAll('</script','<\\/script')}</script></body></html>`);
}
console.log('Rendered real React components with synthetic data and mocked auth/router/API.');
