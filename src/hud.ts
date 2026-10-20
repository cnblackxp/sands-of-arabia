import type { Device } from './input';

const HINTS: Record<Device, string> = {
  keyboard:
    '<b>WASD</b> move · <b>Shift</b> run · <b>LMB / Space</b> attack · <b>E</b> talk · <b>F</b> mount · <b>Wheel</b> zoom · <b>Q / R</b> rotate · <b>P</b> perspective',
  gamepad:
    '<b>L-stick</b> move · <b>LT / LB / L3</b> run · <b>X / RT</b> attack · <b>A</b> talk · <b>Y</b> mount · <b>R-stick</b> camera · <b>View</b> perspective',
};

const KEY: Record<Device, { talk: string; mount: string; next: string; close: string }> = {
  keyboard: { talk: 'E', mount: 'F', next: 'E', close: 'Esc' },
  gamepad: { talk: 'A', mount: 'Y', next: 'A', close: 'B' },
};

export class Hud {
  private hpFill: HTMLDivElement;
  private hpText: HTMLDivElement;
  private prompt: HTMLDivElement;
  private dlg: HTMLDivElement;
  private dlgName: HTMLDivElement;
  private dlgText: HTMLDivElement;
  private dlgMore: HTMLDivElement;
  private hint: HTMLDivElement;
  private toast: HTMLDivElement;
  private fps: HTMLDivElement;
  private vignette: HTMLDivElement;
  private toastTimer = 0;
  private flash = 0;
  private device: Device | null = null;
  key = KEY.keyboard;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="hp"><div class="hp-label">HP</div><div class="hp-bar"><div class="hp-fill"></div></div><div class="hp-text"></div></div>
      <div class="fps"></div>
      <div class="prompt hidden"></div>
      <div class="toast hidden"></div>
      <div class="dialogue hidden"><div class="dlg-name"></div><div class="dlg-text"></div><div class="dlg-more"></div></div>
      <div class="hint"></div>
      <div class="vignette"></div>`;
    const q = <T extends HTMLElement>(s: string) => root.querySelector(s) as T;
    this.hpFill = q('.hp-fill');
    this.hpText = q('.hp-text');
    this.prompt = q('.prompt');
    this.dlg = q('.dialogue');
    this.dlgName = q('.dlg-name');
    this.dlgText = q('.dlg-text');
    this.dlgMore = q('.dlg-more');
    this.hint = q('.hint');
    this.toast = q('.toast');
    this.fps = q('.fps');
    this.vignette = q('.vignette');
    this.setDevice('keyboard');
  }

  setDevice(d: Device): void {
    if (d === this.device) return;
    this.device = d;
    this.key = KEY[d];
    this.hint.innerHTML = HINTS[d];
  }

  setHp(hp: number, max: number): void {
    const f = Math.max(0, hp / max);
    this.hpFill.style.width = `${f * 100}%`;
    this.hpFill.classList.toggle('low', f < 0.3);
    this.hpText.textContent = `${Math.ceil(hp)} / ${max}`;
  }

  setPrompt(text: string | null): void {
    this.prompt.classList.toggle('hidden', !text);
    if (text && this.prompt.innerHTML !== text) this.prompt.innerHTML = text;
  }

  showDialogue(name: string, text: string, last: boolean): void {
    this.dlg.classList.remove('hidden');
    this.dlgName.textContent = name;
    this.dlgText.textContent = text;
    this.dlgMore.textContent = last ? `${this.key.next} — farewell` : `${this.key.next} — continue   ·   ${this.key.close} — leave`;
  }

  hideDialogue(): void {
    this.dlg.classList.add('hidden');
  }

  showToast(text: string, secs = 2.5): void {
    this.toast.textContent = text;
    this.toast.classList.remove('hidden');
    this.toastTimer = secs;
  }

  hurtFlash(): void {
    this.flash = 1;
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
