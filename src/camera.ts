import * as THREE from 'three';

/**
 * High-angle orthographic follow camera (Shadowrun Returns style), with an
 * optional perspective mode. Yaw can be rotated; movement code reads the
 * screen axes from `forward` / `right`, so W is always screen-up.
 */
export class FollowCamera {
  readonly ortho: THREE.OrthographicCamera;
  readonly persp: THREE.PerspectiveCamera;
  usePerspective = false;

  yaw = THREE.MathUtils.degToRad(-45);
  private yawTarget = this.yaw;
  pitch = THREE.MathUtils.degToRad(48);
  /** Half the visible height in metres (orthographic zoom). */
  zoom = 8.5;
  private zoomTarget = 8.5;
  readonly distance = 140;

  readonly target = new THREE.Vector3();
  readonly forward = new THREE.Vector3(0, 0, -1);
  readonly right = new THREE.Vector3(1, 0, 0);
  private aspect = 1;
  private trauma = 0;
  private shakeT = 0;
  private readonly shake = new THREE.Vector3();
  /** While set, the camera eases toward a close view of the player (pause menu). */
  focus = false;
  private focusK = 0;

  /**
   * True third person (debug option): the perspective camera sits behind the
   * player, the mouse or right stick looks around, the wheel or D-pad zooms.
   * The iso camera's yaw is kept separately so switching back restores it.
   */
  thirdPerson = false;
  /** Third-person look: yaw (camera behind the player looks along -offset) and pitch (+ = looking down). */
  tpYaw = 0;
  tpPitch = 0.28;
  private tpDist = 4.2;
  private tpDistTarget = 4.2;
  private tpAimK = 0;
  /** Over-the-shoulder aim (bow drawn): closer and offset to the right. */
  aiming = false;
  /** Shortens the boom when a wall is between the player and the camera. */
  occlusion: (from: THREE.Vector3, dir: THREE.Vector3, max: number) => number = (_f, _d, max) => max;
  /** Ground height under a point (keeps the camera out of dunes). */
  groundAt: (x: number, z: number) => number = () => -1e9;
  private readonly tpPivot = new THREE.Vector3();

  constructor() {
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1500);
    // Near 1.5 m keeps depth precision for distant coplanar faces (no z-fighting).
    this.persp = new THREE.PerspectiveCamera(40, 1, 1.5, 1800);
  }

  /** Debug/inspection view: a free perspective camera (set from the console). */
  override: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;

  get camera(): THREE.Camera {
    return this.usePerspective || this.thirdPerson || this.override ? this.persp : this.ortho;
  }

  /** Switch the true third-person camera on or off. */
  setThirdPerson(on: boolean): void {
    if (on === this.thirdPerson) return;
    this.thirdPerson = on;
    if (on) {
      // Start looking the way the iso camera faced.
      this.tpYaw = this.yaw;
      this.tpPitch = 0.28;
      this.persp.fov = 60;
      this.persp.near = 0.15;
    } else {
      this.persp.fov = 40;
      this.persp.near = 1.5;
    }
    this.persp.updateProjectionMatrix();
  }

  /** Mouse / right-stick look in third person (radians). */
  look(dYaw: number, dPitch: number): void {
    this.tpYaw += dYaw;
    this.tpPitch = THREE.MathUtils.clamp(this.tpPitch + dPitch, -0.9, 1.25);
  }

  /** World direction the third-person camera looks along (for aiming). */
  aimDirection(out: THREE.Vector3): THREE.Vector3 {
    return this.persp.getWorldDirection(out);
  }

  resize(w: number, h: number): void {
    this.aspect = w / h;
    this.persp.aspect = this.aspect;
    this.persp.updateProjectionMatrix();
    this.applyZoom();
  }

  snap(p: THREE.Vector3): void {
    this.target.copy(p);
  }

  zoomBy(steps: number): void {
    if (this.thirdPerson) {
      this.tpDistTarget = THREE.MathUtils.clamp(this.tpDistTarget * Math.pow(1.12, steps), 1.6, 12);
      return;
    }
    this.zoomTarget = THREE.MathUtils.clamp(this.zoomTarget * Math.pow(1.12, steps), 5, 45);
  }

  /** Screen shake: trauma 0..1, decays quickly; displacement is trauma². */
  addTrauma(t: number): void {
    this.trauma = Math.min(1, this.trauma + t);
  }

  rotateBy(rad: number): void {
    if (this.thirdPerson) {
      this.tpYaw += rad;
      return;
    }
    this.yawTarget += rad;
  }

  private applyZoom(): void {
    const h = THREE.MathUtils.lerp(this.zoom, Math.min(this.zoom, 3.6), this.focusK);
    const o = this.ortho;
    o.left = -h * this.aspect;
    o.right = h * this.aspect;
    o.top = h;
    o.bottom = -h;
    o.updateProjectionMatrix();
  }

  update(dt: number, follow: THREE.Vector3): void {
    // Smooth follow; critically damped-ish exponential.
    const k = 1 - Math.exp(-dt * 7);
    this.target.lerp(follow, k);
    this.yaw += (this.yawTarget - this.yaw) * (1 - Math.exp(-dt * 10));
    this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.exp(-dt * 10));
    this.focusK += ((this.focus ? 1 : 0) - this.focusK) * (1 - Math.exp(-dt * 6));
    this.applyZoom();

    // Shake (real time, so it still plays during hitstop).
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    this.shakeT += dt * 38;
    const amp = this.trauma * this.trauma * 0.45;
    this.shake.set(Math.sin(this.shakeT * 1.13) * amp, Math.sin(this.shakeT * 0.87 + 1.3) * amp * 0.6, Math.sin(this.shakeT * 1.31 + 2.1) * amp);
    const target = this.target.clone().add(this.shake);

    const cp = Math.cos(this.pitch);
    const off = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    this.ortho.position.copy(target).addScaledVector(off, this.distance);
    this.ortho.lookAt(target);

    // Perspective: lower pitch, distance tracks zoom so the framing is similar.
    const pp = THREE.MathUtils.degToRad(38);
    const pd = this.zoom * 2.6;
    const poff = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(pp), Math.sin(pp), Math.cos(this.yaw) * Math.cos(pp));
    this.persp.position.copy(target).addScaledVector(poff, pd);
    this.persp.lookAt(target.x, target.y + 1.2, target.z);

    let yaw = this.yaw;
    if (this.thirdPerson) {
      this.updateThirdPerson(dt, follow);
      yaw = this.tpYaw;
    }

    if (this.override) {
      this.persp.position.copy(this.override.pos);
      this.persp.lookAt(this.override.look);
    }

    this.forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    this.right.set(Math.cos(yaw), 0, -Math.sin(yaw));
  }

  private updateThirdPerson(dt: number, follow: THREE.Vector3): void {
    this.tpDist += (this.tpDistTarget - this.tpDist) * (1 - Math.exp(-dt * 10));
    this.tpAimK += ((this.aiming ? 1 : 0) - this.tpAimK) * (1 - Math.exp(-dt * 12));
    // Pivot: the player's upper chest, followed tightly (no lag on turns).
    const pv = this.tpPivot.copy(follow).add(this.shake);
    pv.y += 0.55;
    const cp = Math.cos(this.tpPitch);
    const back = new THREE.Vector3(Math.sin(this.tpYaw) * cp, Math.sin(this.tpPitch), Math.cos(this.tpYaw) * cp);
    const right = new THREE.Vector3(Math.cos(this.tpYaw), 0, -Math.sin(this.tpYaw));
    // Over the right shoulder; tighter while aiming.
    const shoulder = THREE.MathUtils.lerp(0.55, 0.95, this.tpAimK);
    const dist = THREE.MathUtils.lerp(this.tpDist, Math.min(this.tpDist, 2.8), this.tpAimK);
    const origin = pv.clone().addScaledVector(right, shoulder);
    // Keep the boom out of walls.
    const reach = this.occlusion(origin, back, dist + 0.25);
    const d = Math.max(0.35, Math.min(dist, reach - 0.25));
    const cam = origin.addScaledVector(back, d);
    const g = this.groundAt(cam.x, cam.z) + 0.25;
    if (cam.y < g) cam.y = g;
    this.persp.position.copy(cam);
    // Look past the pivot along the view direction.
    const look = pv.clone().addScaledVector(right, shoulder).addScaledVector(back, -10);
    this.persp.lookAt(look);
  }

  /** Depth of the follow target along the view axis (for fog offsets). */
  get targetDepth(): number {
    if (this.thirdPerson) return this.tpDist;
    return this.usePerspective ? this.zoom * 2.6 : this.distance;
  }
}
