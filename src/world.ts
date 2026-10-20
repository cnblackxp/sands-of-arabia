import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { HeightField, Obstacles, type LevelData } from './level';
import { Physics } from './physics';

export interface LoadedAssets {
  level: LevelData;
  heights: HeightField;
  terrain: GLTF;
  town: GLTF;
  backdrop: GLTF;
  backdropGround: GLTF;
  person: GLTF;
  horse: GLTF;
  camel: GLTF;
  envHdr: THREE.DataTexture;
  bg: THREE.Texture;
}

export async function loadAssets(onProgress: (f: number, label: string) => void): Promise<LoadedAssets> {
  const gltf = new GLTFLoader();
  let done = 0;
  const total = 11;
  const tick = <T>(label: string, p: Promise<T>): Promise<T> =>
    p.then((v) => {
      onProgress(++done / total, label);
      return v;
    });

  const level = await tick('level', fetch('/level/level.json').then((r) => r.json() as Promise<LevelData>));
  const [heightsBuf, terrain, town, backdrop, backdropGround, person, horse, camel, envHdr, bg] = await Promise.all([
    tick('heights', fetch('/' + level.heights.file).then((r) => r.arrayBuffer())),
    tick('terrain', gltf.loadAsync('/level/terrain.glb')),
    tick('town', gltf.loadAsync('/level/town.glb')),
    tick('backdrop', gltf.loadAsync('/level/backdrop.glb')),
    tick('backdrop ground', gltf.loadAsync('/level/backdrop_ground.glb')),
    tick('person', gltf.loadAsync('/characters/person.glb')),
    tick('horse', gltf.loadAsync('/characters/horse.glb')),
    tick('camel', gltf.loadAsync('/characters/camel.glb')),
    tick('sky light', new HDRLoader().loadAsync('/sky/sunset_env.hdr')),
    tick('sky', new THREE.TextureLoader().loadAsync('/sky/sunset_bg.jpg')),
  ]);
  return {
    level,
    heights: new HeightField(new Float32Array(heightsBuf), level.heights),
    terrain,
    town,
    backdrop,
    backdropGround,
    person,
    horse,
    camel,
    envHdr,
    bg,
  };
}

const SUN_MIN_ELEVATION_DEG = 24;

export class World {
  readonly scene = new THREE.Scene();
  readonly sun: THREE.DirectionalLight;
  readonly sunDir: THREE.Vector3;
  readonly fog: THREE.Fog;
  readonly obstacles: Obstacles;
  private lamps: THREE.PointLight[] = [];
  private lampSpots: THREE.Vector3[] = [];
  private fire: THREE.PointLight | null = null;
  private lampTimer = 0;
  private flameMats: THREE.MeshStandardMaterial[] = [];
  private t = 0;
  private shadowHalf = 30;

  constructor(
    renderer: THREE.WebGLRenderer,
    readonly assets: LoadedAssets,
    readonly physics: Physics,
  ) {
    const { level, scene } = { level: assets.level, scene: this.scene };

    // Sky: tone-mapped JPG as background, linear HDR through PMREM for lighting.
    assets.bg.mapping = THREE.EquirectangularReflectionMapping;
    assets.bg.colorSpace = THREE.SRGBColorSpace;
    scene.background = assets.bg;
    assets.envHdr.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromEquirectangular(assets.envHdr).texture;
    scene.environmentIntensity = 1.0;
    pmrem.dispose();
    assets.envHdr.dispose();

    this.fog = new THREE.Fog(new THREE.Color(level.fog.color), level.fog.near, level.fog.far);
    scene.fog = this.fog;

    // Sun: azimuth and colour from level.json. The authored 8° elevation puts the
    // whole market in one dune shadow with almost no direct light, so the light
    // is lifted to a playable minimum elevation (shadows stay long and warm).
    const d = level.sun.direction_to_sun;
    this.sunDir = new THREE.Vector3(d[0], d[1], d[2]).normalize();
    const minElev = THREE.MathUtils.degToRad(SUN_MIN_ELEVATION_DEG);
    if (Math.asin(this.sunDir.y) < minElev) {
      const flat = Math.hypot(this.sunDir.x, this.sunDir.z);
      this.sunDir.set((this.sunDir.x / flat) * Math.cos(minElev), Math.sin(minElev), (this.sunDir.z / flat) * Math.cos(minElev));
    }
    this.sun = new THREE.DirectionalLight(new THREE.Color(level.sun.color), 3.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    const sc = this.sun.shadow.camera;
    sc.near = 1;
    sc.far = 600;
    scene.add(this.sun, this.sun.target);
    scene.add(new THREE.HemisphereLight(0xffd2a8, 0x6a4a3a, 0.35));

    // Static level.
    const shadowy = (root: THREE.Object3D, cast: boolean) =>
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = cast;
        m.receiveShadow = true;
        m.matrixAutoUpdate = false;
        m.updateMatrix();
      });
    shadowy(assets.terrain.scene, true);
    shadowy(assets.town.scene, true);
    shadowy(assets.backdrop.scene, false);
    shadowy(assets.backdropGround.scene, false);
    assets.backdropGround.scene.traverse((o) => ((o as THREE.Mesh).receiveShadow = false));
    scene.add(assets.terrain.scene, assets.town.scene, assets.backdrop.scene, assets.backdropGround.scene);

    assets.town.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      for (const mat of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) {
        if (mat.name === 'LampFlame' || mat.name === 'Fire') {
          mat.emissive = new THREE.Color(mat.name === 'Fire' ? 0xff7a2a : 0xffb050);
          mat.emissiveIntensity = 2.5;
          this.flameMats.push(mat);
        }
        if (mat.name === 'Water') {
          mat.roughness = 0.08;
          mat.metalness = 0.1;
        }
      }
    });

    // Physics: ground is the heightfield (same 2 m grid as terrain.glb); Rapier
    // holds the level boxes plus actor capsules.
    physics.addBoxes(level.colliders);
    physics.bounds = { x: [level.bounds.x[0] + 1, level.bounds.x[1] - 1], z: [level.bounds.z[0] + 1, level.bounds.z[1] - 1] };
    physics.groundAt = (x, z) => assets.heights.height(x, z);
    this.obstacles = new Obstacles(level.colliders);

    // Lamps: a fixed pool of point lights moved to the lamps nearest the player
    // (keeps the shader light count constant).
    for (const l of level.lights) {
      const p = new THREE.Vector3(...l.pos);
      if (l.type === 'fire') {
        this.fire = new THREE.PointLight(0xff8a3a, 30, 16, 1.6);
        this.fire.position.copy(p).y += 0.6;
        scene.add(this.fire);
      } else {
        this.lampSpots.push(p);
      }
    }
    for (let i = 0; i < 6; i++) {
      const pl = new THREE.PointLight(0xffa24a, 6, 7, 1.6);
      pl.position.set(0, -100, 0);
      this.lamps.push(pl);
      scene.add(pl);
    }
  }

  /** Wireframe boxes for every level.json collider (debug overlay). */
  colliderDebug(): THREE.Object3D {
    const g = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({ color: 0x00ffff, fog: false, depthTest: false, transparent: true, opacity: 0.7 });
    const box = new THREE.EdgesGeometry(new THREE.BoxGeometry(2, 2, 2));
    for (const c of this.assets.level.colliders) {
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
    return this.assets.heights.height(x, z);
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

    // Nearest lamps.
    this.lampTimer -= dt;
    if (this.lampTimer <= 0) {
      this.lampTimer = 0.5;
      const near = this.lampSpots
        .map((p) => ({ p, d: p.distanceToSquared(focus) }))
        .sort((x, y) => x.d - y.d)
        .slice(0, this.lamps.length);
      this.lamps.forEach((l, i) => {
        const n = near[i];
        if (n && n.d < 60 * 60) l.position.copy(n.p);
        else l.position.set(0, -100, 0);
      });
    }
    const flick = 1 + 0.12 * Math.sin(this.t * 13.1) + 0.08 * Math.sin(this.t * 7.3 + 1.7);
    for (const l of this.lamps) l.intensity = 6 * flick;
    if (this.fire) this.fire.intensity = 30 * (1 + 0.2 * Math.sin(this.t * 9.7) + 0.1 * Math.sin(this.t * 23.1));
    for (const m of this.flameMats) m.emissiveIntensity = 2.5 * flick;
  }

  setFogOffset(depth: number): void {
    const f = this.assets.level.fog;
    this.fog.near = depth + f.near * 0.5;
    this.fog.far = depth + f.far;
  }
}
