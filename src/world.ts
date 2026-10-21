import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { HeightField, Obstacles, type LevelData } from './level';
import { NavGrid } from './nav';
import { Physics } from './physics';

/** Clip metadata from assets/manifest.json (layer drives animation layering). */
export interface ClipMeta {
  duration: number;
  loop: boolean;
  layer?: 'upper' | 'full';
  hit_time?: number;
  windup_end_time?: number;
}

export interface MapEntry {
  name: string;
  title: string;
  level: string;
}

/** Loaded once: characters, sky, manifest, map list. */
export interface CommonAssets {
  person: GLTF;
  horse: GLTF;
  camel: GLTF;
  /** Optional newer assets (older deploys may not have them). */
  wingedHorse: GLTF | null;
  bonfireProp: GLTF | null;
  chestProp: GLTF | null;
  /** Bow and beasts (placeholders are built in code until these exist). */
  arrowProp: GLTF | null;
  rockProp: GLTF | null;
  dog: GLTF | null;
  bird: GLTF | null;
  dogClips: Record<string, ClipMeta>;
  birdClips: Record<string, ClipMeta>;
  envHdr: THREE.DataTexture;
  bg: THREE.Texture;
  personClips: Record<string, ClipMeta>;
  maps: { start: string; maps: MapEntry[] };
}

/** Loaded per map (and cached for revisits). */
export interface MapAssets {
  name: string;
  level: LevelData;
  heights: HeightField;
  terrain: GLTF;
  town: GLTF;
  backdrop: GLTF | null;
  backdropGround: GLTF | null;
  dressing: GLTF | null;
}

/** Asset URL relative to the deployed base (works at / and at /sands-of-arabia/). */
const asset = (path: string) => import.meta.env.BASE_URL + path.replace(/^\//, '');
const gltf = new GLTFLoader();

type Progress = (f: number, label: string) => void;

function counter(total: number, onProgress: Progress) {
  let done = 0;
  return <T>(label: string, p: Promise<T>): Promise<T> =>
    p.then((v) => {
      onProgress(++done / total, label);
      return v;
    });
}

export async function loadCommon(onProgress: Progress): Promise<CommonAssets> {
  const tick = counter(14, onProgress);
  const optional = (path: string, label: string) => tick(label, gltf.loadAsync(asset(path)).catch(() => null));
  const [person, horse, camel, envHdr, bg, manifest, maps, wingedHorse, bonfireProp, chestProp, arrowProp, rockProp, dog, bird] = await Promise.all([
    tick('people', gltf.loadAsync(asset('characters/person.glb'))),
    tick('horses', gltf.loadAsync(asset('characters/horse.glb'))),
    tick('camels', gltf.loadAsync(asset('characters/camel.glb'))),
    tick('sky light', new HDRLoader().loadAsync(asset('sky/sunset_env.hdr'))),
    tick('sky', new THREE.TextureLoader().loadAsync(asset('sky/sunset_bg.jpg'))),
    tick('manifest', fetch(asset('manifest.json')).then((r) => r.json())),
    tick(
      'maps',
      fetch(asset('level/maps.json'))
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ),
    optional('characters/horse_winged.glb', 'winged horse'),
    optional('props/bonfire.glb', 'bonfire'),
    optional('props/chest.glb', 'chest'),
    optional('props/arrow.glb', 'arrows'),
    optional('props/rock_throw.glb', 'stones'),
    optional('characters/dog.glb', 'hounds'),
    optional('characters/bird.glb', 'vultures'),
  ]);
  bg.mapping = THREE.EquirectangularReflectionMapping;
  bg.colorSpace = THREE.SRGBColorSpace;
  envHdr.mapping = THREE.EquirectangularReflectionMapping;
  return {
    person,
    horse,
    camel,
    wingedHorse,
    bonfireProp,
    chestProp,
    arrowProp,
    rockProp,
    dog,
    bird,
    dogClips: manifest?.assets?.dog?.clips ?? {},
    birdClips: manifest?.assets?.bird?.clips ?? {},
    envHdr,
    bg,
    personClips: manifest?.assets?.person?.clips ?? {},
    maps: maps ?? { start: 'oasis', maps: [{ name: 'oasis', title: 'The oasis town', level: 'level/level.json' }] },
  };
}

const mapCache = new Map<string, Promise<MapAssets>>();

export function loadMap(entry: MapEntry, onProgress: Progress): Promise<MapAssets> {
  let p = mapCache.get(entry.name);
  if (!p) {
    p = (async () => {
      const level = (await fetch(asset(entry.level)).then((r) => r.json())) as LevelData;
      const opt = (path: string | undefined, label: string) => (path ? tick(label, gltf.loadAsync(asset(path))) : Promise.resolve(null));
      const files = [level.terrain, level.town, level.backdrop, level.backdrop_ground, level.dressing].filter(Boolean).length + 1;
      const tick = counter(files, onProgress);
      const [heightsBuf, terrain, town, backdrop, backdropGround, dressing] = await Promise.all([
        tick('heights', fetch(asset(level.heights.file)).then((r) => r.arrayBuffer())),
        tick('terrain', gltf.loadAsync(asset(level.terrain))),
        tick('town', gltf.loadAsync(asset(level.town))),
        opt(level.backdrop, 'backdrop'),
        opt(level.backdrop_ground, 'far ground'),
        opt(level.dressing, 'dressing'),
      ]);
      return { name: entry.name, level, heights: new HeightField(new Float32Array(heightsBuf), level.heights), terrain, town, backdrop, backdropGround, dressing };
    })();
    mapCache.set(entry.name, p);
    p.catch(() => mapCache.delete(entry.name));
  }
  return p;
}

// --- See-through cutout ------------------------------------------------------------
// Fragments of the town/dressing that are nearer to the camera than the player,
// inside a screen circle around them and above their feet, are dither-discarded,
// so walls, awnings and palm canopies never hide the player.

export const cutout = {
  uCutCenter: { value: new THREE.Vector2() },
  uCutRadius: { value: 0 },
  uCutAspect: { value: 1 },
  uCutDepth: { value: 0 },
  uCutFloorY: { value: -1e9 },
  uCamWorld: { value: new THREE.Matrix4() },
  uResolution: { value: new THREE.Vector2(1, 1) },
};

const CUT_GLSL = /* glsl */ `
  if (uCutRadius > 0.0) {
    vec2 ndc = gl_FragCoord.xy / uResolution * 2.0 - 1.0;
    float r = length((ndc - uCutCenter) * vec2(uCutAspect, 1.0)) / uCutRadius;
    if (r < 1.0 && vViewPosition.z < uCutDepth - 0.6) {
      float wy = (uCamWorld * vec4(-vViewPosition, 1.0)).y;
      if (wy > uCutFloorY) {
        const float B[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
        ivec2 q = ivec2(mod(gl_FragCoord.xy, 4.0));
        float t = (B[q.x + q.y * 4] + 0.5) / 16.0;
        float keep = mix(0.12, 1.0, smoothstep(0.55, 1.0, r));
        if (t > keep) discard;
      }
    }
  }
`;

function applyCutout(mat: THREE.Material): void {
  if (mat.userData.cutout) return;
  mat.userData.cutout = true;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, cutout);
    shader.fragmentShader =
      `uniform vec2 uCutCenter;\nuniform float uCutRadius;\nuniform float uCutAspect;\nuniform float uCutDepth;\nuniform float uCutFloorY;\nuniform mat4 uCamWorld;\nuniform vec2 uResolution;\n` +
      shader.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + CUT_GLSL);
  };
  mat.customProgramCacheKey = () => 'cutout';
  mat.needsUpdate = true;
}

interface LightSpot {
  p: THREE.Vector3;
  fire: boolean;
}

export class World {
  readonly scene = new THREE.Scene();
  readonly sun: THREE.DirectionalLight;
  readonly sunDir: THREE.Vector3;
  readonly fog: THREE.Fog;
  readonly hemi: THREE.HemisphereLight;
  /** Lamp/fire brightness multiplier from the time of day. */
  lampFactor = 1;
  readonly obstacles: Obstacles;
  readonly nav: NavGrid;
  readonly level: LevelData;
  private lights: THREE.PointLight[] = [];
  private lightFire: boolean[] = [];
  private spots: LightSpot[] = [];
  private lampTimer = 0;
  private flameMats: THREE.MeshStandardMaterial[] = [];
  /** Awning/limewash materials that get a faint glow at night so they don't go black. */
  private glowMats: THREE.MeshStandardMaterial[] = [];
  private t = 0;
  private shadowHalf = 30;

  constructor(
    readonly map: MapAssets,
    readonly physics: Physics,
  ) {
    const level = map.level;
    const scene = this.scene;
    this.level = level;

    this.fog = new THREE.Fog(new THREE.Color(level.fog.color), level.fog.near, level.fog.far);
    scene.fog = this.fog;

    // Sun: level.json gives the authored sunset direction and colour; DayCycle
    // moves it through the day.
    const d = level.sun.direction_to_sun;
    this.sunDir = new THREE.Vector3(d[0], d[1], d[2]).normalize();
    this.sun = new THREE.DirectionalLight(new THREE.Color(level.sun.color), 3.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    const sc = this.sun.shadow.camera;
    sc.near = 1;
    sc.far = 600;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xffd2a8, 0x6a4a3a, 0.35);
    scene.add(this.hemi);

    // Static level.
    const prep = (root: THREE.Object3D | undefined, cast: boolean, receive: boolean) => {
      if (!root) return;
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = cast;
        m.receiveShadow = receive;
        m.matrixAutoUpdate = false;
        m.updateMatrix();
      });
      scene.add(root);
    };
    prep(map.terrain.scene, true, true);
    prep(map.town.scene, true, true);
    prep(map.dressing?.scene, true, true);
    prep(map.backdrop?.scene, false, true);
    prep(map.backdropGround?.scene, false, false);

    for (const root of [map.town.scene, map.dressing?.scene]) {
      root?.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        for (const mat of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) {
          if (mat.name === 'LampFlame' || mat.name === 'Fire') {
            mat.emissive = new THREE.Color(mat.name === 'Fire' ? 0xff7a2a : 0xffb050);
            mat.emissiveIntensity = 2.5;
            if (!this.flameMats.includes(mat)) this.flameMats.push(mat);
            continue;
          }
          if (mat.name === 'Water') {
            mat.roughness = 0.08;
            mat.metalness = 0.1;
          }
          if ((/^Aw\d/.test(mat.name) || mat.name === 'Lime') && !this.glowMats.includes(mat)) {
            mat.emissive = mat.color.clone();
            mat.emissiveIntensity = 0;
            this.glowMats.push(mat);
          }
          applyCutout(mat);
        }
      });
    }

    // Physics: ground is the heightfield (same 2 m grid as terrain.glb); Rapier
    // holds the level boxes plus actor capsules.
    physics.addBoxes(level.colliders);
    physics.bounds = { x: [level.bounds.x[0] + 1, level.bounds.x[1] - 1], z: [level.bounds.z[0] + 1, level.bounds.z[1] - 1] };
    physics.groundAt = (x, z) => map.heights.height(x, z);
    this.obstacles = new Obstacles(level.colliders);
    this.nav = new NavGrid(level.colliders, level.bounds.x[0], level.bounds.z[0], level.bounds.x[1], level.bounds.z[1]);

    // Lamps and fires: a fixed pool of point lights moved to the spots nearest
    // the player (keeps the shader light count constant).
    for (const l of level.lights) {
      const p = new THREE.Vector3(...l.pos);
      if (l.type === 'fire') p.y += 0.6;
      this.spots.push({ p, fire: l.type === 'fire' });
    }
    for (let i = 0; i < 6; i++) {
      const pl = new THREE.PointLight(0xffa24a, 0, 7, 1.6);
      pl.position.set(0, -100, 0);
      this.lights.push(pl);
      this.lightFire.push(false);
      scene.add(pl);
    }
  }

  /** Wireframe boxes for every level.json collider (debug overlay). */
  colliderDebug(): THREE.Object3D {
    const g = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({ color: 0x00ffff, fog: false, depthTest: false, transparent: true, opacity: 0.7 });
    const box = new THREE.EdgesGeometry(new THREE.BoxGeometry(2, 2, 2));
    for (const c of this.level.colliders) {
      const l = new THREE.LineSegments(box, mat);
      l.position.set(...c.pos);
      l.scale.set(...c.half);
      l.rotation.y = c.yaw;
      l.renderOrder = 10;
      g.add(l);
    }
    return g;
  }

  ground(x: number, z: number): number {
    return this.map.heights.height(x, z);
  }

  /** Floor under (x, z) for something standing at height y: sand or a walkable box top. */
  floor(x: number, z: number, y: number): number {
    return this.physics.support(x, z, y + 0.3);
  }

  /** Add a lamp or fire to the pooled point lights (bonfires). */
  addLightSpot(p: THREE.Vector3, fire: boolean): void {
    this.spots.push({ p: p.clone(), fire });
    this.lampTimer = 0;
  }

  /** Night glow for awnings and limewash (0 by day). */
  setNightGlow(g: number): void {
    for (const m of this.glowMats) m.emissiveIntensity = 0.06 * g;
  }

  update(dt: number, focus: THREE.Vector3, viewHalf: number): void {
    this.t += dt;
    // Sun + shadow frustum follow the player; snap to texels to stop shimmering.
    const half = Math.max(22, viewHalf * 1.9);
    if (Math.abs(half - this.shadowHalf) > 0.5) {
      this.shadowHalf = half;
      const sc = this.sun.shadow.camera;
      sc.left = -half;
      sc.right = half;
      sc.top = half;
      sc.bottom = -half;
      sc.updateProjectionMatrix();
    }
    const texel = (2 * this.shadowHalf) / this.sun.shadow.mapSize.x;
    const up = Math.abs(this.sunDir.y) > 0.99 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const lx = new THREE.Vector3().crossVectors(up, this.sunDir).normalize();
    const ly = new THREE.Vector3().crossVectors(this.sunDir, lx).normalize();
    const a = Math.round(focus.dot(lx) / texel) * texel;
    const b = Math.round(focus.dot(ly) / texel) * texel;
    const c = focus.dot(this.sunDir);
    const snapped = new THREE.Vector3().addScaledVector(lx, a).addScaledVector(ly, b).addScaledVector(this.sunDir, c);
    this.sun.target.position.copy(snapped);
    this.sun.position.copy(snapped).addScaledVector(this.sunDir, 250);

    // Nearest lamps / fires.
    this.lampTimer -= dt;
    if (this.lampTimer <= 0) {
      this.lampTimer = 0.5;
      const near = this.spots
        .map((s) => ({ s, d: s.p.distanceToSquared(focus) }))
        .sort((x, y) => x.d - y.d)
        .slice(0, this.lights.length);
      this.lights.forEach((l, i) => {
        const n = near[i];
        if (n && n.d < 60 * 60) {
          l.position.copy(n.s.p);
          this.lightFire[i] = n.s.fire;
          l.color.setHex(n.s.fire ? 0xff8a3a : 0xffa24a);
        } else {
          l.position.set(0, -100, 0);
        }
      });
    }
    const flick = 1 + 0.12 * Math.sin(this.t * 13.1) + 0.08 * Math.sin(this.t * 7.3 + 1.7);
    const fireFlick = 1 + 0.2 * Math.sin(this.t * 9.7) + 0.1 * Math.sin(this.t * 23.1);
    const lf = this.lampFactor;
    this.lights.forEach((l, i) => {
      if (this.lightFire[i]) {
        l.intensity = 16 * Math.min(1.3, Math.max(0.4, lf)) * fireFlick;
        l.distance = 9 + 3 * Math.max(0, lf - 1);
      } else {
        l.intensity = 6 * flick * lf;
        l.distance = 7 + 5 * Math.max(0, lf - 1);
      }
    });
    for (const m of this.flameMats) m.emissiveIntensity = 2.5 * flick * Math.max(0.5, lf);
  }

  setFogOffset(depth: number): void {
    const f = this.level.fog;
    this.fog.near = depth + f.near * 0.5;
    this.fog.far = depth + f.far;
  }
}
