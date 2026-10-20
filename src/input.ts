/**
 * Keyboard, mouse and gamepad input merged into one per-frame snapshot.
 * The last device that produced input becomes `device`, which drives every
 * on-screen prompt.
 *
 * Gamepad (standard mapping), Dark Souls style:
 *   L-stick move · B tap = roll, B hold = sprint (or L3 / LT) · RB / X / RT attack
 *   A jump / confirm · Y interact (talk, mount) · Start pause · View minimap · R-stick camera
 *   (Elden Ring layout; keyboard: Space roll, F jump, E interact)
 *   D-pad up/down zoom, left/right rotate (D-pad navigates menus)
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
  /** Talk / mount / dismount, whichever is in reach. */
  interact: boolean;
  /** Back / leave dialogue (Esc, B). */
  cancel: boolean;
  pause: boolean;
  map: boolean;
  zoom: number;
  rotate: number;
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
  private padPrev: boolean[] = [];
  private runToggle = false;
  private bHeld = -1;
  private navHold = { x: 0, y: 0, t: 0 };
  device: Device = 'keyboard';
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
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('mousemove', () => {
      this.device = 'keyboard';
    });
    canvas.addEventListener('mousedown', (e) => {
      this.onGesture();
      if (e.button === 0) this.mouseAttack = true;
      this.device = 'keyboard';
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener(
      'wheel',
      (e) => {
        this.wheel += Math.sign(e.deltaY);
        e.preventDefault();
      },
      { passive: false },
    );
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
      interact: p.has('KeyE'),
      cancel: p.has('Escape') || p.has('Backspace'),
      pause: p.has('Escape') || p.has('KeyP'),
      map: p.has('KeyM'),
      zoom: this.wheel,
      rotate: ((k.has('KeyQ') ? 1 : 0) - (k.has('KeyR') ? 1 : 0)) * 1.6 * dt,
      navX: (p.has('KeyD') || p.has('ArrowRight') ? 1 : 0) - (p.has('KeyA') || p.has('ArrowLeft') ? 1 : 0),
      navY: (p.has('KeyS') || p.has('ArrowDown') ? 1 : 0) - (p.has('KeyW') || p.has('ArrowUp') ? 1 : 0),
      confirm: p.has('Enter') || p.has('Space') || p.has('KeyE'),
      device: this.device,
    };
    this.pressed.clear();
    this.wheel = 0;
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
      if (this.bHeld < 0) this.bHeld = 0;
      else this.bHeld += dt;
      if (this.bHeld > SPRINT_HOLD) f.run = true;
    } else if (this.bHeld >= 0) {
      if (this.bHeld <= SPRINT_HOLD) f.dodge = true;
      this.bHeld = -1;
    }
    if (edge(10)) this.runToggle = !this.runToggle;
    if (mag < DEAD) this.runToggle = false;
    if (this.runToggle || (gp.buttons[6]?.value ?? 0) > 0.4) f.run = true;

    if (edge(2) || edge(5) || edge(7)) f.attack = true;
    if (edge(0)) {
      f.jump = true;
      f.confirm = true;
    }
    if (edge(3)) f.interact = true;
    if (edge(1)) f.cancel = true;
    if (edge(9)) f.pause = true;
    if (edge(8)) f.map = true;

    const rx = ax(2);
    const ry = ax(3);
    if (Math.abs(rx) > DEAD) {
      f.rotate -= rx * 2.2 * dt;
      active = true;
    }
    if (Math.abs(ry) > DEAD) {
      f.zoom += ry * 6 * dt;
      active = true;
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
