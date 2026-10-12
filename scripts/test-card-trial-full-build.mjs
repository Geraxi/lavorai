/** Full production build with a fresh local PostgreSQL schema. Never reads live DB URLs.
 * Isolated prerequisites: npm install --prefix /tmp/card-trial-db embedded-postgres@18.4.0-beta.17 pg
 * CARD_TRIAL_DB_DEPS=/tmp/card-trial-db node scripts/test-card-trial-full-build.mjs
 * Uses the already generated Prisma client; does not alter app dependencies or migrations.
 */
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { existsSync, readFileSync, mkdtempSync, createWriteStream, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env','.env.local','.env.production','.env.production.local']) {
  if (existsSync(path.join(root,name))) throw new Error(`Refusing build with an environment file present: ${name}`);
}
const dependencyRequire = createRequire(path.join(process.env.CARD_TRIAL_DB_DEPS ?? '/tmp/card-trial-db','package.json'));
const { default: EmbeddedPostgres } = await import(pathToFileURL(dependencyRequire.resolve('embedded-postgres')).href);
const { Client } = dependencyRequire('pg');
const base = mkdtempSync(path.join(tmpdir(),'card-trial-full-build-'));
const port = 55440;
const url = `postgresql://postgres:password@127.0.0.1:${port}/postgres?schema=public`;
// Whitelist only runtime plumbing, so Stripe, AI, email, deploy and other account credentials cannot enter the build.
const env = Object.fromEntries(['PATH','HOME','TMPDIR','LANG','LC_ALL','TZ','SYSTEMROOT','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','SSL_CERT_DIR'].filter(key => process.env[key]).map(key => [key,process.env[key]]));
Object.assign(env,{ NODE_ENV:'production', DATABASE_URL:url, DIRECT_URL:url, NEXT_TELEMETRY_DISABLED:'1', CARD_TRIAL_COHORT_START:'', CARD_TRIAL_PROVIDER_READY:'', NEXT_PUBLIC_SITE_URL:'http://127.0.0.1:3000' });
const cluster = new EmbeddedPostgres({databaseDir:path.join(base,'data'),port,persistent:false,postgresFlags:['-h','127.0.0.1','-c','unix_socket_directories='],onLog(){},onError(){}});
let started=false, client;
function run(args,logName) {
  return new Promise((resolve,reject) => {
    const logPath=path.join(base,logName); const log=createWriteStream(logPath); const chunks=[];
    const child=spawn(process.execPath,args,{cwd:root,env,stdio:['ignore','pipe','pipe']});
    child.stdout.on('data',chunk=>{log.write(chunk);chunks.push(chunk);});
    child.stderr.on('data',chunk=>log.write(chunk));
    child.on('error',reject);
    child.on('close',code=>log.end(()=>{console.log(`${logName}: exit=${code}, log=${logPath}`);if(code===0)resolve(Buffer.concat(chunks).toString());else reject(new Error(`Command failed (${code}): ${args.join(' ')}. See ${logPath}`));}));
  });
}
console.log(`Disposable build artifacts: ${base}`);
try {
  await cluster.initialise();await cluster.start();started=true;
  client=new Client({host:'127.0.0.1',port,user:'postgres',password:'password',database:'postgres'});await client.connect();
  console.log((await client.query('SELECT version()')).rows[0].version);
  const sql=await run(['node_modules/prisma/build/index.js','migrate','diff','--from-empty','--to-schema-datamodel','prisma/schema.prisma','--script'],'schema-generation.log');
  writeFileSync(path.join(base,'full-schema.sql'),sql);
  await client.query(sql);
  await client.query(readFileSync(path.join(root,'docs/card-trial-schema.sql'),'utf8'));
  await client.query(readFileSync(path.join(root,'docs/card-trial-preview-schema.sql'),'utf8'));
  const tables=(await client.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")).rows[0].n;
  console.log(`Applied entire current Prisma schema and both card-trial schemas: ${tables} tables; no fixture users or provider credentials.`);
  await run(['node_modules/next/dist/bin/next','build','--webpack'],'next-build.log');
  console.log('PASS full Next.js production build against disposable PostgreSQL, with rollout disabled.');
} finally {
  if(client)await client.end();
  if(started){await cluster.stop();console.log('Disposable PostgreSQL stopped and database data removed.');}
}
