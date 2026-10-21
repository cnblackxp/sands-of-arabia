import * as THREE from 'three';

/**
 * In-world markers: icons floating over NPCs (quest "!" / "?", shop coin),
 * light beams over objectives, the bonfire, the gold you dropped on death and
 * quest pickups. All are cheap sprites / a few boxes.
 */

export type IconKind = 'quest' | 'turnin' | 'shop' | 'objective';

const ICON_STYLE: Record<IconKind, { fill: string; ring: string; glyph: string }> = {
  quest: { fill: '#f2b233', ring: '#5a3410', glyph: '!' },
  turnin: { fill: '#f2b233', ring: '#5a3410', glyph: '?' },
  shop: { fill: '#e9d27a', ring: '#5a4410', glyph: '◉' },
  objective: { fill: '#c28cff', ring: '#3a1a5a', glyph: '◆' },
};

const iconTextures = new Map<IconKind, THREE.CanvasTexture>();

export function iconTexture(kind: IconKind): THREE.CanvasTexture {
  let t = iconTextures.get(kind);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const st = ICON_STYLE[kind];
  g.fillStyle = st.ring;
  g.beginPath();
  g.arc(32, 32, 28, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = st.fill;
  g.beginPath();
  g.arc(32, 32, 23, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = st.ring;
  g.font = 'bold 34px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(st.glyph, 32, 34);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  iconTextures.set(kind, t);
  return t;
}

/** A floating icon that tracks something (an NPC's head). */
export class Icon {
  readonly sprite: THREE.Sprite;
  private t = Math.random() * 5;
  constructor(
    scene: THREE.Scene,
    public kind: IconKind,
  ) {
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture(kind), depthWrite: false, fog: false, transparent: true }));
    this.sprite.scale.setScalar(0.75);
    this.sprite.renderOrder = 15;
    scene.add(this.sprite);
  }
  setKind(k: IconKind): void {
    if (k === this.kind) return;
    this.kind = k;
    this.sprite.material.map = iconTexture(k);
    this.sprite.material.needsUpdate = true;
  }
  place(x: number, y: number, z: number, dt: number): void {
    this.t += dt;
    this.sprite.position.set(x, y + 0.15 * Math.sin(this.t * 2.6), z);
  }
  dispose(): void {
    this.sprite.removeFromParent();
    this.sprite.material.dispose();
  }
}

/** A vertical shaft of light that fades upward. */
export function beam(color: THREE.ColorRepresentation, height = 10, radius = 0.4): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(radius * 0.6, radius, height, 12, 1, true);
  geo.translate(0, height / 2, 0);
  const c = new THREE.Color(color);
  const mat = new THREE.ShaderMaterial({
    uniforms: { opacity: { value: 0.3 }, tint: { value: c } },
    // Log-depth chunks: the renderer uses a logarithmic depth buffer.
    vertexShader: `#include <common>
      #include <logdepthbuf_pars_vertex>
      varying float vY;
      void main() {
        vY = uv.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `#include <logdepthbuf_pars_fragment>
      uniform float opacity; uniform vec3 tint; varying float vY;
      void main() {
        #include <logdepthbuf_fragment>
        gl_FragColor = vec4(tint * opacity * pow(1.0 - vY, 1.6), 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(geo, mat);
}

const stoneMat = new THREE.MeshStandardMaterial({ color: 0x5a5048, roughness: 0.95 });
const ashMat = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 1 });
const logMat = new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.9 });
const bladeMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.3, metalness: 0.9 });
const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const emberMat = new THREE.MeshBasicMaterial({ color: 0xff5a20, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const goldMat = new THREE.MeshStandardMaterial({ color: 0xffc94a, emissive: 0x7a4a00, emissiveIntensity: 0.8, roughness: 0.35, metalness: 0.9 });
const sackMat = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.95 });

/** Rest point: a ring of stones, a few logs and a blade planted in the embers. */
export class Bonfire {
  readonly group = new THREE.Group();
  readonly pos: THREE.Vector3;
  private flames: THREE.Object3D[] = [];
  private t = Math.random() * 10;
  lit = false;

  constructor(
    scene: THREE.Scene,
    readonly id: string,
    pos: THREE.Vector3,
    readonly yaw: number,
    template?: THREE.Object3D | null,
  ) {
    this.pos = pos.clone();
    const g = this.group;
    if (template) {
      // The authored prop: `Bonfire` (stones, logs, planted sword) + `Flame`.
      const c = template.clone(true);
      c.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.castShadow = o.name !== 'Flame';
      });
      const flame = c.getObjectByName('Flame');
      if (flame) this.flames.push(flame);
      g.add(c);
      g.position.copy(pos);
      g.rotation.y = yaw;
      scene.add(g);
      this.setLit(false);
      return;
    }
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.18), stoneMat);
      s.position.set(Math.cos(a) * 0.55, 0.07, Math.sin(a) * 0.55);
      s.rotation.y = a;
      g.add(s);
    }
    const ash = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.48, 0.05, 10), ashMat);
    ash.position.y = 0.03;
    g.add(ash);
    for (let i = 0; i < 4; i++) {
      const log = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.75), logMat);
      log.position.set(0, 0.16, 0);
      log.rotation.set(0.55, (i / 4) * Math.PI * 2, 0);
      log.translateZ(0.15);
      g.add(log);
    }
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.85, 0.12), bladeMat);
    blade.position.set(0.05, 0.55, 0);
    blade.rotation.z = 0.12;
    g.add(blade);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.32), bladeMat);
    guard.position.set(0.1, 1.0, 0);
    g.add(guard);
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, 0.14), i % 2 ? emberMat : flameMat);
      f.position.set((Math.random() - 0.5) * 0.3, 0.25, (Math.random() - 0.5) * 0.3);
      this.flames.push(f);
      g.add(f);
    }
    g.position.copy(pos);
    g.rotation.y = yaw;
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material !== flameMat && m.material !== emberMat) m.castShadow = true;
    });
    scene.add(g);
    this.setLit(false);
  }

  setLit(on: boolean): void {
    this.lit = on;
    for (const f of this.flames) f.visible = on;
  }

  update(dt: number): void {
    this.t += dt;
    if (!this.lit) return;
    if (this.flames.length === 1) {
      const k = 0.85 + 0.15 * Math.sin(this.t * 11) + 0.08 * Math.sin(this.t * 23);
      this.flames[0].scale.set(1, k, 1);
      return;
    }
    this.flames.forEach((f, i) => {
      const k = 0.7 + 0.35 * Math.sin(this.t * (7 + i * 1.7) + i);
      f.scale.set(0.8 + 0.2 * k, 0.6 + 0.9 * k, 0.8 + 0.2 * k);
      f.position.y = 0.2 + 0.18 * k;
      f.rotation.y = this.t * (1 + i * 0.3);
    });
  }
}

/** A chest with a hinged lid (authored prop, or a box fallback). */
export class Chest {
  readonly group = new THREE.Group();
  private lid: THREE.Object3D | null = null;
  private openT = -1;
  opened = false;
  /** Buried: a mound of sand until dug up (then it rises and opens like any chest). */
  buried = false;
  private mound: THREE.Mesh | null = null;
  private digT = -1;

  constructor(
    scene: THREE.Scene,
    readonly id: string,
    readonly pos: THREE.Vector3,
    yaw: number,
    readonly secret: boolean,
    template?: THREE.Object3D | null,
  ) {
    if (template) {
      const c = template.clone(true);
      c.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
      });
      this.lid = c.getObjectByName('ChestLid') ?? null;
      this.group.add(c);
    } else {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.6), logMat);
      base.position.y = 0.25;
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.18, 0.62), logMat);
      lid.geometry.translate(0, 0.09, 0.31);
      lid.position.set(0, 0.5, -0.31);
      this.lid = lid;
      this.group.add(base, lid);
    }
    this.group.position.copy(pos);
    this.group.rotation.y = yaw;
    scene.add(this.group);
  }

  /** Bury it: only a low mound of disturbed sand shows. */
  bury(scene: THREE.Scene): void {
    this.buried = true;
    this.group.position.y = this.pos.y - 0.75;
    this.mound = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.32, 7), new THREE.MeshStandardMaterial({ color: 0xc9a06a, roughness: 1, flatShading: true }));
    this.mound.position.copy(this.pos).setY(this.pos.y + 0.12);
    this.mound.receiveShadow = true;
    scene.add(this.mound);
  }

  /** Dig it up: the mound sinks and the chest rises. */
  dig(): void {
    this.buried = false;
    this.digT = 0;
  }

  /** Open instantly (already looted on an earlier visit). */
  setOpen(): void {
    this.opened = true;
    if (this.lid) this.lid.rotation.x = -1.7;
  }

  open(): void {
    this.opened = true;
    this.openT = 0;
  }

  update(dt: number): void {
    if (this.digT >= 0) {
      this.digT += dt;
      const u = Math.min(1, this.digT / 0.9);
      this.group.position.y = this.pos.y - 0.75 * (1 - u);
      if (this.mound) this.mound.scale.setScalar(Math.max(0.01, 1 - u));
      if (u >= 1) {
        this.digT = -1;
        this.mound?.removeFromParent();
      }
    }
    if (this.openT < 0 || !this.lid) return;
    this.openT += dt;
    const u = Math.min(1, this.openT / 0.6);
    this.lid.rotation.x = -1.7 * (1 - Math.pow(1 - u, 3));
    if (u >= 1) this.openT = -1;
  }
}

/**
 * A sluice gate's lever post on Marib's canals: turn it to open or shut the
 * gate (the water rota puzzle).
 */
export class Sluice {
  readonly group = new THREE.Group();
  private wheel: THREE.Group;
  private beamMesh: THREE.Mesh;
  private target = 0;
  private angle = 0;
  open = false;
  constructor(
    scene: THREE.Scene,
    readonly id: string,
    readonly pos: THREE.Vector3,
    yaw: number,
  ) {
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 0.85, flatShading: true });
    const bronze = new THREE.MeshStandardMaterial({ color: 0xb98a3e, roughness: 0.4, metalness: 0.7 });
    const post = (x: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.3, 0.14), wood);
      m.position.set(x, 0.65, 0);
      m.castShadow = true;
      this.group.add(m);
    };
    post(-0.45);
    post(0.45);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.12, 0.16), wood);
    beam.position.y = 1.25;
    this.group.add(beam);
    // Windlass with four spokes: it turns as the gate rises.
    this.wheel = new THREE.Group();
    this.wheel.position.y = 0.95;
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.95, 8), bronze);
    axle.rotation.z = Math.PI / 2;
    this.wheel.add(axle);
    for (let i = 0; i < 4; i++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 0.05), wood);
      sp.rotation.x = (i * Math.PI) / 4;
      sp.position.x = 0.48;
      this.wheel.add(sp);
    }
    this.group.add(this.wheel);
    this.beamMesh = beam_(0x8fd4ff, 3, 0.22);
    this.group.add(this.beamMesh);
    this.group.position.copy(pos);
    this.group.rotation.y = yaw;
    scene.add(this.group);
  }
  setOpen(on: boolean): void {
    this.open = on;
    this.target = on ? Math.PI * 3 : 0;
  }
  /** Highlight it while it is the next gate of an active rota. */
  setHighlight(on: boolean): void {
    this.beamMesh.visible = on;
  }
  update(dt: number): void {
    this.angle += (this.target - this.angle) * Math.min(1, dt * 2.5);
    this.wheel.rotation.x = this.angle;
    const u = (this.beamMesh.material as THREE.ShaderMaterial).uniforms.opacity;
    u.value = 0.25 + 0.1 * Math.sin(performance.now() / 300);
  }
}

/** An inscription to read: the carved face gets a faint pale glow. */
export class LoreStone {
  readonly group = new THREE.Group();
  private beamMesh: THREE.Mesh;
  read = false;
  constructor(
    scene: THREE.Scene,
    readonly id: string,
    readonly pos: THREE.Vector3,
  ) {
    this.beamMesh = beam_(0xe8e0ff, 2.2, 0.28);
    this.group.add(this.beamMesh);
    this.group.position.copy(pos);
    scene.add(this.group);
  }
  update(): void {
    const u = (this.beamMesh.material as THREE.ShaderMaterial).uniforms.opacity;
    u.value = (this.read ? 0.12 : 0.3) + 0.08 * Math.sin(performance.now() / 500 + this.pos.x);
  }
}

const beam_ = (c: THREE.ColorRepresentation, h: number, r: number) => beam(c, h, r);

/** A glowing pile of gold coins with a golden beam (your lost gold / loot). */
export class GoldPile {
  readonly group = new THREE.Group();
  private beamMesh: THREE.Mesh;
  private t = 0;
  constructor(
    scene: THREE.Scene,
    readonly pos: THREE.Vector3,
  ) {
    for (let i = 0; i < 7; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 8), goldMat);
      c.position.set((Math.random() - 0.5) * 0.4, 0.03 + i * 0.03, (Math.random() - 0.5) * 0.4);
      c.rotation.set(Math.random() * 0.4, 0, Math.random() * 0.4);
      this.group.add(c);
    }
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), sackMat);
    bag.position.set(0.15, 0.15, -0.1);
    this.group.add(bag);
    this.beamMesh = beam(0xffc94a, 7, 0.35);
    this.group.add(this.beamMesh);
    this.group.position.copy(pos);
    scene.add(this.group);
  }
  update(dt: number): void {
    this.t += dt;
    (this.beamMesh.material as THREE.ShaderMaterial).uniforms.opacity.value = 0.3 + 0.1 * Math.sin(this.t * 3);
    this.group.rotation.y += dt * 0.5;
  }
  dispose(): void {
    this.group.removeFromParent();
  }
}

/** A quest item lying in the world (a sack / skin) with a violet beam. */
export class Pickup {
  readonly group = new THREE.Group();
  private beamMesh: THREE.Mesh;
  private t = 0;
  constructor(
    scene: THREE.Scene,
    readonly pos: THREE.Vector3,
    readonly item: string,
    readonly label: string,
  ) {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.45, 0.3), sackMat);
    bag.position.y = 0.22;
    bag.castShadow = true;
    this.group.add(bag);
    this.beamMesh = beam(0xc28cff, 8, 0.35);
    this.group.add(this.beamMesh);
    this.group.position.copy(pos);
    scene.add(this.group);
  }
  update(dt: number): void {
    this.t += dt;
    (this.beamMesh.material as THREE.ShaderMaterial).uniforms.opacity.value = 0.3 + 0.1 * Math.sin(this.t * 3);
  }
  dispose(): void {
    this.group.removeFromParent();
  }
}
