import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { homeTemplates } from '@vibeestimate/scene-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'frontend/public/homes');
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(root, '.cache/playwright');
const { chromium } = await import('@playwright/test');
const client = `import React from 'react'; import {createRoot} from 'react-dom/client'; import {flushSync} from 'react-dom';
import {HousePlan} from './frontend/src/components/spatial/house-plan.tsx'; import {homeTemplates} from '@vibeestimate/scene-core';
const root=createRoot(document.getElementById('plan'));window.loadTemplate=async(id)=>{const t=homeTemplates.find(t=>t.id===id);flushSync(()=>root.render(React.createElement(HousePlan,{document:t.document})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {rooms:t.roomCount,areaM2:t.areaM2,openings:t.document.openings.length}};`;
const bundle = await build({ stdin: { contents: client, resolveDir: root }, bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic', write: false, define: { 'process.env.NODE_ENV': '"production"' } });
const server = createServer((req, res) => {
  if (req.url === '/bundle.js') { res.setHeader('content-type', 'text/javascript'); res.end(bundle.outputFiles[0].contents); }
  else if (req.url === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><html lang="en"><style>#plan svg{width:100%;height:100%;display:block}</style><body style="margin:0;background:#f4f6f8"><div id="plan" style="width:720px;height:520px;display:flex;padding:16px;box-sizing:border-box"></div><script src="/bundle.js"></script></body></html>'); }
  else { res.statusCode = 404; res.end(); }
});
await mkdir(output, { recursive: true });
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 720, height: 520 } });
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.goto(origin); await page.waitForFunction(() => typeof window.loadTemplate === 'function');
  const checks = [];
  for (const template of homeTemplates) {
    const rendered = await page.evaluate(id => window.loadTemplate(id), template.id);
    const png = await page.locator('#plan').screenshot({ path: resolve(output, `${template.id}.png`) });
    checks.push({ id: template.id, source: 'Canonical HousePlan component', ...rendered, bytes: png.length, sha256: createHash('sha256').update(png).digest('hex') });
  }
  await writeFile(resolve(output, 'manifest.json'), JSON.stringify({ renderer: 'Headed Chromium, canonical SVG plan; 3D is verified separately through Pascal', templates: checks }, null, 2) + '\n');
  console.log('Captured three measured home previews from the actual canonical plans.');
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
