// 截图：node tools/shot.mjs <out.png> <setup.js> [waitMs]
import { chromium } from 'playwright';
import fs from 'fs';

const out = process.argv[2] || 'shot.png';
const scriptFile = process.argv[3];
const waitAfter = parseInt(process.argv[4] || '2000', 10);
const script = scriptFile && fs.existsSync(scriptFile) ? fs.readFileSync(scriptFile, 'utf8') : '';

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-gl=angle',
         '--disable-gpu-sandbox', '--no-sandbox', '--ignore-gpu-blocklist'],
});
const W = parseInt(process.env.SHOT_W || '900', 10);
const H = parseInt(process.env.SHOT_H || '560', 10);
const page = await browser.newPage({ viewport: { width: W, height: H } });
const logs = [];
page.on('pageerror', e => logs.push('[pageerror] ' + e.message.slice(0, 200)));
await page.goto('http://localhost:8123/index.html', { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.SHANHAI !== undefined || window.__ERR, null,
  { timeout: 300000, polling: 500 });
await page.waitForTimeout(1500);
if (script) {
  try { logs.push('[setup] ' + JSON.stringify(await page.evaluate(script)).slice(0, 400)); }
  catch (e) { logs.push('[setuperr] ' + e.message.slice(0, 300)); }
}
await page.waitForTimeout(waitAfter);
try { await page.screenshot({ path: out, timeout: 280000 }); logs.push('[ok] ' + out); }
catch (e) { logs.push('[shoterr] ' + e.message.slice(0, 160)); }
console.log(logs.join('\n'));
await browser.close();
