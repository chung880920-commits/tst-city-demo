import * as THREE from 'three';

/**
 * Cinematic effects used by the promo record mode: the hero-landing ground crack, raised paving,
 * flying debris, dust ring, and expanding shockwave rings. Built lazily on first use; every effect is
 * a closed-form function of its age, so it looks the same at any frame rate.
 */
export class CinematicFx {
  readonly group = new THREE.Group();
  private crack: THREE.Mesh | null = null;
  private crackMat: THREE.ShaderMaterial | null = null;
  private crackAge = -1;
  private chunks: { mesh: THREE.Mesh; rx: number; rz: number; lift: number; delay: number }[] = [];
  private debris: THREE.InstancedMesh | null = null;
  private debrisData: { x: number; z: number; vx: number; vy: number; vz: number; spin: THREE.Vector3; s: number }[] = [];
  private debrisAge = -1;
  private origin = new THREE.Vector3();
  private dust: THREE.Points | null = null;
  private dustData: { a: number; v: number; up: number }[] = [];
  private dustAge = -1;
  private rings: { mesh: THREE.Mesh; age: number; life: number; r0: number; r1: number; op: number }[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();

  private rand: () => number;

  constructor(rand: () => number = Math.random) {
    this.rand = rand;
    this.group.name = 'cinematic-fx';
  }

  /** Superhero landing at (x, z) on ground height y. */
  impact(x: number, y: number, z: number) {
    this.origin.set(x, y, z);
    this.makeCrack(x, y, z);
    this.makeChunks(x, y, z);
    this.makeDebris();
    this.makeDust();
    this.ring(x, y + 0.06, z, '#fff3cf', 0.55, 0.3, 9, 0.9, true);
    this.ring(x, y + 0.08, z, '#ffd36a', 0.8, 0.2, 6, 0.7, true);
  }

  /** Flat expanding ring (ground shockwave, or the armour-lock energy wave at chest height). */
  ring(x: number, y: number, z: number, color: string, life: number, r0: number, r1: number, op = 0.85, ground = false) {
    const geo = new THREE.RingGeometry(0.82, 1, 64, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.renderOrder = ground ? 4 : 6;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.rings.push({ mesh, age: 0, life, r0, r1, op });
  }

  private makeCrack(x: number, y: number, z: number) {
    const S = 1024;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d')!;
    const C = S / 2;
    // crater: dark scorched centre with a lighter crushed rim
    const crater = g.createRadialGradient(C, C, 0, C, C, S * 0.16);
    crater.addColorStop(0, 'rgba(25,20,18,0.9)');
    crater.addColorStop(0.55, 'rgba(45,38,34,0.75)');
    crater.addColorStop(0.8, 'rgba(120,110,100,0.35)');
    crater.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = crater;
    g.beginPath();
    g.arc(C, C, S * 0.16, 0, Math.PI * 2);
    g.fill();
    const R = this.rand;
    const branch = (x0: number, y0: number, a: number, len: number, w: number, depth: number) => {
      let px = x0, py = y0;
      const steps = Math.ceil(len / 14);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      const pts: [number, number][] = [[px, py]];
      for (let i = 0; i < steps; i++) {
        a += (R() - 0.5) * 0.5;
        px += Math.cos(a) * 14;
        py += Math.sin(a) * 14;
        pts.push([px, py]);
        if (depth < 2 && R() < 0.07) branch(px, py, a + (R() < 0.5 ? -1 : 1) * (0.5 + R() * 0.5), len * (0.3 + R() * 0.25), w * 0.6, depth + 1);
      }
      for (const [col, lw] of [['rgba(255,240,215,0.35)', w + 5], ['rgba(18,14,12,0.95)', w]] as const) {
        g.strokeStyle = col;
        g.beginPath();
        pts.forEach(([qx, qy], i) => {
          const taper = 1 - i / pts.length;
          g.lineWidth = Math.max(1.2, lw * (0.35 + taper * 0.65));
          if (i === 0) g.moveTo(qx, qy);
          else {
            g.lineTo(qx, qy);
            g.stroke();
            g.beginPath();
            g.moveTo(qx, qy);
          }
        });
      }
    };
    const n = 13;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + R() * 0.3;
      branch(C + Math.cos(a) * S * 0.07, C + Math.sin(a) * S * 0.07, a, S * (0.3 + R() * 0.16), 11, 0);
    }
    // a broken ring of stress cracks around the crater
    g.strokeStyle = 'rgba(18,14,12,0.85)';
    g.lineWidth = 5;
    for (let i = 0; i < 9; i++) {
      const a0 = R() * Math.PI * 2;
      g.beginPath();
      g.arc(C, C, S * (0.17 + R() * 0.05), a0, a0 + 0.3 + R() * 0.4);
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.crackMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      uniforms: { map: { value: tex }, reveal: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; uniform float reveal; varying vec2 vUv;
        void main(){
          vec4 c = texture2D(map, vUv);
          float d = length(vUv - 0.5) * 2.0;
          float m = 1.0 - smoothstep(reveal - 0.06, reveal, d);
          gl_FragColor = vec4(c.rgb, c.a * m);
          #include <colorspace_fragment>
        }`,
    });
    const geo = new THREE.PlaneGeometry(8, 8);
    geo.rotateX(-Math.PI / 2);
    this.crack = new THREE.Mesh(geo, this.crackMat);
    this.crack.position.set(x, y + 0.025, z);
    this.crack.rotation.y = R() * Math.PI;
    this.crack.renderOrder = 2;
    this.group.add(this.crack);
    this.crackAge = 0;
  }

  private makeChunks(x: number, y: number, z: number) {
    const mat = new THREE.MeshLambertMaterial({ color: '#b9ad9c', flatShading: true });
    const dark = new THREE.MeshLambertMaterial({ color: '#8d8274', flatShading: true });
    const R = this.rand;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + R() * 0.35;
      const r = 0.6 + R() * 0.95;
      const w = 0.24 + R() * 0.2;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.11 + R() * 0.06, w * (0.7 + R() * 0.5)), i % 3 ? mat : dark);
      mesh.position.set(x + Math.cos(a) * r, y, z + Math.sin(a) * r);
      mesh.rotation.y = -a;
      mesh.castShadow = true;
      this.group.add(mesh);
      // tilt outward, like slabs pushed up by the blast
      this.chunks.push({ mesh, rx: (0.25 + R() * 0.45) * (R() < 0.5 ? 1 : -1), rz: 0.35 + R() * 0.55, lift: 0.04 + R() * 0.12, delay: r * 0.03 });
    }
  }

  private makeDebris() {
    const n = 46;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: '#a89c8b', flatShading: true });
    this.debris = new THREE.InstancedMesh(geo, mat, n);
    this.debris.frustumCulled = false;
    this.debris.castShadow = true;
    const R = this.rand;
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2;
      const out = 2 + R() * 5;
      this.debrisData.push({ x: Math.cos(a) * 0.5, z: Math.sin(a) * 0.5, vx: Math.cos(a) * out, vy: 3.5 + R() * 6.5, vz: Math.sin(a) * out, spin: new THREE.Vector3(R() * 14 - 7, R() * 14 - 7, R() * 14 - 7), s: 0.05 + R() * 0.14 });
    }
    this.group.add(this.debris);
    this.debrisAge = 0;
  }

  private makeDust() {
    const n = 150;
    const pos = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d')!;
    const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(235,222,200,0.9)');
    grad.addColorStop(0.5, 'rgba(205,190,168,0.45)');
    grad.addColorStop(1, 'rgba(190,175,150,0)');
    x.fillStyle = grad;
    x.fillRect(0, 0, 64, 64);
    const mat = new THREE.PointsMaterial({ size: 1.5, map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, color: '#e9dcc5' });
    this.dust = new THREE.Points(geo, mat);
    this.dust.frustumCulled = false;
    const R = this.rand;
    for (let i = 0; i < n; i++) this.dustData.push({ a: (i / n) * Math.PI * 2 + R() * 0.1, v: 3 + R() * 3.2, up: 0.05 + R() * 0.55 });
    this.group.add(this.dust);
    this.dustAge = 0;
  }

  update(dt: number) {
    if (this.crackAge >= 0 && this.crackMat) {
      this.crackAge += dt;
      // fast spread out from the impact, then holds
      const k = Math.min(1, this.crackAge / 0.35);
      this.crackMat.uniforms.reveal.value = 0.2 + 0.85 * (1 - Math.pow(1 - k, 3));
    }
    for (const c of this.chunks) {
      const k = THREE.MathUtils.clamp((this.crackAge - c.delay) / 0.16, 0, 1);
      const pop = k < 1 ? Math.sin(k * Math.PI * 0.5) * 1.25 : 1;
      c.mesh.position.y = this.origin.y + 0.03 + c.lift * Math.min(pop, 1.2);
      c.mesh.rotation.x = c.rx * Math.min(pop, 1.1);
      c.mesh.rotation.z = c.rz * Math.min(pop, 1.1);
    }
    if (this.debris && this.debrisAge >= 0) {
      this.debrisAge += dt;
      const t = this.debrisAge;
      const drag = 1.1;
      const spread = (1 - Math.exp(-drag * t)) / drag;
      this.debrisData.forEach((d, i) => {
        // ballistic until it lands, then rests
        const tLand = (d.vy + Math.sqrt(d.vy * d.vy + 2 * 9.8 * 0.1)) / 9.8;
        const tt = Math.min(t, tLand);
        const y = Math.max(0.05, 0.1 + d.vy * tt - 4.9 * tt * tt);
        const sp = (1 - Math.exp(-drag * tt)) / drag;
        this.p.set(this.origin.x + d.x + d.vx * (t < tLand ? spread : sp), this.origin.y + y, this.origin.z + d.z + d.vz * (t < tLand ? spread : sp));
        this.e.set(d.spin.x * tt, d.spin.y * tt, d.spin.z * tt);
        this.q.setFromEuler(this.e);
        this.s.setScalar(d.s * (t > 6 ? Math.max(0.001, 1 - (t - 6)) : 1));
        this.m.compose(this.p, this.q, this.s);
        this.debris!.setMatrixAt(i, this.m);
      });
      this.debris.instanceMatrix.needsUpdate = true;
    }
    if (this.dust && this.dustAge >= 0) {
      this.dustAge += dt;
      const t = this.dustAge;
      const P = (this.dust.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
      const drag = 2.2;
      this.dustData.forEach((d, i) => {
        const r = 0.6 + (d.v * (1 - Math.exp(-drag * t))) / drag;
        P[i * 3] = this.origin.x + Math.cos(d.a) * r;
        P[i * 3 + 1] = this.origin.y + 0.12 + d.up * (1 - Math.exp(-1.5 * t));
        P[i * 3 + 2] = this.origin.z + Math.sin(d.a) * r;
      });
      (this.dust.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      const mat = this.dust.material as THREE.PointsMaterial;
      mat.opacity = 0.6 * Math.max(0, 1 - t / 2.0);
      mat.size = 0.8 + t * 0.7;
      this.dust.visible = mat.opacity > 0.01;
    }
    for (const r of this.rings) {
      r.age += dt;
      const k = Math.min(1, r.age / r.life);
      const e = 1 - Math.pow(1 - k, 3);
      r.mesh.scale.setScalar(r.r0 + (r.r1 - r.r0) * e);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = r.op * (1 - k);
      r.mesh.visible = k < 1;
    }
  }
}
