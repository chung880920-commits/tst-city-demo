import * as THREE from 'three';

export const SUN_DIR = new THREE.Vector3(-0.78, 0.3, 0.55).normalize();
export const FOG_COLOR = new THREE.Color('#e9a27e');
export const WATER_LEVEL = -0.75;

export function createSky() {
  const geo = new THREE.SphereGeometry(2200, 24, 12);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      sunDir: { value: SUN_DIR },
      top: { value: new THREE.Color('#2b3f7a') },
      mid: { value: new THREE.Color('#d9799a') },
      horizon: { value: new THREE.Color('#ffb27a') },
      sun: { value: new THREE.Color('#fff1c2') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir, top, mid, horizon, sun;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -0.2, 1.0);
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.18, h));
        c = mix(c, top, smoothstep(0.15, 0.65, h));
        float s = max(dot(d, normalize(vec3(sunDir.x, 0.09, sunDir.z))), 0.0);
        c += sun * (pow(s, 600.0) * 2.5 + pow(s, 24.0) * 0.45 + pow(s, 4.0) * 0.18);
        if (d.y < 0.0) c = mix(c, horizon * 0.9, smoothstep(0.0, -0.08, d.y));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.name = 'sky';
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  return sky;
}

export function createWater() {
  const geo = new THREE.PlaneGeometry(4000, 1000, 120, 40);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, 38 + 500);
  const mat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        time: { value: 0 },
        sunDir: { value: SUN_DIR },
        deep: { value: new THREE.Color('#17507a') },
        shallow: { value: new THREE.Color('#2f8ba3') },
        skyTint: { value: new THREE.Color('#e7948f') },
        sunCol: { value: new THREE.Color('#ffd28a') },
      },
    ]),
    vertexShader: /* glsl */ `
      uniform float time;
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vec3 p = position;
        float w = sin(p.x * 0.12 + time * 1.1) * 0.22 + sin(p.z * 0.17 - time * 1.4) * 0.18
                + sin((p.x + p.z) * 0.31 + time * 2.1) * 0.08;
        p.y += w;
        vec4 world = modelMatrix * vec4(p, 1.0);
        vWorld = world.xyz;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir, deep, shallow, skyTint, sunCol;
      uniform float time;
      varying vec3 vWorld;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        if (n.y < 0.0) n = -n;
        vec3 v = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        vec3 col = mix(shallow, deep, clamp(n.y * 1.2 - 0.1, 0.0, 1.0));
        col = mix(col, skyTint, fres * 0.45);
        vec3 r = reflect(-v, n);
        float spec = pow(max(dot(r, sunDir), 0.0), 60.0);
        float sparkle = step(0.6, fract(sin(dot(floor(vWorld.xz * 1.4), vec2(12.9898, 78.233)) + floor(time * 3.0)) * 43758.5453));
        col += sunCol * (spec * 1.6 + spec * sparkle * 0.8);
        float diff = max(dot(n, sunDir), 0.0);
        col *= 0.75 + diff * 0.35;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  const water = new THREE.Mesh(geo, mat);
  water.position.y = WATER_LEVEL;
  water.name = 'water';
  return { mesh: water, uniforms: mat.uniforms };
}

export function createLights(scene: THREE.Scene) {
  const hemi = new THREE.HemisphereLight('#ffd9c4', '#5a5a80', 1.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffb878', 1.9);
  sun.position.copy(SUN_DIR).multiplyScalar(80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const s = sun.shadow.camera;
  s.left = -38;
  s.right = 38;
  s.top = 38;
  s.bottom = -38;
  s.near = 1;
  s.far = 220;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(sun.target);
  return { hemi, sun };
}
