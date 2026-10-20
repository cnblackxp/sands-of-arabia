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
   * level boxes and actors only; height comes from the heightfield. Keeping the
   * terrain out of the sweep means slopes can never push the character sideways,
   * so on open ground the step is exactly the requested direction.
   */
  move(dx: number, dz: number, lift = 0, exclude?: RAPIER.Collider): { x: number; z: number } {
    const ctl = this.phys.controller;
    ctl.computeColliderMovement(
      this.collider,
      { x: dx, y: 0, z: dz },
      this.phys.R.QueryFilterFlags.EXCLUDE_SENSORS,
      GROUP_PLAYER,
      exclude ? (c) => c.handle !== exclude.handle : undefined,
    );
    const m = ctl.computedMovement();
    const t = this.body.translation();
    const b = this.phys.bounds;
    const nx = THREE.MathUtils.clamp(t.x + m.x, b.x[0], b.x[1]);
    const nz = THREE.MathUtils.clamp(t.z + m.z, b.z[0], b.z[1]);
    const gy = this.phys.groundAt(nx, nz);
    this.body.setTranslation({ x: nx, y: gy + lift + this.centerOffset, z: nz }, true);
    this.feet.set(nx, gy + lift, nz);
    return { x: nx - t.x, z: nz - t.z };
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
  bounds = { x: [-200, 200] as [number, number], z: [-250, 150] as [number, number] };

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
    for (const b of boxes) {
      q.setFromAxisAngle(up, b.yaw);
      this.world.createCollider(
        this.R.ColliderDesc.cuboid(b.half[0], b.half[1], b.half[2])
          .setTranslation(b.pos[0], b.pos[1], b.pos[2])
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
          .setCollisionGroups(GROUP_STATIC),
      );
    }
  }

  /** A body-less capsule for an NPC or animal, moved with setTranslation. */
  addActor(radius: number, halfHeight: number, at: THREE.Vector3): RAPIER.Collider {
    return this.world.createCollider(
      this.R.ColliderDesc.capsule(halfHeight, radius)
        .setTranslation(at.x, at.y + halfHeight + radius, at.z)
        .setCollisionGroups(GROUP_ACTOR),
    );
  }

  step(): void {
    this.world.step();
  }
}
