/**
 * Keyboard, mouse and gamepad input merged into one per-frame snapshot.
 *
 * Gamepad (standard mapping): left stick move (analog), LT / LB / L3 run,
 * X or RT attack, A talk / next line, Y mount, B close dialogue,
 * right stick X rotates the camera, right stick Y and D-pad up/down zoom,
 * Back/View toggles perspective.
 */

export type Device = 'keyboard' | 'gamepad';

export interface Frame {
  /** Screen-relative move: x = right, y = up (W). Length is 0..1. */
  moveX: number;
  moveY: number;
  run: boolean;
  attack: boolean;
  interact: boolean;
  mount: boolean;
  cancel: boolean;
  zoom: number; // >0 zoom out, <0 zoom in (multiplicative steps)
  rotate: number; // radians this frame
  togglePerspective: boolean;
  device: Device;
}

const DEAD = 0.18;

export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private wheel = 0;
  private mouseAttack = false;
  private padPrev: boolean[] = [];
  private runToggle = false;
  device: Device = 'keyboard';

  constructor(canvas: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      this.device = 'keyboard';
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('mousedown', (e) => {
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
      attack: this.mouseAttack || p.has('Space'),
      interact: p.has('KeyE') || p.has('Enter'),
      mount: p.has('KeyF'),
      cancel: p.has('Escape'),
      zoom: this.wheel,
      rotate: ((k.has('KeyQ') ? 1 : 0) - (k.has('KeyR') ? 1 : 0)) * 1.6 * dt,
      togglePerspective: p.has('KeyP'),
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
      // Rescale so the dead zone edge maps to 0 and full tilt to 1.
      const s = Math.min(1, (mag - DEAD) / (1 - DEAD)) / mag;
      lx *= s;
      ly *= s;
      f.moveX = lx;
      f.moveY = ly;
      active = true;
    }
    if (edge(10)) this.runToggle = !this.runToggle;
    if (mag < DEAD) this.runToggle = false;
    const run = b(4) || (gp.buttons[6]?.value ?? 0) > 0.4 || this.runToggle;
    if (run) f.run = true;

    if (edge(2) || edge(7) || edge(5)) f.attack = true;
    if (edge(0)) f.interact = true;
    if (edge(3)) f.mount = true;
    if (edge(1)) f.cancel = true;
    if (edge(8)) f.togglePerspective = true;

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

    for (let i = 0; i < gp.buttons.length; i++) {
      if (gp.buttons[i].pressed) active = true;
      this.padPrev[i] = gp.buttons[i].pressed;
    }
    if (active) this.device = 'gamepad';
  }
}
