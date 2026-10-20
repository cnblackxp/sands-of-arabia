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

  constructor() {
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1500);
    this.persp = new THREE.PerspectiveCamera(40, 1, 0.5, 2500);
  }

  /** Debug/inspection view: a free perspective camera (set from the console). */
  override: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;

  get camera(): THREE.Camera {
    return this.usePerspective || this.override ? this.persp : this.ortho;
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
    this.zoomTarget = THREE.MathUtils.clamp(this.zoomTarget * Math.pow(1.12, steps), 5, 45);
  }

  /** Screen shake: trauma 0..1, decays quickly; displacement is trauma². */
  addTrauma(t: number): void {
    this.trauma = Math.min(1, this.trauma + t);
  }

  rotateBy(rad: number): void {
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

    if (this.override) {
      this.persp.position.copy(this.override.pos);
      this.persp.lookAt(this.override.look);
    }

    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  /** Depth of the follow target along the view axis (for fog offsets). */
  get targetDepth(): number {
    return this.usePerspective ? this.zoom * 2.6 : this.distance;
  }
}
