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
  | 'inventory';

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
  }

  /** HTML glyph for an action on the current device. */
  key(a: Action): string {
    return GLYPH[this.device][a];
  }

  setDevice(d: Device): void {
    this.device = d;
  }

  /** Bottom help bar: a list of [action, label] for the current context. */
  setHints(items: [Action, string][]): void {
    const key = this.device + items.map((i) => i.join(':')).join('|');
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
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
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
    this.dlgText.textContent = text;
    this.dlgMore.innerHTML = last ? `${this.key('next')} farewell` : `${this.key('next')} continue &nbsp;·&nbsp; ${this.key('leave')} leave`;
  }

  hideDialogue(): void {
    this.dlg.classList.add('hidden');
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
      el.style.transform = `translate(${b.x.toFixed(0)}px, ${b.y.toFixed(0)}px) translate(-50%, -100%)`;
      (el.children[0] as HTMLElement).textContent = b.name;
      (el.children[1].firstChild as HTMLElement).style.width = `${b.frac * 100}%`;
      (el.children[2] as HTMLElement).textContent = b.dmg > 0 ? String(Math.round(b.dmg)) : '';
      el.classList.toggle('tell', b.tell);
    });
  }

  update(dt: number, fps: number): void {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.classList.add('hidden');
    }
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.vignette.style.opacity = String(this.flash * 0.8);
    this.fps.textContent = `${fps.toFixed(0)} fps`;
  }
}
