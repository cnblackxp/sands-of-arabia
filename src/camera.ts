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

  constructor() {
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1500);
    this.persp = new THREE.PerspectiveCamera(40, 1, 0.5, 2500);
  }

  get camera(): THREE.Camera {
    return this.usePerspective ? this.persp : this.ortho;
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

  rotateBy(rad: number): void {
    this.yawTarget += rad;
  }

  private applyZoom(): void {
    const h = this.zoom;
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
    this.applyZoom();

    const cp = Math.cos(this.pitch);
    const off = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    this.ortho.position.copy(this.target).addScaledVector(off, this.distance);
    this.ortho.lookAt(this.target);

    // Perspective: lower pitch, distance tracks zoom so the framing is similar.
    const pp = THREE.MathUtils.degToRad(38);
    const pd = this.zoom * 2.6;
    const poff = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(pp), Math.sin(pp), Math.cos(this.yaw) * Math.cos(pp));
    this.persp.position.copy(this.target).addScaledVector(poff, pd);
    this.persp.lookAt(this.target.x, this.target.y + 1.2, this.target.z);

    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  /** Depth of the follow target along the view axis (for fog offsets). */
  get targetDepth(): number {
    return this.usePerspective ? this.zoom * 2.6 : this.distance;
  }
}
