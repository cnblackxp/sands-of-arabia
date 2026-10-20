import * as THREE from 'three';
import type { World } from './world';

/**
 * Time of day. A sky dome (gradient + sun/moon + stars) that blends into the
 * authored sunset photo/HDR around sunset, keyframed light colours, and an
 * environment map regenerated from the dome whenever the time moves enough.
 */

interface Key {
  h: number;
  sun: number;
  sunI: number;
  hemiSky: number;
  hemiGround: number;
  hemiI: number;
  env: number;
  fog: number;
  zenith: number;
  horizon: number;
  lamp: number;
  stars: number;
  /** Night colour grade strength 0..1. */
  grade?: number;
}

const KEYS: Key[] = [
  { h: 0, sun: 0x9db4ff, sunI: 0.7, hemiSky: 0x3d5aa8, hemiGround: 0x141a30, hemiI: 0.6, env: 0.45, fog: 0x101a38, zenith: 0x030820, horizon: 0x13245a, lamp: 1.8, stars: 1, grade: 1 },
  { h: 4.8, sun: 0x9db4ff, sunI: 0.6, hemiSky: 0x4a5aa0, hemiGround: 0x1a1a30, hemiI: 0.55, env: 0.45, fog: 0x1e2648, zenith: 0x060c2c, horizon: 0x2a3466, lamp: 1.8, stars: 0.8, grade: 0.9 },
  { h: 6.2, sun: 0xff9a6a, sunI: 1.8, hemiSky: 0xb8a0c8, hemiGround: 0x6a4a3a, hemiI: 0.45, env: 0.7, fog: 0xd8a890, zenith: 0x4a6aa8, horizon: 0xf0a878, lamp: 0.6, stars: 0, grade: 0.2 },
  { h: 8, sun: 0xffe0b8, sunI: 2.5, hemiSky: 0xcfe0ff, hemiGround: 0x8a6a4a, hemiI: 0.42, env: 0.7, fog: 0xe6d2b8, zenith: 0x4f82cc, horizon: 0xdbe4ee, lamp: 0, stars: 0, grade: 0 },
  { h: 12.3, sun: 0xfff2e0, sunI: 2.6, hemiSky: 0xc8dcff, hemiGround: 0x8a6a4a, hemiI: 0.4, env: 0.65, fog: 0xe8dcc8, zenith: 0x3a74c8, horizon: 0xcfe0f0, lamp: 0, stars: 0, grade: 0 },
  { h: 16, sun: 0xffdca8, sunI: 2.8, hemiSky: 0xe0e0f0, hemiGround: 0x9a7050, hemiI: 0.42, env: 0.8, fog: 0xead4b0, zenith: 0x4a7ac0, horizon: 0xe8dcc0, lamp: 0, stars: 0, grade: 0 },
  { h: 18.2, sun: 0xffb46b, sunI: 3.2, hemiSky: 0xffd2a8, hemiGround: 0x6a4a3a, hemiI: 0.35, env: 1.0, fog: 0xe8c49a, zenith: 0x6f90bc, horizon: 0xf2b27e, lamp: 1, stars: 0, grade: 0 },
  { h: 18.95, sun: 0xff8a5a, sunI: 1.4, hemiSky: 0xb08aa0, hemiGround: 0x4a3030, hemiI: 0.4, env: 0.7, fog: 0xb08070, zenith: 0x2a3462, horizon: 0xd88466, lamp: 1.3, stars: 0, grade: 0.2 },
  { h: 19.7, sun: 0x8aa0f0, sunI: 0.6, hemiSky: 0x4058a8, hemiGround: 0x1c2036, hemiI: 0.55, env: 0.4, fog: 0x1c2850, zenith: 0x081038, horizon: 0x3a3a78, lamp: 1.7, stars: 0.5, grade: 0.8 },
  { h: 21, sun: 0x9db4ff, sunI: 0.7, hemiSky: 0x3d5aa8, hemiGround: 0x141a30, hemiI: 0.6, env: 0.45, fog: 0x101a38, zenith: 0x030820, horizon: 0x13245a, lamp: 1.8, stars: 1, grade: 1 },
  { h: 24, sun: 0x9db4ff, sunI: 0.7, hemiSky: 0x3d5aa8, hemiGround: 0x141a30, hemiI: 0.6, env: 0.45, fog: 0x101a38, zenith: 0x030820, horizon: 0x13245a, lamp: 1.8, stars: 1, grade: 1 },
];

export const SUNSET_HOUR = 18.2;
const RISE = 5.7;
const SET = 19.0;
/** Shadow-casting light never drops below this elevation (readability). */
const MIN_LIGHT_ELEV = THREE.MathUtils.degToRad(22);

export function timeLabel(h: number): string {
  const hh = Math.floor(h) % 24;
  const mm = Math.floor((h - Math.floor(h)) * 60);
  const name =
    h < 4.8 || h >= 20.5 ? 'Night' : h < 6.8 ? 'Dawn' : h < 11 ? 'Morning' : h < 14 ? 'Noon' : h < 17.4 ? 'Afternoon' : h < 19 ? 'Sunset' : 'Dusk';
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}  ${name}`;
}

const VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
    vec4 p = projectionMatrix * viewMatrix * vec4((modelMatrix * vec4(position, 1.0)).xyz, 1.0);
    gl_Position = p.xyww;
  }`;

const FRAG = /* glsl */ `
  uniform vec3 zenith;
  uniform vec3 horizon;
  uniform vec3 ground;
  uniform vec3 sunDir;
  uniform vec3 sunColor;
  uniform float sunVis;
  uniform vec3 moonDir;
  uniform float moonVis;
  uniform float stars;
  uniform sampler2D photo;
  uniform float photoMix;
  uniform float photoGain;
  varying vec3 vDir;
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.55));
    col = mix(col, ground, smoothstep(0.0, -0.12, h));
    float s = max(dot(d, sunDir), 0.0);
    col += sunColor * (pow(s, 12.0) * 0.25 + pow(s, 200.0) * 0.8) * sunVis;
    col += sunColor * smoothstep(0.9994, 0.9997, s) * 4.0 * sunVis;
    float m = max(dot(d, moonDir), 0.0);
    col += vec3(0.85, 0.92, 1.0) * smoothstep(0.9991, 0.9994, m) * 1.6 * moonVis;
    col += vec3(0.25, 0.35, 0.7) * pow(m, 60.0) * 0.5 * moonVis;
    if (stars > 0.0 && h > 0.0) {
      vec3 q = floor(d * 380.0);
      float st = step(0.9975, hash(q));
      col += vec3(st) * stars * 0.9 * smoothstep(0.0, 0.25, h);
    }
    if (photoMix > 0.0) {
      vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5);
      col = mix(col, texture2D(photo, uv).rgb * photoGain, photoMix);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

function skyMaterial(photo: THREE.Texture, gain: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: false,
    uniforms: {
      zenith: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      ground: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color() },
      sunVis: { value: 1 },
      moonDir: { value: new THREE.Vector3(0, 1, 0) },
      moonVis: { value: 0 },
      stars: { value: 0 },
      photo: { value: photo },
      photoMix: { value: 0 },
      photoGain: { value: gain },
    },
  });
}

export class DayCycle {
  hours = SUNSET_HOUR;
  flowing = false;
  /** Game hours per real second while flowing. */
  speed = 1 / 30;
  private dome: THREE.Mesh;
  private envScene = new THREE.Scene();
  private envMat: THREE.ShaderMaterial;
  private skyMat: THREE.ShaderMaterial;
  private pmrem: THREE.PMREMGenerator;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private lastEnvHour = -99;
  private tmp = new THREE.Color();
  lampFactor = 1;
  /** Current night-grade strength (0 = none). */
  grade = 0;
  private gradeScene = new THREE.Scene();
  private gradeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private gradeMul: THREE.MeshBasicMaterial;
  private gradeAdd: THREE.MeshBasicMaterial;

  constructor(
    private world: World,
    renderer: THREE.WebGLRenderer,
    bg: THREE.Texture,
    hdr: THREE.Texture,
  ) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.skyMat = skyMaterial(bg, 1);
    this.envMat = skyMaterial(hdr, 1);
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), this.skyMat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1;
    world.scene.add(this.dome);
    world.scene.background = null;
    // Night grade: a full-screen multiply toward blue plus a faint blue lift.
    const quad = new THREE.PlaneGeometry(2, 2);
    this.gradeMul = new THREE.MeshBasicMaterial({ blending: THREE.MultiplyBlending, premultipliedAlpha: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false });
    this.gradeAdd = new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false, fog: false });
    const m1 = new THREE.Mesh(quad, this.gradeMul);
    const m2 = new THREE.Mesh(quad, this.gradeAdd);
    m1.renderOrder = 0;
    m2.renderOrder = 1;
    m1.frustumCulled = m2.frustumCulled = false;
    this.gradeScene.add(m1, m2);
    const envDome = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), this.envMat);
    this.envScene.add(envDome);
    this.apply(true);
  }

  dispose(): void {
    this.dome.removeFromParent();
    this.envRT?.dispose();
    this.envRT = null;
    this.pmrem.dispose();
  }

  /** Draw the night grade over the frame just rendered. */
  renderGrade(renderer: THREE.WebGLRenderer): void {
    if (this.grade < 0.01) return;
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.gradeScene, this.gradeCam);
    renderer.autoClear = auto;
  }

  set(h: number): void {
    this.hours = ((h % 24) + 24) % 24;
    this.apply(false);
  }

  update(dt: number, cameraPos: THREE.Vector3): void {
    this.dome.position.copy(cameraPos);
    if (this.flowing) {
      this.hours = (this.hours + dt * this.speed) % 24;
      this.apply(false);
    }
  }

  private sample(): Key {
    const h = this.hours;
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
    const a = KEYS[i];
    const b = KEYS[i + 1];
    const t = THREE.MathUtils.clamp((h - a.h) / (b.h - a.h), 0, 1);
    const c = (x: number, y: number) => this.tmp.setHex(x).lerp(new THREE.Color(y), t).getHex();
    const n = (x: number, y: number) => x + (y - x) * t;
    return {
      h,
      sun: c(a.sun, b.sun),
      sunI: n(a.sunI, b.sunI),
      hemiSky: c(a.hemiSky, b.hemiSky),
      hemiGround: c(a.hemiGround, b.hemiGround),
      hemiI: n(a.hemiI, b.hemiI),
      env: n(a.env, b.env),
      fog: c(a.fog, b.fog),
      zenith: c(a.zenith, b.zenith),
      horizon: c(a.horizon, b.horizon),
      lamp: n(a.lamp, b.lamp),
      stars: n(a.stars, b.stars),
      grade: n(a.grade ?? 0, b.grade ?? 0),
    };
  }

  /** Sun direction for the hour (bearing NE → S → NW, matching the authored sunset). */
  private sunDirection(h: number, out: THREE.Vector3): number {
    const u = (h - RISE) / (SET - RISE);
    const bearing = THREE.MathUtils.degToRad(54 + 286 * u); // ~323° (authored) at 18:12
    const elev = THREE.MathUtils.degToRad(72) * Math.sin(Math.PI * u);
    const ce = Math.cos(elev);
    out.set(Math.sin(bearing) * ce, Math.sin(elev), -Math.cos(bearing) * ce);
    return elev;
  }

  private apply(force: boolean): void {
    const k = this.sample();
    const w = this.world;
    const sunDir = new THREE.Vector3();
    const elev = this.sunDirection(this.hours, sunDir);
    const day = elev > -0.05;
    // Moon roughly opposite the sun, high enough to light the scene.
    const moonDir = new THREE.Vector3(-sunDir.x, Math.max(0.55, -sunDir.y), -sunDir.z).normalize();

    // Shadow light: the sun by day (lifted to a readable elevation), the moon by night.
    const light = day ? sunDir.clone() : moonDir.clone();
    const le = Math.asin(THREE.MathUtils.clamp(light.y, -1, 1));
    if (le < MIN_LIGHT_ELEV) {
      const flat = Math.hypot(light.x, light.z) || 1;
      light.set((light.x / flat) * Math.cos(MIN_LIGHT_ELEV), Math.sin(MIN_LIGHT_ELEV), (light.z / flat) * Math.cos(MIN_LIGHT_ELEV));
    }
    w.sunDir.copy(light);
    w.sun.color.setHex(k.sun);
    w.sun.intensity = k.sunI;
    w.hemi.color.setHex(k.hemiSky);
    w.hemi.groundColor.setHex(k.hemiGround);
    w.hemi.intensity = k.hemiI;
    w.scene.environmentIntensity = k.env;
    w.fog.color.setHex(k.fog);
    this.lampFactor = k.lamp;
    w.lampFactor = k.lamp;
    this.grade = k.grade ?? 0;
    const gm = this.grade;
    // Display-space factors: cool, slightly desaturated moonlight look.
    this.gradeMul.color.setRGB(1 - 0.42 * gm, 1 - 0.3 * gm, 1 - 0.02 * gm, THREE.SRGBColorSpace);
    this.gradeAdd.color.setRGB(0.004 * gm, 0.02 * gm, 0.07 * gm, THREE.SRGBColorSpace);

    // Photo sky only around the authored sunset.
    const photo = THREE.MathUtils.clamp(1 - Math.abs(this.hours - SUNSET_HOUR) / 0.9, 0, 1);
    for (const m of [this.skyMat, this.envMat]) {
      const u = m.uniforms;
      (u.zenith.value as THREE.Color).setHex(k.zenith);
      (u.horizon.value as THREE.Color).setHex(k.horizon);
      (u.ground.value as THREE.Color).setHex(k.fog);
      (u.sunDir.value as THREE.Vector3).copy(sunDir);
      (u.sunColor.value as THREE.Color).setHex(k.sun);
      u.sunVis.value = THREE.MathUtils.clamp((elev + 0.08) * 8, 0, 1);
      (u.moonDir.value as THREE.Vector3).copy(moonDir);
      u.moonVis.value = day ? 0 : 1;
      u.stars.value = k.stars;
      u.photoMix.value = photo;
    }

    if (force || Math.abs(this.hours - this.lastEnvHour) > 0.2) {
      this.lastEnvHour = this.hours;
      const rt = this.pmrem.fromScene(this.envScene, 0.02);
      w.scene.environment = rt.texture;
      this.envRT?.dispose();
      this.envRT = rt;
    }
  }
}
