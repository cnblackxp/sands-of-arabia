import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Animator, ClipLibrary } from './animator';

/** Clip ground speeds from the manifest (m/s at timeScale 1). */
export const CLIP_SPEED = {
  personWalk: 1.5,
  personRun: 4.8,
  horseWalk: 1.7,
  horseGallop: 9,
  camelWalk: 1.8,
  camelRun: 6,
};

/**
 * Person accessory parts (see the manifest). Any part of a model other than
 * `Body` is hidden unless explicitly chosen, so newly exported accessories
 * never show up on everyone by accident.
 */
export type Accessory =
  | 'Beard'
  | 'BeardLong'
  | 'Belly'
  | 'Bow'
  | 'Cloak'
  | 'FaceWrap'
  | 'Hair'
  | 'Headband'
  | 'Helmet'
  | 'Jar'
  | 'Keffiyeh'
  | 'Lamellar'
  | 'Shield'
  | 'Spear'
  | 'Sword'
  | 'Turban'
  | 'Veil'
  | 'Vest'
  | 'Waterskin';

const PERSON_LOWER = ['root', 'hips', 'leg_L', 'leg_R'];

export interface Rig {
  root: THREE.Object3D;
  anim: Animator;
  bones: Map<string, THREE.Bone>;
}

/**
 * Bakes every visible SkinnedMesh of a cloned rig into one SkinnedMesh with
 * per-vertex colours (one draw group for cloth/skin, one for metal), so each
 * character costs one or two draw calls instead of nine.
 */
function mergeRig(
  root: THREE.Object3D,
  colourOf: (m: THREE.MeshStandardMaterial) => THREE.Color,
  mats: [THREE.Material, THREE.Material],
  bounds: THREE.Sphere,
): void {
  root.updateMatrixWorld(true);
  const all: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) all.push(o as THREE.SkinnedMesh);
  });
  const visible = all.filter((m) => {
    for (let o: THREE.Object3D | null = m; o && o !== root; o = o.parent) if (!o.visible) return false;
    return true;
  });
  const skeleton = visible[0].skeleton;
  const bind = visible[0].bindMatrix.clone();
  const bindInv = bind.clone().invert();

  const groups = [0, 1].map(() => ({ pos: [] as number[], nrm: [] as number[], col: [] as number[], si: [] as number[], sw: [] as number[], idx: [] as number[] }));
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const xf = new THREE.Matrix4();
  const nm = new THREE.Matrix3();
  for (const part of visible) {
    const mat = part.material as THREE.MeshStandardMaterial;
    const g = groups[mat.metalness > 0.3 ? 1 : 0];
    const c = colourOf(mat);
    xf.multiplyMatrices(bindInv, part.bindMatrix);
    nm.getNormalMatrix(xf);
    const geo = part.geometry;
    const P = geo.getAttribute('position');
    const N = geo.getAttribute('normal');
    const SI = geo.getAttribute('skinIndex');
    const SW = geo.getAttribute('skinWeight');
    // Map this part's joint indices onto the shared skeleton's bone order.
    const remap = part.skeleton.bones.map((bn) => skeleton.bones.indexOf(bn));
    const base = g.pos.length / 3;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(xf);
      n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      g.pos.push(v.x, v.y, v.z);
      g.nrm.push(n.x, n.y, n.z);
      g.col.push(c.r, c.g, c.b);
      g.si.push(remap[SI.getX(i)], remap[SI.getY(i)], remap[SI.getZ(i)], remap[SI.getW(i)]);
      g.sw.push(SW.getX(i), SW.getY(i), SW.getZ(i), SW.getW(i));
    }
    const I = geo.getIndex();
    if (I) for (let i = 0; i < I.count; i++) g.idx.push(base + I.getX(i));
    else for (let i = 0; i < P.count; i++) g.idx.push(base + i);
  }
  const geo = new THREE.BufferGeometry();
  const cat = (k: 'pos' | 'nrm' | 'col' | 'si' | 'sw') => groups[0][k].concat(groups[1][k]);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(cat('pos'), 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(cat('nrm'), 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cat('col'), 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(cat('si'), 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(cat('sw'), 4));
  const off = groups[0].pos.length / 3;
  geo.setIndex(groups[0].idx.concat(groups[1].idx.map((i) => i + off)));
  geo.addGroup(0, groups[0].idx.length, 0);
  if (groups[1].idx.length) geo.addGroup(groups[0].idx.length, groups[1].idx.length, 1);
  geo.boundingSphere = bounds.clone();

  for (const m of all) m.removeFromParent();
  const mesh = new THREE.SkinnedMesh(geo, mats);
  mesh.name = 'Merged';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.bind(skeleton, bind);
  // Culling sphere in the rig's local space, big enough for Death / gallop poses.
  mesh.boundingSphere = bounds.clone();
  root.add(mesh);
}

export class CharacterFactory {
  private mats: [THREE.Material, THREE.Material] = [
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 }),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.8 }),
  ];
  private personLib: ClipLibrary;
  private horseLib: ClipLibrary;
  private camelLib: ClipLibrary;

  constructor(
    private person: GLTF,
    private horse: GLTF,
    private camel: GLTF,
  ) {
    this.personLib = new ClipLibrary(person.animations, ['Attack', 'Attack2', 'Talk', 'Hit'], PERSON_LOWER, ['Death', 'Roll', 'Jump']);
    this.horseLib = new ClipLibrary(horse.animations, [], null, ['Rear']);
    this.camelLib = new ClipLibrary(camel.animations, [], null, []);
  }

  private build(
    src: GLTF,
    lib: ClipLibrary,
    colours: Record<string, number>,
    show: Set<string>,
    bounds: THREE.Sphere,
  ): Rig {
    const root = SkeletonUtils.clone(src.scene);
    const bones = new Map<string, THREE.Bone>();
    root.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones.set(o.name, o as THREE.Bone);
      // Multi-material meshes load as a Group of SkinnedMeshes named after the part.
      // Parts are the direct children of the model node (a mesh, or a Group of
      // per-material meshes); everything but Body is opt-in.
      if (o.parent?.parent === root && o.name !== 'Body' && !(o as THREE.Bone).isBone && o.name !== 'root') o.visible = show.has(o.name);
    });
    const colourOf = (m: THREE.MeshStandardMaterial) => {
      const hex = colours[m.name];
      return hex === undefined ? m.color : new THREE.Color(hex);
    };
    mergeRig(root, colourOf, this.mats, bounds);
    return { root, anim: new Animator(root, lib), bones };
  }

  createPerson(accessories: Iterable<Accessory>, colours: Record<string, number>, scale = 1): Rig {
    const rig = this.build(this.person, this.personLib, colours, new Set<string>(accessories), new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.7));
    if (scale !== 1) rig.root.scale.setScalar(scale);
    return rig;
  }

  createHorse(colours: Record<string, number>, saddle: boolean): Rig {
    return this.build(this.horse, this.horseLib, colours, new Set(saddle ? ['Saddle'] : []), new THREE.Sphere(new THREE.Vector3(0, 1.2, 0), 2.4));
  }

  createCamel(colours: Record<string, number>, saddle: boolean, cargo: boolean): Rig {
    const show = new Set<string>();
    if (saddle) show.add('Saddle');
    if (cargo) show.add('Cargo');
    return this.build(this.camel, this.camelLib, colours, show, new THREE.Sphere(new THREE.Vector3(0, 1.4, 0), 2.6));
  }
}

// --- Player looks ------------------------------------------------------------

export interface Look {
  name: string;
  acc: Accessory[];
  colours: Record<string, number>;
}

export const PLAYER_LOOKS: Look[] = [
  { name: 'Wanderer', acc: ['Keffiyeh', 'Beard', 'Sword'], colours: { P_Robe: 0xf1ece0, P_Sash: 0xb3312b, P_Wrap: 0xf3eee2, P_Skin: 0xb17a50, P_Pants: 0x5a3f2c } },
  { name: 'Desert Guard', acc: ['Turban', 'Beard', 'Sword'], colours: { P_Robe: 0x2c3e73, P_Sash: 0xd6a531, P_Wrap: 0xb3312b, P_Skin: 0x9a6440, P_Pants: 0x3d3128 } },
  { name: 'Huntress', acc: ['Veil', 'Sword'], colours: { P_Robe: 0x5b2d6e, P_Sash: 0xd6a531, P_Wrap: 0x2b2622, P_Skin: 0xc98e62, P_Pants: 0x2f2a26 } },
  { name: 'Young Poet', acc: ['Hair', 'Sword'], colours: { P_Robe: 0xc9902e, P_Sash: 0x2f6d4f, P_Hair: 0x1d1612, P_Skin: 0xd9a57a, P_Pants: 0x7a6450 } },
  { name: 'Priest of the Stone', acc: ['Turban', 'Beard', 'Sword'], colours: { P_Robe: 0xf4f0e6, P_Sash: 0x8a5a2b, P_Wrap: 0xf4f0e6, P_Skin: 0xb17a50, P_Hair: 0x8f8a82, P_Pants: 0xa08a6b } },
  { name: 'Black Rider', acc: ['Keffiyeh', 'Beard', 'Sword'], colours: { P_Robe: 0x2b2622, P_Sash: 0x7b2a24, P_Wrap: 0x2b2622, P_Skin: 0x7d4f31, P_Pants: 0x2f2a26 } },
];

// --- Palettes -------------------------------------------------------------

export const PAL = {
  robe: [0xf1ece0, 0xe9dfc8, 0xd8c7a2, 0x2c3e73, 0x7b2a24, 0xc9902e, 0x6b4a32, 0x3b3530, 0x4f6b4a, 0x9a3d22, 0xb8a48a],
  sash: [0xb3312b, 0x1f3f8a, 0xd6a531, 0x2f6d4f, 0x5b2d6e, 0x8a5a2b, 0xe8e0cc],
  pants: [0x5a3f2c, 0x3d3128, 0x7a6450, 0x2f2a26, 0xa08a6b],
  skin: [0xc98e62, 0xb17a50, 0x9a6440, 0x7d4f31, 0xd9a57a],
  wrap: [0xf3eee2, 0xe5dcc8, 0xb3312b, 0x1f3f8a, 0x2b2622, 0xc9902e, 0x6d2f5e],
  hair: [0x1d1612, 0x2e221a, 0x4a3a2c, 0x8f8a82],
  horseCoat: [0x6e3b1f, 0x4a2a17, 0x2a1d17, 0xb98a5a, 0xd9cfc0, 0x8a5a33],
  horseMane: [0x1c1410, 0x2e1f15, 0xe8e0d0, 0x5a3a22],
  blanket: [0xb3312b, 0x1f3f8a, 0x2f6d4f, 0x5b2d6e],
};

export function pick<T>(arr: readonly T[], rnd: () => number = Math.random): T {
  return arr[Math.floor(rnd() * arr.length)];
}
