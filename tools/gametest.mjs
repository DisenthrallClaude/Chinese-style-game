import { chromium } from 'playwright';
import fs from 'fs';
const out = process.argv[2] || 'g.png';
const scriptFile = process.argv[3];
const waitAfter = parseInt(process.argv[4] || '12000', 10);
const script = scriptFile ? fs.readFileSync(scriptFile, 'utf8') : '';
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-gl=angle',
         '--disable-gpu-sandbox', '--no-sandbox', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const logs = [];
page.on('console', m => { if (m.type()==='error') logs.push('[err] '+m.text().slice(0,300)); });
page.on('pageerror', e => logs.push('[pageerror] ' + e.message + ' | ' + (e.stack||'').split('\n').slice(1,3).join(' | ')));
await page.goto('http://localhost:8123/index.html', { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.SHANHAI !== undefined, null, { timeout: 260000, polling: 500 });
logs.push('[ok] booted');
await page.waitForTimeout(1500);
if (script) {
  try { logs.push('[setup] ' + JSON.stringify(await page.evaluate(script)).slice(0,900)); }
  catch (e) { logs.push('[setuperr] ' + e.message.slice(0,500)); }
}
await page.waitForTimeout(waitAfter);
try {
  const st = await page.evaluate(`(()=>{const G=window.SHANHAI.game;return{
    state:G.state, wave:G.waveIndex, waveActive:G.waveActive, heart:G.heart, gold:G.gold,
    alive:G.enemies.count, spawned:G.enemies.all.length, kills:G.stats.kills,
    leaks:G.enemies.leakCount, queue:G.spawnQueue.length,
    proj:G.projectiles.list.length, eff:+G.towers.efficiency.toFixed(2),
    supply:G.towers.supply, demand:G.towers.demand,
    powered:G.towers.towers.filter(t=>t.powered).length, towers:G.towers.towers.length,
    dmg:Math.round(G.towers.towers.reduce((a,t)=>a+t.damageDone,0)),
    fps:Math.round(window.SHANHAI.engine.fps)
  }})()`);
  logs.push('[state] ' + JSON.stringify(st));
} catch (e) { logs.push('[stateerr] ' + e.message.slice(0,300)); }
await page.screenshot({ path: out, timeout: 120000 });
console.log(logs.slice(-30).join('\n'));
await browser.close();
