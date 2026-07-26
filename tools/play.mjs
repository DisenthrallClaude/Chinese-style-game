import { chromium } from 'playwright';
const out = process.argv[2] || 'play.png';
const script = process.argv[3] || '';
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-gl=angle',
         '--disable-gpu-sandbox', '--no-sandbox', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const logs = [];
page.on('console', m => { if (m.type()==='error'||m.type()==='warning') logs.push('['+m.type()+'] '+m.text().slice(0,240)); });
page.on('pageerror', e => logs.push('[pageerror] ' + e.message + ' | ' + (e.stack||'').split('\n')[1]));
await page.goto('http://localhost:8123/index.html', { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.SHANHAI !== undefined, null, { timeout: 240000, polling: 500 });
logs.push('[ok] booted');
await page.waitForTimeout(2000);
if (script) {
  try { const r = await page.evaluate(script); logs.push('[eval] ' + JSON.stringify(r).slice(0,900)); }
  catch (e) { logs.push('[evalerr] ' + e.message.slice(0,400)); }
}
await page.waitForTimeout(2500);
await page.screenshot({ path: out, timeout: 120000 });
console.log(logs.slice(-30).join('\n'));
await browser.close();
