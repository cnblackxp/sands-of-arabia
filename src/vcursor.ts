/**
 * The game's own mouse cursor for menus opened while the mouse is captured
 * (pointer lock). The lock stays on, so closing the menu needs no click to take
 * the mouse back. The drawn cursor moves on the mouse's motion and clicks,
 * drags sliders, hovers and scrolls whatever is under it.
 *
 * (Esc is the browser's: outside fullscreen it always frees the mouse, and the
 * real cursor takes over until the next click in the game.)
 */
export class VirtualCursor {
  private el: HTMLDivElement;
  private x = 0;
  private y = 0;
  private on = false;
  private hover: Element | null = null;
  private down: Element | null = null;
  private drag: HTMLInputElement | null = null;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'vcursor';
    this.el.hidden = true;
    document.body.appendChild(this.el);
    // Capture phase on window: these never reach the game's own listeners while shown.
    window.addEventListener('mousemove', (e) => this.onMove(e), true);
    window.addEventListener('mousedown', (e) => this.onDown(e), true);
    window.addEventListener('mouseup', (e) => this.onUp(e), true);
    window.addEventListener('click', (e) => this.swallow(e), true);
    window.addEventListener('wheel', (e) => this.onWheel(e), { capture: true, passive: false });
  }

  get shown(): boolean {
    return this.on;
  }

  /** Show it at the centre of the screen. */
  show(): void {
    if (this.on) return;
    this.on = true;
    this.x = window.innerWidth / 2;
    this.y = window.innerHeight / 2;
    this.el.hidden = false;
    this.place();
  }

  hide(): void {
    if (!this.on) return;
    this.on = false;
    this.el.hidden = true;
    this.hover = this.down = this.drag = null;
  }

  private place(): void {
    this.el.style.transform = `translate(${this.x}px, ${this.y}px)`;
    const t = this.target();
    this.el.classList.toggle('hot', !!t?.closest('button, .prow, .tab, a, input'));
    if (t !== this.hover) {
      // The menu focuses rows on mouseenter.
      this.hover?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
      let n: Element | null = t;
      while (n && !n.contains(this.hover)) {
        n.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
        n = n.parentElement;
      }
      t?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      this.hover = t;
    }
  }

  private target(): Element | null {
    const t = document.elementFromPoint(this.x, this.y);
    return t === this.el ? null : t;
  }

  private swallow(e: Event): boolean {
    if (!this.on || !e.isTrusted) return false;
    e.stopPropagation();
    e.preventDefault();
    return true;
  }

  private onMove(e: MouseEvent): void {
    if (!this.swallow(e)) return;
    this.x = Math.min(window.innerWidth - 2, Math.max(0, this.x + e.movementX));
    this.y = Math.min(window.innerHeight - 2, Math.max(0, this.y + e.movementY));
    this.place();
    if (this.drag) this.slide(this.drag);
  }

  private onDown(e: MouseEvent): void {
    if (!this.swallow(e) || e.button !== 0) return;
    const t = this.target();
    this.down = t;
    if (t instanceof HTMLInputElement && t.type === 'range') {
      this.drag = t;
      this.slide(t);
    }
  }

  private onUp(e: MouseEvent): void {
    if (!this.swallow(e) || e.button !== 0) return;
    const t = this.target();
    if (this.drag) this.drag.dispatchEvent(new Event('change', { bubbles: true }));
    else if (t && this.down && (t === this.down || this.down.contains(t) || t.contains(this.down))) {
      (t as HTMLElement).click?.();
    }
    this.down = this.drag = null;
  }

  private onWheel(e: WheelEvent): void {
    if (!this.swallow(e)) return;
    // Scroll the nearest scrollable box under the cursor.
    for (let n = this.target(); n; n = n.parentElement) {
      if (n.scrollHeight > n.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(n).overflowY)) {
        n.scrollTop += e.deltaY;
        break;
      }
    }
  }

  /** Set a slider from the cursor's x, as dragging its thumb would. */
  private slide(r: HTMLInputElement): void {
    const b = r.getBoundingClientRect();
    let k = Math.min(1, Math.max(0, (this.x - b.left) / Math.max(1, b.width)));
    if (getComputedStyle(r).direction === 'rtl') k = 1 - k; // Arabic: the slider runs right to left
    const min = Number(r.min || 0);
    const max = Number(r.max || 100);
    const step = Number(r.step) || 1;
    const v = Math.round((min + (max - min) * k) / step) * step;
    if (String(v) === r.value) return;
    r.value = String(v);
    r.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
