// Scripted promo shot list, injected into the game page opened with ?record=1.
// step(t) runs once per frame after the clock tick and before the render; t = frame / fps.
(() => {
  const T = window.__tst;
  const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
  const lerp = (a, b, k) => a + (b - a) * k;
  const lerpAng = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

  const BOOST_AT = 7.2; // transform chord (armour lock) sounds 0.82 s later = beat drop at 8.02 s
  const RUN_START = { x: -44, z: 9.5 };
  const CP = { x: -30, z: 22 };
  const DASH = { x: -19, z: 30.5 };
  const runDir = (() => {
    const dx = CP.x - RUN_START.x, dz = CP.z - RUN_START.z, l = Math.hypot(dx, dz);
    return { x: dx / l, z: dz / l };
  })();

  const markers = {};
  const events = [
    [0.5, () => T.drive(runDir.x, runDir.z, true)],
    [5.0, () => {
      T.stopDrive();
      T.endReward();
      T.teleport(DASH.x, DASH.z, Math.PI / 2);
      T.setEnergy(3);
      markers.cut = 5.0;
    }],
    [BOOST_AT, () => {
      T.setNightLevel(0.6);
      markers.boostTrigger = BOOST_AT;
      markers.boostOk = T.boost();
    }],
    [8.2, () => T.drive(1, 0, true)],
    [12.9, () => T.drive(0, 0, false)],
    [13.6, () => T.stopDrive()],
  ];
  let next = 0;

  const cam = { px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0, init: false, unlockH: null, swingA: null };
  const set = (camera, p, l) => {
    camera.position.set(p[0], p[1], p[2]);
    camera.lookAt(l[0], l[1], l[2]);
  };
  const orbit = (pos, a, r, y) => [pos[0] + Math.sin(a) * r, pos[1] + y, pos[2] + Math.cos(a) * r];
  const smoothTo = (p, l, k) => {
    if (!cam.init) Object.assign(cam, { px: p[0], py: p[1], pz: p[2], lx: l[0], ly: l[1], lz: l[2], init: true });
    cam.px = lerp(cam.px, p[0], k); cam.py = lerp(cam.py, p[1], k); cam.pz = lerp(cam.pz, p[2], k);
    cam.lx = lerp(cam.lx, l[0], k); cam.ly = lerp(cam.ly, l[1], k); cam.lz = lerp(cam.lz, l[2], k);
    return [[cam.px, cam.py, cam.pz], [cam.lx, cam.ly, cam.lz]];
  };

  const camFn = (camera, t) => {
    const i = T.info();
    const pos = i.pos;
    const h = i.heading;
    const look = [pos[0], pos[1] + 1.4, pos[2]];
    if (t < 5.0) {
      if (i.found.includes('clock') && cam.unlockH === null) { cam.unlockH = h; markers.unlock = t; }
      const behindA = (cam.unlockH ?? h) + Math.PI;
      const swing = cam.unlockH === null ? 0 : ease((t - markers.unlock) / 1.6);
      // opening: high and wide behind the runner with the clock tower ahead, easing down into a chase
      const k = ease(t / 2.6);
      const p = orbit(pos, behindA - 0.35 * (1 - k) - swing * Math.PI * 0.8, lerp(15, lerp(5.6, 4.3, swing), k), lerp(9.5, lerp(2.7, 1.9, swing), k));
      const l = [lerp(-30, look[0], k), lerp(9, look[1], k), lerp(27, look[2], k)];
      cam.init = false;
      return set(camera, p, l);
    }
    if (t < BOOST_AT) {
      const a = Math.PI / 2 + 0.55 + (t - 5.0) * 0.08;
      cam.init = false;
      return set(camera, orbit(pos, a, 4.6, 1.7), [pos[0], pos[1] + 1.25, pos[2]]);
    }
    if (t < 8.2) {
      const k = ease((t - BOOST_AT) / 0.95);
      const a = Math.PI / 2 + 0.55 + (BOOST_AT - 5.0) * 0.08 - k * 0.62;
      const p = orbit(pos, a, lerp(4.6, 3.1, k), lerp(1.7, 1.2, k));
      const l = [pos[0], pos[1] + lerp(1.25, 1.4, k), pos[2]];
      if (t >= 8.02) {
        const s = Math.exp(-(t - 8.02) * 14) * 0.09;
        p[0] += Math.sin(t * 91) * s; p[1] += Math.sin(t * 73 + 1) * s; p[2] += Math.cos(t * 83) * s;
      }
      cam.init = false;
      cam.last = [p, l];
      return set(camera, p, l);
    }
    if (t < 13.0) {
      const target = [pos[0] - 3.0, pos[1] + 1.45, pos[2] - 3.5];
      const tl = [pos[0] + 2.0, pos[1] + 1.1, pos[2] + 0.8];
      // orbit (relative to the moving avatar) from the front close-up round to the tracking offset
      if (!cam.from) {
        const rx = cam.last[0][0] - pos[0], rz = cam.last[0][2] - pos[2];
        cam.from = { a: Math.atan2(rx, rz), r: Math.hypot(rx, rz), y: cam.last[0][1] - pos[1] };
      }
      const k = ease((t - 8.2) / 0.8);
      const aT = Math.atan2(target[0] - pos[0], target[2] - pos[2]);
      const a = lerpAng(cam.from.a, aT, k);
      const r = lerp(cam.from.r, Math.hypot(target[0] - pos[0], target[2] - pos[2]), k);
      const p = orbit(pos, a, r, lerp(cam.from.y, target[1] - pos[1], k));
      const l = [pos[0], pos[1] + 1.35, pos[2]].map((v, j) => lerp(v, tl[j], k));
      const s = smoothTo(p, l, t < 9.0 ? 1 : 0.35);
      return set(camera, s[0], s[1]);
    }
    if (cam.swingA === null) {
      cam.swingA = Math.atan2(camera.position.x - pos[0], camera.position.z - pos[2]);
      cam.swingR = Math.hypot(camera.position.x - pos[0], camera.position.z - pos[2]);
      cam.swingY = camera.position.y - pos[1];
    }
    const k = ease((t - 13.0) / 1.8);
    const a = lerpAng(cam.swingA, Math.PI / 2 + 0.45, k) + Math.max(0, t - 14.8) * 0.05;
    const p = orbit(pos, a, lerp(cam.swingR, 5.0, k), lerp(cam.swingY, 1.9, k) + Math.max(0, t - 14.0) * 0.35);
    const s = smoothTo(p, look, 0.5);
    return set(camera, s[0], s[1]);
  };

  window.__promo = {
    BOOST_AT,
    markers,
    setup() {
      T.start();
      T.setNight(false, true);
      T.teleport(RUN_START.x, RUN_START.z, Math.atan2(runDir.x, runDir.z));
      T.camOverride(camFn);
    },
    step(t) {
      while (next < events.length && events[next][0] <= t + 1e-6) events[next++][1]();
    },
  };
})();
