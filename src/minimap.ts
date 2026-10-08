import type { Checkpoint, MapShape } from './world';
import { SHORE_Z } from './world';

const STYLE: Record<MapShape['kind'], string> = {
  land: '#2a3b52',
  road: '#4b5568',
  walk: '#6d6a72',
  plaza: '#8a6c5a',
  building: '#7f8fa8',
  pier: '#8b8278',
  green: '#3f7d4d',
  landmark: '#d26a4a',
  boat: '#2d8a5a',
};

const ORIGIN = { x: -200, z: -200 };
const PPU = 3;

export class Minimap {
  private ctx: CanvasRenderingContext2D;
  private base: HTMLCanvasElement;
  private compass: HTMLElement;
  private size: number;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, shapes: MapShape[]) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.size = canvas.width;
    this.compass = document.getElementById('compass')!;
    this.base = document.createElement('canvas');
    this.base.width = 400 * PPU;
    this.base.height = 300 * PPU;
    const g = this.base.getContext('2d')!;
    g.fillStyle = '#1b5d86';
    g.fillRect(0, 0, this.base.width, this.base.height);
    const order: MapShape['kind'][] = ['land', 'walk', 'road', 'plaza', 'pier', 'green', 'building', 'landmark', 'boat'];
    for (const kind of order) {
      g.fillStyle = STYLE[kind];
      for (const s of shapes) {
        if (s.kind !== kind) continue;
        const x = (s.x0 - ORIGIN.x) * PPU;
        const y = (s.z0 - ORIGIN.z) * PPU;
        const w = (s.x1 - s.x0) * PPU;
        const h = (s.z1 - s.z0) * PPU;
        if (s.round) {
          g.beginPath();
          g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
          g.fill();
        } else {
          g.fillRect(x, y, w, h);
          if (kind === 'building') {
            g.strokeStyle = '#5b6a82';
            g.lineWidth = 2;
            g.strokeRect(x + 1, y + 1, w - 2, h - 2);
          }
        }
      }
    }
    g.strokeStyle = '#d9c9a8';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, (SHORE_Z - ORIGIN.z) * PPU);
    g.lineTo(this.base.width, (SHORE_Z - ORIGIN.z) * PPU);
    g.stroke();
  }

  draw(px: number, pz: number, heading: number, camYaw: number, checkpoints: Checkpoint[], found: Set<string>, nextId: string | null, t: number) {
    const ctx = this.ctx;
    const S = this.size;
    const zoom = 2.2;
    const scale = zoom / PPU;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#1b5d86';
    ctx.fillRect(0, 0, S, S);
    ctx.translate(S / 2, S / 2);
    ctx.rotate(camYaw);
    ctx.scale(scale, scale);
    ctx.translate(-(px - ORIGIN.x) * PPU, -(pz - ORIGIN.z) * PPU);
    ctx.drawImage(this.base, 0, 0);
    ctx.restore();

    // world -> minimap screen
    const toScreen = (x: number, z: number) => {
      const dx = (x - px) * zoom;
      const dz = (z - pz) * zoom;
      const c = Math.cos(camYaw);
      const s = Math.sin(camYaw);
      return { x: S / 2 + dx * c - dz * s, y: S / 2 + dx * s + dz * c };
    };

    const R = S / 2 - 26;
    for (const cp of checkpoints) {
      let p = toScreen(cp.x, cp.z);
      const dx = p.x - S / 2;
      const dy = p.y - S / 2;
      const d = Math.hypot(dx, dy);
      if (d > R) p = { x: S / 2 + (dx / d) * R, y: S / 2 + (dy / d) * R };
      const done = found.has(cp.id);
      const isNext = cp.id === nextId;
      const pulse = isNext ? 1 + Math.sin(t * 5) * 0.15 : 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 20 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = done ? '#3fbf6a' : '#f5c542';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#0b1f3a';
      ctx.stroke();
      ctx.fillStyle = '#0b1f3a';
      ctx.font = '900 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(done ? '✓' : '◆', p.x, p.y + 1);
    }

    // player arrow
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.rotate(camYaw - heading + Math.PI);
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.lineTo(15, 16);
    ctx.lineTo(0, 8);
    ctx.lineTo(-15, 16);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#0b1f3a';
    ctx.stroke();
    ctx.restore();

    // north indicator on the ring
    const wrap = this.canvas.getBoundingClientRect().width;
    const r = wrap / 2 - 4;
    this.compass.style.left = `${wrap / 2 + Math.sin(camYaw) * r}px`;
    this.compass.style.top = `${wrap / 2 - Math.cos(camYaw) * r}px`;
  }
}
