import { t, tOr } from './i18n';
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
    run: '<span class="pad b">B</span><small>hold</small> <span class="pad stick">L3</span>',
    attack: '<span class="pad bumper">RT</span>',
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
    block: '<span class="pad bumper">LT</span>',
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
  private typeVerse = false;
  private typeWait = 0;
  private typeMore = '';
  private typeLast = false;
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
  /** Debug performance readout appended to the fps counter ('' = off). */
  perf = '';
  /** Interface size: panels use CSS zoom, so screen-anchored items divide by it. */
  uiScale = 1;
  /** Third-person camera: "camera" prompts show the look control instead. */
  thirdPerson = false;
  private boss: HTMLDivElement;
  private bossLag = 1;
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
      <div class="prompt off"></div>
      <div class="toast hidden"></div>
      <div class="dialogue hidden"><div class="dlg-name"></div><div class="dlg-text"></div><div class="dlg-more"></div></div>
      <div class="hint"></div>
      <div class="bossbar hidden"><div class="boss-name"></div><div class="boss-track"><div class="boss-lag"></div><div class="boss-fill"></div></div></div>
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
    this.boss = q('.bossbar');
    this.ammo = q('.ammo');
  }

  /** A boss's big health bar (null hides it); the lost chunk trails behind. */
  setBoss(name: string | null, frac: number, dt: number): void {
    this.boss.classList.toggle('hidden', !name);
    if (!name) {
      this.bossLag = 1;
      return;
    }
    (this.boss.children[0] as HTMLElement).textContent = name;
    this.bossLag = Math.max(frac, this.bossLag - dt * 0.35);
    const track = this.boss.children[1];
    (track.children[0] as HTMLElement).style.width = `${this.bossLag * 100}%`;
    (track.children[1] as HTMLElement).style.width = `${Math.max(0, frac) * 100}%`;
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
    const glyph = a === 'camera' && this.thirdPerson ? GLYPH[this.device].look : GLYPH[this.device][a];
    // `.keys` keeps multi-key glyphs (W A S D) in order inside right-to-left text.
    return `<span class="keys">${glyph.replace(/<small>(\w+)<\/small>/, (_, w: string) => `<small>${tOr(`keys.${w}`, w)}</small>`)}</span>`;
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
    // Fades in and out; the old text stays while it fades away.
    this.prompt.classList.toggle('off', !html);
    if (html) this.prompt.innerHTML = html;
  }

  /** `verse`: a couplet of poetry (centred, two lines, recited slower and without babble). */
  showDialogue(name: string, text: string, last: boolean, verse = false): void {
    this.dlg.classList.remove('hidden');
    this.dlg.classList.toggle('verse', verse);
    this.typeVerse = verse;
    this.dlgName.textContent = name;
    this.typeLast = last;
    this.typeMore = last ? `${this.key('next')} ${t('hud.farewell')}` : `${this.key('next')} ${t('hud.continue')} &nbsp;·&nbsp; ${this.key('leave')} ${t('hud.leave')}`;
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
    const line = this.typeText;
    // A zero-width joiner across the split keeps Arabic letters joined mid-word.
    const zwj = this.typeN > 0 && this.typeN < line.length ? '\u200d' : '';
    this.dlgShown.textContent = line.slice(0, this.typeN) + zwj;
    // The unrevealed rest is laid out invisibly so words never jump lines.
    this.dlgRest.textContent = zwj + line.slice(this.typeN);
    const done = this.typeN >= line.length;
    this.dlg.classList.toggle('talking', !done);
    this.dlgMore.innerHTML = done ? this.typeMore : `${this.key('next')} ${t('hud.skip')}`;
  }

  private updateType(dt: number): void {
    if (this.typeN >= this.typeText.length || this.dlg.classList.contains('hidden')) return;
    this.typeWait -= dt;
    let changed = false;
    while (this.typeWait <= 0 && this.typeN < this.typeText.length) {
      const ch = this.typeText[this.typeN++];
      changed = true;
      // Pauses on punctuation, like a breath between phrases.
      let wait = this.typeVerse ? 1 / 24 : 1 / 42;
      if (ch === ',' || ch === ';' || ch === ':' || ch === '،' || ch === '؛') wait = 0.16;
      else if (ch === '.' || ch === '!' || ch === '?' || ch === '؟') wait = this.typeText[this.typeN] === '.' ? 0.09 : 0.3;
      else if (ch === '…' || ch === '—') wait = 0.28;
      this.typeWait += wait;
      // Voice every other letter so speech babbles instead of buzzing.
      if (!this.typeVerse && /[\p{L}\p{N}]/u.test(ch) && this.typeN % 2 === 1) this.onVoice(ch);
    }
    if (changed) this.renderType();
  }

  /** Redraw text the HUD built itself (after a language change). */
  refreshText(): void {
    this.hintKey = '';
    this.promptKey = '';
    if (!this.dlg.classList.contains('hidden')) this.showDialogue(this.dlgName.textContent ?? '', this.typeText, this.typeLast);
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
    this.fps.textContent = this.perf ? `${t('hud.fps', { n: fps.toFixed(0) })} · ${this.perf}` : t('hud.fps', { n: fps.toFixed(0) });
  }
}
