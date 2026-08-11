// 载入页截图 —— 必须在「真的还在载入」的时候拍。
// shot.mjs 会先等 window.SHANHAI 就绪，那时载入页早已淡出，
// 事后把它调回来会重放入场动画，拍到的是第 0 帧（还是全透明的）。
import { chromium } from 'playwright';

const out = process.argv[2] || 'boot.png';
const wait = parseInt(process.argv[3] || '2600', 10);
const W = parseInt(process.env.SHOT_W || '560', 10);
const H = parseInt(process.env.SHOT_H || '560', 10);

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROME || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-gl=angle',
         '--disable-gpu-sandbox', '--no-sandbox', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto('http://localhost:8123/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(wait);
const st = await page.evaluate(`(() => {
  const s = document.getElementById('gearStage');
  const r = document.querySelector('.gear-rig');
  return {
    plates: s ? s.querySelectorAll('.gp').length : 0,
    opacity: r ? getComputedStyle(r).opacity : null,
    loader: getComputedStyle(document.getElementById('loader')).display,
  };
})()`);
console.log('[state]', JSON.stringify(st));
await page.screenshot({ path: out, timeout: 240000 });
console.log('[ok]', out);
await browser.close();
