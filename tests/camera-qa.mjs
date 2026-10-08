const URL = process.env.QA_URL ?? 'http://127.0.0.1:47321/';
const results = [];
const check = (name, ok, detail = '') => { results.push({ ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const QUICK = !!process.env.QA_QUICK;
const PICK0 = [[-5.1, -15.3], [-12.6, -28.6], [-63, -78.8], [-28, -8.6], [27, -37.3], [43, -69.9]];
const PICK = QUICK ? PICK0.slice(0, 2) : PICK0;
const UNIFORM_MAX = 0.9;

async function run(browser, label, opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(2500);
  await page.click('#start-btn');
  await page.waitForTimeout(600);
  await page.evaluate(() => { __tst.setQuality('low'); __tst.manual(true); });
  const all = await page.evaluate(() => __tst.shops());
  const shops = PICK.map(([x, z]) => all.reduce((b, s) => (Math.hypot(s.x - x, s.z - z) < Math.hypot(b.x - x, b.z - z) ? s : b)));

  const bad = [];
  let frames = 0, worstU = 0, worstAt = '', minCur = 99;
  const sample = async (tag, n, uniform) => {
    const r = await page.evaluate(([n, uniform]) => {
      const out = [];
      for (let i = 0; i < n; i++) {
        __tst.advance(33);
        const c = __tst.camState();
        out.push({ ...c, u: uniform && i === n - 1 ? __tst.viewUniformity() : 0, st: __tst.info().state, ph: __tst.info().boost.phase });
      }
      return out;
    }, [n, uniform]);
    for (const c of r) {
      frames++;
      minCur = Math.min(minCur, c.cur);
      if (c.u > worstU) { worstU = c.u; worstAt = tag; }
      if (c.inside || c.nearClip || c.u > UNIFORM_MAX) bad.push(`${tag} ${c.inside ? 'INSIDE' : c.nearClip ? 'near-clip' : `uniform ${c.u.toFixed(2)}`} cam(${c.pos.map((v) => v.toFixed(1))}) d=${c.cur.toFixed(2)} ${c.ph}`);
    }
  };

  // 1. static sweep: hug each storefront, aim the camera into / along the wall at several pitches
  for (const s of shops) {
    const tx = -s.nz, tz = s.nx;
    for (const a of [-s.len / 2 + 1, s.len / 2 - 1]) {
      const px = s.x + s.nx * 0.5 + tx * a, pz = s.z + s.nz * 0.5 + tz * a;
      for (const rel of QUICK ? [180] : [180, 135, 225]) {
        const base = Math.atan2(s.nx, s.nz);
        const yaw = base + (rel * Math.PI) / 180;
        for (const pitch of QUICK ? [1.1] : [0.05, 0.4, 1.1]) {
          await page.evaluate(([px, pz, h, yaw, pitch]) => { __tst.teleport(px, pz, h); __tst.setCam(yaw, pitch, 7); }, [px, pz, Math.atan2(tx, tz), yaw, pitch]);
          await sample(`${s.name}@${a.toFixed(1)} yaw${rel} p${pitch} first frames`, 2, false);
          await sample(`${s.name}@${a.toFixed(1)} yaw${rel} p${pitch} settled`, 18, true);
        }
      }
    }
  }
  check(`[${label}] static sweep: ${shops.length} storefronts × 2 spots × 3 wall-facing yaws × 3 pitches`, bad.length === 0, bad.slice(0, 4).join(' | '));
  const sweepBad = bad.length;

  // 2. walk hugging the wall (camera diagonally behind, on the wall side), walking, running, then AI Boost
  const walk = async (s, keys, n, tag, boost = false) => {
    const tx = -s.nz, tz = s.nx;
    const sx = s.x + s.nx * 0.6 - tx * (s.len / 2), sz = s.z + s.nz * 0.6 - tz * (s.len / 2);
    const heading = Math.atan2(tx, tz);
    // camera offset: behind the walker and toward the wall
    const yaw = Math.atan2(-tx - s.nx, -tz - s.nz);
    await page.evaluate(([sx, sz, h, yaw]) => { __tst.teleport(sx, sz, h); __tst.setCam(yaw, 0.35, 7); }, [sx, sz, heading, yaw]);
    if (boost) await page.evaluate(() => { __tst.setEnergy(3); __tst.boost(); });
    for (const k of keys) await page.keyboard.down(k);
    for (let i = 0; i < n; i += 10) await sample(tag, 10, i >= 20);
    for (const k of keys) await page.keyboard.up(k);
    await sample(tag, 10, true);
  };
  const before = bad.length;
  for (const s of QUICK ? [] : shops) {
    await walk(s, ['KeyW', 'KeyD'], 50, `${s.name} walk`);
    await walk(s, ['KeyW', 'KeyD', 'ShiftLeft'], 40, `${s.name} run`);
  }
  check(`[${label}] walking + running while hugging ${shops.length} storefronts`, bad.length === before, bad.slice(before, before + 4).join(' | '));
  const b2 = bad.length;
  for (const s of shops.slice(0, QUICK ? 1 : 4)) await walk(s, ['KeyW', 'KeyD'], 200, `${s.name} AI boost`, true);
  check(`[${label}] AI Boost transform + 5 s boost run along storefronts`, bad.length === b2, bad.slice(b2, b2 + 4).join(' | '));
  await page.evaluate(() => { for (let i = 0; i < 120; i++) __tst.advance(33); });

  // 3. unlock push-in at every checkpoint, camera pre-aimed at the nearest wall side
  const b3 = bad.length;
  for (const [x, z] of QUICK ? [] : [[-30, 22], [-54, 43], [28.6, -6.6]]) {
    await page.evaluate(([x, z]) => { __tst.teleport(x, z, 0); __tst.setCam(Math.PI * 0.75, 0.5, 7); }, [x, z]);
    await sample(`unlock (${x},${z})`, 90, true);
    await page.evaluate(() => document.getElementById('popup-ok').click());
    await sample(`unlock (${x},${z}) release`, 30, true);
  }
  check(`[${label}] unlock camera push-in at 3 checkpoints`, bad.length === b3, bad.slice(b3, b3 + 4).join(' | '));
  check(`[${label}] ${frames} frames audited: camera never inside / within near-plane of a surface`, bad.length === 0, `worst single-colour share ${(worstU * 100).toFixed(0)}% (${worstAt}), closest camera distance ${minCur.toFixed(2)} m`);
  check(`[${label}] no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
  return sweepBad;
}

export default async (browser) => {
  if (process.env.QA_CTX !== 'mobile') await run(browser, 'desktop 1280x720', { viewport: { width: 1280, height: 720 } });
  if (process.env.QA_CTX !== 'desktop') await run(browser, 'mobile 390x844', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
};
