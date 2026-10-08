import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const tmpColor = new THREE.Color();
const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();

export interface Placement {
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
}

/**
 * Accumulates many small geometries with baked vertex colours and merges them
 * into a single mesh, so a whole district renders in one draw call.
 */
export class MeshBuilder {
  private parts: THREE.BufferGeometry[] = [];
  readonly keepUv: boolean;

  constructor(keepUv = false) {
    this.keepUv = keepUv;
  }

  get count() {
    return this.parts.length;
  }

  add(geom: THREE.BufferGeometry, color: THREE.ColorRepresentation, p: Placement = {}) {
    let g = geom.index ? geom.toNonIndexed() : geom.clone();
    if (!this.keepUv) g.deleteAttribute('uv');
    else if (!g.getAttribute('uv')) {
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    }
    const n = g.getAttribute('position').count;
    tmpColor.set(color);
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    tmpEuler.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0);
    tmpQuat.setFromEuler(tmpEuler);
    tmpMatrix.compose(
      new THREE.Vector3(p.x ?? 0, p.y ?? 0, p.z ?? 0),
      tmpQuat,
      new THREE.Vector3(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1),
    );
    g.applyMatrix4(tmpMatrix);
    for (const name of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'color', 'uv'].includes(name)) g.deleteAttribute(name);
    }
    g.clearGroups();
    this.parts.push(g);
    return this;
  }

  /** Box positioned by its centre. */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, ry = 0) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, { x, y, z, ry });
  }

  /** Box resting on the ground plane at y (bottom face at y). */
  block(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, color: THREE.ColorRepresentation) {
    return this.box(x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, color);
  }

  build(material: THREE.Material, name = 'merged') {
    if (!this.parts.length) return new THREE.Mesh(new THREE.BufferGeometry(), material);
    const merged = mergeGeometries(this.parts, false)!;
    merged.computeBoundingSphere();
    for (const p of this.parts) p.dispose();
    this.parts = [];
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = name;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }
}

/** Deterministic PRNG so the city looks identical on every load. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const FONT_STACK =
  "'Noto Sans TC','PingFang HK','PingFang TC','Microsoft JhengHei','Heiti TC','WenQuanYi Micro Hei','Droid Sans Fallback',sans-serif";
