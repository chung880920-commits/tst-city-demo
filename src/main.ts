import * as THREE from 'three';
import './style.css';
import { Sound } from './audio';
import { createAvatar, renderPortraits } from './avatar';
import { createLights, createSky, createTimeOfDay, createWater, FOG_COLOR, SUN_DIR } from './env';
import { Burst, FootTrail, GuideLine, Navigator } from './guide';
import { Input } from './input';
import { Minimap } from './minimap';
import { BOUNDS, buildWorld, CHECKPOINTS, CLOCK_TOWER, ZONES, type AABB } from './world';

type Quality = 'ultra' | 'low' | 'high';
const QUALITY_LABEL: Record<Quality, string> = { ultra: '省電', low: '流暢', high: '高畫質' };

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const store = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string | null) {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};

const PROGRESS_KEY = 'tst-progress-v1';
interface Progress {
  found: string[];
  x: number;
  z: number;
  heading: number;
  energy?: number;
}

/** No 中/EN switch exists yet; the English line is kept here for when one is added. */
const BOOST_LINE = { zh: '轉型唔係換人，係升級自己', en: "Transformation isn't replacing you. It's upgrading you." };
const BOOST_TIME = { transform: 1.0, active: 5.0, fold: 0.8 };
const ENERGY_MAX = 3;
const RECHARGE_SECONDS = 12;

const IDLE_LINES = ['差少少啫，跟住金線行！', '下一站就喺前面，跟住金線行！', '加油！跟住地上金線就搵到！'];

function fail(msg?: string) {
  $('title-screen').hidden = true;
  $('hud').hidden = true;
  if (msg) $('error-msg').textContent = msg;
  $('error').hidden = false;
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

if (!webglAvailable()) fail();
else boot();

function boot() {
  /** Wall clock, or a stepped clock when automated captures drive the game frame by frame. */
  const clock = { manual: false, t: 0, now: () => (clock.manual ? clock.t : performance.now()) };
  const canvas = $<HTMLCanvasElement>('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = FOG_COLOR.clone();
  scene.fog = new THREE.Fog(FOG_COLOR.clone(), 80, 1700);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 3000);

  const sky = createSky();
  scene.add(sky);
  const water = createWater();
  scene.add(water.mesh);
  const { sun, hemi } = createLights(scene);
  const world = buildWorld();
  scene.add(world.group);
  const colliders = world.colliders;
  // The one extra real light: a warm street-lamp glow that follows the player at night.
  const lamp = new THREE.PointLight('#ffc27a', 0, 22, 1.3);
  scene.add(lamp);
  const setTimeOfDay = createTimeOfDay({ scene, sky, water: water.uniforms, hemi, sun, lamp, mats: world.nightMats });

  // ---------------------------------------------------------------- player
  const avatar = createAvatar();
  scene.add(avatar.root);
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.45, 16).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.28, depthWrite: false }),
  );
  scene.add(blob);

  const SPAWN = { x: -12, z: 31, heading: -Math.PI / 2 - 0.35 };
  const player = {
    pos: new THREE.Vector3(SPAWN.x, 0, SPAWN.z),
    vel: new THREE.Vector3(),
    vy: 0,
    heading: SPAWN.heading,
    grounded: true,
    radius: 0.42,
  };
  const BASE_Y = 0.08;
  player.pos.y = BASE_Y;

  // ------------------------------------------------------------ checkpoints
  const found = new Set<string>();
  const beamMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { time: { value: 0 }, color: { value: new THREE.Color('#f5c542') } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float time; uniform vec3 color; varying vec2 vUv;
      void main(){ float a = (1.0 - vUv.y) * (0.55 + 0.15 * sin(time * 3.0 + vUv.y * 12.0));
      gl_FragColor = vec4(color * a, a); }`,
  });
  const cpVisuals = CHECKPOINTS.map((cp) => {
    const g = new THREE.Group();
    g.position.set(cp.x, 0.1, cp.z);
    const ringMat = new THREE.MeshBasicMaterial({ color: '#f5c542' });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.13, 6, 28).rotateX(Math.PI / 2), ringMat);
    ring.position.y = 0.08;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 26, 16, 1, true), beamMat);
    beam.position.y = 13;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), new THREE.MeshBasicMaterial({ color: '#ffe17a' }));
    gem.position.y = 2.3;
    gem.scale.y = 1.4;
    g.add(ring, beam, gem);
    scene.add(g);
    return { cp, g, ring, ringMat, beam, gem };
  });
  const setCheckpointDone = (id: string, done: boolean) => {
    const v = cpVisuals.find((c) => c.cp.id === id)!;
    v.beam.visible = !done;
    v.gem.visible = !done;
    v.ringMat.color.set(done ? '#3fbf6a' : '#f5c542');
  };

  // ------------------------------------------------------------ guidance & fx
  const nav = new Navigator(colliders.slice(0, world.staticCount));
  const guide = new GuideLine();
  scene.add(guide.mesh);
  const burst = new Burst(140);
  scene.add(burst.points);
  const trail = new FootTrail();
  scene.add(trail.mesh);
  type BoostPhase = 'idle' | 'transform' | 'active' | 'fold';
  const boost = { phase: 'idle' as BoostPhase, t: 0, k: 0, thrust: 0, energy: 0, recharge: 0, announced: false };

  // -------------------------------------------------------------- systems
  const input = new Input(canvas);
  const minimap = new Minimap($<HTMLCanvasElement>('minimap'), world.map);
  const sound = new Sound();

  const savedQuality = store.get('tst-quality');
  const manualQuality = savedQuality === 'ultra' || savedQuality === 'low' || savedQuality === 'high';
  let quality: Quality = manualQuality ? (savedQuality as Quality) : input.isTouch ? 'low' : 'high';
  const auto = { active: !manualQuality, start: 0, frames: 0, rounds: 0, fps: 0, decided: '' };

  const applyQuality = () => {
    const dpr = window.devicePixelRatio || 1;
    const pr = quality === 'high' ? Math.min(dpr, 2) : quality === 'low' ? Math.min(dpr, 1.25) : Math.max(0.6, Math.min(dpr, 1) * 0.75);
    renderer.setPixelRatio(pr);
    const shadows = quality === 'high';
    const lampOn = quality !== 'ultra';
    if (renderer.shadowMap.enabled !== shadows || lamp.visible !== lampOn) {
      renderer.shadowMap.enabled = shadows;
      sun.castShadow = shadows;
      lamp.visible = lampOn;
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (m) m.needsUpdate = true;
      });
    }
    blob.visible = !shadows;
    trail.max = quality === 'ultra' ? 14 : quality === 'low' ? 26 : 48;
    document.querySelectorAll<HTMLButtonElement>('[data-quality]').forEach((b) => b.classList.toggle('active', b.dataset.quality === quality));
    resize();
  };

  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = camera.aspect < 1 ? 70 : 55;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  renderer.shadowMap.enabled = true;
  applyQuality();

  // ---------------------------------------------------------------- camera
  const cam = {
    yaw: SPAWN.heading + Math.PI,
    pitch: 0.3,
    dist: 7,
    cur: 7,
    focus: player.pos.clone().add(new THREE.Vector3(0, 1.45, 0)),
    /** 0..1 blend toward the close-up "reward" framing in front of the player. */
    push: 0,
    pushTarget: 0,
  };

  const rayBox = (o: THREE.Vector3, d: THREE.Vector3, b: AABB, maxT: number) => {
    let tmin = 0;
    let tmax = maxT;
    const mins = [b.minX, -1, b.minZ];
    const maxs = [b.maxX, b.h, b.maxZ];
    const os = [o.x, o.y, o.z];
    const ds = [d.x, d.y, d.z];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(ds[i]) < 1e-6) {
        if (os[i] < mins[i] || os[i] > maxs[i]) return Infinity;
      } else {
        let t1 = (mins[i] - os[i]) / ds[i];
        let t2 = (maxs[i] - os[i]) / ds[i];
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return Infinity;
      }
    }
    return tmin;
  };

  const angleTo = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
  const tmpDir = new THREE.Vector3();
  const updateCamera = (dt: number, moving: number) => {
    const orbit = input.consumeOrbit();
    const sens = input.isTouch ? 0.009 : 0.006;
    cam.yaw -= orbit.x * sens;
    cam.pitch = THREE.MathUtils.clamp(cam.pitch + orbit.y * sens * 0.8, -0.3, 1.15);

    cam.push += (cam.pushTarget - cam.push) * Math.min(1, dt * 3.5);
    const now = clock.now() / 1000;
    if (cam.pushTarget > 0) {
      // swing round to face the cheering avatar
      cam.yaw += angleTo(cam.yaw, player.heading + 0.35) * Math.min(1, dt * 3);
    } else if (moving > 0.1 && now - input.lastOrbitAt > 1.4 && input.move.y > -0.3) {
      cam.yaw += angleTo(cam.yaw, player.heading + Math.PI) * Math.min(1, dt * 1.6 * moving);
    }

    const closeK = Math.max(0, cam.push);
    const goal = tmpDir.set(player.pos.x, player.pos.y + 1.75 - closeK * 0.5, player.pos.z);
    cam.focus.lerp(goal, Math.min(1, dt * 14));

    const pitch = THREE.MathUtils.lerp(cam.pitch, 0.16, closeK);
    const dir = new THREE.Vector3(Math.sin(cam.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(cam.yaw) * Math.cos(pitch));
    const desired = cam.dist * (camera.aspect < 1 ? 1.15 : 1) * (1 - 0.55 * cam.push);
    let hit = desired;
    for (const c of colliders) {
      const t = rayBox(cam.focus, dir, c, desired + 0.5);
      if (t < hit + 0.4) hit = Math.min(hit, t - 0.4);
    }
    hit = Math.max(1.2, hit);
    cam.cur += (hit - cam.cur) * Math.min(1, dt * (hit < cam.cur ? 18 : 3));
    camera.position.copy(cam.focus).addScaledVector(dir, cam.cur);
    camera.position.y = Math.max(camera.position.y, 0.5);
    camera.lookAt(cam.focus);
  };

  // ---------------------------------------------------------------- physics
  const WALK = 3.8;
  const RUN = 7.6;
  const GRAVITY = 24;
  const JUMP_V = 7.5;

  const BOOST_SPEED = RUN * 2;
  /** Largest horizontal move per collision pass; well under the player radius so nothing tunnels. */
  const SUBSTEP = 0.18;
  const lastSafe = new THREE.Vector3().copy(player.pos);

  /** Pushes the player circle out of every box it overlaps; returns the floor height underneath. */
  const resolveCollisions = () => {
    let ground = BASE_Y;
    const r = player.radius;
    for (let iter = 0; iter < 2; iter++) {
      for (const c of colliders) {
        if (player.pos.x < c.minX - r || player.pos.x > c.maxX + r || player.pos.z < c.minZ - r || player.pos.z > c.maxZ + r) continue;
        if (player.pos.y >= c.h - 0.08) {
          if (player.pos.x > c.minX - r * 0.4 && player.pos.x < c.maxX + r * 0.4 && player.pos.z > c.minZ - r * 0.4 && player.pos.z < c.maxZ + r * 0.4) {
            ground = Math.max(ground, c.h);
          }
          continue;
        }
        const cx = THREE.MathUtils.clamp(player.pos.x, c.minX, c.maxX);
        const cz = THREE.MathUtils.clamp(player.pos.z, c.minZ, c.maxZ);
        const dx = player.pos.x - cx;
        const dz = player.pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 > r * r) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          player.pos.x += (dx / d) * (r - d);
          player.pos.z += (dz / d) * (r - d);
        } else {
          const pen = [player.pos.x - c.minX, c.maxX - player.pos.x, player.pos.z - c.minZ, c.maxZ - player.pos.z];
          const m = Math.min(...pen);
          if (m === pen[0]) player.pos.x = c.minX - r;
          else if (m === pen[1]) player.pos.x = c.maxX + r;
          else if (m === pen[2]) player.pos.z = c.minZ - r;
          else player.pos.z = c.maxZ + r;
        }
      }
    }
    player.pos.x = THREE.MathUtils.clamp(player.pos.x, BOUNDS.minX, BOUNDS.maxX);
    player.pos.z = THREE.MathUtils.clamp(player.pos.z, BOUNDS.minZ, BOUNDS.maxZ);
    return ground;
  };

  const insideSolid = () => {
    for (const c of colliders) {
      if (player.pos.y + 0.3 >= c.h) continue;
      if (player.pos.x > c.minX + 0.05 && player.pos.x < c.maxX - 0.05 && player.pos.z > c.minZ + 0.05 && player.pos.z < c.maxZ - 0.05) return true;
    }
    return false;
  };

  const stepPlayer = (dt: number) => {
    input.poll();
    const mx = input.move.x;
    const my = input.move.y;
    const mag = Math.min(1, Math.hypot(mx, my));
    const fwdX = -Math.sin(cam.yaw);
    const fwdZ = -Math.cos(cam.yaw);
    const rightX = Math.cos(cam.yaw);
    const rightZ = -Math.sin(cam.yaw);
    const boosting = boost.phase === 'active';
    const speed = boosting ? BOOST_SPEED : input.running ? RUN : WALK;
    const tx = (fwdX * my + rightX * mx) * speed;
    const tz = (fwdZ * my + rightZ * mx) * speed;
    const accel = player.grounded ? (boosting ? 7 : 12) : 4;
    player.vel.x += (tx - player.vel.x) * Math.min(1, dt * accel);
    player.vel.z += (tz - player.vel.z) * Math.min(1, dt * accel);
    const planarNow = Math.hypot(player.vel.x, player.vel.z);
    const cap = boosting ? BOOST_SPEED : RUN;
    if (planarNow > cap) player.vel.multiplyScalar(cap / planarNow);

    // jump & gravity
    if (input.consumeJump() && player.grounded) {
      player.vy = JUMP_V;
      player.grounded = false;
    }
    player.vy -= GRAVITY * dt;
    player.pos.y += player.vy * dt;

    // swept movement: split the frame's motion into substeps and resolve each one
    const moveX = player.vel.x * dt;
    const moveZ = player.vel.z * dt;
    const steps = Math.max(1, Math.ceil(Math.hypot(moveX, moveZ) / SUBSTEP));
    let ground = BASE_Y;
    for (let i = 0; i < steps; i++) {
      player.pos.x += moveX / steps;
      player.pos.z += moveZ / steps;
      ground = resolveCollisions();
    }
    if (insideSolid()) {
      player.pos.x = lastSafe.x;
      player.pos.z = lastSafe.z;
      player.vel.x = player.vel.z = 0;
      ground = resolveCollisions();
    } else {
      lastSafe.set(player.pos.x, 0, player.pos.z);
    }

    if (player.pos.y <= ground) {
      player.pos.y = ground;
      player.vy = 0;
      player.grounded = true;
    } else if (player.pos.y > ground + 0.05) {
      player.grounded = false;
    }
    if (!Number.isFinite(player.pos.y) || player.pos.y < -1) {
      player.pos.set(lastSafe.x, BASE_Y, lastSafe.z);
      player.vy = 0;
    }

    const planar = Math.hypot(player.vel.x, player.vel.z);
    if (planar > 0.3 && mag > 0.05) {
      const target = Math.atan2(player.vel.x, player.vel.z);
      const diff = Math.atan2(Math.sin(target - player.heading), Math.cos(target - player.heading));
      player.heading += diff * Math.min(1, dt * 12);
    }
    avatar.root.position.copy(player.pos);
    avatar.root.rotation.y = player.heading;
    blob.position.set(player.pos.x, ground + 0.03, player.pos.z);
    const lift = player.pos.y - ground;
    blob.scale.setScalar(Math.max(0.4, 1 - lift * 0.25));
    return { move: planar / WALK, running: (input.running || boosting) && planar > WALK * 0.9 };
  };

  // -------------------------------------------------------------------- UI
  const portraits = renderPortraits();
  for (const id of ['title-portrait', 'complete-portrait']) $<HTMLImageElement>(id).src = portraits.bust;
  $<HTMLImageElement>('hud-portrait').src = portraits.head;

  type State = 'title' | 'play' | 'reward' | 'modal';
  let state: State = 'title';
  const startBtn = $<HTMLButtonElement>('start-btn');
  startBtn.disabled = false;
  startBtn.textContent = '開始';

  const zoneToast = $('zone-toast');
  let currentZone = '';
  let toastTimer = 0;
  const showZone = (name: string) => {
    zoneToast.textContent = name;
    zoneToast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => zoneToast.classList.remove('show'), 2600);
  };
  const toast = $('toast');
  let toastTimer2 = 0;
  const showToast = (msg: string) => {
    toast.textContent = msg;
    toast.classList.add('show');
    window.clearTimeout(toastTimer2);
    toastTimer2 = window.setTimeout(() => toast.classList.remove('show'), 3500);
  };

  const nextCheckpoint = () => CHECKPOINTS.find((c) => !found.has(c.id)) ?? null;
  const objective = $('objective');
  const updateObjective = () => {
    const n = nextCheckpoint();
    if (!n) {
      objective.textContent = '✔ 全部寶藏已搵齊';
      return;
    }
    const d = Math.round(Math.hypot(n.x - player.pos.x, n.z - player.pos.z));
    objective.innerHTML = `<small>下一站</small><span class="obj-name">${n.name}</span><span class="obj-dist">${d} 米</span>`;
  };

  const updateCount = () => {
    $('count').textContent = String(found.size);
    $('popup-count').textContent = String(found.size);
  };

  // ------------------------------------------------------------- progress
  const saveProgress = () => {
    const p: Progress = { found: [...found], x: player.pos.x, z: player.pos.z, heading: player.heading, energy: boost.energy };
    store.set(PROGRESS_KEY, JSON.stringify(p));
  };
  const loadProgress = () => {
    try {
      const raw = store.get(PROGRESS_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as Progress;
      for (const id of p.found ?? []) {
        if (CHECKPOINTS.some((c) => c.id === id)) {
          found.add(id);
          setCheckpointDone(id, true);
        }
      }
      if (Number.isFinite(p.x) && Number.isFinite(p.z) && !nav.blocked({ x: p.x, z: p.z })) {
        player.pos.set(THREE.MathUtils.clamp(p.x, BOUNDS.minX, BOUNDS.maxX), BASE_Y, THREE.MathUtils.clamp(p.z, BOUNDS.minZ, BOUNDS.maxZ));
        player.heading = Number.isFinite(p.heading) ? p.heading : player.heading;
      }
      boost.energy = THREE.MathUtils.clamp(Math.floor(Number(p.energy) || 0), 0, ENERGY_MAX);
      boost.announced = boost.energy >= ENERGY_MAX;
      const note = $('resume-note');
      note.hidden = false;
      note.textContent = found.size === CHECKPOINTS.length ? '已完成全部寶藏，可以繼續周圍行' : `已保存進度：${found.size}/${CHECKPOINTS.length}，撳開始繼續`;
    } catch {
      store.set(PROGRESS_KEY, null);
    }
  };
  loadProgress();
  updateCount();
  const saveIfPlaying = () => {
    if (state !== 'title') saveProgress();
  };
  window.addEventListener('pagehide', saveIfPlaying);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveIfPlaying();
  });

  // --------------------------------------------------------------- modals
  const openModal = (id: string) => {
    state = 'modal';
    input.enabled = false;
    input.reset();
    $(id).hidden = false;
    $(id).querySelector('button')?.focus({ preventScroll: true });
  };
  const closeModal = (id: string) => {
    $(id).hidden = true;
    state = 'play';
    input.enabled = boost.phase !== 'transform';
    cam.pushTarget = boost.phase === 'active' ? -0.3 : 0;
    canvas.focus({ preventScroll: true });
    if (boost.energy >= ENERGY_MAX && !boost.announced && boost.phase === 'idle') {
      boost.announced = true;
      showToast(input.isTouch ? 'AI 能量滿咗！撳「AI 加速」' : 'AI 能量滿咗！按 E 啟動 AI 加速');
    }
    syncEnergy();
  };

  let rewardTimer = 0;
  const unlock = (id: string) => {
    if (found.has(id)) return;
    found.add(id);
    const v = cpVisuals.find((c) => c.cp.id === id)!;
    setCheckpointDone(id, true);
    updateCount();
    if (boost.phase === 'idle') boost.energy = Math.min(ENERGY_MAX, boost.energy + 1);
    syncEnergy();
    saveProgress();
    $('popup-name').textContent = v.cp.name;

    state = 'reward';
    input.enabled = false;
    input.reset();
    player.vel.set(0, 0, 0);
    burst.fire(player.pos.x, 1.3, player.pos.z, quality === 'ultra' ? 60 : 140);
    avatar.cheer(1.9);
    cam.pushTarget = 1;
    sound.chime();
    if (navigator.vibrate) navigator.vibrate([40, 30, 90]);
    window.clearTimeout(rewardTimer);
    rewardTimer = window.setTimeout(() => openModal('popup'), 1500);
  };

  const resetProgress = () => {
    found.clear();
    for (const v of cpVisuals) setCheckpointDone(v.cp.id, false);
    endBoost();
    boost.energy = 0;
    boost.recharge = 0;
    boost.announced = false;
    syncEnergy();
    updateCount();
    store.set(PROGRESS_KEY, null);
    teleport(SPAWN.x, SPAWN.z, SPAWN.heading);
  };

  $('popup-ok').addEventListener('click', () => {
    closeModal('popup');
    if (found.size === CHECKPOINTS.length) {
      sound.jingle();
      burst.fire(player.pos.x, 1.3, player.pos.z, quality === 'ultra' ? 60 : 140);
      if (navigator.vibrate) navigator.vibrate([60, 40, 60, 40, 120]);
      openModal('complete');
    }
  });
  $('complete-walk').addEventListener('click', () => closeModal('complete'));
  $('complete-restart').addEventListener('click', () => {
    resetProgress();
    closeModal('complete');
  });
  $('reset-progress').addEventListener('click', () => {
    resetProgress();
    closeModal('settings');
    showToast('已重新開始尋寶');
  });

  const qualityNote = $('quality-note');
  $('settings-btn').addEventListener('click', () => openModal('settings'));
  $('settings-close').addEventListener('click', () => closeModal('settings'));
  document.querySelectorAll<HTMLButtonElement>('[data-quality]').forEach((b) =>
    b.addEventListener('click', () => {
      quality = b.dataset.quality as Quality;
      auto.active = false;
      store.set('tst-quality', quality);
      qualityNote.textContent = `已手動設定：${QUALITY_LABEL[quality]}`;
      applyQuality();
    }),
  );

  // ----------------------------------------------------------- sound & night
  const muteBtn = $('mute-btn');
  const syncMute = () => {
    muteBtn.setAttribute('aria-pressed', String(sound.muted));
    muteBtn.setAttribute('aria-label', sound.muted ? '聲音：關' : '聲音：開');
  };
  syncMute();
  muteBtn.addEventListener('click', () => {
    sound.unlock();
    sound.setMuted(!sound.muted);
    syncMute();
    showToast(sound.muted ? '已靜音' : '已開聲');
  });

  let nightTarget = store.get('tst-night') === '1' ? 1 : 0;
  let nightK = nightTarget;
  setTimeOfDay(nightK);
  const nightBtn = $('night-btn');
  const syncNight = () => {
    nightBtn.setAttribute('aria-pressed', String(nightTarget === 1));
    nightBtn.setAttribute('aria-label', nightTarget ? '切換日落' : '切換夜景');
  };
  syncNight();
  nightBtn.addEventListener('click', () => {
    nightTarget = nightTarget ? 0 : 1;
    store.set('tst-night', String(nightTarget));
    syncNight();
    showToast(nightTarget ? '入夜喇，霓虹燈著晒！' : '返去日落時分');
  });

  // ------------------------------------------------------------------ start
  const start = () => {
    if (state !== 'title') return;
    sound.unlock();
    $('title-screen').hidden = true;
    $('hud').hidden = false;
    state = 'play';
    input.enabled = true;
    cam.yaw = player.heading + Math.PI;
    cam.focus.set(player.pos.x, player.pos.y + 1.45, player.pos.z);
    canvas.tabIndex = 0;
    canvas.focus({ preventScroll: true });
    currentZone = '';
    lastMoveAt = clock.now();
    if (found.size === CHECKPOINTS.length) showToast('全部寶藏已搵齊，隨便行吓！');
  };
  startBtn.addEventListener('click', start);
  window.addEventListener('keydown', (e) => {
    if (state === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
      e.preventDefault();
      start();
    }
  });

  const teleport = (x: number, z: number, heading = player.heading) => {
    player.pos.set(x, BASE_Y, z);
    player.vel.set(0, 0, 0);
    player.heading = heading;
    lastSafe.set(x, 0, z);
    cam.yaw = heading + Math.PI;
    cam.focus.set(x, BASE_Y + 1.45, z);
  };

  // ------------------------------------------------------------ idle hint & speech
  const bubble = $('bubble');
  let lastMoveAt = clock.now();
  let hintShown = false;
  let sayText = '';
  let sayUntil = 0;
  const headPos = new THREE.Vector3();
  const bubbleAt = { x: -1, y: -1 };
  const IDLE_SECONDS = 15;
  const say = (text: string, seconds: number) => {
    sayText = text;
    sayUntil = clock.now() + seconds * 1000;
  };
  const updateIdleHint = (moving: boolean) => {
    const now = clock.now();
    const saying = now < sayUntil;
    if (moving || saying || state !== 'play' || !nextCheckpoint()) lastMoveAt = now;
    const hint = state === 'play' && now - lastMoveAt > IDLE_SECONDS * 1000;
    if (hint && !hintShown) bubble.textContent = IDLE_LINES[Math.floor(Math.random() * IDLE_LINES.length)];
    if (saying) bubble.textContent = sayText;
    objective.classList.toggle('pulse', hint);
    const show = saying || hint;
    if (bubble.hidden === show) bubble.hidden = !show;
    hintShown = hint;
    if (show) {
      headPos.set(player.pos.x, player.pos.y + 2.45, player.pos.z).project(camera);
      const bx = Math.round(((headPos.x + 1) / 2) * window.innerWidth);
      const by = Math.round(((1 - headPos.y) / 2) * window.innerHeight);
      if (bx !== bubbleAt.x || by !== bubbleAt.y) {
        bubbleAt.x = bx;
    document.body.classList.add('playing');
        bubbleAt.y = by;
        bubble.style.setProperty('--x', `${bx}px`);
        bubble.style.setProperty('--y', `${by}px`);
      }
    }
  };

  // -------------------------------------------------------------- AI Boost
  const boostBtn = $<HTMLButtonElement>('boost-btn');
  const energyEl = $('energy');
  const pips = [...energyEl.querySelectorAll<HTMLElement>('i')];
  const canBoost = () => state === 'play' && boost.phase === 'idle' && boost.energy >= ENERGY_MAX;
  const syncEnergy = () => {
    const fill = boost.phase === 'active' ? ENERGY_MAX * (1 - boost.t / BOOST_TIME.active) : boost.phase === 'idle' ? boost.energy + boost.recharge / RECHARGE_SECONDS : 0;
    pips.forEach((p, i) => p.style.setProperty('--f', THREE.MathUtils.clamp(fill - i, 0, 1).toFixed(2)));
    energyEl.classList.toggle('full', canBoost());
    energyEl.setAttribute('aria-valuenow', String(boost.energy));
    const ready = canBoost();
    if (boostBtn.hidden === ready) boostBtn.hidden = !ready;
    boostBtn.disabled = !ready;
  };
  const triggerBoost = () => {
    if (!canBoost()) return false;
    boost.phase = 'transform';
    boost.t = 0;
    boost.energy = 0;
    boost.recharge = 0;
    boost.announced = false;
    input.enabled = false;
    input.reset();
    player.vel.set(0, 0, 0);
    cam.pushTarget = 1;
    sound.transform();
    say(BOOST_LINE.zh, 2.6);
    burst.fire(player.pos.x, 1.2, player.pos.z, quality === 'ultra' ? 14 : quality === 'low' ? 28 : 45);
    if (navigator.vibrate) navigator.vibrate(35);
    syncEnergy();
    saveProgress();
    return true;
  };
  const endBoost = () => {
    if (boost.phase === 'active' || boost.phase === 'transform') sound.thrust(false);
    if (boost.phase === 'transform' && state === 'play') input.enabled = true;
    boost.phase = 'idle';
    boost.k = 0;
    boost.thrust = 0;
    avatar.armor(0, 0, 0);
  };
  boostBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    triggerBoost();
  });
  boostBtn.addEventListener('click', () => triggerBoost());
  syncEnergy();

  const updateBoost = (dt: number, moving: number) => {
    if (state === 'play' && input.consumeBoost()) triggerBoost();
    if (state === 'play' && boost.phase === 'idle' && found.size === CHECKPOINTS.length && boost.energy < ENERGY_MAX) {
      boost.recharge += dt;
      if (boost.recharge >= RECHARGE_SECONDS) {
        boost.recharge = 0;
        boost.energy++;
        if (boost.energy >= ENERGY_MAX && !boost.announced) {
          boost.announced = true;
          showToast(input.isTouch ? 'AI 能量滿咗！撳「AI 加速」' : 'AI 能量滿咗！按 E 啟動 AI 加速');
        }
      }
    }
    if (boost.phase === 'idle' || state !== 'play') return;
    boost.t += dt;
    if (boost.phase === 'transform') {
      boost.k = Math.min(1, boost.t / BOOST_TIME.transform);
      if (boost.t >= BOOST_TIME.transform) {
        boost.phase = 'active';
        boost.t = 0;
        input.enabled = true;
        cam.pushTarget = -0.3;
        sound.thrust(true);
      }
    } else if (boost.phase === 'active') {
      boost.k = 1;
      if (boost.t >= BOOST_TIME.active) {
        boost.phase = 'fold';
        boost.t = 0;
        cam.pushTarget = 0;
        sound.thrust(false);
        sound.fold();
      }
    } else if (boost.phase === 'fold') {
      boost.k = Math.max(0, 1 - boost.t / BOOST_TIME.fold);
      if (boost.t >= BOOST_TIME.fold) endBoost();
    }
    const thrustGoal = boost.phase === 'active' ? (moving > 0.3 ? 1 : 0.35) : 0;
    boost.thrust += (thrustGoal - boost.thrust) * Math.min(1, dt * 8);
  };

  // ----------------------------------------------------------------- guide
  let guideTimer = 0;
  let guideFade = 0;
  const updateGuide = (dt: number, t: number) => {
    const target = nextCheckpoint();
    const visible = !!target && (state === 'play' || state === 'reward');
    guideFade += ((visible && state === 'play' ? 1 : 0) - guideFade) * Math.min(1, dt * 4);
    guide.mesh.visible = guideFade > 0.02;
    guide.uniforms.time.value = t;
    guide.uniforms.opacity.value = guideFade;
    guide.uniforms.pulse.value = hintShown ? 0.5 + 0.5 * Math.sin(t * 6) : 0;
    guideTimer -= dt;
    if (target && guideTimer <= 0) {
      guideTimer = 0.4;
      guide.set(nav.path({ x: player.pos.x, z: player.pos.z }, { x: target.x, z: target.z }));
    }
  };

  // ----------------------------------------------------------- auto quality
  const updateAutoQuality = (now: number) => {
    if (!auto.active) return;
    if (!auto.start) {
      auto.start = now + 1500;
      return;
    }
    if (now < auto.start) return;
    auto.frames++;
    const secs = (now - auto.start) / 1000;
    if (secs < 3.5) return;
    auto.fps = Math.round(auto.frames / secs);
    auto.rounds++;
    let next: Quality = quality;
    if (auto.fps < 28) next = 'ultra';
    else if (auto.fps < 45 && quality === 'high') next = 'low';
    if (next !== quality) {
      quality = next;
      applyQuality();
      auto.decided = `${auto.fps} fps → ${QUALITY_LABEL[quality]}`;
      qualityNote.textContent = `自動偵測：${auto.decided}`;
      showToast(`已自動調整畫質：${QUALITY_LABEL[quality]}`);
    } else {
      auto.decided = `${auto.fps} fps → 保持${QUALITY_LABEL[quality]}`;
      qualityNote.textContent = `自動偵測：${auto.decided}`;
    }
    if (next === 'ultra' || auto.rounds >= 2 || next === quality) {
      auto.active = auto.rounds < 2 && next !== 'ultra' && quality !== 'high' && auto.fps < 45;
    }
    auto.start = now + 800;
    auto.frames = 0;
  };
  if (manualQuality) qualityNote.textContent = `已手動設定：${QUALITY_LABEL[quality]}`;

  // ------------------------------------------------------------------ loop
  const timer = new THREE.Timer();
  timer.connect(document);
  let fpsFrames = 0;
  let fpsTime = 0;
  let fps = 0;
  let zoneCheck = 0;
  let hudTick = 0;
  let ambTick = 0;
  let saveTick = 0;
  const statsEl = $('stats');
  let freezeTitleCam = false;
  const focusV = new THREE.Vector3();

  const frame = (now?: number) => {
    timer.update(now);
    // Simulation steps are capped for stability; fades and autosave follow wall-clock time.
    const realDt = THREE.MathUtils.clamp(timer.getDelta(), 0, 0.25);
    const dt = Math.min(realDt, 1 / 20);
    const t = timer.getElapsed();
    updateAutoQuality(clock.now());

    if (Math.abs(nightK - nightTarget) > 0.001) {
      nightK += Math.sign(nightTarget - nightK) * Math.min(Math.abs(nightTarget - nightK), realDt * 0.4);
      setTimeOfDay(nightK);
    }

    world.update(t);
    (water.uniforms.time as { value: number }).value = t;
    beamMat.uniforms.time.value = t;
    for (const v of cpVisuals) {
      v.gem.rotation.y = t * 1.8;
      v.gem.position.y = 2.3 + Math.sin(t * 2.4) * 0.25;
      v.ring.scale.setScalar(1 + Math.sin(t * 3) * 0.04);
    }
    burst.update(dt);

    if (state === 'title') {
      if (!freezeTitleCam) {
        const a = t * 0.08 + 0.6;
        camera.position.set(CLOCK_TOWER.x + Math.sin(a) * 40, 9 + Math.sin(t * 0.2) * 2, CLOCK_TOWER.z + 6 + Math.cos(a) * 40);
        camera.lookAt(CLOCK_TOWER.x, 12, CLOCK_TOWER.z);
      }
      avatar.root.position.copy(player.pos);
      avatar.root.rotation.y = player.heading;
      avatar.update(dt, t, 0, false, false);
      guide.mesh.visible = false;
    } else {
      const res = state === 'play' ? stepPlayer(dt) : { move: 0, running: false };
      if (state !== 'play') input.poll();
      updateBoost(realDt, res.move);
      avatar.armor(boost.k, boost.thrust, t);
      trail.update(player.pos.x, player.pos.z, boost.phase === 'active' && res.move > 0.5, t);
      const stepped = avatar.update(dt, t, res.move, res.running, !player.grounded);
      if (stepped) sound.step(res.running);
      updateCamera(dt, res.move);
      updateIdleHint(res.move > 0.05 || !player.grounded || Math.hypot(input.move.x, input.move.y) > 0.05);
      updateGuide(dt, t);

      if (state === 'play') {
        for (const v of cpVisuals) {
          if (found.has(v.cp.id)) continue;
          if (Math.hypot(player.pos.x - v.cp.x, player.pos.z - v.cp.z) < 2.6) unlock(v.cp.id);
        }
        saveTick -= realDt;
        if (saveTick <= 0) {
          saveTick = 3;
          saveProgress();
        }
      }
      zoneCheck -= dt;
      if (zoneCheck <= 0) {
        zoneCheck = 0.3;
        const z = ZONES.find((zz) => zz.test(player.pos.x, player.pos.z))!.name;
        if (z !== currentZone) {
          currentZone = z;
          showZone(z);
        }
      }
      hudTick -= dt;
      if (hudTick <= 0) {
        hudTick = 0.25;
        updateObjective();
        syncEnergy();
      }
      ambTick -= dt;
      if (ambTick <= 0) {
        ambTick = 0.5;
        sound.updateAmbience(player.pos.z, nightK);
      }
      minimap.draw(player.pos.x, player.pos.z, player.heading, cam.yaw, CHECKPOINTS, found, nextCheckpoint()?.id ?? null, t);
    }

    const focus = state === 'title' ? focusV.set(CLOCK_TOWER.x, 0, CLOCK_TOWER.z) : player.pos;
    sun.target.position.set(focus.x, 0, focus.z);
    sun.position.set(focus.x + SUN_DIR.x * 90, SUN_DIR.y * 90 + 20, focus.z + SUN_DIR.z * 90);
    lamp.position.set(player.pos.x - 1.5, player.pos.y + 4.5, player.pos.z + 1.5);

    renderer.render(scene, camera);

    fpsFrames++;
    fpsTime += dt;
    if (fpsTime >= 1) {
      fps = Math.round(fpsFrames / fpsTime);
      fpsFrames = 0;
      fpsTime = 0;
      const info = renderer.info.render;
      statsEl.textContent = `${fps} fps · ${(info.triangles / 1000).toFixed(0)}k 三角形 · ${info.calls} draw calls`;
    }
    if (!clock.manual) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // Hooks for automated screenshots and debugging.
  (window as unknown as { __tst: unknown }).__tst = {
    start,
    portraits: () => renderPortraits(true),
    teleport,
    unlock,
    setCam: (yaw: number, pitch: number, dist: number) => {
      cam.yaw = yaw;
      cam.pitch = pitch;
      cam.dist = dist;
      cam.cur = dist;
      input.lastOrbitAt = clock.now() / 1000 + 9999;
    },
    titleCam: (x: number, y: number, z: number, lx: number, ly: number, lz: number) => {
      freezeTitleCam = true;
      camera.position.set(x, y, z);
      camera.lookAt(lx, ly, lz);
    },
    setQuality: (q: Quality) => {
      quality = q;
      auto.active = false;
      applyQuality();
    },
    setNight: (on: boolean, instant = false) => {
      nightTarget = on ? 1 : 0;
      if (instant) {
        nightK = nightTarget;
        setTimeOfDay(nightK);
      }
      syncNight();
    },
    setEnergy: (n: number) => {
      boost.energy = THREE.MathUtils.clamp(n, 0, ENERGY_MAX);
      syncEnergy();
    },
    boost: () => triggerBoost(),
    /** Stops the rAF loop; advance(ms) then renders exactly one frame of that length. */
    manual: (on: boolean) => {
      if (on === clock.manual) return;
      clock.t = performance.now();
      clock.manual = on;
      if (!on) requestAnimationFrame(frame);
    },
    advance: (ms: number) => {
      clock.t += ms;
      frame(clock.t);
    },
    colliders: () => colliders.slice(0, world.staticCount).filter((c) => c.h > 3),
    info: () => ({
      fps,
      boost: { phase: boost.phase, t: boost.t, k: boost.k, energy: boost.energy, thrust: boost.thrust },
      trailPoints: trail.points,
      boostBtn: { hidden: boostBtn.hidden, disabled: boostBtn.disabled },
      insideSolid: insideSolid(),
      vel: Math.hypot(player.vel.x, player.vel.z),
      ...renderer.info.render,
      pos: player.pos.toArray(),
      heading: player.heading,
      state,
      found: [...found],
      quality,
      auto: { active: auto.active, fps: auto.fps, decided: auto.decided },
      night: nightK,
      audio: sound.state,
      muted: sound.muted,
      masterGain: sound.masterGain,
      guideSegments: guide.segments,
      guideVisible: guide.mesh.visible,
      bubble: !bubble.hidden ? bubble.textContent : null,
      pixelRatio: renderer.getPixelRatio(),
      shadows: renderer.shadowMap.enabled,
    }),
  };
}
