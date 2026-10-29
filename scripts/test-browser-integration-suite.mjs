import {execFileSync} from 'node:child_process';
// Synthetic local browser tests only. Model inference is separately opt-in and never uses CI secrets.
const tests = ['test-owned-browser-input','test-observer-deadline','test-contact-observer','test-provider-compatibility-fixtures','test-local-workspace-documents','test-local-workspace-input','test-local-workspace-agent-led','test-local-workspace-hardening','test-local-workspace-gates','test-local-provider-coordinator','test-stagehand-local'];
for (const test of tests) execFileSync(process.execPath,['--import','tsx',`scripts/${test}.ts`],{stdio:'inherit',timeout:120000});
