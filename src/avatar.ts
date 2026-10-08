import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { MeshBuilder } from './builder';

const COL = {
  skin: '#f3caa6',
  skinShade: '#e7b48e',
  hair: '#17171b',
  hairHi: '#2c2c34',
  fade: '#463b35',
  tee: '#f7f5ef',
  knit: '#ece2cf',
  knitRib: '#ddd0b8',
  trousers: '#2a2e3a',
  shoe: '#1c1c21',
  sole: '#3a3a40',
  eye: '#1c1a1f',
  mouth: '#a5604f',
  blush: '#f1ad95',
};

let knitTexture: THREE.CanvasTexture | null = null;

/** Small tiling cable-knit pattern so the cardigan reads as chunky wool. */
function getKnitTexture() {
  if (knitTexture) return knitTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  // ribs between cables
  g.fillStyle = '#ebe5da';
  for (const x of [0, 30, 62, 94]) g.fillRect(x, 0, 4, 128);
  // two braided cables per tile
  g.lineWidth = 7;
  g.lineCap = 'round';
  for (const cx of [16, 48, 80, 112]) {
    for (let y = -16; y < 144; y += 32) {
      g.strokeStyle = '#ddd4c4';
      g.beginPath();
      g.moveTo(cx - 7, y);
      g.bezierCurveTo(cx - 7, y + 10, cx + 7, y + 6, cx + 7, y + 16);
      g.stroke();
      g.beginPath();
      g.moveTo(cx + 7, y + 16);
      g.bezierCurveTo(cx + 7, y + 26, cx - 7, y + 22, cx - 7, y + 32);
      g.stroke();
      g.strokeStyle = '#ffffff';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(cx - 6, y + 2);
      g.bezierCurveTo(cx - 6, y + 10, cx + 6, y + 6, cx + 6, y + 14);
      g.stroke();
      g.lineWidth = 7;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  knitTexture = t;
  return t;
}

type Rot = { rx?: number; ry?: number; rz?: number; sx?: number; sy?: number; sz?: number };

/** Scales a geometry's UVs so the knit pattern tiles at roughly real-world size. */
function tileUv(g: THREE.BufferGeometry, su: number, sv: number, density = 5.5) {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su * density, uv.getY(i) * sv * density);
  return g;
}

const rbox = (w: number, h: number, d: number, r = 0.05) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2) * 0.98);
const capsule = (r: number, len: number, radial = 8) => new THREE.CapsuleGeometry(r, len, 3, radial);
const ball = (r: number, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);

const HEAD_R = 0.3;

/** Sphere head with a softer, narrower jaw. */
function headGeometry() {
  const g = new THREE.SphereGeometry(HEAD_R, 16, 12);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let y = p.getY(i);
    let z = p.getZ(i);
    const s = Math.max(0, -y / HEAD_R);
    x *= 1 - 0.24 * s;
    z *= 1 - 0.06 * s;
    y *= y < 0 ? 0.92 : 1.04;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

/** Hair cap: hairline lifted at the front, volume swept up and back. */
function hairCapGeometry() {
  const r = HEAD_R * 1.08;
  const g = new THREE.SphereGeometry(r, 18, 9, 0, Math.PI * 2, 0, 1.3);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let y = p.getY(i);
    let z = p.getZ(i);
    const t = y / r;
    const f = Math.max(0, z / r);
    const back = Math.max(0, -z / r);
    y += f * (1 - t) * 0.12 + f * t * 0.07;
    z += f * t * 0.03;
    y -= back * (1 - t) * 0.03;
    x *= 1.0 + (1 - t) * 0.02;
    p.setXYZ(i, x, y * 1.04, z);
  }
  g.computeVertexNormals();
  return g;
}

/** Short faded band around the sides and back, open at the face. */
function fadeBandGeometry() {
  const front = Math.PI * 0.75;
  return new THREE.SphereGeometry(HEAD_R * 1.035, 18, 4, Math.PI / 2 + front / 2, Math.PI * 2 - front, 1.15, 0.75);
}

class Part {
  plain = new MeshBuilder();
  knit = new MeshBuilder(true);
  add(g: THREE.BufferGeometry, x: number, y: number, z: number, color: string, rot: Rot = {}) {
    this.plain.add(g, color, { x, y, z, ...rot });
  }
  wool(g: THREE.BufferGeometry, su: number, sv: number, x: number, y: number, z: number, color: string, rot: Rot = {}) {
    this.knit.add(tileUv(g, su, sv), color, { x, y, z, ...rot });
  }
  into(group: THREE.Object3D, mats: { plain: THREE.Material; knit: THREE.Material }) {
    for (const [b, m] of [[this.plain, mats.plain], [this.knit, mats.knit]] as const) {
      if (!b.count) continue;
      const mesh = b.build(m);
      mesh.matrixAutoUpdate = true;
      mesh.castShadow = true;
      group.add(mesh);
    }
  }
}

export interface Avatar {
  root: THREE.Group;
  /** Returns true on the frame a foot hits the ground. */
  update: (dt: number, t: number, move: number, running: boolean, airborne: boolean) => boolean;
  cheer: (seconds?: number) => void;
}

export function createAvatar(): Avatar {
  const mats = {
    plain: new THREE.MeshLambertMaterial({ vertexColors: true }),
    knit: new THREE.MeshLambertMaterial({ vertexColors: true, map: getKnitTexture() }),
  };
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // ---- legs
  const legs: THREE.Group[] = [];
  for (const s of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.12 * s, 0.62, 0);
    const p = new Part();
    p.add(capsule(0.105, 0.34), 0, -0.26, 0, COL.trousers);
    p.add(rbox(0.21, 0.13, 0.34, 0.06), 0, -0.55, 0.05, COL.shoe);
    p.add(rbox(0.22, 0.04, 0.35, 0.02), 0, -0.605, 0.05, COL.sole);
    p.into(pivot, mats);
    body.add(pivot);
    legs.push(pivot);
  }

  // ---- torso
  const torso = new THREE.Group();
  body.add(torso);
  const t = new Part();
  t.add(rbox(0.48, 0.2, 0.29, 0.08), 0, 0.67, 0, COL.trousers);
  t.add(rbox(0.44, 0.62, 0.28, 0.1), 0, 0.98, 0.0, COL.tee);
  t.add(new THREE.TorusGeometry(0.085, 0.018, 4, 14, Math.PI), 0, 1.255, 0.07, '#e9e5dc', { rx: Math.PI / 2 + 0.5, rz: Math.PI });
  t.wool(rbox(0.58, 0.68, 0.3, 0.12), 0.58, 0.68, 0, 0.95, -0.03, COL.knit);
  for (const s of [1, -1]) {
    t.wool(rbox(0.19, 0.66, 0.08, 0.035), 0.19, 0.66, 0.185 * s, 0.95, 0.135, COL.knit);
    // rolled shawl collar: thick lapels forming a deep V and wrapping the neck
    t.wool(capsule(0.05, 0.42, 6), 0.3, 0.5, 0.105 * s, 1.04, 0.172, COL.knitRib, { rz: -0.25 * s, sx: 1.5, sz: 0.5 });
    t.wool(capsule(0.05, 0.1, 6), 0.3, 0.2, 0.135 * s, 1.27, 0.07, COL.knitRib, { rx: 0.6, sz: 0.7 });
    // patch pockets
    t.wool(rbox(0.15, 0.17, 0.05, 0.02), 0.15, 0.17, 0.2 * s, 0.73, 0.18, COL.knitRib);
  }
  t.wool(capsule(0.06, 0.26, 6), 0.4, 0.2, 0, 1.31, -0.09, COL.knitRib, { rz: Math.PI / 2 });
  t.wool(rbox(0.6, 0.08, 0.32, 0.035), 0.6, 0.08, 0, 0.64, -0.01, COL.knitRib);
  t.add(new THREE.CylinderGeometry(0.075, 0.08, 0.16, 10), 0, 1.33, 0, COL.skin);
  t.into(torso, mats);

  // ---- head
  const head = new THREE.Group();
  head.position.set(0, 1.36, 0);
  body.add(head);
  const h = new Part();
  const hc = HEAD_R - 0.01;
  h.add(headGeometry(), 0, hc, 0, COL.skin);
  for (const s of [1, -1]) {
    h.add(ball(0.065, 8, 6), 0.29 * s, hc - 0.01, -0.02, COL.skinShade, { sx: 0.45, sz: 0.8 });
    h.add(ball(0.045, 8, 6), 0.11 * s, hc + 0.01, 0.268, COL.eye, { sx: 0.8, sy: 1.15, sz: 0.45 });
    h.add(ball(0.014, 6, 4), 0.097 * s, hc + 0.035, 0.284, '#ffffff');
    h.add(capsule(0.016, 0.075, 6), 0.115 * s, hc + 0.105, 0.255, COL.eye, { rz: Math.PI / 2 + 0.08 * s });
    h.add(ball(0.04, 8, 4), 0.165 * s, hc - 0.075, 0.22, COL.blush, { sy: 0.6, sz: 0.3 });
  }
  h.add(ball(0.036, 8, 6), 0, hc - 0.045, 0.29, COL.skinShade, { sy: 1.2 });
  h.add(capsule(0.012, 0.06, 6), 0, hc - 0.13, 0.25, COL.mouth, { rz: Math.PI / 2 });
  // hair: slicked-back swoop over a short faded back and sides
  h.add(fadeBandGeometry(), 0, hc, 0, COL.fade);
  h.add(hairCapGeometry(), 0, hc, -0.005, COL.hair);
  h.add(ball(0.2, 12, 6), 0.01, hc + 0.27, 0.05, COL.hair, { sx: 1.32, sy: 0.4, sz: 1.3, rx: -0.2 });
  for (const x of [-0.11, 0.0, 0.1]) h.add(capsule(0.011, 0.2, 4), x, hc + 0.31, -0.06, COL.hairHi, { rx: Math.PI / 2 - 0.3 });
  h.into(head, mats);

  // ---- arms
  const arms: THREE.Group[] = [];
  const hands: THREE.Group[] = [];
  for (const s of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.335 * s, 1.22, 0);
    const a = new Part();
    a.wool(ball(0.088, 10, 6), 0.4, 0.3, -0.01 * s, -0.03, 0, COL.knit);
    a.wool(capsule(0.085, 0.32), 0.5, 0.5, 0, -0.24, 0, COL.knit);
    a.wool(new THREE.CylinderGeometry(0.09, 0.088, 0.07, 10), 0.5, 0.1, 0, -0.45, 0, COL.knitRib);
    a.into(pivot, mats);
    const hand = new Part();
    hand.add(ball(0.07, 8, 6), 0, 0, 0.005, COL.skin, { sx: 0.85, sz: 0.95 });
    const handGroup = new THREE.Group();
    handGroup.position.y = -0.53;
    hand.into(handGroup, mats);
    pivot.add(handGroup);
    hands.push(handGroup);
    body.add(pivot);
    arms.push(pivot);
  }

  let phase = 0;
  let walk = 0;
  let runK = 0;
  let air = 0;
  let cheerT = 0;
  let cheerK = 0;
  let lastStep = 0;
  const update = (dt: number, time: number, move: number, running: boolean, airborne: boolean) => {
    walk += (Math.min(move, 1) - walk) * Math.min(1, dt * 10);
    runK += ((running && move > 0.1 ? 1 : 0) - runK) * Math.min(1, dt * 6);
    air += ((airborne ? 1 : 0) - air) * Math.min(1, dt * 12);
    cheerT = Math.max(0, cheerT - dt);
    cheerK += ((cheerT > 0 ? 1 : 0) - cheerK) * Math.min(1, dt * 10);
    phase += dt * (5.5 + runK * 4.5) * Math.max(walk, 0.0001);

    const amp = (0.55 + runK * 0.35) * walk;
    const sw = Math.sin(phase);
    const hop = Math.abs(Math.sin(time * 9)) * cheerK;
    legs[0].rotation.x = (sw * amp * (1 - air) - air * 0.6) * (1 - cheerK) - hop * 0.3;
    legs[1].rotation.x = (-sw * amp * (1 - air) + air * 0.35) * (1 - cheerK) + hop * 0.15;

    // idle: hands tucked into the cardigan pockets, like the photo
    const idleX = -0.2;
    const idleZ = 0.12;
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      const swing = -sw * s * amp * 0.95;
      const baseX = idleX * (1 - walk) + swing * walk - air * 0.5;
      const baseZ = s * (idleZ * (1 - walk) - 0.08 * walk) * -1 + s * air * 0.5;
      const wave = Math.sin(time * 14 + i * Math.PI) * 0.18;
      arms[i].rotation.x = baseX * (1 - cheerK) + (-2.75 + wave) * cheerK;
      arms[i].rotation.z = baseZ * (1 - cheerK) + s * 0.38 * cheerK;
      hands[i].scale.setScalar(Math.max(0.01, Math.min(1, walk * 3 + air + cheerK)));
    }
    const bob = Math.abs(Math.cos(phase)) * 0.05 * walk;
    const breathe = Math.sin(time * 2.2) * 0.006 * (1 - walk);
    body.position.y = bob + breathe + hop * 0.16;
    body.rotation.x = runK * 0.14 * walk * (1 - cheerK);
    torso.scale.y = 1 + breathe;
    head.rotation.x = -runK * 0.08 * walk - cheerK * 0.18;
    head.rotation.z = Math.sin(time * 0.9) * 0.02 * (1 - walk);

    // one footstep per half stride
    const stepIdx = Math.floor(phase / Math.PI);
    const stepped = stepIdx !== lastStep && walk > 0.3 && !airborne && cheerK < 0.5;
    lastStep = stepIdx;
    return stepped;
  };
  update(0, 0, 0, false, false);
  const cheer = (seconds = 1.6) => {
    cheerT = seconds;
  };

  return { root, update, cheer };
}

/** Renders the avatar once to an offscreen canvas for HUD/title portraits. */
export function renderPortraits(withFull = false): { head: string; bust: string; full?: string } {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#56607a', 1.7));
  const key = new THREE.DirectionalLight('#fff3e6', 1.9);
  key.position.set(2, 3, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#9fc4ff', 1.2);
  rim.position.set(-3, 2, -2);
  scene.add(rim);
  const avatar = createAvatar();
  avatar.root.rotation.y = 0.35;
  scene.add(avatar.root);

  const shot = (size: number, target: THREE.Vector3, dist: number, fov: number, aspect = 1) => {
    renderer.setSize(size * aspect, size, false);
    const cam = new THREE.PerspectiveCamera(fov, aspect, 0.05, 20);
    cam.position.set(target.x + 0.25, target.y + 0.12, target.z + dist);
    cam.lookAt(target);
    renderer.render(scene, cam);
    return renderer.domElement.toDataURL('image/png');
  };
  const head = shot(256, new THREE.Vector3(0, 1.62, 0), 1.9, 30);
  const bust = shot(512, new THREE.Vector3(0, 1.3, 0), 3.0, 34);
  let full: string | undefined;
  if (withFull) {
    avatar.root.rotation.y = 0.5;
    full = shot(900, new THREE.Vector3(0, 0.98, 0), 4.6, 30, 0.8);
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return { head, bust, full };
}
