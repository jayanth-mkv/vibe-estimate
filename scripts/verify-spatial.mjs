import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const commands = [
  ['run','typecheck'], ['run','lint','--workspace','@vibeestimate/frontend'],
  ['run','test','--workspace','@vibeestimate/frontend'], ['run','test'],
  ['run','test:spatial'], ['run','build'], ['run','test:spatial:browser'],
];
const results = [];
for (const args of commands) {
  const started = Date.now();
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {stdio:'inherit',shell:process.platform === 'win32',windowsHide:true});
  results.push({command:'npm '+args.join(' '),exitCode:result.status,durationMs:Date.now()-started});
  mkdirSync('.cache/spatial',{recursive:true});
  writeFileSync('.cache/spatial/verification.json',JSON.stringify({recordedAt:new Date().toISOString(),results},null,2));
  if(result.status !== 0)process.exit(result.status ?? 1);
}
