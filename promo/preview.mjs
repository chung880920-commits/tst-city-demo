import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const SIZE = Number(process.env.SIZE ?? 480);
const EVERY = Number(process.env.EVERY ?? 15);
const browser = await chromium.launch({ executablePath: '/usr/local/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:47321/');
await page.evaluate(() => localStorage.clear());
await page.goto('http://127.0.0.1:47321/?record=1');
await page.waitForFunction(() => window.__tst && document.body.classList.contains('rec'));
await page.addScriptTag({ path: '/workspace/promo/timeline.js' });
await page.evaluate(() => { __promo.setup(); __tst.recBegin(); });
mkdirSync('/tmp/promo/dry', { recursive: true });
const t0 = Date.now();
for (let f = 0; f < 540; f++) {
  const r = await page.evaluate(([f, keep]) => {
    const t = __tst.tick(f === 0 ? 0 : 1000 / 30);
    __promo.step(t);
    const img = __tst.renderGrab('image/jpeg', 0.8);
    const i = __tst.info();
    return { t, img: keep ? img : null, s: `${i.state}/${i.boost.phase} k=${i.boost.k.toFixed(2)} pos=${i.pos.map((v) => v.toFixed(1))} found=${i.found} night=${i.night.toFixed(2)}` };
  }, [f, f % EVERY === 0]);
  if (r.img) {
    writeFileSync(`/tmp/promo/dry/${String(f).padStart(4, '0')}.jpg`, Buffer.from(r.img.split(',')[1], 'base64'));
    console.log(f, r.t.toFixed(3), r.s);
  }
}
const sounds = await page.evaluate(() => __tst.soundLog());
console.log('sounds', sounds.filter((s) => s.fn !== 'step' && s.fn !== 'updateAmbience').map((s) => `${s.fn}@${s.t.toFixed(3)}`).join(' '), 'steps', sounds.filter((s) => s.fn === 'step').length);
console.log('markers', JSON.stringify(await page.evaluate(() => __promo.markers)));
console.log('errors', errors, 'secs', (Date.now() - t0) / 1000);
await browser.close();
