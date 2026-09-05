import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { productionVerificationEnvironment } from './production-verification-env.mjs';
const privateRoot=path.resolve('../docs/private');
const operator=JSON.parse(fs.readFileSync(path.join(privateRoot,'local-config.json'),'utf8'));
const discovery=JSON.parse(fs.readFileSync(path.join(privateRoot,'production-discovery.json'),'utf8'));
const preview=process.argv.includes('--preview');
const supplied=process.argv.slice(2);
let grep;
let list=false;
for(let i=0;i<supplied.length;i++){
  if(supplied[i]==='--preview')continue;
  if(supplied[i]==='--list'){list=true;continue;}
  if(supplied[i]==='--grep'&&supplied[i+1]&&!supplied[i+1].startsWith('--')){grep=supplied[++i];continue;}
  throw new Error('Use only --preview, --list or --grep <test pattern>.');
}
const baseURL=preview?'http://127.0.0.1:3101':JSON.parse(fs.readFileSync(path.join(privateRoot,'production-outputs.json'),'utf8')).public_url.value;
if(!preview&&(discovery.backendProjectId!==operator.backendProjectId||baseURL!==`https://vibeestimate-${discovery.projectNumber}.${operator.backendRegion}.run.app`))throw new Error('Production verification target does not match private authorization.');
const evidence=path.join(privateRoot,'production-verification',new Date().toISOString().replaceAll(':','-').replaceAll('.','-'));
fs.mkdirSync(evidence,{recursive:true});
const browserHome=path.join(evidence,'browser-home');
fs.mkdirSync(browserHome,{recursive:true});
const env=productionVerificationEnvironment({VERIFICATION_BASE_URL:baseURL,VERIFICATION_RUNTIME:preview?'connected':'production',CONNECTED_FIREBASE_TEST:'1',CONNECTED_FIREBASE_PROJECT_ID:operator.firebaseProjectId,PRODUCTION_EVIDENCE_DIR:evidence,PLAYWRIGHT_BROWSERS_PATH:path.resolve('.cache/playwright'),APPDATA:browserHome,LOCALAPPDATA:browserHome,XDG_CONFIG_HOME:browserHome,XDG_CACHE_HOME:browserHome});
const args=['node_modules/@playwright/test/cli.js','test','--config=tests/live/production.config.ts'];
if(grep)args.push('--grep',grep);
else if(preview)args.push('--grep','onboarding');
if(list)args.push('--list');
const child=spawn(process.execPath,args,{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
let output='';child.stdout.on('data',chunk=>{output+=chunk;process.stdout.write(chunk)});child.stderr.on('data',chunk=>{output+=chunk;process.stderr.write(chunk)});
child.on('exit',code=>{fs.writeFileSync(path.join(evidence,'run.log'),output);console.log(JSON.stringify({evidenceStoredPrivately:true,exitCode:code}));process.exit(code??1)});
