/**
 * Player settings (camera, look, sound, interface, time of day), remembered in
 * localStorage between sessions. Progress lives in progress.ts and the
 * language in i18n.ts; this is everything the Settings and Debug tabs change.
 */

export interface Settings {
  version: 1;
  /** Camera: the true third-person camera is the default; else iso (orthographic) or perspective. */
  thirdPerson: boolean;
  perspective: boolean;
  /** Time of day (hours) and its speed (index into FLOW in main.ts). null = the map's default light. */
  hours: number | null;
  flow: number;
  look: number;
  robe: number;
  /** Minimap: 0 small, 1 large, 2 off. */
  minimap: number;
  volume: number;
  music: number;
  /** Which soundtrack plays (music.json `soundtracks` id). */
  soundtrack: string;
  uiScale: number;
  mouseSens: number;
  stickSens: number;
  invertY: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  version: 1,
  thirdPerson: true,
  perspective: false,
  hours: null,
  flow: 0,
  look: 0,
  robe: 0,
  minimap: 0,
  volume: 0.6,
  music: 0.45,
  soundtrack: 'original',
  uiScale: 1,
  mouseSens: 0.0026,
  stickSens: 2.6,
  invertY: false,
};

const KEY = 'sands-of-arabia.settings.v1';
/** Before settings were saved together, the interface size had its own key. */
const OLD_UI_KEY = 'sands-of-arabia.ui-scale';

export function loadSettings(): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as Partial<Settings>;
      if (d && d.version === 1) {
        // Keep only known keys with the right type (an old or edited save can't break the game).
        for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
          const v = d[k];
          const def = DEFAULT_SETTINGS[k];
          if (k === 'hours' ? v === null || (typeof v === 'number' && Number.isFinite(v)) : typeof v === typeof def) (s as unknown as Record<string, unknown>)[k] = v;
        }
      }
    } else {
      const ui = Number(localStorage.getItem(OLD_UI_KEY));
      if (ui >= 0.6 && ui <= 1.8) s.uiScale = ui;
    }
  } catch {
    // No storage (private window): defaults for this session.
  }
  return s;
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Ignore quota / privacy errors.
  }
}
