/**
 * Keyboard, mouse and gamepad input merged into one per-frame snapshot.
 * The last device that produced input becomes `device`, which drives every
 * on-screen prompt.
 *
 * Gamepad (standard mapping), Elden Ring style:
 *   L-stick move · B tap = roll, B hold = sprint (or L3) · RT attack (RB too)
 *   LT hold = block / aim a bow (LB too) · X = healing draught · A jump / confirm · Y interact
 *   Start menu · View map · R-stick camera · LB/RB switch menu tabs
 * Keyboard: WASD · Shift sprint · LMB attack · RMB block · Space roll · F jump
 *   E interact · R heal · Tab inventory · M map · Esc menu · Z/C or middle-mouse drag rotate camera
 *   D-pad up/down zoom, left/right rotate (D-pad navigates menus)
 * True third person (debug camera): mouse (pointer lock) or right stick looks
 *   around, wheel or D-pad up/down zooms. With a bow, block (RMB / LT) aims and
 *   attack (LMB / RT) looses the arrow.
 */

export type Device = 'keyboard' | 'gamepad';

export interface Frame {
  /** Screen-relative move: x = right, y = up (W). Length is 0..1. */
  moveX: number;
  moveY: number;
  run: boolean;
  attack: boolean;
  dodge: boolean;
  jump: boolean;
  /** Jump button still held (variable jump height). */
  jumpHeld: boolean;
  /** Shield held up. */
  block: boolean;
  heal: boolean;
  /** Open the menu on the inventory / map tab. */
  inventory: boolean;
  /** Menu tab switching: -1 / +1. */
  tab: number;
  /** Talk / mount / dismount, whichever is in reach. */
  interact: boolean;
  /** Back / leave dialogue (Esc, B). */
  cancel: boolean;
  pause: boolean;
  map: boolean;
  zoom: number;
  rotate: number;
  /** Third-person look this frame, radians: yaw (+ = turn left) and pitch (+ = look down). */
  lookYaw: number;
  lookPitch: number;
  /** Mouse position in normalised device coordinates (-1..1, y up). */
  mouseX: number;
  mouseY: number;
  // Menu navigation (edge-triggered with auto-repeat).
  navX: number;
  navY: number;
  confirm: boolean;
  device: Device;
}

const DEAD = 0.2;
const SPRINT_HOLD = 0.28;

export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private wheel = 0;
  private mouseAttack = false;
  private mouseBlock = false;
  /** Middle mouse held: horizontal drag rotates the camera. */
  private mmbDrag = false;
  private dragX = 0;
  private padPrev: boolean[] = [];
  private runToggle = false;
  private bHeld = -1;
  private navHold = { x: 0, y: 0, t: 0 };
  device: Device = 'keyboard';
  /** Set by the game: the true third-person camera is active (changes stick and mouse mapping). */
  thirdPerson = false;
  /** Mouse-look sensitivity (radians per pixel) and right-stick look speed (radians per second). */
  mouseSens = 0.0026;
  stickSens = 2.6;
  invertY = false;
  private lookDX = 0;
  private lookDY = 0;
  private mouseNX = 0;
  private mouseNY = 0;
  /**
   * A left click that asked for the pointer lock is held back: if the lock is
   * granted it only captured the mouse; if the browser refuses (or says
   * nothing within a moment) it counts as a normal attack.
   */
  private pendingClick = 0;
  /** Called on the first user gesture of any kind (used to unlock audio). */
  onGesture: () => void = () => {};

  constructor(canvas: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      this.onGesture();
      this.device = 'keyboard';
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    // A release the page never saw (focus lost, pointer-lock change, button let go
    // outside the window) must not leave a key or button held.
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => this.releaseAll());
    document.addEventListener('pointerlockchange', () => this.releaseAll(true));
    window.addEventListener('mousemove', () => {
      this.device = 'keyboard';
    });
    canvas.addEventListener('mousedown', (e) => {
      this.onGesture();
      if (this.thirdPerson && document.pointerLockElement !== canvas) {
        // First click in third person captures the mouse for looking around.
        try {
          canvas.requestPointerLock?.()?.catch?.(() => this.releaseClick());
        } catch {
          // Pointer lock unsupported here: plain mouse look still works.
        }
        if (e.button === 0) {
          this.pendingClick = performance.now();
          setTimeout(() => this.releaseClick(), 250);
        }
      } else if (e.button === 0) this.mouseAttack = true;
      if (e.button === 2) this.mouseBlock = true;
      if (e.button === 1) {
        this.mmbDrag = true;
        e.preventDefault(); // no browser auto-scroll
      }
      this.device = 'keyboard';
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.mouseBlock = false;
      if (e.button === 1) this.mmbDrag = false;
    });
    window.addEventListener('mousemove', (e) => {
      // `buttons` is the truth: drop a held button whose mouseup went missing.
      if (this.mouseBlock && !(e.buttons & 2)) this.mouseBlock = false;
      if (this.mmbDrag && !(e.buttons & 4)) this.mmbDrag = false;
      if (this.mmbDrag) this.dragX += e.movementX;
      if (this.thirdPerson) {
        this.lookDX += e.movementX;
        this.lookDY += e.movementY;
      }
      this.mouseNX = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouseNY = -(e.clientY / window.innerHeight) * 2 + 1;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // Lock granted: that click only captured the mouse. Refused: it was an attack.
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === canvas) this.pendingClick = 0;
    });
    document.addEventListener('pointerlockerror', () => this.releaseClick());
    canvas.addEventListener(
      'wheel',
      (e) => {
        this.wheel += Math.sign(e.deltaY);
        e.preventDefault();
      },
      { passive: false },
    );
  }

  /** Forget everything held (keys always; mouse buttons unless only the lock changed). */
  private releaseAll(keepMouse = false): void {
    this.keys.clear();
    if (keepMouse) return;
    this.mouseBlock = false;
    this.mmbDrag = false;
  }

  /** The held-back click counts after all (no pointer lock came of it). */
  private releaseClick(): void {
    if (!this.pendingClick) return;
    this.pendingClick = 0;
    this.mouseAttack = true;
  }

  /**
   * Forget buttons that are mid-press (a menu or dialogue just closed), so the
   * release of the B that closed it doesn't also fire a dodge roll.
   */
  cancelHolds(): void {
    this.bHeld = -2;
    this.pressed.clear();
    this.mouseAttack = false;
    this.pendingClick = 0;
  }

  read(dt: number): Frame {
    const k = this.keys;
    const p = this.pressed;
    let mx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let my = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const kl = Math.hypot(mx, my);
    if (kl > 1) {
      mx /= kl;
      my /= kl;
    }
    const f: Frame = {
      moveX: mx,
      moveY: my,
      run: k.has('ShiftLeft') || k.has('ShiftRight'),
      attack: this.mouseAttack || p.has('KeyJ'),
      dodge: p.has('Space'),
      jump: p.has('KeyF'),
      jumpHeld: k.has('KeyF'),
      block: this.mouseBlock,
      heal: p.has('KeyR'),
      inventory: p.has('Tab'),
      tab: (p.has('BracketRight') || (p.has('Tab') && !k.has('ShiftLeft')) ? 1 : 0) - (p.has('BracketLeft') || (p.has('Tab') && k.has('ShiftLeft')) ? 1 : 0),
      interact: p.has('KeyE'),
      cancel: p.has('Escape') || p.has('Backspace'),
      pause: p.has('Escape') || p.has('KeyP'),
      map: p.has('KeyM'),
      zoom: this.wheel,
      rotate: ((k.has('KeyZ') ? 1 : 0) - (k.has('KeyC') ? 1 : 0)) * 1.6 * dt - this.dragX * 0.006,
      lookYaw: -this.lookDX * this.mouseSens,
      lookPitch: this.lookDY * this.mouseSens * (this.invertY ? -1 : 1),
      mouseX: this.mouseNX,
      mouseY: this.mouseNY,
      navX: (p.has('KeyD') || p.has('ArrowRight') ? 1 : 0) - (p.has('KeyA') || p.has('ArrowLeft') ? 1 : 0),
      navY: (p.has('KeyS') || p.has('ArrowDown') ? 1 : 0) - (p.has('KeyW') || p.has('ArrowUp') ? 1 : 0),
      confirm: p.has('Enter') || p.has('Space') || p.has('KeyE'),
      device: this.device,
    };
    this.pressed.clear();
    this.wheel = 0;
    this.dragX = 0;
    this.lookDX = 0;
    this.lookDY = 0;
    this.mouseAttack = false;

    this.readPad(f, dt);
    f.device = this.device;
    return f;
  }

  private readPad(f: Frame, dt: number): void {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = Array.from(pads).find((g) => g && g.connected);
    if (!gp) return;
    const b = (i: number) => !!gp.buttons[i]?.pressed;
    const edge = (i: number) => b(i) && !this.padPrev[i];
    const ax = (i: number) => gp.axes[i] ?? 0;

    let lx = ax(0);
    let ly = -ax(1);
    const mag = Math.hypot(lx, ly);
    let active = false;
    if (mag > DEAD) {
      // Rescale so the dead-zone edge maps to 0, with a gentle curve.
      const m = Math.min(1, (mag - DEAD) / (1 - DEAD));
      const s = Math.pow(m, 0.8) / mag;
      lx *= s;
      ly *= s;
      f.moveX = lx;
      f.moveY = ly;
      active = true;
    }

    // B: tap = roll, hold = sprint.
    if (b(1)) {
      // -2: this press belongs to a menu that just closed; ignore until released.
      if (this.bHeld === -2) {
        // swallow
      } else if (this.bHeld < 0) this.bHeld = 0;
      else this.bHeld += dt;
      if (this.bHeld > SPRINT_HOLD) f.run = true;
    } else if (this.bHeld >= 0) {
      if (this.bHeld <= SPRINT_HOLD) f.dodge = true;
      this.bHeld = -1;
    } else {
      this.bHeld = -1;
    }
    if (edge(10)) this.runToggle = !this.runToggle;
    if (mag < DEAD) this.runToggle = false;
    if (this.runToggle) f.run = true;

    // Triggers: RT attacks (looses an arrow), LT blocks (draws and aims a bow). The bumpers do the same.
    if (edge(7) || edge(5)) f.attack = true;
    if (edge(2)) f.heal = true;
    if (b(4) || b(6) || (gp.buttons[6]?.value ?? 0) > 0.3) f.block = true;
    if (edge(4)) f.tab -= 1;
    if (edge(5)) f.tab += 1;
    if (edge(0)) {
      f.jump = true;
      f.confirm = true;
    }
    if (b(0)) f.jumpHeld = true;
    if (edge(3)) f.interact = true;
    if (edge(1)) f.cancel = true;
    if (edge(9)) f.pause = true;
    if (edge(8)) f.map = true;

    const rx = ax(2);
    const ry = ax(3);
    if (this.thirdPerson) {
      // Right stick looks around (both axes); zoom moves to the D-pad below.
      const curve = (v: number) => Math.sign(v) * Math.pow(Math.min(1, (Math.abs(v) - DEAD) / (1 - DEAD)), 1.6);
      if (Math.abs(rx) > DEAD) {
        f.lookYaw -= curve(rx) * this.stickSens * dt;
        active = true;
      }
      if (Math.abs(ry) > DEAD) {
        f.lookPitch += curve(ry) * this.stickSens * 0.7 * dt * (this.invertY ? -1 : 1);
        active = true;
      }
    } else {
      if (Math.abs(rx) > DEAD) {
        f.rotate -= rx * 2.2 * dt;
        active = true;
      }
      if (Math.abs(ry) > DEAD) {
        f.zoom += ry * 6 * dt;
        active = true;
      }
    }
    if (b(12)) f.zoom -= 4 * dt;
    if (b(13)) f.zoom += 4 * dt;
    if (b(14)) f.rotate += 1.6 * dt;
    if (b(15)) f.rotate -= 1.6 * dt;

    // Menu navigation from D-pad or stick, with auto-repeat.
    const nx = b(15) || ax(0) > 0.6 ? 1 : b(14) || ax(0) < -0.6 ? -1 : 0;
    const ny = b(13) || ax(1) > 0.6 ? 1 : b(12) || ax(1) < -0.6 ? -1 : 0;
    const h = this.navHold;
    if (nx !== h.x || ny !== h.y) {
      h.x = nx;
      h.y = ny;
      h.t = 0.38;
      if (nx) f.navX = nx;
      if (ny) f.navY = ny;
    } else if (nx || ny) {
      h.t -= dt;
      if (h.t <= 0) {
        h.t = 0.11;
        if (nx) f.navX = nx;
        if (ny) f.navY = ny;
      }
    }

    let any = false;
    for (let i = 0; i < gp.buttons.length; i++) {
      if (gp.buttons[i].pressed) {
        active = true;
        if (!this.padPrev[i]) any = true;
      }
      this.padPrev[i] = gp.buttons[i].pressed;
    }
    if (any) this.onGesture();
    if (active) this.device = 'gamepad';
  }
}
