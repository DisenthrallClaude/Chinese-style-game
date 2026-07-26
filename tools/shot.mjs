import { chromium } from 'playwright';
const args = process.argv.slice(2);
const out = args[0] || 'shot.png';
const waitMs = parseInt(args[1] || '18000', 10);
const evalJs = args[2] || '';
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-gl=angle',
         '--disable-gpu-sandbox', '--no-sandbox', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', m => logs.push('[' + m.type() + '] ' + m.text()));
page.on('pageerror', e => logs.push('[pageerror] ' + e.message + '\n' + (e.stack||'').split('\n').slice(0,4).join('\n')));
page.on('requestfailed', r => logs.push('[reqfail] ' + r.url() + ' ' + (r.failure()?.errorText||'')));
await page.goto('http://localhost:8123/index.html', { waitUntil: 'load', timeout: 60000 });
try {
  await page.waitForFunction(() => window.SHANHAI !== undefined, null, { timeout: waitMs, polling: 500 });
  logs.push('[ok] world booted');
} catch (e) { logs.push('[warn] boot timeout: ' + e.message.slice(0,120)); }
await page.evaluate(() => { const el = document.querySelector('#startScreen'); if (el) el.hidden = true; const l=document.querySelector('#loader'); if(l) l.style.display='none'; });
await page.waitForTimeout(4000);
if (evalJs) { try { const r = await page.evaluate(evalJs); logs.push('[eval] ' + JSON.stringify(r)); } catch(e){ logs.push('[evalerr] '+e.message.slice(0,200)); } }
await page.waitForTimeout(1500);
await page.screenshot({ path: out, timeout: 120000 });
console.log(logs.filter(l=>/error|Error|ERROR|pageerror|reqfail|\[ok\]|\[eval|WebGL|shader|program/i.test(l)).slice(-25).join('\n'));
await browser.close();
