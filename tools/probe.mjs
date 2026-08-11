// 无头体检：启动 -> 可选脚本 -> 取状态。截图另走 shot.mjs。
import { chromium } from 'playwright';
import fs from 'fs';

const scriptFile = process.argv[2];
const waitAfter = parseInt(process.argv[3] || '2500', 10);
const shot = process.argv[4] || '';
const script = scriptFile && fs.existsSync(scriptFile) ? fs.readFileSync(scriptFile, 'utf8') : '';

// 沙盒里 playwright 缓存的浏览器版本号有时与包内写死的对不上；
// PW_CHROME 给一个出口，直接指到实际存在的那份可执行文件
const exe = process.env.PW_CHROME || undefined;
const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-gl=angle',
         '--disable-gpu-sandbox', '--no-sandbox', '--ignore-gpu-blocklist'],
});
const W = parseInt(process.env.SHOT_W || '1280', 10);
const H = parseInt(process.env.SHOT_H || '720', 10);
const page = await browser.newPage({ viewport: { width: W, height: H } });
const logs = [];
page.on('console', m => { if (m.type() === 'error') logs.push('[err] ' + m.text().slice(0, 400)); });
page.on('pageerror', e => logs.push('[pageerror] ' + e.message + ' | ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));

try {
  await page.goto('http://localhost:8123/index.html', { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.SHANHAI !== undefined || window.__ERR, null,
    { timeout: 300000, polling: 500 });
  const boot = await page.evaluate('window.__ERR || "booted"');
  logs.push('[boot] ' + boot);
  await page.waitForTimeout(1200);

  if (script) {
    try { logs.push('[setup] ' + JSON.stringify(await page.evaluate(script)).slice(0, 1600)); }
    catch (e) { logs.push('[setuperr] ' + e.message.slice(0, 600)); }
  }
  await page.waitForTimeout(waitAfter);

  try {
    const st = await page.evaluate(`(()=>{const S=window.SHANHAI, G=S.game; return {
      level: S.world.level.name, lvIdx: G.levelIndex,
      state: G.state, wave: G.waveIndex, waveMax: G.waveCount,
      heart: G.heart, gold: G.gold,
      slots: G.grid.slots.length, towers: G.towers.towers.length,
      alive: G.enemies.count, kills: G.stats.kills, leaks: G.enemies.leakCount,
      pathLen: Math.round(S.game.enemies ? 0 : 0),
      fps: Math.round(S.engine.fps), frames: window.__N||0, err: window.__ERR||null
    }})()`);
    logs.push('[state] ' + JSON.stringify(st));
  } catch (e) { logs.push('[stateerr] ' + e.message.slice(0, 400)); }

  if (shot) {
    try { await page.screenshot({ path: shot, timeout: 240000 }); logs.push('[shot] ' + shot); }
    catch (e) { logs.push('[shoterr] ' + e.message.slice(0, 200)); }
  }
} catch (e) {
  logs.push('[fatal] ' + e.message.slice(0, 400));
}
console.log(logs.slice(-40).join('\n'));
await browser.close();
