import * as THREE from 'three';
import { MeshBuilder } from './builder';

const COL = {
  skin: '#f3caa6',
  skinShade: '#e7b48e',
  hair: '#17171b',
  hairHi: '#2c2c34',
  fade: '#5a4c44',
  tee: '#f7f5ef',
  knit: '#e2d4b8',
  knitRib: '#cdbd9f',
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

/** Box with UVs scaled to its real size so the knit tiles evenly. */
function knitBox(w: number, h: number, d: number, density = 5.5) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const dims: Array<[number, number]> = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let i = 0; i < uv.count; i++) {
    const [a, b] = dims[Math.floor(i / 4)];
    uv.setXY(i, uv.getX(i) * a * density, uv.getY(i) * b * density);
  }
  return g;
}

class Part {
  plain = new MeshBuilder();
  knit = new MeshBuilder(true);
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: string, rot: { rx?: number; ry?: number; rz?: number } = {}) {
    this.plain.add(new THREE.BoxGeometry(w, h, d), color, { x, y, z, ...rot });
  }
  wool(w: number, h: number, d: number, x: number, y: number, z: number, color: string, rot: { rx?: number; ry?: number; rz?: number } = {}) {
    this.knit.add(knitBox(w, h, d), color, { x, y, z, ...rot });
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
  update: (dt: number, t: number, move: number, running: boolean, airborne: boolean) => void;
}

export function createAvatar(): Avatar {
  const mats = {
    plain: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
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
    p.box(0.21, 0.52, 0.24, 0, -0.27, 0, COL.trousers);
    p.box(0.23, 0.12, 0.36, 0, -0.55, 0.05, COL.shoe);
    p.box(0.235, 0.04, 0.37, 0, -0.6, 0.05, COL.sole);
    p.into(pivot, mats);
    body.add(pivot);
    legs.push(pivot);
  }

  // ---- torso
  const torso = new THREE.Group();
  body.add(torso);
  const t = new Part();
  t.box(0.48, 0.16, 0.28, 0, 0.66, 0, COL.trousers);
  t.box(0.46, 0.6, 0.27, 0, 0.98, 0, COL.tee);
  t.box(0.2, 0.05, 0.02, 0, 1.24, 0.135, '#e9e5dc'); // crew neck rib
  t.wool(0.56, 0.66, 0.1, 0, 0.95, -0.12, COL.knit);
  for (const s of [1, -1]) {
    t.wool(0.08, 0.66, 0.32, 0.27 * s, 0.95, 0, COL.knit);
    t.wool(0.17, 0.66, 0.07, 0.19 * s, 0.95, 0.145, COL.knit);
    // shawl collar lapels forming a deep V
    t.wool(0.1, 0.46, 0.09, 0.125 * s, 1.06, 0.19, COL.knitRib, { rz: -0.26 * s });
    t.wool(0.1, 0.16, 0.24, 0.16 * s, 1.3, 0.03, COL.knitRib);
    // patch pockets
    t.wool(0.16, 0.16, 0.05, 0.19 * s, 0.74, 0.19, COL.knitRib);
  }
  t.wool(0.56, 0.08, 0.34, 0, 1.27, 0, COL.knit);
  t.wool(0.4, 0.14, 0.12, 0, 1.31, -0.1, COL.knitRib);
  t.wool(0.575, 0.08, 0.335, 0, 0.64, 0, COL.knitRib);
  t.box(0.15, 0.12, 0.15, 0, 1.33, 0, COL.skin);
  t.into(torso, mats);

  // ---- head
  const head = new THREE.Group();
  head.position.set(0, 1.36, 0);
  body.add(head);
  const h = new Part();
  h.box(0.6, 0.48, 0.54, 0, 0.32, 0, COL.skin);
  h.box(0.5, 0.12, 0.47, 0, 0.06, 0.01, COL.skin);
  for (const s of [1, -1]) {
    h.box(0.07, 0.15, 0.11, 0.32 * s, 0.3, -0.02, COL.skinShade);
    h.box(0.075, 0.1, 0.03, 0.13 * s, 0.3, 0.27, COL.eye);
    h.box(0.025, 0.025, 0.01, 0.115 * s, 0.33, 0.287, '#ffffff');
    h.box(0.15, 0.035, 0.03, 0.13 * s, 0.41, 0.27, COL.eye, { rz: 0.06 * s });
    h.box(0.08, 0.04, 0.01, 0.2 * s, 0.19, 0.272, COL.blush);
    // short faded sides: dark band above the ear, lighter fade below
    h.box(0.04, 0.12, 0.5, 0.31 * s, 0.5, -0.02, COL.hair);
    h.box(0.03, 0.12, 0.42, 0.305 * s, 0.39, -0.05, COL.fade);
  }
  h.box(0.07, 0.09, 0.05, 0, 0.22, 0.285, COL.skinShade);
  h.box(0.12, 0.025, 0.02, 0, 0.12, 0.272, COL.mouth);
  // slicked-back top with volume at the front
  h.box(0.64, 0.13, 0.6, 0, 0.6, -0.01, COL.hair);
  h.box(0.6, 0.15, 0.17, 0, 0.63, 0.21, COL.hair, { rx: -0.28 });
  h.box(0.6, 0.07, 0.05, 0, 0.545, 0.27, COL.hair);
  for (const x of [-0.17, 0.0, 0.16]) h.box(0.07, 0.03, 0.52, x, 0.675, -0.03, COL.hairHi);
  h.box(0.62, 0.32, 0.07, 0, 0.43, -0.28, COL.hair);
  h.box(0.6, 0.12, 0.06, 0, 0.21, -0.275, COL.fade);
  h.into(head, mats);

  // ---- arms
  const arms: THREE.Group[] = [];
  for (const s of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.335 * s, 1.22, 0);
    const a = new Part();
    a.wool(0.16, 0.5, 0.17, 0, -0.23, 0, COL.knit);
    a.wool(0.165, 0.07, 0.175, 0, -0.46, 0, COL.knitRib);
    a.box(0.12, 0.13, 0.13, 0, -0.54, 0, COL.skin);
    a.into(pivot, mats);
    body.add(pivot);
    arms.push(pivot);
  }

  let phase = 0;
  let walk = 0;
  let runK = 0;
  let air = 0;
  const update = (dt: number, time: number, move: number, running: boolean, airborne: boolean) => {
    walk += (Math.min(move, 1) - walk) * Math.min(1, dt * 10);
    runK += ((running && move > 0.1 ? 1 : 0) - runK) * Math.min(1, dt * 6);
    air += ((airborne ? 1 : 0) - air) * Math.min(1, dt * 12);
    phase += dt * (5.5 + runK * 4.5) * Math.max(walk, 0.0001);

    const amp = (0.55 + runK * 0.35) * walk;
    const sw = Math.sin(phase);
    legs[0].rotation.x = sw * amp * (1 - air) - air * 0.6;
    legs[1].rotation.x = -sw * amp * (1 - air) + air * 0.35;

    // idle: hands tucked into the cardigan pockets, like the photo
    const idleX = -0.27;
    const idleZ = 0.2;
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      const swing = -sw * s * amp * 0.95;
      arms[i].rotation.x = idleX * (1 - walk) + swing * walk - air * 0.5;
      arms[i].rotation.z = s * (idleZ * (1 - walk) - 0.08 * walk) * -1 + s * air * 0.5;
    }
    const bob = Math.abs(Math.cos(phase)) * 0.05 * walk;
    const breathe = Math.sin(time * 2.2) * 0.006 * (1 - walk);
    body.position.y = bob + breathe;
    body.rotation.x = runK * 0.14 * walk;
    torso.scale.y = 1 + breathe;
    head.rotation.x = -runK * 0.08 * walk;
    head.rotation.z = Math.sin(time * 0.9) * 0.02 * (1 - walk);
  };
  update(0, 0, 0, false, false);

  return { root, update };
}

/** Renders the avatar once to an offscreen canvas for HUD/title portraits. */
export function renderPortraits(): { head: string; bust: string } {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff1e0', '#4a5a7a', 1.6));
  const key = new THREE.DirectionalLight('#ffd2a0', 2.2);
  key.position.set(2, 3, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#9fc4ff', 1.2);
  rim.position.set(-3, 2, -2);
  scene.add(rim);
  const avatar = createAvatar();
  avatar.root.rotation.y = 0.35;
  scene.add(avatar.root);

  const shot = (size: number, target: THREE.Vector3, dist: number, fov: number) => {
    renderer.setSize(size, size, false);
    const cam = new THREE.PerspectiveCamera(fov, 1, 0.05, 20);
    cam.position.set(target.x + 0.25, target.y + 0.12, target.z + dist);
    cam.lookAt(target);
    renderer.render(scene, cam);
    return renderer.domElement.toDataURL('image/png');
  };
  const head = shot(256, new THREE.Vector3(0, 1.62, 0), 1.9, 30);
  const bust = shot(512, new THREE.Vector3(0, 1.3, 0), 3.0, 34);
  renderer.dispose();
  renderer.forceContextLoss();
  return { head, bust };
}
