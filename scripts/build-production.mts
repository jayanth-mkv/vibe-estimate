import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { create as tarCreate } from 'tar';
import { obtainNamedProfileToken } from '../backend/src/vertex-auth.ts';

async function main() {
  const action=process.argv[2];if(!['submit','status'].includes(action))throw new Error('Unsupported build action');
  const privateRoot=path.resolve('../docs/private');
  const operator=JSON.parse(fs.readFileSync(path.join(privateRoot,'local-config.json'),'utf8'));
  const vertex=JSON.parse(fs.readFileSync(path.join(privateRoot,'vertex-local.json'),'utf8'));
  const outputs=JSON.parse(fs.readFileSync(path.join(privateRoot,'production-outputs.json'),'utf8'));
  if(vertex.projectId!==operator.backendProjectId||vertex.account!==operator.account||vertex.gcloudConfiguration!==operator.gcloudConfiguration)throw new Error('Authorized build target mismatch');
  const adc=path.join(vertex.gcloudConfigDir,'application_default_credentials.json');
  const hash=(data:Buffer|string)=>createHash('sha256').update(data).digest('hex');
  const adcHash=()=>fs.existsSync(adc)?hash(fs.readFileSync(adc)):'absent';const before=adcHash();
  try {
    const token=await obtainNamedProfileToken({projectId:vertex.projectId,gcloudConfiguration:vertex.gcloudConfiguration,gcloudAccount:vertex.account,gcloudConfigDir:vertex.gcloudConfigDir});
    const headers={Authorization:'Bearer '+token,'x-goog-user-project':operator.backendProjectId};
    if(action==='submit') {
      const files=['package.json','package-lock.json','Dockerfile','.dockerignore','frontend/package.json','frontend/tsconfig.json','frontend/next.config.ts','frontend/postcss.config.mjs','backend/package.json','backend/tsconfig.json','scripts/start-production.mjs'];
      for(const directory of ['frontend/src','frontend/public','backend/src']) {
        for(const entry of fs.readdirSync(directory,{recursive:true}).map(p=>directory+'/'+p)) {
          const stat=fs.lstatSync(entry);if(stat.isSymbolicLink())throw new Error('Build context contains a link');if(stat.isFile())files.push(entry.replaceAll('\\','/'));
        }
      }
      if(files.some(p=>/(^|\/)([.]env|[.]cache|[.]git|[.]terraform)|tfstate|private/i.test(p)))throw new Error('Unsafe build context path');
      const web=JSON.parse(fs.readFileSync(path.join(privateRoot,'firebase-connected-web.json'),'utf8'));
      for(const f of files) {
        const b=fs.readFileSync(f);
        if(b.includes(Buffer.from(web.apiKey))||b.includes(Buffer.from(['-----BEGIN', 'PRIVATE KEY-----'].join(' '))))throw new Error('Build context contains a credential');
      }
      const stamp=new Date().toISOString().replaceAll(':','-').replaceAll('.','-');
      const archive=path.join(privateRoot,'application-'+stamp+'.tgz');
      await tarCreate({file:archive,gzip:true,portable:true,cwd:process.cwd()},files.sort());
      const bytes=fs.readFileSync(archive);const object='application-'+hash(bytes).slice(0,20)+'.tgz';
      const uploaded=await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${outputs.source_bucket.value}/o?uploadType=media&name=${encodeURIComponent(object)}&ifGenerationMatch=0`,{method:'POST',headers:{...headers,'Content-Type':'application/gzip'},body:bytes,signal:AbortSignal.timeout(120000)});
      if(!uploaded.ok)throw new Error('Source upload failed');
      const source=await uploaded.json();
      const image=outputs.image_repository.value+':initial-'+stamp.toLowerCase();
      const build={source:{storageSource:{bucket:outputs.source_bucket.value,object,generation:source.generation}},serviceAccount:outputs.build_identity.value,
        steps:[{name:'gcr.io/cloud-builders/docker',args:['build','-t',image,'.']}],images:[image],timeout:'1200s',options:{logging:'CLOUD_LOGGING_ONLY',machineType:'E2_HIGHCPU_8'},
        tags:['vibeestimate','initial-production']};
      const response=await fetch(`https://cloudbuild.googleapis.com/v1/projects/${operator.backendProjectId}/locations/${operator.backendRegion}/builds`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(build),signal:AbortSignal.timeout(30000)});
      const result=await response.json();
      if(!response.ok){fs.writeFileSync(path.join(privateRoot,'production-build-error.json'),JSON.stringify({code:result.error?.code,status:result.error?.status,message:result.error?.message}));throw new Error('Cloud Build request failed');}
      fs.writeFileSync(path.join(privateRoot,'production-build.json'),JSON.stringify({operation:result.name,buildName:result.metadata?.build?.name,image,sourceHash:hash(bytes),sourceFileCount:files.length,submittedAt:new Date().toISOString()},null,2));
      console.log(JSON.stringify({submitted:true,sourceFileCount:files.length,sourceBytes:bytes.length,credentialScanPassed:true}));
    } else {
      const saved=JSON.parse(fs.readFileSync(path.join(privateRoot,'production-build.json'),'utf8'));
      const response=await fetch('https://cloudbuild.googleapis.com/v1/'+(saved.buildName||saved.operation),{headers,signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw new Error('Build status unavailable');
      const result=await response.json();const build=result.response??result.metadata?.build??result;
      fs.writeFileSync(path.join(privateRoot,'production-build-status.json'),JSON.stringify(build,null,2));
      console.log(JSON.stringify({status:build.status??'PENDING',steps:build.steps?.map((step:any)=>({status:step.status,exitCode:step.exitCode}))}));
      if(build.status==='SUCCESS'){
        const digest=build.results?.images?.[0]?.digest;if(!/^sha256:[a-f0-9]{64}$/.test(digest??''))throw new Error('Verified image digest missing');
        fs.writeFileSync(path.join(privateRoot,'production-image.json'),JSON.stringify({image:outputs.image_repository.value+'@'+digest,buildName:build.name,verifiedAt:new Date().toISOString()}));
      }
    }
  } finally {console.log(JSON.stringify({sharedAdcUnchanged:before===adcHash()}));if(before!==adcHash())process.exitCode=1;}
}
main().catch(()=>{console.error('Cloud build operation stopped; private values and raw errors omitted.');process.exitCode=1;});
