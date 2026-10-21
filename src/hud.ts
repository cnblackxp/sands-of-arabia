import type { Device } from './input';

export type Action =
  | 'move'
  | 'run'
  | 'attack'
  | 'dodge'
  | 'talk'
  | 'mount'
  | 'jump'
  | 'pause'
  | 'map'
  | 'camera'
  | 'zoom'
  | 'next'
  | 'leave'
  | 'confirm'
  | 'back'
  | 'adjust'
  | 'block'
  | 'heal'
  | 'inventory'
  | 'look';

/** Button glyphs per device. Gamepad uses Xbox-style labels on a standard pad. */
const GLYPH: Record<Device, Record<Action, string>> = {
  keyboard: {
    move: '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>',
    run: '<kbd>Shift</kbd>',
    attack: '<kbd>LMB</kbd>',
    dodge: '<kbd>Space</kbd>',
    talk: '<kbd>E</kbd>',
    mount: '<kbd>E</kbd>',
    jump: '<kbd>F</kbd>',
    pause: '<kbd>Esc</kbd>',
    map: '<kbd>M</kbd>',
    camera: '<kbd>MMB</kbd><small>drag</small> <kbd>Z</kbd><kbd>C</kbd>',
    zoom: '<kbd>Wheel</kbd>',
    next: '<kbd>E</kbd>',
    leave: '<kbd>Esc</kbd>',
    confirm: '<kbd>Enter</kbd>',
    back: '<kbd>Esc</kbd>',
    adjust: '<kbd>A</kbd><kbd>D</kbd>',
    block: '<kbd>RMB</kbd>',
    heal: '<kbd>R</kbd>',
    inventory: '<kbd>Tab</kbd>',
    look: '<kbd>Mouse</kbd>',
  },
  gamepad: {
    move: '<span class="pad stick">L</span>',
    run: '<span class="pad b">B</span><small>hold</small>',
    attack: '<span class="pad bumper">RB</span>',
    dodge: '<span class="pad b">B</span>',
    talk: '<span class="pad y">Y</span>',
    mount: '<span class="pad y">Y</span>',
    jump: '<span class="pad a">A</span>',
    pause: '<span class="pad menu">☰</span>',
    map: '<span class="pad menu">⧉</span>',
    camera: '<span class="pad stick">R</span>',
    zoom: '<span class="pad dpad">✚</span>',
    next: '<span class="pad a">A</span>',
    leave: '<span class="pad b">B</span>',
    confirm: '<span class="pad a">A</span>',
    back: '<span class="pad b">B</span>',
    adjust: '<span class="pad dpad">◀▶</span>',
    block: '<span class="pad bumper">LB</span>',
    heal: '<span class="pad x">X</span>',
    inventory: '<span class="pad menu">☰</span>',
    look: '<span class="pad stick">R</span>',
  },
};

export interface EnemyBar {
  x: number;
  y: number;
  frac: number;
  name: string;
  dmg: number;
  tell: boolean;
}

export class Hud {
  private hpFill: HTMLDivElement;
  private hpLag: HTMLDivElement;
  private stFill: HTMLDivElement;
  private stBar: HTMLDivElement;
  private prompt: HTMLDivElement;
  private dlg: HTMLDivElement;
  private dlgName: HTMLDivElement;
  private dlgText: HTMLDivElement;
  private dlgMore: HTMLDivElement;
  private dlgShown!: HTMLSpanElement;
  private dlgRest!: HTMLSpanElement;
  /** Typewriter state: the full line and how much of it is revealed. */
  private typeText = '';
  private typeN = 0;
  private typeWait = 0;
  private typeMore = '';
  /** Called for each revealed letter that should be voiced. */
  onVoice: (ch: string) => void = () => {};
  private hint: HTMLDivElement;
  private toast: HTMLDivElement;
  private fps: HTMLDivElement;
  private vignette: HTMLDivElement;
  private lowHp: HTMLDivElement;
  private bars: HTMLDivElement;
  private barPool: HTMLDivElement[] = [];
  private goldEl: HTMLSpanElement;
  private flaskEl: HTMLSpanElement;
  private trackerEl: HTMLDivElement;
  private floaters: HTMLDivElement;
  private shownGold = -1;
  private toastTimer = 0;
  private flash = 0;
  private hpLagValue = 1;
  private hpLagHold = 0;
  private lastHp = 1;
  device: Device = 'keyboard';
  /** Interface size: panels use CSS zoom, so screen-anchored items divide by it. */
  uiScale = 1;
  /** Third-person camera: "camera" prompts show the look control instead. */
  thirdPerson = false;
  private cross: HTMLDivElement;
  private ammo: HTMLDivElement;
  private shownAmmo = '';
  private hintKey = '';
  private promptKey = '';

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="bars-top">
        <div class="hp-bar"><div class="hp-lag"></div><div class="hp-fill"></div></div>
        <div class="st-bar"><div class="st-fill"></div></div>
        <div class="purse"><span class="coin">◉</span><span class="gold">0</span><span class="flasks"></span></div>
      </div>
      <div class="tracker hidden"></div>
      <div class="floaters"></div>
      <div class="fps"></div>
      <div class="enemy-bars"></div>
      <div class="prompt hidden"></div>
      <div class="toast hidden"></div>
      <div class="dialogue hidden"><div class="dlg-name"></div><div class="dlg-text"></div><div class="dlg-more"></div></div>
      <div class="hint"></div>
      <div class="crosshair hidden"><i></i></div>
      <div class="ammo hidden"></div>
      <div class="vignette"></div>
      <div class="lowhp"></div>`;
    const q = <T extends HTMLElement>(s: string) => root.querySelector(s) as T;
    this.hpFill = q('.hp-fill');
    this.hpLag = q('.hp-lag');
    this.stFill = q('.st-fill');
    this.stBar = q('.st-bar');
    this.prompt = q('.prompt');
    this.dlg = q('.dialogue');
    this.dlgName = q('.dlg-name');
    this.dlgText = q('.dlg-text');
    this.dlgMore = q('.dlg-more');
    this.dlgShown = document.createElement('span');
    this.dlgRest = document.createElement('span');
    this.dlgRest.className = 'dlg-rest';
    this.dlgText.append(this.dlgShown, this.dlgRest);
    this.hint = q('.hint');
    this.toast = q('.toast');
    this.fps = q('.fps');
    this.vignette = q('.vignette');
    this.lowHp = q('.lowhp');
    this.bars = q('.enemy-bars');
    this.goldEl = q('.gold');
    this.flaskEl = q('.flasks');
    this.trackerEl = q('.tracker');
    this.floaters = q('.floaters');
    this.cross = q('.crosshair');
    this.ammo = q('.ammo');
  }

  /** Third-person crosshair: a dot, a closing ring while the bow draws. */
  setCrosshair(show: boolean, draw: number, aiming: boolean): void {
    this.cross.classList.toggle('hidden', !show);
    if (!show) return;
    this.cross.classList.toggle('aiming', aiming);
    this.cross.classList.toggle('ready', aiming && draw >= 1);
    (this.cross.firstElementChild as HTMLElement).style.transform = `translate(-50%, -50%) scale(${aiming ? 2.2 - 1.2 * draw : 1})`;
  }

  /** Arrows in the quiver (null hides the counter). */
  setAmmo(n: number | null, max: number): void {
    const key = n === null ? '' : `${n}/${max}`;
    if (key === this.shownAmmo) return;
    this.shownAmmo = key;
    this.ammo.classList.toggle('hidden', n === null);
    if (n !== null) this.ammo.innerHTML = `<span class="ammo-icon">➶</span> ${n}<small> / ${max}</small>`;
    this.ammo.classList.toggle('empty', n === 0);
  }

  /** HTML glyph for an action on the current device. */
  key(a: Action): string {
    if (a === 'camera' && this.thirdPerson) return GLYPH[this.device].look;
    return GLYPH[this.device][a];
  }

  setDevice(d: Device): void {
    this.device = d;
  }

  /** Bottom help bar: a list of [action, label] for the current context. */
  setHints(items: [Action, string][]): void {
    const key = this.device + this.thirdPerson + items.map((i) => i.join(':')).join('|');
    if (key === this.hintKey) return;
    this.hintKey = key;
    this.hint.innerHTML = items.map(([a, l]) => `<span class="hint-item">${this.key(a)} ${l}</span>`).join('');
  }

  setVitals(hp: number, maxHp: number, st: number, maxSt: number, exhausted: boolean, dt: number): void {
    const f = Math.max(0, hp / maxHp);
    if (f < this.lastHp) this.hpLagHold = 0.6;
    this.lastHp = f;
    // Souls-style trailing damage chunk.
    if (this.hpLagHold > 0) this.hpLagHold -= dt;
    else this.hpLagValue = Math.max(f, this.hpLagValue - dt * 0.6);
    if (this.hpLagValue < f) this.hpLagValue = f;
    this.hpFill.style.width = `${f * 100}%`;
    this.hpLag.style.width = `${this.hpLagValue * 100}%`;
    this.stFill.style.width = `${Math.max(0, st / maxSt) * 100}%`;
    this.stBar.classList.toggle('exhausted', exhausted);
    this.lowHp.style.opacity = f < 0.3 ? String(0.35 + 0.25 * Math.sin(performance.now() / 180)) : '0';
  }

  setPurse(gold: number, flasks: number, maxFlasks: number): void {
    if (gold !== this.shownGold) {
      if (this.shownGold >= 0 && gold > this.shownGold) {
        this.goldEl.classList.remove('pulse');
        void this.goldEl.offsetWidth;
        this.goldEl.classList.add('pulse');
      }
      this.shownGold = gold;
      this.goldEl.textContent = String(gold);
    }
    const f = '<span class="flask full">▮</span>'.repeat(flasks) + '<span class="flask">▯</span>'.repeat(Math.max(0, maxFlasks - flasks));
    if (this.flaskEl.innerHTML !== f) this.flaskEl.innerHTML = f;
  }

  setTracker(text: string | null): void {
    this.trackerEl.classList.toggle('hidden', !text);
    if (text && this.trackerEl.textContent !== '◆ ' + text) this.trackerEl.textContent = '◆ ' + text;
  }

  /** Rising text at a screen position (gold gained, etc.). */
  floatText(x: number, y: number, text: string, cls = 'gold'): void {
    const el = document.createElement('div');
    el.className = `floater ${cls}`;
    el.textContent = text;
    el.style.left = `${x / this.uiScale}px`;
    el.style.top = `${y / this.uiScale}px`;
    this.floaters.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  /** Flash the stamina bar when an action is refused. */
  staminaDenied(): void {
    this.stBar.classList.remove('denied');
    void this.stBar.offsetWidth;
    this.stBar.classList.add('denied');
  }

  setPrompt(html: string | null): void {
    const key = (html ?? '') + this.device;
    if (key === this.promptKey) return;
    this.promptKey = key;
    this.prompt.classList.toggle('hidden', !html);
    if (html) this.prompt.innerHTML = html;
  }

  showDialogue(name: string, text: string, last: boolean): void {
    this.dlg.classList.remove('hidden');
    this.dlgName.textContent = name;
    this.typeMore = last ? `${this.key('next')} farewell` : `${this.key('next')} continue &nbsp;·&nbsp; ${this.key('leave')} leave`;
    // Re-showing the same line (a device switch) keeps the reveal going.
    if (text !== this.typeText) {
      this.typeText = text;
      this.typeN = 0;
      this.typeWait = 0.08;
    }
    this.renderType();
  }

  /** True while the current line is still being typed out. */
  get typing(): boolean {
    return !this.dlg.classList.contains('hidden') && this.typeN < this.typeText.length;
  }

  /** Reveal the whole line at once (interact pressed mid-line). */
  finishTyping(): void {
    this.typeN = this.typeText.length;
    this.renderType();
  }

  private renderType(): void {
    const t = this.typeText;
    this.dlgShown.textContent = t.slice(0, this.typeN);
    // The unrevealed rest is laid out invisibly so words never jump lines.
    this.dlgRest.textContent = t.slice(this.typeN);
    const done = this.typeN >= t.length;
    this.dlg.classList.toggle('talking', !done);
    this.dlgMore.innerHTML = done ? this.typeMore : `${this.key('next')} skip`;
  }

  private updateType(dt: number): void {
    if (this.typeN >= this.typeText.length || this.dlg.classList.contains('hidden')) return;
    this.typeWait -= dt;
    let changed = false;
    while (this.typeWait <= 0 && this.typeN < this.typeText.length) {
      const ch = this.typeText[this.typeN++];
      changed = true;
      // Pauses on punctuation, like a breath between phrases.
      let wait = 1 / 42;
      if (ch === ',' || ch === ';' || ch === ':') wait = 0.16;
      else if (ch === '.' || ch === '!' || ch === '?') wait = this.typeText[this.typeN] === '.' ? 0.09 : 0.3;
      else if (ch === '…' || ch === '—') wait = 0.28;
      this.typeWait += wait;
      // Voice every other letter so speech babbles instead of buzzing.
      if (/[\p{L}\p{N}]/u.test(ch) && this.typeN % 2 === 1) this.onVoice(ch);
    }
    if (changed) this.renderType();
  }

  hideDialogue(): void {
    this.dlg.classList.add('hidden');
    this.typeText = '';
    this.typeN = 0;
  }

  showToast(text: string, secs = 2.5): void {
    this.toast.textContent = text;
    this.toast.classList.remove('hidden');
    this.toastTimer = secs;
  }

  hurtFlash(strength = 1): void {
    this.flash = Math.max(this.flash, strength);
  }

  setEnemyBars(list: EnemyBar[]): void {
    while (this.barPool.length < list.length) {
      const el = document.createElement('div');
      el.className = 'ebar';
      el.innerHTML = '<div class="ebar-name"></div><div class="ebar-track"><div class="ebar-fill"></div></div><div class="ebar-dmg"></div>';
      this.bars.appendChild(el);
      this.barPool.push(el);
    }
    this.barPool.forEach((el, i) => {
      const b = list[i];
      if (!b) {
        el.style.display = 'none';
        return;
      }
      el.style.display = '';
      el.style.transform = `translate(${(b.x / this.uiScale).toFixed(0)}px, ${(b.y / this.uiScale).toFixed(0)}px) translate(-50%, -100%)`;
      (el.children[0] as HTMLElement).textContent = b.name;
      (el.children[1].firstChild as HTMLElement).style.width = `${b.frac * 100}%`;
      (el.children[2] as HTMLElement).textContent = b.dmg > 0 ? String(Math.round(b.dmg)) : '';
      el.classList.toggle('tell', b.tell);
    });
  }

  update(dt: number, fps: number): void {
    this.updateType(dt);
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.classList.add('hidden');
    }
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.vignette.style.opacity = String(this.flash * 0.8);
    this.fps.textContent = `${fps.toFixed(0)} fps`;
  }
}
