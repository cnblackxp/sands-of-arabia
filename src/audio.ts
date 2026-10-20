import type { Sfx } from './fx';

/**
 * Ambience and music. Ambience is synthesised: looping filtered-noise beds
 * (wind, crowd murmur, water) whose levels follow where the player is, plus
 * one-shot details (fire crackle, birds by day, crickets by night) scheduled
 * at random. Music is a set of tracks per mood, cross-faded.
 */

export interface AmbienceState {
  /** 0..1 how open/high the spot is (wind). */
  wind: number;
  /** Number of townsfolk within earshot. */
  crowd: number;
  /** 0..1 closeness to water. */
  water: number;
  /** 0..1 closeness to a fire, and its stereo side. */
  fire: number;
  firePan: number;
  /** 0..1 trees / palms around (birds). */
  trees: number;
  /** 0 day … 1 night. */
  night: number;
}

class NoiseBed {
  readonly gain: GainNode;
  private filter: BiquadFilterNode;
  constructor(
    private ctx: AudioContext,
    buffer: AudioBuffer,
    out: AudioNode,
    type: BiquadFilterType,
    freq: number,
    q: number,
  ) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = type;
    this.filter.frequency.value = freq;
    this.filter.Q.value = q;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    src.connect(this.filter).connect(this.gain).connect(out);
    src.start(0, Math.random() * 1.5);
  }
  set(level: number, freq?: number): void {
    const t = this.ctx.currentTime;
    this.gain.gain.setTargetAtTime(level, t, 0.6);
    if (freq !== undefined) this.filter.frequency.setTargetAtTime(freq, t, 0.8);
  }
}

export class Ambience {
  private wind: NoiseBed | null = null;
  private crowd: NoiseBed | null = null;
  private crowd2: NoiseBed | null = null;
  private water: NoiseBed | null = null;
  private t = 0;
  private nextCrackle = 0;
  private nextBird = 0;
  private nextCricket = 0;

  constructor(private sfx: Sfx) {}

  private ensure(): boolean {
    if (this.wind) return true;
    const ctx = this.sfx.context;
    const buf = this.sfx.noiseBuffer;
    const out = this.sfx.ambience;
    if (!ctx || !buf || !out) return false;
    this.wind = new NoiseBed(ctx, buf, out, 'lowpass', 500, 0.7);
    // Crowd murmur: two band-passed beds around speech formants.
    this.crowd = new NoiseBed(ctx, buf, out, 'bandpass', 420, 1.6);
    this.crowd2 = new NoiseBed(ctx, buf, out, 'bandpass', 900, 2.2);
    this.water = new NoiseBed(ctx, buf, out, 'lowpass', 900, 0.5);
    return true;
  }

  update(dt: number, s: AmbienceState): void {
    if (!this.ensure()) return;
    this.t += dt;
    const t = this.t;
    // Wind gusts: slow overlapping swells.
    const gust = 0.55 + 0.25 * Math.sin(t * 0.21) + 0.2 * Math.sin(t * 0.53 + 1.3);
    this.wind!.set((0.035 + 0.09 * s.wind) * gust, 350 + 500 * gust * (0.5 + s.wind));
    // Crowd: louder with more people, a restless wobble.
    const c = Math.min(1, s.crowd / 18);
    const wob = 0.8 + 0.2 * Math.sin(t * 1.7) * Math.sin(t * 0.63);
    this.crowd!.set(0.05 * c * wob * (1 - 0.6 * s.night));
    this.crowd2!.set(0.025 * c * (0.7 + 0.3 * Math.sin(t * 2.3 + 0.7)) * (1 - 0.6 * s.night));
    this.water!.set(0.05 * s.water * (0.8 + 0.2 * Math.sin(t * 0.9)), 700 + 300 * Math.sin(t * 0.4));

    // One-shot details.
    if (s.fire > 0.05 && t > this.nextCrackle) {
      this.sfx.crackle(s.firePan + (Math.random() - 0.5) * 0.3, s.fire);
      this.nextCrackle = t + 0.05 + Math.random() * (0.4 / (0.3 + s.fire));
    }
    if (s.night < 0.5 && s.trees > 0.05 && t > this.nextBird) {
      this.sfx.chirp((Math.random() - 0.5) * 1.6, 0.4 + s.trees);
      this.nextBird = t + 1.5 + Math.random() * (6 / (0.2 + s.trees));
    }
    if (s.night > 0.5 && t > this.nextCricket) {
      this.sfx.cricket((Math.random() - 0.5) * 1.6, s.night * (0.5 + 0.5 * (1 - s.wind)));
      this.nextCricket = t + 0.4 + Math.random() * 1.4;
    }
  }
}

export type Mood = 'explore' | 'town' | 'night' | 'combat' | 'stronghold';

export interface TrackDef {
  file: string;
  title: string;
  moods: Mood[];
}

/**
 * Music: tracks listed in assets/audio/music/music.json, grouped by mood.
 * Cross-fades between moods; within a mood, plays the next track when one ends.
 */
export class Music {
  private tracks: TrackDef[] = [];
  private current: { el: HTMLAudioElement; track: TrackDef; gain: GainNode; node: MediaElementAudioSourceNode } | null = null;
  private fading: { el: HTMLAudioElement; gain: GainNode }[] = [];
  private mood: Mood | null = null;
  private wanted: Mood = 'explore';
  private holdT = 0;
  credits: string[] = [];

  constructor(
    private sfx: Sfx,
    private base: string,
  ) {}

  async load(): Promise<void> {
    try {
      const r = await fetch(this.base + 'audio/music/music.json');
      if (!r.ok) return;
      const j = (await r.json()) as { tracks: TrackDef[]; credits?: string[] };
      this.tracks = j.tracks ?? [];
      this.credits = j.credits ?? [];
    } catch {
      // No music shipped: silence is fine.
    }
  }

  get nowPlaying(): string {
    return this.current?.track.title ?? '';
  }

  /** Ask for a mood; combat switches fast, calming down waits a few seconds. */
  want(mood: Mood): void {
    if (mood === 'combat' || mood === 'stronghold') {
      this.wanted = mood;
      this.holdT = 6;
    } else if (this.holdT <= 0) {
      this.wanted = mood;
    }
  }

  update(dt: number): void {
    this.holdT -= dt;
    const ctx = this.sfx.context;
    const bus = this.sfx.music;
    if (!ctx || !bus || this.tracks.length === 0) return;
    if (this.wanted !== this.mood || (this.current && this.current.el.ended)) this.play(this.wanted);
    // Fade out old tracks.
    this.fading = this.fading.filter((f) => {
      if (f.gain.gain.value < 0.01) {
        f.el.pause();
        return false;
      }
      return true;
    });
  }

  private play(mood: Mood): void {
    const ctx = this.sfx.context!;
    const bus = this.sfx.music!;
    const pool = this.tracks.filter((t) => t.moods.includes(mood));
    const list = pool.length ? pool : this.tracks;
    // Don't restart the same piece if it suits the new mood too.
    if (this.current && list.includes(this.current.track) && !this.current.el.ended) {
      this.mood = mood;
      return;
    }
    const others = list.filter((t) => t !== this.current?.track);
    const track = (others.length ? others : list)[Math.floor(Math.random() * (others.length ? others.length : list.length))];
    if (this.current) {
      const g = this.current.gain;
      g.gain.setTargetAtTime(0, ctx.currentTime, 1.2);
      this.fading.push({ el: this.current.el, gain: g });
    }
    const el = new Audio(this.base + 'audio/music/' + encodeURIComponent(track.file));
    el.crossOrigin = 'anonymous';
    el.loop = false;
    const node = ctx.createMediaElementSource(el);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    node.connect(gain).connect(bus);
    gain.gain.setTargetAtTime(1, ctx.currentTime, mood === 'combat' ? 0.6 : 1.8);
    void el.play().catch(() => {});
    this.current = { el, track, gain, node };
    this.mood = mood;
  }
}
