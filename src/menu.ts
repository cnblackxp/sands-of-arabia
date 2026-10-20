import type { Action, Hud } from './hud';
import type { Frame } from './input';

/** What the pause menu can read and change. */
export interface MenuHost {
  getTime(): number;
  timeLabel(): string;
  setTime(h: number): void;
  flowLabel(): string;
  cycleFlow(d: number): void;
  lookName(): string;
  cycleLook(d: number): void;
  robeColour(): string;
  cycleRobe(d: number): void;
  cameraLabel(): string;
  toggleCamera(): void;
  mapLabel(): string;
  cycleMap(d: number): void;
  volume(): number;
  setVolume(v: number): void;
  uiSound(confirm: boolean): void;
}

interface Row {
  id: string;
  label: string;
  kind: 'button' | 'choice' | 'slider';
  value?: () => string;
  adjust?: (d: number) => void;
  activate?: () => void;
  slider?: { min: number; max: number; step: number; get: () => number; set: (v: number) => void };
}

const CONTROLS: [Action, string][] = [
  ['move', 'Move'],
  ['run', 'Sprint (uses stamina)'],
  ['attack', 'Attack (chain by pressing again)'],
  ['dodge', 'Dodge roll (i-frames, uses stamina)'],
  ['jump', 'Jump (uses stamina)'],
  ['talk', 'Talk / mount / dismount'],
  ['next', 'Next dialogue line'],
  ['camera', 'Rotate camera'],
  ['zoom', 'Zoom'],
  ['map', 'Minimap size'],
  ['pause', 'Pause menu'],
];

export class PauseMenu {
  isOpen = false;
  private root: HTMLDivElement;
  private list: HTMLDivElement;
  private help: HTMLDivElement;
  private foot: HTMLDivElement;
  private rows: Row[];
  private els: HTMLDivElement[] = [];
  private focus = 0;
  private showHelp = false;
  private lastDevice = '';

  constructor(
    parent: HTMLElement,
    private host: MenuHost,
    private hud: Hud,
    private onResume: () => void,
  ) {
    this.rows = [
      { id: 'resume', label: 'Resume', kind: 'button', activate: () => this.close() },
      {
        id: 'time',
        label: 'Time of day',
        kind: 'slider',
        value: () => host.timeLabel(),
        adjust: (d) => host.setTime(host.getTime() + d * 0.5),
        slider: { min: 0, max: 23.99, step: 0.05, get: () => host.getTime(), set: (v) => host.setTime(v) },
      },
      { id: 'flow', label: 'Time passes', kind: 'choice', value: () => host.flowLabel(), adjust: (d) => host.cycleFlow(d), activate: () => host.cycleFlow(1) },
      { id: 'look', label: 'Character', kind: 'choice', value: () => host.lookName(), adjust: (d) => host.cycleLook(d), activate: () => host.cycleLook(1) },
      {
        id: 'robe',
        label: 'Robe colour',
        kind: 'choice',
        value: () => `<span class="swatch" style="background:${host.robeColour()}"></span>`,
        adjust: (d) => host.cycleRobe(d),
        activate: () => host.cycleRobe(1),
      },
      { id: 'camera', label: 'Camera', kind: 'choice', value: () => host.cameraLabel(), adjust: () => host.toggleCamera(), activate: () => host.toggleCamera() },
      { id: 'map', label: 'Minimap', kind: 'choice', value: () => host.mapLabel(), adjust: (d) => host.cycleMap(d), activate: () => host.cycleMap(1) },
      {
        id: 'volume',
        label: 'Volume',
        kind: 'slider',
        value: () => `${Math.round(host.volume() * 100)}%`,
        adjust: (d) => host.setVolume(Math.min(1, Math.max(0, host.volume() + d * 0.1))),
        slider: { min: 0, max: 1, step: 0.01, get: () => host.volume(), set: (v) => host.setVolume(v) },
      },
      { id: 'controls', label: 'Controls', kind: 'button', activate: () => this.toggleHelp() },
    ];

    this.root = document.createElement('div');
    this.root.className = 'pause hidden';
    this.root.innerHTML = `
      <div class="pause-panel">
        <div class="pause-title">Paused</div>
        <div class="pause-sub">The Oasis at Sunset</div>
        <div class="pause-list"></div>
        <div class="pause-help hidden"></div>
        <div class="pause-foot"></div>
      </div>`;
    parent.appendChild(this.root);
    this.list = this.root.querySelector('.pause-list') as HTMLDivElement;
    this.help = this.root.querySelector('.pause-help') as HTMLDivElement;
    this.foot = this.root.querySelector('.pause-foot') as HTMLDivElement;

    this.rows.forEach((row, i) => {
      const el = document.createElement('div');
      el.className = `prow prow-${row.kind}`;
      let inner = `<div class="prow-label">${row.label}</div>`;
      if (row.kind === 'choice' || row.kind === 'slider') {
        inner += `<div class="prow-ctl"><button class="arrow" data-d="-1">◀</button><div class="prow-value"></div><button class="arrow" data-d="1">▶</button></div>`;
      }
      if (row.slider) {
        const s = row.slider;
        inner += `<input class="prow-range" type="range" min="${s.min}" max="${s.max}" step="${s.step}">`;
      }
      el.innerHTML = inner;
      el.addEventListener('mouseenter', () => this.setFocus(i));
      el.addEventListener('click', (e) => {
        const t = e.target as HTMLElement;
        if (t.classList.contains('arrow')) {
          row.adjust?.(Number(t.dataset.d));
          host.uiSound(false);
        } else if (!t.classList.contains('prow-range')) {
          row.activate?.();
          if (row.activate) host.uiSound(true);
        }
        this.refresh();
      });
      const range = el.querySelector('.prow-range') as HTMLInputElement | null;
      if (range && row.slider) {
        range.addEventListener('input', () => {
          row.slider!.set(Number(range.value));
          this.refresh();
        });
      }
      this.list.appendChild(el);
      this.els.push(el);
    });
    this.help.addEventListener('click', () => this.toggleHelp());
  }

  open(): void {
    this.isOpen = true;
    this.showHelp = false;
    this.focus = 0;
    this.root.classList.remove('hidden');
    this.help.classList.add('hidden');
    this.list.classList.remove('hidden');
    this.host.uiSound(true);
    this.refresh();
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.add('hidden');
    this.host.uiSound(false);
    this.onResume();
  }

  private toggleHelp(): void {
    this.showHelp = !this.showHelp;
    this.help.classList.toggle('hidden', !this.showHelp);
    this.list.classList.toggle('hidden', this.showHelp);
    this.refresh();
  }

  private setFocus(i: number): void {
    if (i === this.focus) return;
    this.focus = i;
    this.host.uiSound(false);
    this.refresh();
  }

  /** Per-frame input while open. */
  update(f: Frame): void {
    if (!this.isOpen) return;
    if (f.device !== this.lastDevice) this.refresh();
    if (this.showHelp) {
      if (f.cancel || f.confirm || f.pause) {
        this.toggleHelp();
        this.host.uiSound(false);
      }
      return;
    }
    if (f.pause || f.cancel) {
      this.close();
      return;
    }
    if (f.navY) {
      this.focus = (this.focus + f.navY + this.rows.length) % this.rows.length;
      this.host.uiSound(false);
      this.refresh();
    }
    const row = this.rows[this.focus];
    if (f.navX && row.adjust) {
      row.adjust(f.navX);
      this.host.uiSound(false);
      this.refresh();
    } else if (f.confirm && row.activate) {
      row.activate();
      this.host.uiSound(true);
      this.refresh();
    }
  }

  refresh(): void {
    this.lastDevice = this.hud.device;
    this.rows.forEach((row, i) => {
      const el = this.els[i];
      el.classList.toggle('focus', i === this.focus);
      const v = el.querySelector('.prow-value');
      if (v && row.value) v.innerHTML = row.value();
      const range = el.querySelector('.prow-range') as HTMLInputElement | null;
      if (range && row.slider && document.activeElement !== range) range.value = String(row.slider.get());
    });
    const k = (a: Action) => this.hud.key(a);
    this.help.innerHTML =
      `<div class="help-title">Controls — ${this.hud.device === 'gamepad' ? 'Controller' : 'Keyboard & mouse'}</div>` +
      CONTROLS.map(([a, l]) => `<div class="help-row"><span class="help-key">${k(a)}</span><span>${l}</span></div>`).join('') +
      `<div class="help-note">Stamina: attacks, rolls and sprinting drain the green bar. When it is empty you cannot act — back off and let it refill. Watch for the red flash: an enemy is about to strike. Roll through the blow.</div>`;
    this.foot.innerHTML = this.showHelp
      ? `${k('back')} back`
      : `<span>${this.hud.device === 'gamepad' ? '<span class="pad dpad">✚</span>' : '<kbd>↑</kbd><kbd>↓</kbd>'} select</span><span>${k('adjust')} change</span><span>${k('confirm')} choose</span><span>${k('back')} resume</span>`;
  }
}
