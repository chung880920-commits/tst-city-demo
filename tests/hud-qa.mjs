// AI Boost discoverability, ?test=1 shortcut, ?debug=1 stats, copy, and the unlock celebration at low fps.
const BASE = process.env.QA_URL ?? 'http://127.0.0.1:47321/';
const url = (q = '') => BASE + (q ? (BASE.includes('?') ? '&' : '?') + q : '');
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36';
const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: ANDROID };
const check = (name, ok, detail = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
const info = (p) => p.evaluate(() => __tst.info());

async function open(browser, opts, q, clear = true) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url(q));
  if (clear) {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  }
  await page.waitForTimeout(2500);
  return { ctx, page, errors };
}
const start = async (page, touch) => {
  if (touch) await page.tap('#start-btn');
  else await page.click('#start-btn');
  await page.waitForTimeout(700);
  await page.evaluate(() => __tst.setQuality('ultra'));
};
const fontPx = (page, sel) => page.$eval(sel, (e) => parseFloat(getComputedStyle(e).fontSize));

async function touchLocked(browser) {
  const { ctx, page, errors } = await open(browser, MOBILE);
  await start(page, true);
  let i = await info(page);
  const vis = await page.isVisible('#boost-btn');
  check('[touch] boost button shown from the start, greyed/locked with the count', vis && i.boostBtn.locked && i.boostBtn.count === '0/3', `visible=${vis} locked=${i.boostBtn.locked} count=${i.boostBtn.count}`);
  const countPx = await fontPx(page, '#boost-count');
  check('[touch] locked count text ≥ 20px', countPx >= 20, `${countPx}px`);
  await page.tap('#boost-btn', { force: true });
  await page.waitForTimeout(300);
  i = await info(page);
  const want = 'AI 能量未滿（0/3），再解鎖 3 個地標就用得！';
  const toastPx = await fontPx(page, '#toast');
  const tb = await page.locator('#toast').boundingBox();
  check('[touch] tapping the locked button shows the live-count toast', i.toast === want && i.boost.phase === 'idle', `"${i.toast}"`);
  check('[touch] toast text ≥ 20px and fits the 390px screen', toastPx >= 20 && tb.x >= 0 && tb.x + tb.width <= 390, `${toastPx}px, x ${tb.x.toFixed(0)}–${(tb.x + tb.width).toFixed(0)}`);

  // unlock the clock tower: count goes live to 1/3 and the celebration plays
  await page.evaluate(() => __tst.teleport(-30, 22, 0));
  await page.waitForSelector('#popup:not([hidden])', { timeout: 20000 });
  await page.tap('#popup-ok');
  await page.waitForTimeout(400);
  await page.tap('#boost-btn', { force: true });
  await page.waitForTimeout(300);
  i = await info(page);
  check('[touch] after 1 unlock: button reads 1/3 and the toast updates', i.boostBtn.count === '1/3' && i.toast === 'AI 能量未滿（1/3），再解鎖 2 個地標就用得！', `count=${i.boostBtn.count} "${i.toast}"`);
  const placeholder = await page.$eval('#popup .placeholder', (e) => e.textContent);
  check('popup copy reads 「小任務即將推出」', placeholder === '小任務即將推出', placeholder);

  await page.evaluate(() => __tst.setEnergy(3));
  await page.waitForTimeout(500);
  i = await info(page);
  check('[touch] at 3/3 the button unlocks (full colour, pulsing)', !i.boostBtn.locked && !i.boostBtn.hidden, `locked=${i.boostBtn.locked}`);
  await page.tap('#boost-btn', { force: true });
  await page.waitForTimeout(300);
  i = await info(page);
  check('[touch] full energy: tap starts the transform', i.boost.phase === 'transform' || i.boost.phase === 'active', i.boost.phase);
  check('[touch] no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

async function desktopLocked(browser) {
  const { ctx, page, errors } = await open(browser, { viewport: { width: 1280, height: 720 } });
  await start(page, false);
  let i = await info(page);
  check('[desktop] boost button hidden until full (E key is the trigger)', i.boostBtn.hidden, `hidden=${i.boostBtn.hidden}`);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  i = await info(page);
  check('[desktop] E with empty meter shows the live-count toast', i.toast === 'AI 能量未滿（0/3），再解鎖 3 個地標就用得！' && i.boost.phase === 'idle', `"${i.toast}"`);
  const statsHidden = await page.$eval('#stats', (e) => e.hidden);
  check('[desktop] fps / triangles / draw-calls line hidden without ?debug=1', statsHidden);
  check('[desktop] no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
  const d = await open(browser, { viewport: { width: 1280, height: 720 } }, 'debug=1');
  await start(d.page, false);
  await d.page.click('#settings-btn');
  await d.page.waitForTimeout(1500);
  const txt = await d.page.$eval('#stats', (e) => (e.hidden ? '' : e.textContent));
  check('[desktop] ?debug=1 shows the stats line', /fps/.test(txt), txt);
  await d.ctx.close();
}

async function testMode(browser) {
  for (const q of ['test=1', 'energy=full']) {
    const { ctx, page, errors } = await open(browser, MOBILE, q);
    await start(page, true);
    let i = await info(page);
    const badge = await page.isVisible('#test-badge');
    check(`[?${q}] starts with full AI energy and shows 測試模式`, i.test && i.boost.energy === 3 && !i.boostBtn.locked && badge, `energy=${i.boost.energy} badge=${badge}`);
    // transform → 5 s at 2× run speed → fold back, then refilled for another go
    await page.evaluate(() => __tst.teleport(-19, 30.5, Math.PI / 2));
    await page.tap('#boost-btn', { force: true });
    await page.waitForTimeout(1400);
    await page.evaluate(() => __tst.drive(1, 0, true));
    let vmax = 0, solid = false, sawActive = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 14000) {
      i = await info(page);
      if (i.boost.phase === 'active') sawActive = true;
      vmax = Math.max(vmax, i.vel);
      solid ||= i.insideSolid;
      if (sawActive && i.boost.phase === 'idle') break;
      await page.waitForTimeout(150);
    }
    await page.evaluate(() => __tst.stopDrive());
    i = await info(page);
    check(`[?${q}] boost ran (transform → active → fold → idle), into a wall without passing through`, sawActive && i.boost.phase === 'idle' && !solid, `vmax ${vmax.toFixed(1)} m/s, insideSolid ever=${solid}`);
    check(`[?${q}] energy refilled after the boost`, i.boost.energy === 3 && !i.boostBtn.locked, `energy=${i.boost.energy}`);
    const slot = await page.evaluate(() => [!!localStorage.getItem('tst-progress-test-v1'), !!localStorage.getItem('tst-progress-v1')]);
    check(`[?${q}] progress saved to the test slot only`, slot[0] && !slot[1], `test=${slot[0]} normal=${slot[1]}`);
    check(`[?${q}] no page errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  const { ctx, page } = await open(browser, MOBILE);
  await start(page, true);
  const i = await info(page);
  check('[normal URL] still starts at 0/3 energy, no test badge', !i.test && i.boost.energy === 0 && !(await page.isVisible('#test-badge')), `energy=${i.boost.energy}`);
  await ctx.close();
}

async function celebration(browser) {
  const { ctx, page, errors } = await open(browser, MOBILE);
  await start(page, true);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 20 });
  await page.evaluate(() => __tst.teleport(-30, 21, 0));
  await page.waitForFunction(() => __tst.info().found.includes('clock'), null, { timeout: 30000 });
  const tUnlock = Date.now();
  const fpsSamples = [];
  let peak = 0, conf = 0, size = 0;
  while (Date.now() - tUnlock < 1500) {
    const i = await info(page);
    fpsSamples.push(i.fps);
    peak = Math.max(peak, i.burst.spread);
    conf = Math.max(conf, i.celebrate);
    size = i.burst.size;
    await page.waitForTimeout(120);
  }
  const anim = await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.target?.closest?.('#celebrate')).length);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const fps = Math.min(...fpsSamples.filter((f) => f > 0));
  check('[low fps] unlock burst spreads ≥ 4 m within 1.5 s (time-based, not per-frame)', peak >= 4, `spread ${peak.toFixed(1)} m, sparkle size ${size}, measured fps as low as ${fps}`);
  check('[low fps] screen-space ring flash + confetti shown', conf >= 30 && anim >= 30, `${conf} elements, ${anim} running CSS animations`);
  const avatarCheer = await page.evaluate(() => __tst.info().state);
  check('[low fps] reward state then popup', avatarCheer === 'reward' || (await page.isVisible('#popup')), avatarCheer);
  check('[low fps] no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

export default async (browser) => {
  await touchLocked(browser);
  await desktopLocked(browser);
  await testMode(browser);
  await celebration(browser);
};
