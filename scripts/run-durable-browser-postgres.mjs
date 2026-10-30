import {execFileSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
const pg='/opt/homebrew/opt/postgresql@16/bin',port=55467;
const probe=createServer();await new Promise((yes,no)=>{probe.once('error',no);probe.listen(port,'127.0.0.1',yes)});await new Promise(yes=>probe.close(yes));
const dir=await mkdtemp(join(tmpdir(),'lavorai-browser-db-'));
const url=`postgresql://postgres@127.0.0.1:${port}/lavorai_ordinary_test`;
const env={...process.env,ORDINARY_TEST_DATABASE_URL:url,DATABASE_URL:url,DIRECT_URL:url};
const run=(bin,args)=>execFileSync(bin,args,{env,stdio:'inherit',timeout:120000});let started=false;
try{run(join(pg,'initdb'),['-D',join(dir,'data'),'-U','postgres','-A','trust','--no-locale','-E','UTF8']);run(join(pg,'pg_ctl'),['-D',join(dir,'data'),'-l',join(dir,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port} -k ${dir}`,'-w','start']);started=true;run(join(pg,'createdb'),['-h','127.0.0.1','-p',String(port),'-U','postgres','lavorai_ordinary_test']);run(process.execPath,['--import','tsx','scripts/test-durable-browser-postgres.ts']);}
finally{if(started)run(join(pg,'pg_ctl'),['-D',join(dir,'data'),'-m','fast','-w','stop']);await rm(dir,{recursive:true,force:true});}
