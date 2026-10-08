export class Input {
  /** x: right, y: forward, both in [-1, 1]. */
  move = { x: 0, y: 0 };
  runHeld = false;
  runToggle = false;
  jumpQueued = false;
  boostQueued = false;
  orbitDX = 0;
  orbitDY = 0;
  lastOrbitAt = -10;
  enabled = false;
  isTouch = false;

  private keys = new Set<string>();
  private joy = { id: -1, cx: 0, cy: 0, x: 0, y: 0 };
  private orbitPointer = -1;
  private lastPX = 0;
  private lastPY = 0;
  private knob: HTMLElement;
  private runBtn: HTMLElement;

  constructor(canvas: HTMLCanvasElement) {
    this.knob = document.getElementById('joy-knob')!;
    this.runBtn = document.getElementById('run-btn')!;
    const coarse = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.setTouch(coarse);
    window.addEventListener('touchstart', () => this.setTouch(true), { passive: true, once: true });

    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      const k = e.code;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(k)) e.preventDefault();
      if (k === 'Space' && !e.repeat) this.jumpQueued = true;
      if (k === 'KeyE' && !e.repeat) this.boostQueued = true;
      this.keys.add(k);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    // Camera orbit: drag anywhere on the 3D view.
    canvas.addEventListener('pointerdown', (e) => {
      if (this.orbitPointer !== -1) return;
      this.orbitPointer = e.pointerId;
      this.lastPX = e.clientX;
      this.lastPY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.orbitPointer) return;
      this.orbitDX += e.clientX - this.lastPX;
      this.orbitDY += e.clientY - this.lastPY;
      this.lastPX = e.clientX;
      this.lastPY = e.clientY;
      this.lastOrbitAt = performance.now() / 1000;
    });
    const endOrbit = (e: PointerEvent) => {
      if (e.pointerId === this.orbitPointer) this.orbitPointer = -1;
    };
    canvas.addEventListener('pointerup', endOrbit);
    canvas.addEventListener('pointercancel', endOrbit);

    // Virtual joystick
    const zone = document.getElementById('joystick')!;
    const base = zone.querySelector('.joy-base') as HTMLElement;
    zone.addEventListener('pointerdown', (e) => {
      if (this.joy.id !== -1) return;
      const r = base.getBoundingClientRect();
      this.joy = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2, x: 0, y: 0 };
      zone.setPointerCapture(e.pointerId);
      this.updateJoy(e.clientX, e.clientY, r.width / 2);
      e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.joy.id) return;
      this.updateJoy(e.clientX, e.clientY, base.getBoundingClientRect().width / 2);
    });
    const endJoy = (e: PointerEvent) => {
      if (e.pointerId !== this.joy.id) return;
      this.joy.id = -1;
      this.joy.x = this.joy.y = 0;
      this.knob.style.transform = '';
    };
    zone.addEventListener('pointerup', endJoy);
    zone.addEventListener('pointercancel', endJoy);

    this.runBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.runToggle = !this.runToggle;
      this.runBtn.classList.toggle('active', this.runToggle);
    });
    const jumpBtn = document.getElementById('jump-btn')!;
    jumpBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.enabled) this.jumpQueued = true;
      jumpBtn.classList.add('active');
    });
    const up = () => jumpBtn.classList.remove('active');
    jumpBtn.addEventListener('pointerup', up);
    jumpBtn.addEventListener('pointercancel', up);
    jumpBtn.addEventListener('pointerleave', up);
  }

  setTouch(v: boolean) {
    this.isTouch = v;
    document.body.classList.toggle('touch', v);
  }

  private updateJoy(px: number, py: number, radius: number) {
    let dx = (px - this.joy.cx) / radius;
    let dy = (py - this.joy.cy) / radius;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    this.joy.x = dx;
    this.joy.y = -dy;
    this.knob.style.transform = `translate(${dx * radius * 0.6}px, ${dy * radius * 0.6}px)`;
  }

  /** Call once per frame before reading state. */
  poll() {
    let x = 0;
    let y = 0;
    if (this.enabled) {
      const k = this.keys;
      if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
      const len = Math.hypot(x, y);
      if (len > 1) {
        x /= len;
        y /= len;
      }
      if (this.joy.id !== -1) {
        const dead = 0.12;
        const m = Math.hypot(this.joy.x, this.joy.y);
        if (m > dead) {
          const k2 = (m - dead) / (1 - dead) / m;
          x = this.joy.x * k2;
          y = this.joy.y * k2;
        }
      }
    }
    this.move.x = x;
    this.move.y = y;
    this.runHeld = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  get running() {
    return this.runHeld || this.runToggle;
  }

  consumeOrbit() {
    const d = { x: this.orbitDX, y: this.orbitDY };
    this.orbitDX = this.orbitDY = 0;
    return d;
  }

  consumeJump() {
    const j = this.jumpQueued;
    this.jumpQueued = false;
    return j;
  }

  consumeBoost() {
    const b = this.boostQueued;
    this.boostQueued = false;
    return b;
  }

  reset() {
    this.keys.clear();
    this.joy.id = -1;
    this.joy.x = this.joy.y = 0;
    this.knob.style.transform = '';
    this.jumpQueued = false;
    this.boostQueued = false;
  }
}
