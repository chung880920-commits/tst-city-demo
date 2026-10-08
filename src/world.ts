import * as THREE from 'three';
import { MeshBuilder, mulberry32 } from './builder';
import { SignAtlas } from './signs';
import { WATER_LEVEL } from './env';

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Top of the obstacle; low ones can be jumped onto. */
  h: number;
}

/** Overhead geometry (awnings, signs, tree crowns, canopies) that blocks the camera but not the player. */
export interface Box3 {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export type MapKind = 'land' | 'road' | 'walk' | 'plaza' | 'building' | 'pier' | 'green' | 'landmark' | 'boat';
export interface MapShape {
  kind: MapKind;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  round?: boolean;
}

export interface Checkpoint {
  id: string;
  name: string;
  x: number;
  z: number;
}

export interface Zone {
  name: string;
  test: (x: number, z: number) => boolean;
}

export const BOUNDS = { minX: -95, maxX: 95, minZ: -96, maxZ: 70 };
export const SHORE_Z = 38;
export const CLOCK_TOWER = { x: -30, z: 28 };
export const PIER = { x0: -63, x1: -45, z0: SHORE_Z, z1: 64 };

export const CHECKPOINTS: Checkpoint[] = [
  { id: 'clock', name: '尖沙咀鐘樓', x: CLOCK_TOWER.x, z: 22 },
  { id: 'pier', name: '天星碼頭', x: -54, z: 43 },
  { id: 'corner', name: '彌敦道街角', x: 28.6, z: -6.6 },
];

const inRect = (x: number, z: number, x0: number, x1: number, z0: number, z1: number) =>
  x >= x0 && x <= x1 && z >= z0 && z <= z1;

export const ZONES: Zone[] = [
  { name: '天星碼頭', test: (x, z) => inRect(x, z, PIER.x0, PIER.x1, PIER.z0, PIER.z1 + 2) },
  { name: '尖沙咀鐘樓', test: (x, z) => Math.hypot(x - CLOCK_TOWER.x, z - CLOCK_TOWER.z) < 11 },
  { name: '尖沙咀海濱長廊', test: (_x, z) => z > 8 && z <= SHORE_Z + 1 },
  { name: '梳士巴利道', test: (_x, z) => z > -8.5 && z <= 8 },
  { name: '廣東道', test: (x, z) => z <= -8.5 && x > -64 && x < -48 },
  { name: '漢口道', test: (x, z) => z <= -8.5 && x > -13 && x < -5 },
  { name: '彌敦道', test: (x, z) => z <= -8.5 && x > 26 && x < 44 },
  { name: '尖沙咀', test: () => true },
];

const C = {
  land: '#a3978e',
  asphalt: '#565563',
  sidewalk: '#b8aca3',
  curb: '#9c8f86',
  promenade: '#c4b2a6',
  promenade2: '#b29c8e',
  plaza: '#b98d79',
  seawall: '#8f8a85',
  brick: '#b7553b',
  brickDark: '#93402c',
  granite: '#ead9bd',
  slate: '#5b4f4a',
  white: '#f4efe6',
  glass: '#33405c',
  greenDark: '#1f5a3d',
  green: '#2d7a4f',
  trunk: '#8a6a4a',
  leaf: '#4f9a4a',
  leaf2: '#3f8240',
  metal: '#3a4a46',
  bench: '#9a6a43',
};

const FACADES = ['#e8d8c3', '#d9c2a5', '#c9d6d8', '#e4c9b5', '#b9c7b0', '#d8b4a0', '#a9b8c9', '#efe2cf', '#c7b2c9', '#dcc89c', '#e6b8a2', '#bfc9d9'];
const NEON = ['#ff3b6b', '#36e8ff', '#ffd23f', '#7cff6b', '#ff8a1f', '#d77bff', '#ff5ad1'];

const VERTICAL_SIGNS = [
  '金龍茶餐廳', '好運找換店', '晴空眼鏡', '海景金行', '仁心藥房', '明珠燒臘', '富滿樓酒家', '新潮電器',
  '彌敦冰室', '興隆押', '大光明賓館', '福星士多', '細路雲吞麵', '鴻圖酒家', '港灣錶行', '飛訊電訊',
];
const SHOP_SIGNS: Array<[string, string]> = [
  ['金龍茶餐廳', 'GOLDEN DRAGON CAFE'],
  ['好運找換店', 'LUCKY MONEY EXCHANGE'],
  ['海景金行', 'HARBOUR VIEW GOLD'],
  ['富滿樓酒家', 'FULL HOUSE RESTAURANT'],
  ['新潮電器', 'NEW WAVE ELECTRONICS'],
  ['大光明賓館', 'BRIGHT LIGHT GUEST HOUSE'],
  ['晴空眼鏡', 'CLEAR SKY OPTICAL'],
  ['仁心藥房', 'KIND HEART PHARMACY'],
  ['明珠燒臘', 'PEARL BBQ'],
  ['港灣錶行', 'BAYSIDE WATCHES'],
  ['福星士多', 'LUCKY STAR STORE'],
  ['彌敦冰室', 'NATHAN ICE CAFE'],
];

export interface World {
  group: THREE.Group;
  colliders: AABB[];
  camBlockers: Box3[];
  /** Shopfront centres at the facade with their outward normal (used by automated camera checks). */
  shops: { name: string; x: number; z: number; nx: number; nz: number; len: number }[];
  map: MapShape[];
  /** Number of colliders that never move (traffic colliders follow them). */
  staticCount: number;
  /** Self-lit materials whose brightness follows the time of day. */
  nightMats: { windows: THREE.MeshBasicMaterial; skyline: THREE.MeshBasicMaterial; skylineWin: THREE.MeshBasicMaterial; signs: THREE.MeshBasicMaterial; glow: THREE.MeshBasicMaterial };
  update: (t: number) => void;
}

export function buildWorld(): World {
  const rng = mulberry32(852);
  const group = new THREE.Group();
  const colliders: AABB[] = [];
  const camBlockers: Box3[] = [];
  const shops: World['shops'] = [];
  const map: MapShape[] = [];

  const ground = new MeshBuilder();
  const solid = new MeshBuilder();
  const glow = new MeshBuilder();
  const far = new MeshBuilder();
  const farWin = new MeshBuilder();
  const nightWin = new MeshBuilder();
  const signs = new SignAtlas();

  const collide = (minX: number, minZ: number, maxX: number, maxZ: number, h: number) =>
    colliders.push({ minX, maxX, minZ, maxZ, h });
  const camBlock = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) =>
    camBlockers.push({ minX: Math.min(ax, bx), maxX: Math.max(ax, bx), minY: Math.min(ay, by), maxY: Math.max(ay, by), minZ: Math.min(az, bz), maxZ: Math.max(az, bz) });
  const mapRect = (kind: MapKind, x0: number, z0: number, x1: number, z1: number, round = false) =>
    map.push({ kind, x0, z0, x1, z1, round });
  const flat = (x0: number, z0: number, x1: number, z1: number, y: number, color: string, thick = 0.1) =>
    ground.block(x0, z0, x1, z1, y - thick, y, color);

  // ---------------------------------------------------------------- ground
  flat(-420, -420, 420, SHORE_Z, 0, C.land, 0.4);
  ground.block(-420, SHORE_Z - 0.6, 420, SHORE_Z + 0.4, WATER_LEVEL - 2.5, 0.12, C.seawall);
  mapRect('land', -200, -200, 200, SHORE_Z);

  // Promenade with paving stripes
  flat(-200, 8, 200, SHORE_Z, 0.05, C.promenade);
  for (let x = -200; x < 200; x += 6) flat(x, 8.2, x + 1.2, SHORE_Z - 0.6, 0.07, C.promenade2, 0.02);
  mapRect('walk', -200, 8, 200, SHORE_Z);

  // Clock tower plaza
  ground.add(new THREE.CylinderGeometry(10, 10, 0.1, 20), C.plaza, { x: CLOCK_TOWER.x, y: 0.06, z: CLOCK_TOWER.z });
  ground.add(new THREE.CylinderGeometry(7.2, 7.2, 0.1, 20), '#c9a18a', { x: CLOCK_TOWER.x, y: 0.08, z: CLOCK_TOWER.z });
  mapRect('plaza', CLOCK_TOWER.x - 10, CLOCK_TOWER.z - 10, CLOCK_TOWER.x + 10, CLOCK_TOWER.z + 10, true);

  // Salisbury Road (east-west) and sidewalks
  flat(-200, -5, 200, 5, 0.02, C.asphalt);
  flat(-200, 5, 200, 8, 0.12, C.sidewalk);
  flat(-200, -8.5, 200, -5, 0.12, C.sidewalk);
  flat(-200, 4.85, 200, 5.15, 0.14, C.curb, 0.1);
  flat(-200, -5.15, 200, -4.85, 0.14, C.curb, 0.1);
  for (let x = -198; x < 198; x += 6) flat(x, -0.12, x + 3, 0.12, 0.04, '#e8e2d0', 0.02);
  for (let x = -198; x < 198; x += 6) {
    flat(x, -2.65, x + 2, -2.45, 0.04, '#cfc8b6', 0.02);
    flat(x, 2.45, x + 2, 2.65, 0.04, '#cfc8b6', 0.02);
  }
  mapRect('road', -200, -5, 200, 5);
  mapRect('walk', -200, -8.5, 200, -5);
  mapRect('walk', -200, 5, 200, 8);

  // Zebra crossings
  const zebra = (cx: number) => {
    for (let i = -4; i <= 4; i++) flat(cx - 3, i * 1.05 - 0.35, cx + 3, i * 1.05 + 0.35, 0.05, '#f1ece0', 0.02);
  };
  zebra(CLOCK_TOWER.x);
  zebra(35);
  zebra(-56);

  // North-south streets
  const streets = [
    { name: 'canton', x0: -60, x1: -52, walk: 3 },
    { name: 'lane', x0: -11, x1: -7, walk: 1.6 },
    { name: 'nathan', x0: 30, x1: 40, walk: 3 },
  ];
  for (const s of streets) {
    flat(s.x0, -200, s.x1, -5, 0.03, C.asphalt);
    flat(s.x0 - s.walk, -200, s.x0, -8.5, 0.12, C.sidewalk);
    flat(s.x1, -200, s.x1 + s.walk, -8.5, 0.12, C.sidewalk);
    if (s.x1 - s.x0 > 6) {
      const cx = (s.x0 + s.x1) / 2;
      for (let z = -12; z > -200; z -= 6) flat(cx - 0.12, z - 3, cx + 0.12, z, 0.05, '#e8e2d0', 0.02);
    }
    mapRect('road', s.x0, -200, s.x1, -5);
    mapRect('walk', s.x0 - s.walk, -200, s.x0, -8.5);
    mapRect('walk', s.x1, -200, s.x1 + s.walk, -8.5);
  }

  // ------------------------------------------------------------- buildings
  let signIdx = 0;
  let vSignIdx = 0;

  type Face = 'n' | 's' | 'e' | 'w';
  const building = (x0: number, z0: number, x1: number, z1: number, h: number, faces: Face[], detail = true) => {
    const color = FACADES[Math.floor(rng() * FACADES.length)];
    solid.block(x0, z0, x1, z1, 0, h, color);
    collide(x0, z0, x1, z1, h);
    mapRect('building', x0, z0, x1, z1);
    // ribbon windows
    const band = rng() < 0.5 ? 1.3 : 1.6;
    for (let y = 5.2; y < h - 1.2; y += 3) {
      const r = rng();
      const lit = r < 0.12;
      (lit ? glow : r < 0.45 ? nightWin : solid).block(x0 - 0.06, z0 - 0.06, x1 + 0.06, z1 + 0.06, y, y + band, lit ? '#ffcf86' : r < 0.45 ? '#ffffff' : C.glass);
    }
    solid.block(x0 - 0.15, z0 - 0.15, x1 + 0.15, z1 + 0.15, h, h + 0.5, shade(color, 0.8));
    if (!detail) return;
    if (rng() < 0.6) {
      const rx = x0 + 1 + rng() * (x1 - x0 - 3);
      const rz = z0 + 1 + rng() * (z1 - z0 - 3);
      solid.add(new THREE.CylinderGeometry(0.9, 0.9, 1.8, 6), '#8d8a90', { x: rx + 0.9, y: h + 1.4, z: rz + 0.9 });
    }
    if (rng() < 0.5) solid.block(x0 + 0.8, z0 + 0.8, x0 + 2.4, z0 + 2.0, h + 0.5, h + 1.3, '#9aa0a8');

    for (const f of faces) shopfront(x0, z0, x1, z1, f, h);
  };

  const shopfront = (x0: number, z0: number, x1: number, z1: number, f: Face, h: number) => {
    const along = f === 'n' || f === 's';
    const len = along ? x1 - x0 : z1 - z0;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const out = f === 'n' || f === 'w' ? -1 : 1;
    const faceCoord = f === 'n' ? z0 : f === 's' ? z1 : f === 'w' ? x0 : x1;
    const ry = f === 'n' ? Math.PI : f === 's' ? 0 : f === 'e' ? Math.PI / 2 : -Math.PI / 2;
    const at = (o: number, a: number) => (along ? { x: cx + a, z: faceCoord + out * o } : { x: faceCoord + out * o, z: cz + a });

    // lit shop window band
    const sw = len - 1.2;
    const p = at(0.06, 0);
    glow.box(along ? sw : 0.12, 2.6, along ? 0.12 : sw, p.x, 1.6, p.z, rng() < 0.5 ? '#f2c98e' : '#e8d3b0');
    for (let a = -sw / 2; a <= sw / 2 + 0.01; a += sw / Math.max(1, Math.round(sw / 1.8))) {
      const m = at(0.1, a);
      solid.box(along ? 0.14 : 0.1, 2.7, along ? 0.1 : 0.14, m.x, 1.6, m.z, '#3a3440');
    }
    solid.box(along ? sw : 0.1, 0.14, along ? 0.1 : sw, at(0.1, 0).x, 0.36, at(0.1, 0).z, '#3a3440');
    // awning
    const aw = at(0.7, 0);
    const awColor = NEON[Math.floor(rng() * NEON.length)];
    solid.add(new THREE.BoxGeometry(along ? sw : 1.4, 0.18, along ? 1.4 : sw), shade(awColor, 0.75), {
      x: aw.x,
      y: 3.35,
      z: aw.z,
      rx: along ? -out * 0.18 : 0,
      rz: along ? 0 : out * 0.18,
    });
    {
      const a0 = at(0, -sw / 2);
      const a1 = at(1.45, sw / 2);
      camBlock(a0.x, 3.1, a0.z, a1.x, 3.6, a1.z);
    }
    // flat shop sign above the awning
    const [t, sub] = SHOP_SIGNS[signIdx++ % SHOP_SIGNS.length];
    shops.push({ name: t, ...at(0, 0), nx: along ? 0 : out, nz: along ? out : 0, len });
    const sp = at(0.1, 0);
    signs.add({ text: t, sub, neon: NEON[signIdx % NEON.length] }, Math.min(len - 1.5, 7), sp.x, 4.45, sp.z, ry);

    // vertical neon blade signs sticking out over the pavement
    if (h > 12 && len > 5) {
      const count = len > 9 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const a = (count === 1 ? 0 : (i - 0.5) * len * 0.5) + (rng() - 0.5);
        const bp = at(1.25, a);
        const text = VERTICAL_SIGNS[vSignIdx++ % VERTICAL_SIGNS.length];
        const sy = 7 + rng() * Math.min(5, h - 12);
        const neon = NEON[Math.floor(rng() * NEON.length)];
        const res = signs.add({ text, vertical: true, neon }, 4.6, bp.x, sy, bp.z, ry + Math.PI / 2);
        if (res) {
          const b0 = at(0.5, a - 0.15);
          const b1 = at(1.25 + res.w / 2, a + 0.15);
          camBlock(b0.x, sy - res.h / 2, b0.z, b1.x, sy + res.h / 2, b1.z);
          const bracket = at(0.6, a);
          solid.box(along ? 0.12 : 1.2, 0.12, along ? 1.2 : 0.12, bracket.x, sy + res.h / 2 - 0.2, bracket.z, '#2b2b33');
        }
      }
    }
  };

  /** Fills a rectangular block with a row of buildings, with shops on street faces. */
  const fillBlock = (x0: number, z0: number, x1: number, z1: number, opts: { faces: (bx0: number, bx1: number) => Face[]; hMin: number; hMax: number; byZ?: boolean }) => {
    if (opts.byZ) {
      let z = z1;
      while (z > z0 + 4) {
        const d = Math.min(z - z0, 7 + rng() * 6);
        const h = opts.hMin + rng() * (opts.hMax - opts.hMin);
        building(x0, z - d + 0.3, x1, z - 0.3, h, opts.faces(x0, x1));
        z -= d;
      }
      return;
    }
    let x = x0;
    while (x < x1 - 4) {
      const w = Math.min(x1 - x, 7 + rng() * 6);
      const h = opts.hMin + rng() * (opts.hMax - opts.hMin);
      building(x + 0.3, z0, x + w - 0.3, z1, h, opts.faces(x, x + w));
      x += w;
    }
  };

  // Front row along Salisbury Road (north side)
  const frontZ0 = -22;
  const frontZ1 = -8.6;
  const edgeFaces = (bx0: number, bx1: number, leftStreet: number, rightStreet: number): Face[] => {
    const out: Face[] = ['s'];
    if (Math.abs(bx0 - leftStreet) < 0.5) out.push('w');
    if (Math.abs(bx1 - rightStreet) < 0.5) out.push('e');
    return out;
  };
  // west of Canton Road: arcade
  solid.block(-150, -60, -63, frontZ1, 0, 13, '#d9cdb8');
  solid.block(-150.2, -60.2, -62.8, frontZ1 + 0.2, 4.2, 5.8, C.glass);
  glow.block(-150.1, -60.1, -62.9, frontZ1 + 0.1, 0.4, 3.6, '#ffe6b5');
  solid.block(-150.4, -60.4, -62.6, frontZ1 + 0.4, 13, 13.6, '#b8a88f');
  collide(-150, -60, -63, frontZ1, 13);
  mapRect('building', -150, -60, -63, frontZ1);
  signs.add({ text: '浪花坊', sub: 'WAVEFRONT ARCADE', neon: '#36e8ff' }, 9, -75, 9.6, frontZ1 + 0.2, 0);
  signs.add({ text: '浪花坊', sub: 'WAVEFRONT ARCADE', neon: '#36e8ff' }, 9, -62.8, 9.6, -30, Math.PI / 2);
  fillBlock(-150, -100, -63, -61, { faces: () => ['e'], hMin: 20, hMax: 40, byZ: true });

  // Canton Road -> lane
  fillBlock(-49, frontZ0, -12.6, frontZ1, { faces: (a, b) => edgeFaces(a, b, -49, -12.6), hMin: 11, hMax: 22 });
  fillBlock(-49, -100, -32, frontZ0 - 1, { faces: () => ['w'], hMin: 18, hMax: 36, byZ: true });
  fillBlock(-30, -100, -12.6, frontZ0 - 1, { faces: () => ['e'], hMin: 18, hMax: 36, byZ: true });
  // lane -> Nathan Road
  fillBlock(-5.4, frontZ0, 27, frontZ1, { faces: (a, b) => edgeFaces(a, b, -5.4, 27), hMin: 11, hMax: 24 });
  fillBlock(-5.4, -100, 9, frontZ0 - 1, { faces: () => ['w'], hMin: 18, hMax: 40, byZ: true });
  fillBlock(11, -100, 27, frontZ0 - 1, { faces: () => ['e'], hMin: 20, hMax: 40, byZ: true });
  // east of Nathan Road
  fillBlock(43, frontZ0, 150, frontZ1, { faces: (a, b) => edgeFaces(a, b, 43, 999), hMin: 12, hMax: 26 });
  fillBlock(43, -100, 62, frontZ0 - 1, { faces: () => ['w'], hMin: 22, hMax: 44, byZ: true });
  fillBlock(64, -100, 150, frontZ0 - 1, { faces: () => [], hMin: 20, hMax: 44 });
  // closing wall of towers at the north end
  fillBlock(-150, -130, 150, -101, { faces: () => [], hMin: 30, hMax: 60 });

  // Overhanging horizontal neon over Nathan Road (the classic look)
  const overhang: Array<[string, string]> = [
    ['富滿樓酒家', 'FULL HOUSE'],
    ['興隆押', 'PAWN'],
    ['大光明賓館', 'GUEST HOUSE'],
    ['金龍茶餐廳', 'CAFE'],
    ['鴻圖酒家', 'SEAFOOD'],
    ['海景金行', 'GOLD'],
  ];
  overhang.forEach(([t, sub], i) => {
    const z = -16 - i * 12;
    const fromWest = i % 2 === 0;
    const x = fromWest ? 31.6 : 38.4;
    const y = 6.6 + (i % 3) * 1.6;
    const res = signs.add({ text: t, sub, neon: NEON[(i * 3) % NEON.length] }, 5.2, x, y, z, 0);
    solid.box(4, 0.15, 0.15, fromWest ? 29 : 41, y + (res?.h ?? 1.5) / 2 + 0.05, z, '#2b2b33');
  });
  // a few over Canton Road too
  ['晴空眼鏡', '港灣錶行', '飛訊電訊'].forEach((t, i) => {
    const z = -30 - i * 16;
    signs.add({ text: t, neon: NEON[(i * 2 + 1) % NEON.length] }, 4.6, i % 2 ? -57.8 : -54.2, 6.8 + i * 1.2, z, 0);
  });

  // --------------------------------------------------------- promenade side
  // Space-museum-like dome
  const dome = { x: 4, z: 18 };
  solid.add(new THREE.CylinderGeometry(8.4, 8.6, 1.4, 16), '#d7c9b6', { x: dome.x, y: 0.7, z: dome.z });
  solid.add(new THREE.SphereGeometry(8, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#f1e8dc', { x: dome.x, y: 1.4, z: dome.z, sy: 0.8 });
  solid.block(dome.x - 2, dome.z - 9.2, dome.x + 2, dome.z - 7.5, 0, 3, '#c9b7a3');
  collide(dome.x - 7.4, dome.z - 7.4, dome.x + 7.4, dome.z + 7.4, 7.8);
  mapRect('landmark', dome.x - 8, dome.z - 8, dome.x + 8, dome.z + 8, true);

  // Cultural-centre-like hall with sloped roof facing the harbour
  {
    const x0 = 20;
    const x1 = 90;
    const z0 = 10;
    const z1 = 23;
    solid.block(x0, z0, x1, z1, 0, 7, '#e2b7a0');
    const len = z1 - z0;
    const rise = 9;
    const slope = Math.atan2(rise, len);
    solid.add(new THREE.BoxGeometry(x1 - x0, 0.6, Math.hypot(len, rise)), '#d39a82', {
      x: (x0 + x1) / 2,
      y: 7 + rise / 2,
      z: (z0 + z1) / 2,
      rx: slope,
    });
    solid.block(x0, z0, x0 + 0.6, z1 - 0.2, 7, 7 + rise * 0.98, '#d39a82');
    solid.block(x1 - 0.6, z0, x1, z1 - 0.2, 7, 7 + rise * 0.98, '#d39a82');
    solid.block(x0, z0 - 0.2, x1, z0 + 0.2, 7, 7 + rise, '#c88d76');
    glow.block(x0 + 2, z1 + 0.02, x1 - 2, z1 + 0.12, 0.3, 3.4, '#ffd9a0');
    for (let x = x0 + 3; x < x1 - 2; x += 5) solid.block(x, z1 + 0.1, x + 0.6, z1 + 1.6, 0, 4, '#e9cdb9');
    solid.block(x0 + 1, z1 + 0.1, x1 - 1, z1 + 1.8, 4, 4.5, '#e9cdb9');
    collide(x0, z0, x1, z1 + 1.8, 16);
    mapRect('building', x0, z0, x1, z1);
  }

  // Seaside railing (gap for the pier)
  const railing = (x0: number, x1: number, z: number) => {
    for (let x = x0; x <= x1; x += 2.5) solid.box(0.12, 1.1, 0.12, x, 0.6, z, C.metal);
    solid.box(x1 - x0, 0.1, 0.16, (x0 + x1) / 2, 1.15, z, C.metal);
    solid.box(x1 - x0, 0.06, 0.08, (x0 + x1) / 2, 0.6, z, C.metal);
  };
  railing(-160, PIER.x0, SHORE_Z - 0.4);
  railing(PIER.x1, 160, SHORE_Z - 0.4);
  collide(-200, SHORE_Z - 0.7, PIER.x0, SHORE_Z + 2, 50);
  collide(PIER.x1, SHORE_Z - 0.7, 200, SHORE_Z + 2, 50);

  // Lamps, benches, palms along the promenade
  for (let x = -94; x <= 94; x += 14) {
    if (x > PIER.x0 - 2 && x < PIER.x1 + 2) continue;
    const z = SHORE_Z - 2.4;
    solid.add(new THREE.CylinderGeometry(0.1, 0.14, 4.4, 6), '#2f3d3a', { x, y: 2.2, z });
    solid.box(0.9, 0.08, 0.08, x, 4.3, z, '#2f3d3a');
    glow.add(new THREE.SphereGeometry(0.28, 6, 4), '#fff0c4', { x: x - 0.45, y: 4.05, z });
    glow.add(new THREE.SphereGeometry(0.28, 6, 4), '#fff0c4', { x: x + 0.45, y: 4.05, z });
    collide(x - 0.2, z - 0.2, x + 0.2, z + 0.2, 4.4);
    if (Math.abs(x - CLOCK_TOWER.x) > 9) {
      const bx = x + 7;
      solid.box(2.2, 0.12, 0.6, bx, 0.5, z, C.bench);
      solid.box(2.2, 0.5, 0.1, bx, 0.85, z - 0.3, C.bench);
      solid.box(0.1, 0.45, 0.5, bx - 1, 0.25, z, C.metal);
      solid.box(0.1, 0.45, 0.5, bx + 1, 0.25, z, C.metal);
      collide(bx - 1.1, z - 0.35, bx + 1.1, z + 0.3, 0.56);
    }
  }
  const palm = (x: number, z: number, s = 1) => {
    const lean = (rng() - 0.5) * 0.25;
    solid.add(new THREE.CylinderGeometry(0.18 * s, 0.3 * s, 5.4 * s, 5), C.trunk, { x, y: 2.7 * s, z, rz: lean });
    const top = { x: x - Math.sin(lean) * 5.4 * s, y: 5.4 * s, z };
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + rng();
      solid.add(new THREE.ConeGeometry(0.45 * s, 3.2 * s, 3), i % 2 ? C.leaf : C.leaf2, {
        x: top.x + Math.cos(a) * 1.3 * s,
        y: top.y - 0.25,
        z: top.z + Math.sin(a) * 1.3 * s,
        rx: Math.sin(a) * 1.9,
        rz: -Math.cos(a) * 1.9,
      });
    }
    camBlock(top.x - 2.5 * s, top.y - 1.9 * s, top.z - 2.5 * s, top.x + 2.5 * s, top.y + 0.7 * s, top.z + 2.5 * s);
    solid.add(new THREE.CylinderGeometry(1.1 * s, 1.2 * s, 0.6, 6), '#a58e76', { x, y: 0.3, z });
    collide(x - 0.9 * s, z - 0.9 * s, x + 0.9 * s, z + 0.9 * s, 0.6);
    mapRect('green', x - 1.4, z - 1.4, x + 1.4, z + 1.4, true);
  };
  for (let x = -90; x <= 90; x += 11) {
    if (x > 14 && x < 92) continue;
    if (Math.abs(x - CLOCK_TOWER.x) < 12) continue;
    if (x > -10 && x < 14) continue;
    palm(x, 10.5);
  }
  palm(CLOCK_TOWER.x - 8, CLOCK_TOWER.z + 5, 1.1);
  palm(CLOCK_TOWER.x + 8, CLOCK_TOWER.z + 5, 1.1);
  palm(CLOCK_TOWER.x - 8.5, CLOCK_TOWER.z - 4, 0.9);
  palm(CLOCK_TOWER.x + 8.5, CLOCK_TOWER.z - 4, 0.9);
  // street trees along Salisbury sidewalk
  for (let x = -88; x <= 88; x += 13) {
    if (Math.abs(x - 35) < 8 || Math.abs(x + 56) < 8 || Math.abs(x + 9) < 4 || Math.abs(x - CLOCK_TOWER.x) < 9) continue;
    solid.add(new THREE.CylinderGeometry(0.12, 0.18, 2.4, 5), C.trunk, { x, y: 1.2, z: 6.6 });
    solid.add(new THREE.IcosahedronGeometry(1.4, 0), C.leaf2, { x, y: 3.2, z: 6.6 });
    collide(x - 0.25, 6.35, x + 0.25, 6.85, 2.4);
    camBlock(x - 1.35, 1.9, 5.25, x + 1.35, 4.6, 7.95);
  }

  // --------------------------------------------------------- clock tower
  buildClockTower(solid, glow, collide);
  mapRect('landmark', CLOCK_TOWER.x - 2.6, CLOCK_TOWER.z - 2.6, CLOCK_TOWER.x + 2.6, CLOCK_TOWER.z + 2.6);

  // --------------------------------------------------------- pier + ferry
  buildPier(solid, glow, signs, collide, camBlock, mapRect);

  // ------------------------------------------------------ distant skyline
  buildSkyline(far, farWin, rng);

  // ---------------------------------------------------- traffic (dynamic)
  const traffic = buildTraffic(rng);
  group.add(traffic.group);

  // ---------------------------------------------------------------- meshes
  const lambertV = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const groundMesh = ground.build(lambertV, 'ground');
  groundMesh.receiveShadow = true;
  const solidMesh = solid.build(lambertV, 'solid');
  solidMesh.castShadow = true;
  solidMesh.receiveShadow = true;
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const glowMesh = glow.build(glowMat, 'glow');
  const windowsMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const windowsMesh = nightWin.build(windowsMat, 'night-windows');
  const skylineMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const farMesh = far.build(skylineMat, 'skyline');
  const skylineWinMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const farWinMesh = farWin.build(skylineWinMat, 'skyline-windows');
  const signMesh = signs.build();
  group.add(groundMesh, solidMesh, glowMesh, windowsMesh, farMesh, farWinMesh, signMesh);

  const staticCount = colliders.length;
  colliders.push(...traffic.colliders);

  return {
    group,
    colliders,
    camBlockers,
    shops,
    map,
    staticCount,
    nightMats: { windows: windowsMat, skyline: skylineMat, skylineWin: skylineWinMat, signs: signMesh.material as THREE.MeshBasicMaterial, glow: glowMat },
    update: (t: number) => traffic.update(t),
  };
}

function shade(hex: string, k: number) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return '#' + c.getHexString();
}

function buildClockTower(solid: MeshBuilder, glow: MeshBuilder, collide: (a: number, b: number, c: number, d: number, h: number) => void) {
  const { x, z } = CLOCK_TOWER;
  const w = 5;
  // plinth
  solid.block(x - 3.2, z - 3.2, x + 3.2, z + 3.2, 0, 0.6, C.granite);
  solid.block(x - 2.9, z - 2.9, x + 2.9, z + 2.9, 0.6, 2.4, C.granite);
  // brick shaft
  solid.block(x - w / 2, z - w / 2, x + w / 2, z + w / 2, 2.4, 20, C.brick);
  // granite banding and corner quoins
  for (const y of [2.4, 7.5, 12.5, 17.2]) solid.block(x - 2.65, z - 2.65, x + 2.65, z + 2.65, y, y + 0.45, C.granite);
  for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    for (let y = 3; y < 20; y += 1.4) solid.box(0.55, 0.6, 0.55, x + cx * 2.35, y, z + cz * 2.35, C.granite);
  }
  // arched windows on each face
  for (const [fx, fz, ry] of [[0, -1, 0], [0, 1, 0], [-1, 0, Math.PI / 2], [1, 0, Math.PI / 2]] as const) {
    for (const y of [5, 10, 15]) {
      solid.box(0.9, 2.2, 0.12, x + fx * 2.52, y, z + fz * 2.52, '#4a2a22', ry);
      solid.box(0.5, 0.35, 0.18, x + fx * 2.54, y + 1.25, z + fz * 2.54, C.granite, ry);
    }
  }
  // doorway on the harbour side and the street side
  solid.box(1.6, 2.2, 0.2, x, 1.5, z - 2.95, '#3a221b');
  solid.box(1.6, 2.2, 0.2, x, 1.5, z + 2.95, '#3a221b');
  // clock stage
  solid.block(x - 2.9, z - 2.9, x + 2.9, z + 2.9, 20, 20.5, C.granite);
  solid.block(x - 2.7, z - 2.7, x + 2.7, z + 2.7, 20.5, 24, C.brick);
  solid.block(x - 3, z - 3, x + 3, z + 3, 24, 24.5, C.granite);
  for (const [fx, fz, ry] of [[0, -1, Math.PI], [0, 1, 0], [-1, 0, -Math.PI / 2], [1, 0, Math.PI / 2]] as const) {
    const px = x + fx * 2.78;
    const pz = z + fz * 2.78;
    const disc = new THREE.CylinderGeometry(1.35, 1.35, 0.12, 16);
    disc.rotateX(Math.PI / 2);
    disc.rotateY(ry);
    solid.add(disc, '#f5c542', { x: px, y: 22.25, z: pz });
    const face = new THREE.CylinderGeometry(1.15, 1.15, 0.14, 16);
    face.rotateX(Math.PI / 2);
    face.rotateY(ry);
    glow.add(face, '#fff6dc', { x: px + fx * 0.02, y: 22.25, z: pz + fz * 0.02 });
    // hands at twenty to six (sunset)
    const off = 0.1;
    const hand = (len: number, angle: number, wdt: number) => {
      const g = new THREE.BoxGeometry(wdt, len, 0.05);
      g.translate(0, len / 2, 0);
      g.rotateZ(-angle);
      g.rotateY(ry);
      solid.add(g, '#1d1a1a', { x: px + fx * off, y: 22.25, z: pz + fz * off });
    };
    hand(0.95, (40 / 60) * Math.PI * 2, 0.1);
    hand(0.65, ((5 + 40 / 60) / 12) * Math.PI * 2, 0.16);
  }
  // upper lantern and cupola
  solid.block(x - 2, z - 2, x + 2, z + 2, 24.5, 26.6, C.brick);
  for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) solid.box(0.5, 2.1, 0.5, x + cx * 1.85, 25.55, z + cz * 1.85, C.granite);
  solid.block(x - 2.3, z - 2.3, x + 2.3, z + 2.3, 26.6, 27, C.granite);
  solid.add(new THREE.CylinderGeometry(1.1, 1.5, 1.4, 8), C.brickDark, { x, y: 27.7, z });
  solid.add(new THREE.SphereGeometry(1.15, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), '#6f6a62', { x, y: 28.4, z });
  solid.add(new THREE.CylinderGeometry(0.06, 0.12, 3.4, 5), '#3b3836', { x, y: 31, z });
  solid.add(new THREE.SphereGeometry(0.2, 6, 4), '#f5c542', { x, y: 30.2, z });
  collide(x - 3.2, z - 3.2, x + 3.2, z + 3.2, 31);
}

function buildPier(
  solid: MeshBuilder,
  glow: MeshBuilder,
  signs: SignAtlas,
  collide: (a: number, b: number, c: number, d: number, h: number) => void,
  camBlock: (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => void,
  mapRect: (k: MapKind, a: number, b: number, c: number, d: number, round?: boolean) => void,
) {
  const { x0, x1, z0, z1 } = PIER;
  // deck on piles
  solid.block(x0, z0 - 0.5, x1, z1, -0.6, 0.1, '#a99b8c');
  for (let x = x0 + 1; x < x1; x += 3) for (let z = z0 + 3; z <= z1; z += 4) solid.box(0.5, 2.4, 0.5, x, WATER_LEVEL - 0.6, z, '#5d5550');
  for (let x = x0 + 1; x < x1; x += 2.2) solid.block(x, z0 + 0.2, x + 1, z1 - 0.2, 0.1, 0.13, '#b9ab9b');
  mapRect('pier', x0, z0, x1, z1);
  // pier railings
  for (let z = z0 + 1; z < z1; z += 2.5) {
    solid.box(0.12, 1.1, 0.12, x0 + 0.3, 0.6, z, C.metal);
    solid.box(0.12, 1.1, 0.12, x1 - 0.3, 0.6, z, C.metal);
  }
  solid.box(0.16, 0.1, z1 - z0, x0 + 0.3, 1.15, (z0 + z1) / 2, C.metal);
  solid.box(0.16, 0.1, z1 - z0, x1 - 0.3, 1.15, (z0 + z1) / 2, C.metal);
  collide(x0 - 1, z0, x0 + 0.5, z1 + 1, 50);
  collide(x1 - 0.5, z0, x1 + 1, z1 + 1, 50);
  collide(x0, z1 - 0.5, x1, z1 + 1, 50);

  // terminal building: cream walls, green trim and roof
  const bx0 = x0 + 2;
  const bx1 = x1 - 2;
  const bz0 = 48;
  const bz1 = z1 - 1.5;
  solid.block(bx0, bz0, bx1, bz1, 0.1, 6.5, '#efe5cf');
  solid.block(bx0 - 0.1, bz0 - 0.1, bx1 + 0.1, bz1 + 0.1, 0.1, 0.8, C.greenDark);
  solid.block(bx0 - 0.1, bz0 - 0.1, bx1 + 0.1, bz1 + 0.1, 3.4, 3.8, C.green);
  for (let x = bx0 + 1; x < bx1 - 1; x += 2.2) {
    solid.box(1.4, 1.6, 0.12, x + 0.7, 5, bz0 - 0.05, C.glass);
    solid.box(1.4, 1.6, 0.12, x + 0.7, 5, bz1 + 0.05, C.glass);
  }
  solid.block(bx0 - 0.8, bz0 - 0.8, bx1 + 0.8, bz1 + 0.8, 6.5, 7.1, C.green);
  solid.block(bx0 + 1, bz0 + 1, bx1 - 1, bz1 - 1, 7.1, 7.6, '#2f6d4c');
  // entrance hall and canopy
  glow.box(5, 2.8, 0.1, (bx0 + bx1) / 2, 1.6, bz0 - 0.06, '#ffe0a0');
  solid.box(7, 0.25, 3.2, (bx0 + bx1) / 2, 3.2, bz0 - 1.6, C.green);
  camBlock((bx0 + bx1) / 2 - 3.5, 3.05, bz0 - 3.2, (bx0 + bx1) / 2 + 3.5, 3.35, bz0);
  solid.box(0.25, 3.1, 0.25, (bx0 + bx1) / 2 - 3.3, 1.6, bz0 - 3, C.greenDark);
  solid.box(0.25, 3.1, 0.25, (bx0 + bx1) / 2 + 3.3, 1.6, bz0 - 3, C.greenDark);
  collide((bx0 + bx1) / 2 - 3.45, bz0 - 3.15, (bx0 + bx1) / 2 - 3.15, bz0 - 2.85, 3.1);
  collide((bx0 + bx1) / 2 + 3.15, bz0 - 3.15, (bx0 + bx1) / 2 + 3.45, bz0 - 2.85, 3.1);
  signs.add({ text: '尖沙咀碼頭', sub: 'TSIM SHA TSUI FERRY PIER', neon: '#7cff6b', bg: '#0f3a26' }, 9, (bx0 + bx1) / 2, 5.2, bz0 - 0.1, Math.PI);
  collide(bx0, bz0, bx1, bz1, 7.6);
  mapRect('building', bx0, bz0, bx1, bz1);

  // gangway towards the ferry
  solid.block(x1 - 0.5, 54, x1 + 2.2, 57, -0.05, 0.12, '#7d7066');
  solid.block(x1 - 0.5, 54, x1 + 2.2, 54.15, 0.1, 1.1, C.green);
  solid.block(x1 - 0.5, 56.85, x1 + 2.2, 57, 0.1, 1.1, C.green);

  // docked double-ended ferry
  const fx = x1 + 6;
  const fz = 54;
  const L = 20;
  const B = 7;
  solid.block(fx - B / 2, fz - L / 2 + 2.5, fx + B / 2, fz + L / 2 - 2.5, WATER_LEVEL - 0.9, 0.5, '#1f6b45');
  for (const s of [-1, 1]) {
    const g = new THREE.CylinderGeometry(B / 2, B / 2, 2.15, 4, 1);
    g.scale(1, 1, 1.25);
    solid.add(g, '#1f6b45', { x: fx, y: -0.575, z: fz + s * (L / 2 - 2.5) });
  }
  solid.block(fx - B / 2 - 0.05, fz - L / 2 + 2.5, fx + B / 2 + 0.05, fz + L / 2 - 2.5, 0.3, 0.55, '#f4efe6');
  // lower deck cabin
  solid.block(fx - B / 2 + 0.3, fz - L / 2 + 1.5, fx + B / 2 - 0.3, fz + L / 2 - 1.5, 0.5, 2.4, '#f4efe6');
  solid.block(fx - B / 2 + 0.25, fz - L / 2 + 1.7, fx + B / 2 - 0.25, fz + L / 2 - 1.7, 1.2, 2.0, '#2e5f4a');
  solid.block(fx - B / 2 + 0.1, fz - L / 2 + 1.2, fx + B / 2 - 0.1, fz + L / 2 - 1.2, 2.4, 2.65, '#1f6b45');
  // upper deck
  solid.block(fx - B / 2 + 0.6, fz - L / 2 + 2.5, fx + B / 2 - 0.6, fz + L / 2 - 2.5, 2.65, 4.3, '#f4efe6');
  solid.block(fx - B / 2 + 0.55, fz - L / 2 + 2.7, fx + B / 2 - 0.55, fz + L / 2 - 2.7, 3.2, 3.95, '#2e5f4a');
  solid.block(fx - B / 2 + 0.3, fz - L / 2 + 2.2, fx + B / 2 - 0.3, fz + L / 2 - 2.2, 4.3, 4.55, '#1f6b45');
  for (const s of [-1, 1]) solid.block(fx - 1.2, fz + s * (L / 2 - 3.5) - 0.8, fx + 1.2, fz + s * (L / 2 - 3.5) + 0.8, 4.55, 5.6, '#f4efe6');
  solid.add(new THREE.CylinderGeometry(0.08, 0.1, 3.2, 5), '#333', { x: fx, y: 6.1, z: fz });
  glow.add(new THREE.SphereGeometry(0.16, 6, 4), '#ffef9a', { x: fx, y: 7.7, z: fz });
  signs.add({ text: '晨星號', neon: '#ffffff', bg: '#1f6b45' }, 2.6, fx - B / 2 + 0.22, 1.5, fz + 4, -Math.PI / 2);
  signs.add({ text: '渡海小輪', sub: 'HARBOUR FERRY', neon: '#ffd23f', bg: '#1f6b45' }, 3.6, fx - B / 2 + 0.5, 3.5, fz - 2, -Math.PI / 2);
  collide(fx - B / 2 - 0.4, fz - L / 2, fx + B / 2 + 0.4, fz + L / 2, 8);
  mapRect('boat', fx - B / 2, fz - L / 2, fx + B / 2, fz + L / 2);
}

function buildSkyline(far: MeshBuilder, farWin: MeshBuilder, rng: () => number) {
  // Kowloon-side far towers are omitted; this is the island across the water.
  const ridge = (z: number, base: number, amp: number, color: string, seed: number) => {
    const pts: number[] = [];
    const n = 56;
    for (let i = 0; i <= n; i++) {
      const x = -2400 + (4800 * i) / n;
      const h =
        base +
        amp * (0.55 + 0.45 * Math.sin(i * 0.37 + seed)) * (0.6 + 0.4 * Math.sin(i * 0.11 + seed * 2)) +
        (x > -520 && x < 240 ? amp * 0.55 * Math.cos(((x + 140) / 380) * Math.PI * 0.5) : 0);
      pts.push(x, h);
    }
    const pos: number[] = [];
    for (let i = 0; i < pts.length / 2 - 1; i++) {
      const [ax, ah, bx, bh] = [pts[i * 2], pts[i * 2 + 1], pts[i * 2 + 2], pts[i * 2 + 3]];
      pos.push(ax, -5, z, bx, -5, z, bx, bh, z, ax, -5, z, bx, bh, z, ax, ah, z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
    far.add(g, color);
  };
  ridge(1250, 160, 260, '#b48aa0', 1.3);
  ridge(1000, 90, 190, '#9a7393', 4.1);

  const towerColors = ['#5f5182', '#6a5a8c', '#574a78', '#73608f', '#4f4670'];
  const winGeo = new THREE.PlaneGeometry(1, 1);
  for (let x = -1100; x < 1100; ) {
    const w = 16 + rng() * 26;
    const centre = Math.abs(x) < 420;
    let h = (centre ? 60 : 25) + rng() * (centre ? 130 : 70);
    const z = 640 + rng() * 90;
    const color = towerColors[Math.floor(rng() * towerColors.length)];
    if (Math.abs(x + 140) < 20) h = 330;
    if (Math.abs(x - 180) < 20) h = 250;
    far.block(x, z, x + w, z + w * 0.8, -2, h, color);
    if (h > 160) {
      // tapered crowns for the two tallest towers
      far.add(new THREE.ConeGeometry(w * 0.55, h * 0.12, 4), color, { x: x + w / 2, y: h + h * 0.06, z: z + w * 0.4, ry: Math.PI / 4 });
    }
    // lit window flecks on the face looking at the player
    const rows = Math.floor(h / 12);
    for (let r = 1; r < rows; r++) {
      if (rng() < 0.45) continue;
      const wx = x + 1.5 + rng() * (w - 4);
      farWin.add(winGeo, rng() < 0.3 ? '#ffe7a8' : '#ffc777', { x: wx, y: r * 12, z: z - 0.3, ry: Math.PI, sx: 3 + rng() * 5, sy: 2.4 });
    }
    x += w + 3 + rng() * 14;
  }
  // a waterline strip so the island sits on the sea
  far.block(-2000, 620, 2000, 760, -2, 2, '#6e5a7d');
}

interface Car {
  mesh: THREE.Group;
  lane: number;
  speed: number;
  x: number;
  half: { x: number; z: number };
  aabb: AABB;
  h: number;
}

function buildTraffic(rng: () => number) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const cars: Car[] = [];

  const taxi = () => {
    const b = new MeshBuilder();
    const l = new MeshBuilder();
    b.box(4.2, 0.8, 1.8, 0, 0.75, 0, '#d7262e');
    b.box(2.4, 0.75, 1.7, -0.2, 1.5, 0, '#e8e3dc');
    b.box(2.42, 0.45, 1.72, -0.2, 1.52, 0, '#30394d');
    b.box(0.6, 0.25, 0.5, -0.2, 2.0, 0, '#f2d64b');
    for (const [wx, wz] of [[-1.35, -0.85], [1.35, -0.85], [-1.35, 0.85], [1.35, 0.85]]) b.box(0.7, 0.7, 0.3, wx, 0.38, wz, '#1b1b1f');
    l.box(0.05, 0.25, 0.4, 2.1, 0.8, -0.6, '#fff6d0');
    l.box(0.05, 0.25, 0.4, 2.1, 0.8, 0.6, '#fff6d0');
    l.box(0.05, 0.22, 0.35, -2.1, 0.8, -0.6, '#ff3030');
    l.box(0.05, 0.22, 0.35, -2.1, 0.8, 0.6, '#ff3030');
    const g = new THREE.Group();
    const m = b.build(mat);
    m.castShadow = true;
    g.add(m, l.build(lightMat));
    return { g, half: { x: 2.2, z: 1 }, h: 2.1 };
  };
  const bus = () => {
    const b = new MeshBuilder();
    const l = new MeshBuilder();
    b.box(11, 2.1, 2.5, 0, 1.45, 0, '#f2e6c8');
    b.box(11, 2.0, 2.5, 0, 3.5, 0, '#e65c3c');
    b.box(11.02, 0.8, 2.52, 0, 1.9, 0, '#2f3a4f');
    b.box(11.02, 0.8, 2.52, 0, 3.7, 0, '#2f3a4f');
    b.box(11, 0.2, 2.4, 0, 4.55, 0, '#f2e6c8');
    for (const wx of [-3.8, 3.6]) for (const wz of [-1.15, 1.15]) b.box(1, 1, 0.3, wx, 0.5, wz, '#1b1b1f');
    l.box(0.05, 0.3, 0.5, 5.5, 0.9, -0.8, '#fff6d0');
    l.box(0.05, 0.3, 0.5, 5.5, 0.9, 0.8, '#fff6d0');
    const g = new THREE.Group();
    const m = b.build(mat);
    m.castShadow = true;
    g.add(m, l.build(lightMat));
    return { g, half: { x: 5.5, z: 1.3 }, h: 4.6 };
  };

  const specs = [
    { make: taxi, lane: 1, x: -60 },
    { make: taxi, lane: 1, x: 40 },
    { make: bus, lane: -1, x: 10 },
    { make: taxi, lane: -1, x: -80 },
    { make: taxi, lane: -1, x: 90 },
  ];
  for (const s of specs) {
    const { g, half, h } = s.make();
    group.add(g);
    const aabb: AABB = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, h };
    cars.push({ mesh: g, lane: s.lane, speed: 7 + rng() * 4, x: s.x, half, aabb, h });
  }

  let last = 0;
  const update = (t: number) => {
    const dt = Math.min(0.05, t - last);
    last = t;
    for (const c of cars) {
      c.x += c.lane * c.speed * dt;
      if (c.x > 170) c.x = -170;
      if (c.x < -170) c.x = 170;
      const z = c.lane > 0 ? -2.5 : 2.5;
      c.mesh.position.set(c.x, 0.04, z);
      c.mesh.rotation.y = c.lane > 0 ? 0 : Math.PI;
      c.aabb.minX = c.x - c.half.x;
      c.aabb.maxX = c.x + c.half.x;
      c.aabb.minZ = z - c.half.z;
      c.aabb.maxZ = z + c.half.z;
    }
  };
  update(0);
  return { group, colliders: cars.map((c) => c.aabb), update };
}
