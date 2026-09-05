import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const task = process.argv[2];
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve('.cache/playwright');
process.env.NEXT_TELEMETRY_DISABLED = '1';
if (task === 'review') {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:3100/studio');
  console.log('Visible house demo opened. Close the browser to finish.');
  await new Promise(resolve => browser.on('disconnected', resolve));
} else {
  const args = task === 'start'
    ? [resolve('node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', '3100']
    : [resolve('node_modules/@playwright/test/cli.js'), ...(task === 'install' ? ['install','chromium'] : ['test','--config=playwright.spatial.config.ts', ...process.argv.slice(3)])];
  if (!['start','install','test'].includes(task)) throw new Error('Use start, install, test or review');
  const child = spawn(process.execPath, args, { cwd: task === 'start' ? resolve('frontend') : process.cwd(), env: process.env, stdio: 'inherit', windowsHide: true });
  child.on('exit', code => { process.exitCode = code ?? 1; });
}
