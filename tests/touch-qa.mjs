const URL = process.env.QA_URL ?? 'http://127.0.0.1:47321/';
const UAS = {
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
};
const results = [];
const check = (name, ok, detail = '') => { results.push({ ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const info = (p) => p.evaluate(() => __tst.info());

const SPY = () => {
  window.__qa = { ctx: 0, ctxAllowed: 0, cancel: 0, lost: 0, selection: 0 };
  window.addEventListener('contextmenu', (e) => { __qa.ctx++; if (!e.defaultPrevented) __qa.ctxAllowed++; });
  document.addEventListener('selectionchange', () => { if (String(getSelection()).length) __qa.selection++; });
  window.addEventListener('DOMContentLoaded', () => {
    const z = document.getElementById('joystick');
    z.addEventListener('pointercancel', () => __qa.cancel++);
    z.addEventListener('lostpointercapture', () => __qa.lost++);
  });
};

async function longPressControl(browser) {
  // Does this Chrome raise a long-press context menu from CDP touches at all?
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: UAS.android });
  const page = await ctx.newPage();
  await page.setContent('<img id="i" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22300%22%3E%3Crect width=%22300%22 height=%22300%22 fill=%22red%22/%3E%3C/svg%3E">');
  await page.evaluate(() => { window.__n = 0; addEventListener('contextmenu', () => __n++); });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 150, id: 1 }] });
  await page.waitForTimeout(1500);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(300);
  const n = await page.evaluate(() => __n);
  await ctx.close();
  return n;
}

async function longDrag(browser, label, ua) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: ua });
  await ctx.addInitScript(SPY);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(2500);
  await page.tap('#start-btn');
  await page.waitForTimeout(400);
  await page.evaluate(() => { __tst.setQuality('low'); __tst.teleport(-30, 9.5, 0); __tst.setCam(Math.PI, 0.3, 7); });
  await page.waitForTimeout(800);
  const cdp = await ctx.newCDPSession(page);
  const box = await page.locator('.joy-base').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const t0 = Date.now();
  const z0 = (await info(page)).pos[2];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 7 }] });
  await page.waitForTimeout(2500); // finger held still: the classic long-press
  const afterHold = await page.evaluate(() => ({ ...__qa }));
  let y = cy, zs = [], st = 'play', j = 0;
  while (Date.now() - t0 < 40000) {
    y = Math.max(cy - 60, y - 6);
    const jitter = (j++ % 2) * 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + jitter, y, id: 7 }] });
    const i = await info(page);
    zs.push(i.pos[2]);
    st = i.state;
    if (st !== 'play' && Date.now() - t0 >= 5000) break;
    await page.waitForTimeout(80);
  }
  const dragMs = Date.now() - t0;
  const qa = await page.evaluate(() => ({ ...__qa })); // before lifting: release legitimately ends capture
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(2000);
  const i = await info(page);
  const monotonic = zs.every((z, k) => k === 0 || z >= zs[k - 1] - 0.01);
  check(`[${label}] long-press 2.5 s on joystick: no context menu reaches the browser`, afterHold.ctxAllowed === 0, `contextmenu events ${afterHold.ctx}, all prevented`);
  check(`[${label}] joystick drag held ${(dragMs / 1000).toFixed(1)} s (≥ 5 s) without pointercancel / lost capture`, dragMs >= 5000 && qa.cancel === 0 && qa.lost === 0, `pointercancel=${qa.cancel}, lostpointercapture=${qa.lost}`);
  check(`[${label}] walked continuously to 尖沙咀鐘樓 and unlock fired`, i.found.includes('clock') && monotonic && (await page.isVisible('#popup')), `z ${z0.toFixed(1)} → ${zs[zs.length - 1].toFixed(1)}, state=${st}, popup=${await page.isVisible('#popup')}`);
  check(`[${label}] no context menu / text selection during whole drag`, qa.ctxAllowed === 0 && qa.selection === 0, `contextmenu ${qa.ctx} (allowed ${qa.ctxAllowed}), selections ${qa.selection}`);

  // long-press on the open 3D canvas and on HUD buttons too
  if (await page.isVisible('#popup')) await page.tap('#popup-ok');
  await page.waitForTimeout(300);
  for (const sel of ['#game', '#run-btn', '#jump-btn', '#hud-portrait', '#settings-btn']) {
    const b = await page.locator(sel).boundingBox();
    const px = b ? b.x + b.width / 2 : 200, py = b ? b.y + b.height / 2 : 400;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sel === '#game' ? 200 : px, y: sel === '#game' ? 380 : py, id: 9 }] });
    await page.waitForTimeout(1200);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(200);
  }
  const qa2 = await page.evaluate(() => ({ ...__qa }));
  check(`[${label}] long-press on canvas / 跑 / 跳 / portrait / ⚙: no context menu`, qa2.ctxAllowed === 0 && qa2.selection === 0, `contextmenu ${qa2.ctx} (allowed ${qa2.ctxAllowed})`);
  const css = await page.evaluate(() => ['#game', '#joystick', '#run-btn', '#hud', 'body'].map((s) => { const c = getComputedStyle(document.querySelector(s)); return `${s}:${c.touchAction}/${c.userSelect || c.webkitUserSelect}/${c.webkitTouchCallout ?? 'n/a'}`; }).join(' '));
  check(`[${label}] touch-action none + user-select none on game surfaces`, !/:auto|\/text|\/auto/.test(css), css);
  check(`[${label}] no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

async function fontAudit(browser, label, opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(2500);
  const audit = () => page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own) continue;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (!r.width || !r.height || cs.visibility === 'hidden' || el.closest('[hidden]')) continue;
      const px = parseFloat(cs.fontSize);
      out.push({ t: el.textContent.trim().slice(0, 14), px });
    }
    return out;
  });
  const all = [];
  const grab = async (screen) => { for (const a of await audit()) all.push({ ...a, screen }); };
  await grab('title');
  if (opts.hasTouch) await page.tap('#start-btn'); else await page.click('#start-btn');
  await page.waitForTimeout(800);
  await page.evaluate(() => __tst.setEnergy(3));
  await page.waitForTimeout(500);
  await grab('hud');
  await page.evaluate(() => __tst.teleport(-30, 22, 0));
  await page.waitForTimeout(2500);
  await page.waitForSelector('#popup:not([hidden])', { timeout: 20000 });
  await page.waitForTimeout(800);
  await grab('popup');
  await page.click('#popup-ok');
  await page.click('#settings-btn');
  await page.waitForTimeout(400);
  await grab('settings');
  await page.click('#settings-close');
  for (const [x, z] of [[-54, 43], [28.6, -6.6]]) { await page.evaluate(([x, z]) => __tst.teleport(x, z, 0), [x, z]); await page.waitForSelector('#popup:not([hidden])', { timeout: 20000 }); await page.waitForTimeout(600); await page.click('#popup-ok'); }
  await page.waitForTimeout(500);
  await grab('complete');
  const small = all.filter((a) => a.px < 18);
  const min = all.reduce((m, a) => (a.px < m.px ? a : m), { px: 99 });
  const label2 = (n) => all.filter((a) => a.t.startsWith(n)).map((a) => `${a.px}px`)[0];
  check(`[${label}] all visible text ≥ 18px (${all.length} text elements, 5 screens)`, small.length === 0, small.length ? small.map((s) => `${s.screen}:"${s.t}" ${s.px}px`).join(', ') : `smallest ${min.px}px "${min.t}" (${min.screen}); 下一站 ${label2('下一站')}, （試玩版） ${label2('（試玩版）')}`);
  await ctx.close();
}

export default async (browser) => {
  const n = await longPressControl(browser);
  console.log(`control: a 1.5 s long-press on a plain image page raised ${n} contextmenu event(s) in this Chrome`);
  await longDrag(browser, 'Android Chrome UA', UAS.android);
  await longDrag(browser, 'iPhone UA', UAS.iphone);
  await fontAudit(browser, 'mobile portrait 390x844', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UAS.iphone });
  await fontAudit(browser, 'mobile landscape 844x390', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UAS.android });
  await fontAudit(browser, 'desktop 1280x720', { viewport: { width: 1280, height: 720 } });
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
};
