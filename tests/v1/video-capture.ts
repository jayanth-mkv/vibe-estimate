import fs from 'node:fs';
import type { BrowserContext, Page, TestInfo } from '@playwright/test';

// Capture instrumentation only: real pointer/keyboard actions still reach the
// unchanged application. No source text, token or invitation enters the manifest.
function overlay({ role }: { role: string }) {
  const mount = () => {
    if (!document.documentElement) return;
    if (!document.getElementById('v1-capture-style')) {
      const style = document.createElement('style'); style.id = 'v1-capture-style';
      style.textContent = '[aria-label="Room code"],input#join-code{color:transparent!important;text-shadow:none!important;caret-color:transparent!important}[aria-label="Room code"]::selection,input#join-code::selection{color:transparent!important;background:transparent!important}[aria-label="Scan to join the project room"]{opacity:0!important}';
      document.documentElement.append(style);
    }
    if (!document.body || document.getElementById('v1-capture-overlay')) return;
    const host = document.createElement('div'); host.id = 'v1-capture-overlay'; host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<style>:host{pointer-events:none}#role{position:absolute;bottom:12px;left:12px;padding:7px 12px;background:#142332;color:white;border:1px solid white;border-radius:8px;font:600 14px system-ui;box-shadow:0 2px 10px #0004}#sync{position:absolute;top:0;left:0;width:16px;height:16px;background:#142332}#pointer{position:absolute;left:0;top:0;display:none;width:20px;height:20px;border-radius:50%;border:3px solid white;background:#bd4b37;box-shadow:0 1px 5px #0008;transform:translate(-50%,-50%)}.ripple{position:absolute;width:24px;height:24px;border:4px solid #bd4b37;background:#fff8;border-radius:50%;transform:translate(-50%,-50%);animation:click .8s ease-out forwards}@keyframes click{to{width:72px;height:72px;opacity:0}}</style><div id="sync"></div><div id="role"></div><div id="pointer"></div>';
    shadow.getElementById('role')!.textContent = role;
    document.body.append(host);
    const pointer = shadow.getElementById('pointer') as HTMLElement;
    document.addEventListener('pointermove', event => { pointer.style.display = 'block'; pointer.style.left = event.clientX + 'px'; pointer.style.top = event.clientY + 'px'; }, { passive: true });
    document.addEventListener('pointerdown', event => {
      pointer.style.display = 'block'; pointer.style.left = event.clientX + 'px'; pointer.style.top = event.clientY + 'px';
      const ripple = document.createElement('div'); ripple.className = 'ripple'; ripple.style.left = event.clientX + 'px'; ripple.style.top = event.clientY + 'px'; shadow.append(ripple); setTimeout(() => ripple.remove(), 900);
    }, { passive: true });
    const sync = () => {
      let epoch = 0;
      try { epoch = Number(sessionStorage.getItem('v1-capture-epoch')); } catch { return; } // Initial about:blank has no storage origin.
      if (epoch > 0) setTimeout(() => { (shadow.getElementById('sync') as HTMLElement).style.background = '#ff00ff'; }, Math.max(0, epoch - Date.now()));
    };
    window.addEventListener('v1-capture-sync', sync); sync();
  };
  mount(); new MutationObserver(mount).observe(document, { childList: true, subtree: true });
}

export async function installRoleCapture(context: BrowserContext, role: 'Designer' | 'Homeowner') {
  await context.addInitScript(overlay, { role });
  for (const page of context.pages()) await page.evaluate(overlay, { role });
}

export async function synchronizeCapture(designer: Page, homeowner: Page, info: TestInfo, provider: 'fixture' | 'gemini', gitRevision?: string) {
  const epoch = Date.now() + 2000;
  const markers: { atMilliseconds: number; event: string }[] = [];
  for (const page of [designer, homeowner]) {
    await page.context().addInitScript(value => sessionStorage.setItem('v1-capture-epoch', String(value)), epoch);
    await page.evaluate(value => { sessionStorage.setItem('v1-capture-epoch', String(value)); window.dispatchEvent(new Event('v1-capture-sync')); }, epoch);
  }
  await new Promise(resolve => setTimeout(resolve, Math.max(0, epoch - Date.now()) + 500));
  return {
    mark(event: string) { markers.push({ atMilliseconds: Date.now() - epoch, event }); },
    async finish(complete: boolean) {
      const designerVideo = designer.video(), homeownerVideo = homeowner.video();
      await homeowner.close(); await designer.close();
      if (!designerVideo || !homeownerVideo) throw new Error('Both recorded role streams are required.');
      await Promise.all([designerVideo.saveAs(info.outputPath('designer.webm')), homeownerVideo.saveAs(info.outputPath('homeowner.webm'))]);
      fs.writeFileSync(info.outputPath('dual-capture.json'), JSON.stringify({ schemaVersion: 1, complete, provider, ...(gitRevision ? { gitRevision } : {}), syncEpoch: epoch, synchronization: 'First magenta corner frame is the shared wall-clock start; compositor aligns at 10 frames per second.', streams: { designer: 'designer.webm', homeowner: 'homeowner.webm' }, markers, redactedBeforeRender: ['invitation code', 'invitation QR'], separateIdentities: true, pointerOverlay: 'Synthetic cursor and click ripple following actual pointer events', speed: 1 }, null, 2));
    },
  };
}
