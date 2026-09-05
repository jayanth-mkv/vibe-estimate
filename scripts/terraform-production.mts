import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { obtainNamedProfileToken } from '../backend/src/vertex-auth.ts';

async function main() {
  const action=process.argv[2];
  if(!['init','validate','plan','apply','outputs','fmt'].includes(action))throw new Error('Unsupported action');
  const root=fs.realpathSync(process.cwd());
  const privateRoot=fs.realpathSync(path.resolve('../docs/private'));
  if(privateRoot.toLowerCase().startsWith(root.toLowerCase()+path.sep))throw new Error('Private path must be external');
  const operator=JSON.parse(fs.readFileSync(path.join(privateRoot,'local-config.json'),'utf8'));
  const vertex=JSON.parse(fs.readFileSync(path.join(privateRoot,'vertex-local.json'),'utf8'));
  const discovery=JSON.parse(fs.readFileSync(path.join(privateRoot,'production-discovery.json'),'utf8'));
  const connected=JSON.parse(fs.readFileSync(path.join(privateRoot,'firebase-connected.json'),'utf8'));
  if(operator.backendProjectId!==vertex.projectId||operator.account!==vertex.account||operator.gcloudConfiguration!==vertex.gcloudConfiguration||operator.firebaseProjectId!==connected.firebaseProjectId||operator.backendRegion!==discovery.region||operator.backendProjectId!==discovery.backendProjectId)throw new Error('Authorized target mismatch');
  const adc=path.join(vertex.gcloudConfigDir,'application_default_credentials.json');
  const digest=(data: string|Buffer)=>createHash('sha256').update(data).digest('hex');
  const adcHash=()=>fs.existsSync(adc)?digest(fs.readFileSync(adc)):'absent';
  const before=adcHash();
  const infra=path.join(root,'infra/production');
  const stateDir=path.join(privateRoot,'production-terraform');fs.mkdirSync(stateDir,{recursive:true});
  const toolDir=path.join(root,'infra/.tools');
  const cache=path.join(toolDir,'production-provider-cache');fs.mkdirSync(cache,{recursive:true});
  const dataDir=path.join(toolDir,'production-data');fs.mkdirSync(dataDir,{recursive:true});
  const tfConfig=path.join(toolDir,'production.rc');fs.writeFileSync(tfConfig,'disable_checkpoint = true\n');
  const imageFile=path.join(privateRoot,'production-image.json');
  const image=fs.existsSync(imageFile)?JSON.parse(fs.readFileSync(imageFile,'utf8')).image:'';
  const web=JSON.parse(fs.readFileSync(path.resolve(privateRoot,connected.webConfigPath),'utf8'));
  if(web.projectId!==operator.firebaseProjectId)throw new Error('Firebase public config target mismatch');
  const publicConfig=Object.fromEntries(['projectId','apiKey','authDomain','appId'].map(k=>[k,web[k]]));
  const vars={backend_project_id:operator.backendProjectId,firebase_project_id:operator.firebaseProjectId,project_number:discovery.projectNumber,region:operator.backendRegion,
    existing_auth_domains:discovery.results.find((r:any)=>r.name==='firebaseAuth').data.authorizedDomains,firestore_database_id:connected.firestoreDatabaseId,gemini_model:vertex.model,image};
  const varsFile=path.join(stateDir,'production.tfvars.json');fs.writeFileSync(varsFile,JSON.stringify(vars));
  const env={...process.env};
  for(const k of Object.keys(env))if(/^(TF_|GOOGLE_|GCLOUD_|CLOUDSDK_|GEMINI_|VERTEX_)/i.test(k))delete env[k];
  Object.assign(env,{TF_CLI_CONFIG_FILE:tfConfig,TF_PLUGIN_CACHE_DIR:cache,TF_DATA_DIR:dataDir,TF_IN_AUTOMATION:'1',CHECKPOINT_DISABLE:'1',TF_VAR_firebase_web_config:JSON.stringify(publicConfig)});
  const binary=path.join(toolDir,'terraform-1.13.5/terraform.exe');
  const run=(args:string[])=>new Promise<{code:number,output:string}>((resolve,reject)=>{let output='';const child=spawn(binary,args,{cwd:infra,env,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);child.on('error',()=>reject(new Error('Terraform could not start')));child.on('close',code=>resolve({code:code??1,output}));});
  const plan=path.join(stateDir,'production.tfplan');
  const manifest=path.join(stateDir,'plan-manifest.json');
  const sourceHash=()=>digest(fs.readdirSync(infra).filter(n=>n.endsWith('.tf')).sort().map(n=>fs.readFileSync(path.join(infra,n))).join('\n'));
  try {
    if(['plan','apply','outputs'].includes(action))env.TF_VAR_access_token=await obtainNamedProfileToken({projectId:vertex.projectId,gcloudConfiguration:vertex.gcloudConfiguration,gcloudAccount:vertex.account,gcloudConfigDir:vertex.gcloudConfigDir});
    else env.TF_VAR_access_token='unused-validation-placeholder';
    let args:string[];
    if(action==='init')args=['init','-input=false','-no-color','-backend-config=path='+path.join(stateDir,'terraform.tfstate')];
    else if(action==='validate')args=['validate','-json'];
    else if(action==='fmt')args=['fmt','-no-color'];
    else if(action==='plan')args=['plan','-input=false','-no-color','-var-file='+varsFile,'-out='+plan,...(process.argv[3]==='--bootstrap'?['-target=google_project_service.required']:[])];
    else if(action==='outputs')args=['output','-json'];
    else {
      const checked=JSON.parse(fs.readFileSync(manifest,'utf8'));
      if(checked.planHash!==digest(fs.readFileSync(plan))||checked.sourceHash!==sourceHash()||checked.varsHash!==digest(JSON.stringify(vars)))throw new Error('Saved plan no longer matches verified inputs');
      args=['apply','-input=false','-no-color',plan];
    }
    const result=await run(args);fs.writeFileSync(path.join(stateDir,action+'.log'),result.output);
    if(result.code!==0) {
      if(action==='validate')console.log(result.output);
      else console.log(JSON.stringify({action,ok:false,diagnostics:result.output.split('\n').filter(s=>s.startsWith('Error:')).map(s=>s.slice(0,180))}));
      process.exitCode=1;return;
    }
    if(action==='plan') {
      const shown=await run(['show','-json',plan]);if(shown.code!==0)throw new Error('Plan inspection failed');
      fs.writeFileSync(path.join(stateDir,'plan.json'),shown.output);
      const parsed=JSON.parse(shown.output);
      const changes=(parsed.resource_changes??[]).filter((r:any)=>r.change.actions.join(',')!=='no-op');
      if(changes.some((r:any)=>r.change.actions.includes('delete')))throw new Error('Destructive plan rejected');
      fs.writeFileSync(manifest,JSON.stringify({planHash:digest(fs.readFileSync(plan)),sourceHash:sourceHash(),varsHash:digest(JSON.stringify(vars))}));
      console.log(JSON.stringify({action,ok:true,changes:changes.map((r:any)=>({resource:r.address,actions:r.change.actions,importing:!!r.change.importing}))}));
    } else if(action==='outputs') {fs.writeFileSync(path.join(privateRoot,'production-outputs.json'),result.output);console.log(JSON.stringify({action,ok:true,storedPrivately:true}));}
    else console.log(JSON.stringify({action,ok:true}));
  } finally {console.log(JSON.stringify({sharedAdcUnchanged:before===adcHash()}));if(before!==adcHash())process.exitCode=1;}
}
main().catch(()=>{console.error('Production Terraform operation stopped; private values and raw errors omitted.');process.exitCode=1;});
