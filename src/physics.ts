import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { BoxCollider } from './level';

export type Rapier = typeof RAPIER;

// Collision groups: (membership << 16) | filter.
const G_STATIC = 0x0001;
const G_ACTOR = 0x0002; // NPCs, idle mounts
const G_PLAYER = 0x0004;
export const GROUP_STATIC = (G_STATIC << 16) | 0xffff;
export const GROUP_ACTOR = (G_ACTOR << 16) | G_PLAYER;
export const GROUP_PLAYER = (G_PLAYER << 16) | (G_STATIC | G_ACTOR);

/** A capsule moved by Rapier's kinematic character controller. */
/** How high the feet can step up onto a box without jumping, and how far down
 *  they follow the floor before it counts as a fall. */
export const STEP_UP = 0.42;
export const STEP_DOWN = 0.5;
/** Box tags that are never stood on (a palm trunk top, the pool surface). */
const NOT_FLOOR = new Set(['water', 'palm', 'tree']);

interface FloorBox {
  x: number;
  z: number;
  hx: number;
  hz: number;
  c: number;
  s: number;
  top: number;
}

export class Mover {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  /** Feet position (bottom of the capsule). */
  readonly feet = new THREE.Vector3();

  constructor(
    private phys: Physics,
    readonly radius: number,
    readonly halfHeight: number,
    feet: THREE.Vector3,
  ) {
    const R = phys.R;
    this.body = phys.world.createRigidBody(
      R.RigidBodyDesc.kinematicPositionBased().setTranslation(feet.x, feet.y + this.centerOffset, feet.z),
    );
    this.collider = phys.world.createCollider(
      R.ColliderDesc.capsule(halfHeight, radius).setCollisionGroups(GROUP_PLAYER),
      this.body,
    );
    this.feet.copy(feet);
  }

  get centerOffset(): number {
    return this.halfHeight + this.radius;
  }

  /**
   * Move by a horizontal displacement. Rapier resolves collisions against the
   * level boxes and actors only; height comes from the heightfield and the tops
   * of boxes. Keeping the terrain out of the sweep means slopes can never push
   * the character sideways, so on open ground the step is exactly the requested
   * direction.
   *
   * Boxes whose top is within a step of the feet are left out of the sweep so the
   * character can walk (or land) onto them; `support()` then lifts them up.
   *
   * `airY` = absolute feet height while airborne (no ground snapping). Grounded
   * moves follow the floor, but report `falling` instead of snapping down a drop
   * larger than a step, so the caller can switch to a fall.
   */
  move(dx: number, dz: number, airY: number | null = null, exclude?: RAPIER.Collider): { x: number; z: number; falling: boolean } {
    const ctl = this.phys.controller;
    const feetY = airY ?? this.feet.y;
    const phys = this.phys;
    ctl.computeColliderMovement(
      this.collider,
      { x: dx, y: 0, z: dz },
      phys.R.QueryFilterFlags.EXCLUDE_SENSORS,
      GROUP_PLAYER,
      (c) => {
        if (exclude && c.handle === exclude.handle) return false;
        const top = phys.boxTops.get(c.handle);
        return top === undefined || top > feetY + STEP_UP;
      },
    );
    const m = ctl.computedMovement();
    const t = this.body.translation();
    const b = phys.bounds;
    let nx = THREE.MathUtils.clamp(t.x + m.x, b.x[0], b.x[1]);
    let nz = THREE.MathUtils.clamp(t.z + m.z, b.z[0], b.z[1]);
    // Deep water is a wall (slide along the shore).
    if (airY === null && phys.deepWater(nx, nz)) {
      if (!phys.deepWater(nx, t.z)) nz = t.z;
      else if (!phys.deepWater(t.x, nz)) nx = t.x;
      else {
        nx = t.x;
        nz = t.z;
      }
    }
    let y: number;
    let falling = false;
    if (airY !== null) {
      y = airY;
    } else {
      const floor = phys.support(nx, nz, feetY);
      if (floor < feetY - STEP_DOWN) {
        // Walked off a ledge: hold height this frame, the caller starts a fall.
        y = feetY;
        falling = true;
      } else {
        y = floor;
      }
    }
    this.body.setTranslation({ x: nx, y: y + this.centerOffset, z: nz }, true);
    this.feet.set(nx, y, nz);
    return { x: nx - t.x, z: nz - t.z, falling };
  }

  teleport(feet: THREE.Vector3): void {
    this.body.setTranslation({ x: feet.x, y: feet.y + this.centerOffset, z: feet.z }, true);
    this.feet.copy(feet);
  }

  setEnabled(on: boolean): void {
    this.collider.setEnabled(on);
  }
}

export class Physics {
  world!: RAPIER.World;
  controller!: RAPIER.KinematicCharacterController;
  R: Rapier = RAPIER;
  groundAt: (x: number, z: number) => number = () => 0;
  /** True where water is too deep to wade (set by the world when a map has water). */
  deepWater: (x: number, z: number) => boolean = () => false;
  bounds = { x: [-200, 200] as [number, number], z: [-250, 150] as [number, number] };
  /** Collider handle → world height of its top, for every level box. */
  readonly boxTops = new Map<number, number>();
  private floors = new Map<number, FloorBox[]>();
  private static readonly CELL = 8;

  private static ready: Promise<void> | null = null;

  async init(): Promise<void> {
    Physics.ready ??= RAPIER.init();
    await Physics.ready;
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    const ctl = this.world.createCharacterController(0.03);
    ctl.setApplyImpulsesToDynamicBodies(false);
    ctl.setSlideEnabled(true);
    this.controller = ctl;
  }

  addBoxes(boxes: BoxCollider[]): void {
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const C = Physics.CELL;
    for (const b of boxes) {
      q.setFromAxisAngle(up, b.yaw);
      const col = this.world.createCollider(
        this.R.ColliderDesc.cuboid(b.half[0], b.half[1], b.half[2])
          .setTranslation(b.pos[0], b.pos[1], b.pos[2])
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
          .setCollisionGroups(GROUP_STATIC),
      );
      const top = b.pos[1] + b.half[1];
      if (NOT_FLOOR.has(b.tag)) continue;
      this.boxTops.set(col.handle, top);
      // Spatial hash of walkable tops for support() queries.
      const fb: FloorBox = { x: b.pos[0], z: b.pos[2], hx: b.half[0], hz: b.half[2], c: Math.cos(b.yaw), s: Math.sin(b.yaw), top };
      const r = Math.hypot(b.half[0], b.half[2]);
      for (let cx = Math.floor((fb.x - r) / C); cx <= Math.floor((fb.x + r) / C); cx++) {
        for (let cz = Math.floor((fb.z - r) / C); cz <= Math.floor((fb.z + r) / C); cz++) {
          const key = cx * 100003 + cz;
          let list = this.floors.get(key);
          if (!list) this.floors.set(key, (list = []));
          list.push(fb);
        }
      }
    }
  }

  /**
   * Floor height at (x, z) for feet currently at `feetY`: the heightfield, or the
   * highest box top under the point that is no more than a step above the feet.
   */
  support(x: number, z: number, feetY: number, pad = 0.22): number {
    let best = this.groundAt(x, z);
    const C = Physics.CELL;
    const list = this.floors.get(Math.floor(x / C) * 100003 + Math.floor(z / C));
    if (!list) return best;
    for (const b of list) {
      if (b.top <= best || b.top > feetY + STEP_UP) continue;
      const dx = x - b.x;
      const dz = z - b.z;
      const lx = dx * b.c - dz * b.s;
      const lz = dx * b.s + dz * b.c;
      if (Math.abs(lx) < b.hx + pad && Math.abs(lz) < b.hz + pad) best = b.top;
    }
    return best;
  }

  /** A body-less capsule for an NPC or animal, moved with setTranslation. */
  addActor(radius: number, halfHeight: number, at: THREE.Vector3): RAPIER.Collider {
    return this.world.createCollider(
      this.R.ColliderDesc.capsule(halfHeight, radius)
        .setTranslation(at.x, at.y + halfHeight + radius, at.z)
        .setCollisionGroups(GROUP_ACTOR),
    );
  }

  /**
   * Distance along a ray to the first level box (static colliders only), or
   * `max` if nothing is hit. `dir` must be normalised.
   */
  rayStatic(from: THREE.Vector3, dir: THREE.Vector3, max: number): number {
    const R = this.R;
    const ray = new R.Ray({ x: from.x, y: from.y, z: from.z }, { x: dir.x, y: dir.y, z: dir.z });
    // Query groups: member of everything, filter = static boxes.
    const hit = this.world.castRay(ray, max, true, undefined, (0xffff << 16) | G_STATIC);
    return hit ? hit.timeOfImpact : max;
  }

  step(): void {
    this.world.step();
  }
}
