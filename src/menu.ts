import type { Action, Hud } from './hud';
import type { Frame } from './input';

/**
 * Tabbed menu (pause menu, shop). Each tab is a list of rows rebuilt on every
 * refresh, or a custom panel (the full map). Works with mouse (hover / click /
 * sliders), keyboard (arrows or WASD, Enter, Esc, Tab / [ ]) and gamepad
 * (D-pad or stick, A, B, LB / RB, Start).
 */

export interface MenuRow {
  label: string;
  kind: 'button' | 'choice' | 'slider' | 'info' | 'header';
  value?: () => string;
  /** Small secondary line under the label. */
  sub?: () => string;
  adjust?: (d: number) => void;
  activate?: () => void;
  slider?: { min: number; max: number; step: number; get: () => number; set: (v: number) => void };
  disabled?: () => boolean;
}

export interface MenuTab {
  id: string;
  label: string;
  rows?: () => MenuRow[];
  /** Custom panel content (e.g. the map); called on every refresh. */
  render?: (el: HTMLElement) => void;
  /** Wider panel for this tab. */
  wide?: boolean;
}

export class Menu {
  isOpen = false;
  private root: HTMLDivElement;
  private titleEl: HTMLDivElement;
  private subEl: HTMLDivElement;
  private tabBar: HTMLDivElement;
  private list: HTMLDivElement;
  private custom: HTMLDivElement;
  private foot: HTMLDivElement;
  private panel: HTMLDivElement;
  private tabs: MenuTab[] = [];
  private tabIdx = 0;
  private rows: MenuRow[] = [];
  private els: HTMLDivElement[] = [];
  private focus = 0;
  private lastDevice = '';
  onClose: () => void = () => {};

  constructor(
    parent: HTMLElement,
    private hud: Hud,
    private sound: (confirm: boolean) => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'pause hidden';
    this.root.innerHTML = `
      <div class="pause-panel">
        <div class="pause-title"></div>
        <div class="pause-sub"></div>
        <div class="pause-tabs"></div>
        <div class="pause-list"></div>
        <div class="pause-custom hidden"></div>
        <div class="pause-foot"></div>
      </div>`;
    parent.appendChild(this.root);
    const q = (s: string) => this.root.querySelector(s) as HTMLDivElement;
    this.panel = q('.pause-panel');
    this.titleEl = q('.pause-title');
    this.subEl = q('.pause-sub');
    this.tabBar = q('.pause-tabs');
    this.list = q('.pause-list');
    this.custom = q('.pause-custom');
    this.foot = q('.pause-foot');
  }

  /** Open with a set of tabs. */
  open(title: string, sub: string, tabs: MenuTab[], tabId?: string): void {
    this.tabs = tabs;
    this.tabIdx = Math.max(0, tabs.findIndex((t) => t.id === tabId));
    this.titleEl.textContent = title;
    this.subEl.textContent = sub;
    this.isOpen = true;
    this.focus = 0;
    this.root.classList.remove('hidden');
    this.sound(true);
    this.buildTabs();
    this.refresh();
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.add('hidden');
    this.sound(false);
    this.onClose();
  }

  get tabId(): string {
    return this.tabs[this.tabIdx]?.id ?? '';
  }

  setTab(i: number): void {
    const n = this.tabs.length;
    if (n === 0) return;
    this.tabIdx = ((i % n) + n) % n;
    this.focus = 0;
    this.sound(false);
    this.buildTabs();
    this.refresh();
  }

  private buildTabs(): void {
    this.tabBar.classList.toggle('hidden', this.tabs.length < 2);
    this.tabBar.innerHTML = '';
    const glyph = this.hud.device === 'gamepad';
    if (this.tabs.length > 1) {
      const l = document.createElement('span');
      l.className = 'tab-key';
      l.innerHTML = glyph ? '<span class="pad bumper">LB</span>' : '<kbd>Tab</kbd>';
      this.tabBar.appendChild(l);
    }
    this.tabs.forEach((t, i) => {
      const b = document.createElement('button');
      b.className = 'tab' + (i === this.tabIdx ? ' active' : '');
      b.textContent = t.label;
      b.addEventListener('click', () => this.setTab(i));
      this.tabBar.appendChild(b);
    });
    if (this.tabs.length > 1 && glyph) {
      const r = document.createElement('span');
      r.className = 'tab-key';
      r.innerHTML = '<span class="pad bumper">RB</span>';
      this.tabBar.appendChild(r);
    }
    this.panel.classList.toggle('wide', !!this.tabs[this.tabIdx]?.wide);
  }

  private selectable(i: number): boolean {
    const r = this.rows[i];
    return !!r && r.kind !== 'info' && r.kind !== 'header';
  }

  private moveFocus(d: number): void {
    const n = this.rows.length;
    for (let k = 0; k < n; k++) {
      this.focus = (this.focus + d + n) % n;
      if (this.selectable(this.focus)) return;
    }
  }

  update(f: Frame): void {
    if (!this.isOpen) return;
    if (f.device !== this.lastDevice) {
      this.lastDevice = f.device;
      this.buildTabs();
      this.refresh();
    }
    if (f.pause || f.cancel) {
      this.close();
      return;
    }
    if (f.tab) {
      this.setTab(this.tabIdx + f.tab);
      return;
    }
    if (f.navY && this.rows.length) {
      this.moveFocus(f.navY);
      this.sound(false);
      this.refresh();
    }
    const row = this.rows[this.focus];
    if (!row || row.disabled?.()) return;
    if (f.navX && row.adjust) {
      row.adjust(f.navX);
      this.sound(false);
      this.refresh();
    } else if (f.confirm && row.activate) {
      row.activate();
      this.sound(true);
      if (this.isOpen) this.refresh();
    }
  }

  refresh(): void {
    if (!this.isOpen) return;
    const tab = this.tabs[this.tabIdx];
    const k = (a: Action) => this.hud.key(a);
    if (tab?.render) {
      this.list.classList.add('hidden');
      this.custom.classList.remove('hidden');
      tab.render(this.custom);
      this.rows = [];
    } else {
      this.list.classList.remove('hidden');
      this.custom.classList.add('hidden');
      this.rows = tab?.rows?.() ?? [];
      if (!this.selectable(this.focus)) {
        this.focus = Math.min(this.focus, this.rows.length - 1);
        if (!this.selectable(this.focus)) this.moveFocus(1);
      }
      this.renderRows();
    }
    this.foot.innerHTML =
      `<span>${this.hud.device === 'gamepad' ? '<span class="pad dpad">✚</span>' : '<kbd>↑</kbd><kbd>↓</kbd>'} select</span>` +
      `<span>${k('adjust')} change</span><span>${k('confirm')} choose</span><span>${k('back')} close</span>`;
  }

  private renderRows(): void {
    // Rebuild only when the row count changes; otherwise update in place.
    if (this.els.length !== this.rows.length || this.list.dataset.tab !== this.tabId) {
      this.list.innerHTML = '';
      this.els = this.rows.map((_row, i) => {
        const el = document.createElement('div');
        this.list.appendChild(el);
        el.addEventListener('mouseenter', () => {
          if (this.selectable(i) && this.focus !== i) {
            this.focus = i;
            this.paintFocus();
          }
        });
        el.addEventListener('click', (e) => {
          const r = this.rows[i];
          if (!r || r.disabled?.()) return;
          const t = e.target as HTMLElement;
          if (t.classList.contains('arrow')) r.adjust?.(Number(t.dataset.d));
          else if (!t.classList.contains('prow-range')) r.activate?.();
          this.sound(!!r.activate);
          if (this.isOpen) this.refresh();
        });
        return el;
      });
      this.list.dataset.tab = this.tabId;
    }
    this.rows.forEach((row, i) => {
      const el = this.els[i];
      const val = row.value?.() ?? '';
      const sub = row.sub?.() ?? '';
      const ctl =
        row.kind === 'choice' || row.kind === 'slider'
          ? `<div class="prow-ctl"><button class="arrow" data-d="-1">◀</button><div class="prow-value">${val}</div><button class="arrow" data-d="1">▶</button></div>`
          : val
            ? `<div class="prow-value right">${val}</div>`
            : '';
      const html = `<div class="prow-main"><div class="prow-label">${row.label}</div>${sub ? `<div class="prow-sub">${sub}</div>` : ''}</div>${ctl}`;
      const key = row.kind + html;
      if (el.dataset.key !== key) {
        el.dataset.key = key;
        el.className = `prow prow-${row.kind}`;
        el.innerHTML = html;
        if (row.slider) {
          const s = row.slider;
          const range = document.createElement('input');
          range.className = 'prow-range';
          range.type = 'range';
          range.min = String(s.min);
          range.max = String(s.max);
          range.step = String(s.step);
          range.value = String(s.get());
          range.addEventListener('input', () => {
            s.set(Number(range.value));
            this.refresh();
          });
          el.appendChild(range);
        }
      }
      el.classList.toggle('disabled', !!row.disabled?.());
    });
    this.paintFocus();
  }

  private paintFocus(): void {
    this.els.forEach((el, i) => el.classList.toggle('focus', i === this.focus));
    this.els[this.focus]?.scrollIntoView({ block: 'nearest' });
  }
}
