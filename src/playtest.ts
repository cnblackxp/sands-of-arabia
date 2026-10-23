import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HeightField, type LevelData } from './level';
import type { MapAssets, MapEntry } from './world';

/**
 * Combat playtest (`?playtest` in the URL): an empty sand plain with a faint
 * grid, generated in code, where foes are summoned on demand. The real save is
 * never read or written while it runs.
 */
export const PLAYTEST = new URLSearchParams(location.search).has('playtest');

export const PLAYTEST_MAP = 'playtest';

export const playtestEntry: MapEntry = { name: PLAYTEST_MAP, title: 'Combat plain', title_ar: 'سهل القتال', level: '' };

/** What the playtest hotkeys (and the Debug tab) summon: kind, how many, how far ahead. */
export const PLAYTEST_FOES: { key: string; kind: string; n: number; dist: number }[] = [
  { key: 'Digit1', kind: 'raider', n: 1, dist: 8 },
  { key: 'Digit2', kind: 'skirmisher', n: 1, dist: 8 },
  { key: 'Digit3', kind: 'brute', n: 1, dist: 9 },
  { key: 'Digit4', kind: 'chief', n: 1, dist: 10 },
  { key: 'Digit5', kind: 'clubman', n: 1, dist: 9 },
  { key: 'Digit6', kind: 'hound', n: 2, dist: 12 },
  { key: 'Digit7', kind: 'archer', n: 1, dist: 18 },
  { key: 'Digit8', kind: 'dummy', n: 1, dist: 4 },
];

const SIZE = 160;

/** The plain: flat sand with a faint 2 m grid (to judge speed and distance) and a darker ring every 10 m. */
function plainScene(): THREE.Group {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d9b98a';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(120, 80, 40, 0.22)';
  g.lineWidth = 2;
  for (let i = 0; i <= 5; i++) {
    const v = (i * 256) / 5;
    g.beginPath();
    g.moveTo(v, 0);
    g.lineTo(v, 256);
    g.moveTo(0, v);
    g.lineTo(256, v);
    g.stroke();
  }
  g.strokeStyle = 'rgba(110, 70, 30, 0.45)';
  g.lineWidth = 4;
  g.strokeRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(SIZE / 10, SIZE / 10);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.name = 'PlaytestGround';
  const scene = new THREE.Group();
  scene.add(ground);
  return scene;
}

/** The plain as a map, in the shared level schema (no files to fetch). */
export function playtestMap(): MapAssets {
  const half = SIZE / 2;
  const level: LevelData = {
    name: PLAYTEST_MAP,
    title: playtestEntry.title,
    terrain: '',
    town: '',
    bounds: { x: [-half + 2, half - 2], z: [-half + 2, half - 2] },
    heights: { file: '', cols: 2, rows: 2, step: SIZE, x0: -half, z0: -half },
    sun: { direction_to_sun: [0.5, 0.6, 0.45], color: '#fff1d8', elevation_deg: 40 },
    fog: { color: '#e8d2a8', near: 120, far: 420 },
    colliders: [],
    spawns: [{ role: 'player', pos: [0, 0, 0], yaw: 0 }],
    lights: [],
    paths: {},
    landmarks: {},
    exits: [],
  } as unknown as LevelData;
  const heights = new HeightField(new Float32Array(4), level.heights);
  const wrap = (scene: THREE.Group) => ({ scene, scenes: [scene], animations: [], cameras: [], asset: {}, parser: null, userData: {} }) as unknown as GLTF;
  return { name: PLAYTEST_MAP, level, heights, terrain: wrap(plainScene()), town: wrap(new THREE.Group()), backdrop: null, backdropGround: null, dressing: null };
}
