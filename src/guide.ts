import * as THREE from 'three';
import { BOUNDS, PIER, SHORE_Z, type AABB } from './world';

const CELL = 4;
const PAD = 0.55;
const MAX_SEG = 220;
const STEP = 0.8;

type P = { x: number; z: number };

/** Segment vs box test in the ground plane (box grown by PAD). */
function segHitsBox(a: P, b: P, c: AABB) {
  const minX = c.minX - PAD;
  const maxX = c.maxX + PAD;
  const minZ = c.minZ - PAD;
  const maxZ = c.maxZ + PAD;
  if (Math.max(a.x, b.x) < minX || Math.min(a.x, b.x) > maxX || Math.max(a.z, b.z) < minZ || Math.min(a.z, b.z) > maxZ) return false;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  let t0 = 0;
  let t1 = 1;
  for (const [p, d, lo, hi] of [[a.x, dx, minX, maxX], [a.z, dz, minZ, maxZ]]) {
    if (Math.abs(d) < 1e-9) {
      if (p < lo || p > hi) return false;
    } else {
      let ta = (lo - p) / d;
      let tb = (hi - p) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) return false;
    }
  }
  return true;
}

/**
 * Coarse walkable grid + A* + string pulling. Cheap enough to re-run a few
 * times per second on a phone because the grid is only ~1k nodes.
 */
export class Navigator {
  private nodes: P[] = [];
  private index = new Map<string, number>();
  private links: number[][] = [];
  private boxes: AABB[];

  constructor(colliders: AABB[]) {
    this.boxes = colliders;
    for (let x = BOUNDS.minX + 1; x <= BOUNDS.maxX - 1; x += CELL) {
      for (let z = BOUNDS.minZ + 1; z <= BOUNDS.maxZ - 1; z += CELL) {
        if (z > SHORE_Z - 0.5 && (x < PIER.x0 + 1 || x > PIER.x1 - 1 || z > PIER.z1 - 1)) continue;
        if (this.blocked({ x, z })) continue;
        this.index.set(`${x},${z}`, this.nodes.length);
        this.nodes.push({ x, z });
      }
    }
    for (const n of this.nodes) {
      const out: number[] = [];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const j = this.index.get(`${n.x + dx * CELL},${n.z + dz * CELL}`);
        if (j !== undefined && this.clear(n, this.nodes[j])) out.push(j);
      }
      this.links.push(out);
    }
  }

  blocked(p: P) {
    for (const c of this.boxes) {
      if (p.x > c.minX - PAD && p.x < c.maxX + PAD && p.z > c.minZ - PAD && p.z < c.maxZ + PAD) return true;
    }
    return false;
  }

  clear(a: P, b: P) {
    for (const c of this.boxes) if (segHitsBox(a, b, c)) return false;
    return true;
  }

  private nearest(p: P) {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const d = (n.x - p.x) ** 2 + (n.z - p.z) ** 2;
      if (d < bd && d < 100 && this.clear(p, n)) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  path(from: P, to: P): P[] {
    if (this.clear(from, to)) return [from, to];
    const s = this.nearest(from);
    const g = this.nearest(to);
    if (s < 0 || g < 0) return [from, to];
    const N = this.nodes.length;
    const cost = new Float32Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const open: number[] = [s];
    cost[s] = 0;
    const h = (i: number) => Math.hypot(this.nodes[i].x - this.nodes[g].x, this.nodes[i].z - this.nodes[g].z);
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (cost[open[i]] + h(open[i]) < cost[open[bi]] + h(open[bi])) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (cur === g) break;
      closed[cur] = 1;
      for (const j of this.links[cur]) {
        if (closed[j]) continue;
        const nc = cost[cur] + Math.hypot(this.nodes[j].x - this.nodes[cur].x, this.nodes[j].z - this.nodes[cur].z);
        if (nc < cost[j]) {
          if (cost[j] === Infinity) open.push(j);
          cost[j] = nc;
          prev[j] = cur;
        }
      }
    }
    if (prev[g] < 0 && g !== s) return [from, to];
    const raw: P[] = [to];
    for (let i = g; i >= 0; i = prev[i]) raw.push(this.nodes[i]);
    raw.push(from);
    raw.reverse();
    // string pulling
    const out: P[] = [raw[0]];
    let i = 0;
    while (i < raw.length - 1) {
      let j = raw.length - 1;
      while (j > i + 1 && !this.clear(raw[i], raw[j])) j--;
      out.push(raw[j]);
      i = j;
    }
    return out;
  }
}

/** Animated gold ribbon laid on the ground along a path. */
export class GuideLine {
  readonly mesh: THREE.Mesh;
  readonly uniforms = { time: { value: 0 }, pulse: { value: 0 }, opacity: { value: 1 } };
  private pos = new Float32Array(MAX_SEG * 2 * 3);
  private dist = new Float32Array(MAX_SEG * 2);
  private geo = new THREE.BufferGeometry();

  constructor() {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('dist', new THREE.BufferAttribute(this.dist, 1).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < MAX_SEG - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo.setIndex(idx);
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute float dist;
        varying float vDist;
        void main() { vDist = dist; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform float time, pulse, opacity;
        varying float vDist;
        void main() {
          float chevron = smoothstep(0.15, 0.5, fract(vDist * 0.45 - time * 1.2));
          float fadeIn = smoothstep(0.0, 2.5, vDist);
          float a = (0.35 + 0.5 * chevron) * fadeIn * opacity * (1.0 + pulse * 0.8);
          gl_FragColor = vec4(vec3(1.0, 0.78, 0.26) * a, a);
        }
      `,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  set(path: P[], startOffset = 1.1, endTrim = 1.6) {
    const pts: P[] = [];
    let total = 0;
    const lens: number[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const l = Math.hypot(path[i + 1].x - path[i].x, path[i + 1].z - path[i].z);
      lens.push(l);
      total += l;
    }
    const end = Math.max(startOffset, total - endTrim);
    const ds: number[] = [];
    for (let d = startOffset; d <= end && pts.length < MAX_SEG; d += STEP) {
      let rem = d;
      let k = 0;
      while (k < lens.length - 1 && rem > lens[k]) rem -= lens[k++];
      const a = path[k];
      const b = path[k + 1] ?? a;
      const f = lens[k] ? Math.min(1, rem / lens[k]) : 0;
      pts.push({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f });
      ds.push(d);
    }
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(n - 1, i + 1)];
      let tx = b.x - a.x;
      let tz = b.z - a.z;
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl;
      tz /= tl;
      const w = 0.28;
      const y = 0.17;
      this.pos.set([pts[i].x - tz * w, y, pts[i].z + tx * w, pts[i].x + tz * w, y, pts[i].z - tx * w], i * 6);
      this.dist[i * 2] = this.dist[i * 2 + 1] = ds[i] - startOffset;
    }
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('dist') as THREE.BufferAttribute).needsUpdate = true;
    this.geo.setDrawRange(0, Math.max(0, n - 1) * 6);
    return n;
  }

  get segments() {
    return (this.geo.drawRange.count === Infinity ? 0 : this.geo.drawRange.count) / 6;
  }
}

/** Gold particle burst for unlock rewards. */
export class Burst {
  readonly points: THREE.Points;
  private vel: Float32Array;
  private pos: Float32Array;
  private life = 0;
  private count: number;
  private live = 0;
  private mat: THREE.PointsMaterial;

  constructor(count = 140) {
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d')!;
    const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,235,1)');
    grad.addColorStop(0.18, 'rgba(255,220,100,0.95)');
    grad.addColorStop(0.45, 'rgba(255,190,40,0.25)');
    grad.addColorStop(1, 'rgba(255,170,0,0)');
    x.fillStyle = grad;
    x.fillRect(0, 0, 64, 64);
    this.mat = new THREE.PointsMaterial({
      size: 0.34,
      map: new THREE.CanvasTexture(c),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: '#ffd460',
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  fire(x: number, y: number, z: number, count = this.count) {
    for (let i = 0; i < this.count; i++) {
      const on = i < count;
      const a = Math.random() * Math.PI * 2;
      const up = 3 + Math.random() * 7;
      const out = 1.5 + Math.random() * 4;
      this.pos.set(on ? [x, y, z] : [0, -999, 0], i * 3);
      this.vel.set([Math.cos(a) * out, up, Math.sin(a) * out], i * 3);
    }
    this.live = Math.min(count, this.count);
    this.life = 1.8;
    this.points.visible = true;
  }

  get active() {
    return this.life > 0;
  }

  update(dt: number) {
    if (this.life <= 0) return;
    this.life -= dt;
    for (let i = 0; i < this.live; i++) {
      this.vel[i * 3 + 1] -= 9 * dt;
      this.vel[i * 3] *= 0.985;
      this.vel[i * 3 + 2] *= 0.985;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] = Math.max(0.15, this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt);
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    this.mat.opacity = Math.min(1, this.life / 0.8);
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    if (this.life <= 0) this.points.visible = false;
  }
}
