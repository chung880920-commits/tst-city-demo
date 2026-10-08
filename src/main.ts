import * as THREE from 'three';
import './style.css';
import { createAvatar, renderPortraits } from './avatar';
import { createLights, createSky, createWater, FOG_COLOR, SUN_DIR } from './env';
import { Input } from './input';
import { Minimap } from './minimap';
import { BOUNDS, buildWorld, CHECKPOINTS, CLOCK_TOWER, ZONES, type AABB } from './world';

type Quality = 'low' | 'high';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

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
  const canvas = $<HTMLCanvasElement>('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = FOG_COLOR.clone();
  scene.fog = new THREE.Fog(FOG_COLOR, 80, 1700);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 3000);

  scene.add(createSky());
  const water = createWater();
  scene.add(water.mesh);
  const { sun } = createLights(scene);
  const world = buildWorld();
  scene.add(world.group);
  const colliders = world.colliders;

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

  // -------------------------------------------------------------- systems
  const input = new Input(canvas);
  const minimap = new Minimap($<HTMLCanvasElement>('minimap'), world.map);

  let quality: Quality = input.isTouch ? 'low' : 'high';
  try {
    const saved = localStorage.getItem('tst-quality');
    if (saved === 'low' || saved === 'high') quality = saved;
  } catch {
    /* storage may be unavailable in private mode */
  }

  const applyQuality = () => {
    const dpr = window.devicePixelRatio || 1;
    renderer.setPixelRatio(quality === 'high' ? Math.min(dpr, 2) : Math.min(dpr, 1.25));
    const shadows = quality === 'high';
    if (renderer.shadowMap.enabled !== shadows) {
      renderer.shadowMap.enabled = shadows;
      sun.castShadow = shadows;
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (m) m.needsUpdate = true;
      });
    }
    blob.visible = !shadows;
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

  const tmpDir = new THREE.Vector3();
  const updateCamera = (dt: number, moving: number) => {
    const orbit = input.consumeOrbit();
    const sens = input.isTouch ? 0.009 : 0.006;
    cam.yaw -= orbit.x * sens;
    cam.pitch = THREE.MathUtils.clamp(cam.pitch + orbit.y * sens * 0.8, 0.05, 1.15);

    const now = performance.now() / 1000;
    if (moving > 0.1 && now - input.lastOrbitAt > 1.4 && input.move.y > -0.3) {
      const target = player.heading + Math.PI;
      const diff = Math.atan2(Math.sin(target - cam.yaw), Math.cos(target - cam.yaw));
      cam.yaw += diff * Math.min(1, dt * 1.6 * moving);
    }

    const goal = tmpDir.set(player.pos.x, player.pos.y + 1.75, player.pos.z);
    cam.focus.lerp(goal, Math.min(1, dt * 14));

    const dir = new THREE.Vector3(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch));
    const desired = cam.dist * (camera.aspect < 1 ? 1.15 : 1);
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

  const stepPlayer = (dt: number) => {
    input.poll();
    const mx = input.move.x;
    const my = input.move.y;
    const mag = Math.min(1, Math.hypot(mx, my));
    const fwdX = -Math.sin(cam.yaw);
    const fwdZ = -Math.cos(cam.yaw);
    const rightX = Math.cos(cam.yaw);
    const rightZ = -Math.sin(cam.yaw);
    const speed = input.running ? RUN : WALK;
    const tx = (fwdX * my + rightX * mx) * speed;
    const tz = (fwdZ * my + rightZ * mx) * speed;
    const accel = player.grounded ? 12 : 4;
    player.vel.x += (tx - player.vel.x) * Math.min(1, dt * accel);
    player.vel.z += (tz - player.vel.z) * Math.min(1, dt * accel);

    player.pos.x += player.vel.x * dt;
    player.pos.z += player.vel.z * dt;

    // jump & gravity
    if (input.consumeJump() && player.grounded) {
      player.vy = JUMP_V;
      player.grounded = false;
    }
    player.vy -= GRAVITY * dt;
    player.pos.y += player.vy * dt;

    // collisions: circle vs boxes in XZ
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
        let dx = player.pos.x - cx;
        let dz = player.pos.z - cz;
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
        dx = dz = 0;
      }
    }
    player.pos.x = THREE.MathUtils.clamp(player.pos.x, BOUNDS.minX, BOUNDS.maxX);
    player.pos.z = THREE.MathUtils.clamp(player.pos.z, BOUNDS.minZ, BOUNDS.maxZ);

    if (player.pos.y <= ground) {
      player.pos.y = ground;
      player.vy = 0;
      player.grounded = true;
    } else if (player.pos.y > ground + 0.05) {
      player.grounded = false;
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
    return { move: planar / WALK, running: input.running && planar > WALK * 0.9 };
  };

  // -------------------------------------------------------------------- UI
  const portraits = renderPortraits();
  for (const id of ['title-portrait', 'complete-portrait']) $<HTMLImageElement>(id).src = portraits.bust;
  $<HTMLImageElement>('hud-portrait').src = portraits.head;

  let state: 'title' | 'play' | 'modal' = 'title';
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

  const nextCheckpoint = () => CHECKPOINTS.find((c) => !found.has(c.id)) ?? null;
  const objective = $('objective');
  const updateObjective = () => {
    const n = nextCheckpoint();
    if (!n) {
      objective.textContent = '✔ 全部寶藏已搵齊';
      return;
    }
    const d = Math.round(Math.hypot(n.x - player.pos.x, n.z - player.pos.z));
    objective.textContent = `下一站：${n.name} · ${d} 米`;
  };

  const updateCount = () => {
    $('count').textContent = String(found.size);
    $('popup-count').textContent = String(found.size);
  };

  const openModal = (id: string) => {
    state = 'modal';
    input.enabled = false;
    input.reset();
    $(id).hidden = false;
    const btn = $(id).querySelector('button');
    btn?.focus({ preventScroll: true });
  };
  const closeModal = (id: string) => {
    $(id).hidden = true;
    state = 'play';
    input.enabled = true;
    canvas.focus({ preventScroll: true });
  };

  const unlock = (id: string) => {
    if (found.has(id)) return;
    found.add(id);
    const v = cpVisuals.find((c) => c.cp.id === id)!;
    v.beam.visible = false;
    v.gem.visible = false;
    v.ringMat.color.set('#3fbf6a');
    updateCount();
    $('popup-name').textContent = v.cp.name;
    openModal('popup');
    if (navigator.vibrate) navigator.vibrate(60);
  };

  $('popup-ok').addEventListener('click', () => {
    closeModal('popup');
    if (found.size === CHECKPOINTS.length) openModal('complete');
  });
  $('complete-walk').addEventListener('click', () => closeModal('complete'));
  $('complete-restart').addEventListener('click', () => {
    found.clear();
    for (const v of cpVisuals) {
      v.beam.visible = true;
      v.gem.visible = true;
      v.ringMat.color.set('#f5c542');
    }
    updateCount();
    teleport(SPAWN.x, SPAWN.z, SPAWN.heading);
    closeModal('complete');
  });

  $('settings-btn').addEventListener('click', () => openModal('settings'));
  $('settings-close').addEventListener('click', () => closeModal('settings'));
  document.querySelectorAll<HTMLButtonElement>('[data-quality]').forEach((b) =>
    b.addEventListener('click', () => {
      quality = b.dataset.quality as Quality;
      try {
        localStorage.setItem('tst-quality', quality);
      } catch {
        /* ignore */
      }
      applyQuality();
    }),
  );

  const start = () => {
    if (state !== 'title') return;
    $('title-screen').hidden = true;
    $('hud').hidden = false;
    state = 'play';
    input.enabled = true;
    cam.yaw = player.heading + Math.PI;
    cam.focus.set(player.pos.x, player.pos.y + 1.45, player.pos.z);
    canvas.tabIndex = 0;
    canvas.focus({ preventScroll: true });
    currentZone = '';
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
    cam.yaw = heading + Math.PI;
    cam.focus.set(x, BASE_Y + 1.45, z);
  };

  // ------------------------------------------------------------------ loop
  const clock = new THREE.Clock();
  let fpsFrames = 0;
  let fpsTime = 0;
  let fps = 0;
  let zoneCheck = 0;
  let hudTick = 0;
  const statsEl = $('stats');
  let freezeTitleCam = false;

  const frame = () => {
    const dt = Math.min(clock.getDelta(), 1 / 20);
    const t = clock.elapsedTime;

    world.update(t);
    (water.uniforms.time as { value: number }).value = t;
    beamMat.uniforms.time.value = t;
    for (const v of cpVisuals) {
      v.gem.rotation.y = t * 1.8;
      v.gem.position.y = 2.3 + Math.sin(t * 2.4) * 0.25;
      v.ring.scale.setScalar(1 + Math.sin(t * 3) * 0.04);
    }

    if (state === 'title') {
      if (!freezeTitleCam) {
        const a = t * 0.08 + 0.6;
        camera.position.set(CLOCK_TOWER.x + Math.sin(a) * 40, 9 + Math.sin(t * 0.2) * 2, CLOCK_TOWER.z + 6 + Math.cos(a) * 40);
        camera.lookAt(CLOCK_TOWER.x, 12, CLOCK_TOWER.z);
      }
      avatar.update(dt, t, 0, false, false);
    } else {
      const res = state === 'play' ? stepPlayer(dt) : { move: 0, running: false };
      if (state !== 'play') {
        player.vel.multiplyScalar(0.8);
        input.poll();
      }
      avatar.update(dt, t, res.move, res.running, !player.grounded);
      updateCamera(dt, res.move);

      if (state === 'play') {
        for (const v of cpVisuals) {
          if (found.has(v.cp.id)) continue;
          if (Math.hypot(player.pos.x - v.cp.x, player.pos.z - v.cp.z) < 2.6) unlock(v.cp.id);
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
      }
      minimap.draw(player.pos.x, player.pos.z, player.heading, cam.yaw, CHECKPOINTS, found, nextCheckpoint()?.id ?? null, t);
    }

    const focus = state === 'title' ? new THREE.Vector3(CLOCK_TOWER.x, 0, CLOCK_TOWER.z) : player.pos;
    sun.target.position.set(focus.x, 0, focus.z);
    sun.position.set(focus.x + SUN_DIR.x * 90, SUN_DIR.y * 90 + 20, focus.z + SUN_DIR.z * 90);

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
    requestAnimationFrame(frame);
  };
  updateCount();
  requestAnimationFrame(frame);

  // Hooks for automated screenshots and debugging.
  (window as unknown as { __tst: unknown }).__tst = {
    start,
    teleport,
    unlock,
    setCam: (yaw: number, pitch: number, dist: number) => {
      cam.yaw = yaw;
      cam.pitch = pitch;
      cam.dist = dist;
      cam.cur = dist;
      input.lastOrbitAt = performance.now() / 1000 + 9999;
    },
    titleCam: (x: number, y: number, z: number, lx: number, ly: number, lz: number) => {
      freezeTitleCam = true;
      camera.position.set(x, y, z);
      camera.lookAt(lx, ly, lz);
    },
    setQuality: (q: Quality) => {
      quality = q;
      applyQuality();
    },
    info: () => ({ fps, ...renderer.info.render, pos: player.pos.toArray(), heading: player.heading }),
  };
}
