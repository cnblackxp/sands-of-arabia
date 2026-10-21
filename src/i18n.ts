import { ar } from './locales/ar';
import { en, type Dict } from './locales/en';

/**
 * Localisation. Every visible string lives in `locales/en.ts` and
 * `locales/ar.ts` (same shape; the build fails if Arabic misses a key).
 *
 * - `t('section.key', { n })` for a string, with `{n}` placeholders filled.
 * - `L().section` for data tables (quest text, small talk, item names).
 * - `tOr('section.' + id, fallback)` for keys built from level data ids.
 *
 * The choice is saved to localStorage; `onLangChange` lets open UI re-render.
 */

export type Lang = 'en' | 'ar';
export const LANGS: Lang[] = ['en', 'ar'];
const DICTS: Record<Lang, Dict> = { en, ar };
const STORE = 'arabia-rpg.lang';

type Params = Record<string, string | number>;

/** Dotted paths to string leaves, e.g. 'menu.paused'. */
type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : T[K] extends readonly unknown[] ? never : string extends keyof T[K] ? never : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];
export type Key = Paths<Dict>;

function load(): Lang {
  try {
    return localStorage.getItem(STORE) === 'ar' ? 'ar' : 'en';
  } catch {
    return 'en';
  }
}

let current: Lang = load();
const listeners: (() => void)[] = [];

export function lang(): Lang {
  return current;
}

/** The current language's strings. */
export function L(): Dict {
  return DICTS[current];
}

export function setLang(l: Lang): void {
  if (l === current) return;
  current = l;
  try {
    localStorage.setItem(STORE, l);
  } catch {
    // Private mode: the choice lasts for this session only.
  }
  applyDocument();
  for (const fn of listeners) fn();
}

export function onLangChange(fn: () => void): void {
  listeners.push(fn);
}

function lookup(d: unknown, key: string): string | undefined {
  let v = d;
  for (const part of key.split('.')) {
    if (v === null || typeof v !== 'object') return undefined;
    v = (v as Record<string, unknown>)[part];
  }
  return typeof v === 'string' ? v : undefined;
}

/** Fill `{name}` placeholders. */
export function fill(s: string, params?: Params): string {
  return params ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : s;
}

export function t(key: Key, params?: Params): string {
  return fill(lookup(DICTS[current], key) ?? lookup(en, key) ?? key, params);
}

/** Lookup for a key built at run time (ids from level data); `fallback` if missing. */
export function tOr(key: string, fallback: string, params?: Params): string {
  return fill(lookup(DICTS[current], key) ?? fallback, params);
}

/** Language and direction on the document, the HUD and the loading screen. */
export function applyDocument(): void {
  const dir = current === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = current;
  for (const id of ['hud', 'loading']) {
    const el = document.getElementById(id);
    if (el) el.dir = dir;
  }
}
