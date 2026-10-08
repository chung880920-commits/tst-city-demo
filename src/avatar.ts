import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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

/** 「針織戰甲」 palette: GoProjects navy / cream / teal with gold accents. */
const ARMOR = {
  navy: '#1b3560',
  navyDeep: '#12264a',
  cream: '#f3ead6',
  teal: '#1fa39a',
  tealDeep: '#147a74',
  gold: '#f5c542',
};

export interface Avatar {
  root: THREE.Group;
  /** Returns true on the frame a foot hits the ground. */
  update: (dt: number, t: number, move: number, running: boolean, airborne: boolean) => boolean;
  cheer: (seconds?: number) => void;
  /** k: 0 = plain cardigan, 1 = full Knit Armor. thrust: 0..1 flame strength. */
  armor: (k: number, thrust: number, time: number) => void;
  /**
   * Cinematic controls (promo record mode). land: 0..1 superhero-landing crouch. fly: plates fly in
   * from this many metres out instead of flipping in place. flame: thruster flame size multiplier.
   */
  fx: { land: number; fly: number; flame: number };
}

interface Plate {
  /** Plate-local vertex data, copied into the shared buffer with the plate's current transform. */
  pos: Float32Array;
  nrm: Float32Array;
  start: number;
  hinge: THREE.Quaternion;
  base: THREE.Vector3;
  normal: THREE.Vector3;
  /** The knit tile turns over on this local axis to reveal the plate. */
  axis: THREE.Vector3;
  order: number;
}

let plateTexture: THREE.CanvasTexture | null = null;

/** Left half: the cardigan's cable knit. Right half: plain white for the armor faces. */
function getPlateTexture() {
  if (plateTexture) return plateTexture;
  const knit = getKnitTexture().image as HTMLCanvasElement;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.drawImage(knit, 0, 0);
  g.fillStyle = '#ffffff';
  g.fillRect(128, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  plateTexture = t;
  return t;
}

function uvSolid(g: THREE.BufferGeometry) {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute | undefined;
  if (uv) for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.8, 0.5);
  return g;
}

function uvKnit(g: THREE.BufferGeometry) {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.01 + uv.getX(i) * 0.47, uv.getY(i));
  return g;
}

/** Chamfered low-poly slab. */
const slab = (w: number, h: number, d: number) => new RoundedBoxGeometry(w, h, d, 1, Math.min(w, h, d) * 0.45);

type Trim = [THREE.BufferGeometry, number, number, number, string, Rot?];

/**
 * A plate is a cardigan-coloured knit tile on one face and the armor plate on the
 * other. Closed, the knit side faces out and sits on the cardigan; opening flips it.
 */
function buildPlate(
  w: number,
  h: number,
  color: string,
  trims: Trim[],
  pos: [number, number, number],
  rot: Rot,
  axis: 'x' | 'y',
  order: number,
): { plate: Plate; geo: THREE.BufferGeometry } {
  const b = new MeshBuilder(true);
  b.add(uvSolid(slab(w, h, 0.045)), color);
  for (const [g, x, y, z, c, r] of trims) b.add(uvSolid(g), c, { x, y, z, ...(r ?? {}) });
  b.add(uvKnit(new THREE.PlaneGeometry(w * 0.96, h * 0.96)), COL.knit, { z: -0.024, ry: Math.PI });
  const geo = b.build(new THREE.MeshBasicMaterial()).geometry;
  const e = new THREE.Euler(rot.rx ?? 0, rot.ry ?? 0, rot.rz ?? 0, 'ZYX');
  const plate: Plate = {
    pos: (geo.getAttribute('position').array as Float32Array).slice(),
    nrm: (geo.getAttribute('normal').array as Float32Array).slice(),
    start: 0,
    hinge: new THREE.Quaternion().setFromEuler(e),
    base: new THREE.Vector3(...pos),
    normal: new THREE.Vector3(0, 0, 1).applyEuler(e),
    axis: axis === 'x' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0),
    order,
  };
  return { plate, geo };
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _flip = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();

/**
 * All plates on one body part share a single mesh (one draw call). Their vertices are
 * rewritten on the CPU only while the plates are flipping.
 */
class PlateSet {
  readonly mesh: THREE.Mesh;
  private plates: Plate[] = [];
  private lastK = -1;
  private lastFly = 0;

  constructor(parts: { plate: Plate; geo: THREE.BufferGeometry }[], mat: THREE.Material) {
    let start = 0;
    for (const p of parts) {
      p.plate.start = start;
      start += p.geo.getAttribute('position').count;
      this.plates.push(p.plate);
    }
    const merged = mergeGeometries(parts.map((p) => p.geo), false)!;
    for (const p of parts) p.geo.dispose();
    (merged.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
    (merged.getAttribute('normal') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
    merged.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.6, 0), 1.6);
    this.mesh = new THREE.Mesh(merged, mat);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  update(k: number, fly = 0) {
    this.mesh.visible = k > 0.001;
    if (!this.mesh.visible || (Math.abs(k - this.lastK) < 1e-4 && fly === this.lastFly)) return;
    this.lastK = k;
    this.lastFly = fly;
    const posAttr = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const nrmAttr = this.mesh.geometry.getAttribute('normal') as THREE.BufferAttribute;
    const P = posAttr.array as Float32Array;
    const N = nrmAttr.array as Float32Array;
    for (const pl of this.plates) {
      const local = THREE.MathUtils.clamp((k - pl.order * 0.55) / 0.45, 0, 1);
      const sm = local * local * (3 - 2 * local);
      _flip.setFromAxisAngle(pl.axis, Math.PI * (1 - sm));
      _q.copy(pl.hinge).multiply(_flip);
      _p.copy(pl.normal).multiplyScalar(0.006 + 0.022 * Math.sin(local * Math.PI)).add(pl.base);
      if (fly > 0) {
        // promo: the tile flies in from outside, spinning, and slams onto the body
        const away = Math.pow(1 - sm, 2.2) * fly;
        _p.addScaledVector(pl.normal, away).y += away * 0.35;
        _flip.setFromAxisAngle(pl.axis, Math.PI * (1 - sm) * 3);
        _q.copy(pl.hinge).multiply(_flip);
      }
      _s.setScalar(fly > 0 && local <= 0 ? 0.0001 : 0.72 + 0.28 * easeOutBack(local));
      _m.compose(_p, _q, _s);
      const n = pl.pos.length / 3;
      for (let i = 0; i < n; i++) {
        const o = (pl.start + i) * 3;
        _v.fromArray(pl.pos, i * 3).applyMatrix4(_m).toArray(P, o);
        _v.fromArray(pl.nrm, i * 3).applyQuaternion(_q).toArray(N, o);
      }
    }
    posAttr.needsUpdate = true;
    nrmAttr.needsUpdate = true;
  }
}

const easeOutBack = (x: number) => {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
};

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

  // ---- 「針織戰甲」 Knit Armor (hidden until AI Boost)
  const armorMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: getPlateTexture(), flatShading: true });
  const A = ARMOR;
  type PlatePart = ReturnType<typeof buildPlate>;
  const groups = new Map<THREE.Object3D, PlatePart[]>();
  const P = (parent: THREE.Object3D, ...args: Parameters<typeof buildPlate>) => {
    if (!groups.has(parent)) groups.set(parent, []);
    groups.get(parent)!.push(buildPlate(...args));
  };
  for (const s of [1, -1]) {
    const arm = arms[s === 1 ? 0 : 1];
    const leg = legs[s === 1 ? 0 : 1];
    P(torso, 0.27, 0.3, A.navy, [
      [slab(0.27, 0.035, 0.05), 0, -0.14, 0.004, A.gold],
      [slab(0.035, 0.26, 0.05), -s * 0.12, 0.01, 0.004, A.teal],
    ], [0.145 * s, 1.07, 0.22], { ry: 0.16 * s }, 'y', 0);
    P(torso, 0.2, 0.14, A.navyDeep, [[slab(0.2, 0.03, 0.05), 0, -0.058, 0.004, A.cream]], [0.112 * s, 0.84, 0.21], { ry: 0.1 * s }, 'x', 0.12);
    P(arm, 0.26, 0.24, A.teal, [[slab(0.26, 0.035, 0.05), 0, -0.105, 0.004, A.gold]], [0.035 * s, 0.07, 0], { rx: -Math.PI / 2, rz: -s * 0.55 }, 'x', 0.22);
    P(arm, 0.16, 0.18, A.tealDeep, [[slab(0.03, 0.18, 0.05), 0, 0, 0.004, A.cream]], [0.1 * s, -0.13, 0], { ry: (s * Math.PI) / 2 }, 'y', 0.3);
    P(arm, 0.19, 0.25, A.navy, [[slab(0.19, 0.035, 0.05), 0, 0.095, 0.004, A.gold]], [0.105 * s, -0.33, 0], { ry: (s * Math.PI) / 2 }, 'y', 0.4);
    P(leg, 0.19, 0.19, A.navy, [[slab(0.19, 0.03, 0.05), 0, -0.08, 0.004, A.cream]], [0, -0.13, 0.12], {}, 'x', 0.5);
    P(leg, 0.18, 0.22, A.teal, [[slab(0.18, 0.04, 0.05), 0, 0.095, 0.004, A.gold]], [0, -0.39, 0.122], {}, 'x', 0.62);
  }
  P(torso, 0.46, 0.05, A.gold, [], [0, 0.655, 0.18], {}, 'x', 0.2);
  P(torso, 0.44, 0.5, A.navyDeep, [
    [slab(0.03, 0.46, 0.05), 0.2, 0, 0.004, A.teal],
    [slab(0.03, 0.46, 0.05), -0.2, 0, 0.004, A.teal],
  ], [0, 1.0, -0.215], { ry: Math.PI }, 'y', 0.3);
  const plateSets: PlateSet[] = [];
  for (const [parent, parts] of groups) {
    const set = new PlateSet(parts, armorMat);
    parent.add(set.mesh);
    plateSets.push(set);
  }

  // two compact thrusters that slide out of the back plate (one mesh + one flame mesh)
  const flameMat = new THREE.MeshBasicMaterial({ color: '#bff7ee', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const thruster = new THREE.Group();
  const tb = new MeshBuilder(true);
  const fb = new MeshBuilder();
  for (const s of [1, -1]) {
    const tilt = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.28, 0, s * 0.12)).setPosition(0.12 * s, 0, 0);
    const part = (g: THREE.BufferGeometry, y: number) => uvSolid(g).translate(0, y, 0).applyMatrix4(tilt);
    tb.add(part(new THREE.CylinderGeometry(0.052, 0.062, 0.24, 6), 0), A.teal);
    tb.add(part(new THREE.ConeGeometry(0.052, 0.07, 6), 0.155), A.navy);
    tb.add(part(new THREE.CylinderGeometry(0.07, 0.05, 0.05, 6), -0.14), A.gold);
    fb.add(new THREE.ConeGeometry(0.045, 0.34, 6, 1, true).rotateX(Math.PI).translate(0, -0.17, 0).applyMatrix4(new THREE.Matrix4().makeTranslation(0, -0.16, 0).premultiply(tilt)), '#ffffff');
  }
  const thrusterBody = tb.build(armorMat);
  thrusterBody.castShadow = true;
  const flames = fb.build(flameMat);
  flames.matrixAutoUpdate = true;
  thruster.add(thrusterBody, flames);
  thruster.visible = false;
  torso.add(thruster);

  let armorShown = false;
  const armor = (k: number, thrust: number, time: number) => {
    const on = k > 0.001;
    if (!on && !armorShown) return;
    armorShown = on;
    for (const set of plateSets) set.update(k, fx.fly);
    const tk = THREE.MathUtils.clamp((k - 0.8) / 0.2, 0, 1);
    thruster.visible = tk > 0;
    thruster.scale.setScalar(Math.max(0.001, easeOutBack(tk)));
    thruster.position.set(0, 1.03, -0.21 - 0.075 * tk);
    flames.visible = thrust > 0.02;
    const fl = fx.flame;
    flames.scale.set(1 + (fl - 1) * 0.6, Math.max(0.01, thrust * fl * (0.8 + 0.25 * Math.sin(time * 47))), 1 + (fl - 1) * 0.6);
    flameMat.opacity = Math.min(1, 0.55 + 0.3 * thrust * fl);
  };
  const fx = { land: 0, fly: 0, flame: 1 };

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

    // superhero landing: deep crouch, front knee up, back leg reaching back, one fist on the ground
    const L = fx.land;
    if (L > 0) {
      const mix = (a: number, b: number) => a + (b - a) * L;
      body.position.y = mix(body.position.y, -0.5);
      body.rotation.x = mix(body.rotation.x, 0.42);
      legs[0].rotation.x = mix(legs[0].rotation.x, -1.45);
      legs[1].rotation.x = mix(legs[1].rotation.x, 0.75);
      arms[0].rotation.x = mix(arms[0].rotation.x, -0.55);
      arms[0].rotation.z = mix(arms[0].rotation.z, 0.12);
      arms[1].rotation.x = mix(arms[1].rotation.x, 0.85);
      arms[1].rotation.z = mix(arms[1].rotation.z, -0.75);
      hands[0].scale.setScalar(mix(hands[0].scale.x, 1));
      hands[1].scale.setScalar(mix(hands[1].scale.x, 1));
      head.rotation.x = mix(head.rotation.x, -0.38);
    }

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

  return { root, update, cheer, armor, fx };
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
