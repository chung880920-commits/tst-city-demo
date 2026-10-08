import * as THREE from 'three';
import { FONT_STACK, MeshBuilder } from './builder';

export interface SignSpec {
  text: string;
  sub?: string;
  vertical?: boolean;
  neon: string;
  bg?: string;
}

interface Slot {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  aspect: number;
}

const SIZE = 2048;
const SPLIT = 1180;

/**
 * Packs every neon / shop sign into one canvas texture so all signs share a
 * single material and merge into one draw call.
 */
export class SignAtlas {
  readonly canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  /** Horizontal signs pack from the top, vertical signs from SPLIT down. */
  private shelves = {
    h: { x: 0, y: 0, rowH: 0, limit: SPLIT },
    v: { x: 0, y: SPLIT, rowH: 0, limit: SIZE },
  };
  private cache = new Map<string, Slot>();
  private builder = new MeshBuilder(true);

  constructor() {
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    this.ctx = this.canvas.getContext('2d')!;
  }

  private alloc(w: number, h: number, vertical: boolean) {
    const s = vertical ? this.shelves.v : this.shelves.h;
    if (s.x + w > SIZE) {
      s.x = 0;
      s.y += s.rowH + 4;
      s.rowH = 0;
    }
    if (s.y + h > s.limit) return null;
    const pos = { x: s.x, y: s.y };
    s.x += w + 4;
    s.rowH = Math.max(s.rowH, h);
    return pos;
  }

  private draw(spec: SignSpec): Slot | null {
    const key = JSON.stringify(spec);
    const cached = this.cache.get(key);
    if (cached) return cached;
    const ctx = this.ctx;
    const chars = [...spec.text];
    const cell = 80;
    const pad = 16;
    const w = spec.vertical ? cell + pad * 2 : chars.length * cell + pad * 2;
    const h = spec.vertical ? chars.length * cell + pad * 2 : cell + pad * 2 + (spec.sub ? 38 : 0);
    const pos = this.alloc(w, h, !!spec.vertical);
    if (!pos) return null;
    const { x, y } = pos;

    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = spec.bg ?? '#10101c';
    roundRect(ctx, 0, 0, w, h, 14);
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.strokeStyle = spec.neon;
    ctx.shadowColor = spec.neon;
    ctx.shadowBlur = 14;
    roundRect(ctx, 7, 7, w - 14, h - 14, 10);
    ctx.stroke();

    ctx.font = `900 ${cell * 0.82}px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 18;
    chars.forEach((c, i) => {
      const cx = spec.vertical ? w / 2 : pad + cell * i + cell / 2;
      const cy = spec.vertical ? pad + cell * i + cell / 2 : pad + cell / 2 + 4;
      ctx.fillStyle = spec.neon;
      ctx.fillText(c, cx, cy);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(c, cx, cy);
      ctx.shadowBlur = 18;
    });
    if (spec.sub && !spec.vertical) {
      ctx.font = `800 28px ${FONT_STACK}`;
      ctx.fillStyle = spec.neon;
      ctx.shadowBlur = 8;
      ctx.fillText(spec.sub, w / 2, h - pad - 16, w - pad * 2);
    }
    ctx.restore();

    const slot = {
      u0: x / SIZE,
      u1: (x + w) / SIZE,
      v0: 1 - (y + h) / SIZE,
      v1: 1 - y / SIZE,
      aspect: w / h,
    };
    this.cache.set(key, slot);
    return slot;
  }

  /**
   * Adds a double-sided sign. `size` is the long edge in metres; `ry` rotates
   * the sign's face normal (0 = facing +Z).
   */
  add(spec: SignSpec, size: number, x: number, y: number, z: number, ry: number) {
    const slot = this.draw(spec);
    if (!slot) return null;
    const w = slot.aspect >= 1 ? size : size * slot.aspect;
    const h = slot.aspect >= 1 ? size / slot.aspect : size;
    for (const side of [0, Math.PI]) {
      const g = new THREE.PlaneGeometry(w, h);
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, slot.u0 + uv.getX(i) * (slot.u1 - slot.u0), slot.v0 + uv.getY(i) * (slot.v1 - slot.v0));
      }
      const off = side === 0 ? 0.03 : -0.03;
      this.builder.add(g, '#ffffff', {
        x: x + Math.sin(ry) * off,
        y,
        z: z + Math.cos(ry) * off,
        ry: ry + side,
      });
    }
    return { w, h };
  }

  build() {
    const tex = new THREE.CanvasTexture(this.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    const mat = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, fog: true });
    return this.builder.build(mat, 'signs');
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
