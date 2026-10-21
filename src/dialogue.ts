import { fill, L, lang, tOr } from './i18n';
import { NAMES, type Culture } from './lore';
import { poemsFor } from './poetry';

// Flavour lines for strangers in the oasis town (text in locales/). Each conversation picks a few.

export type NpcRole =
  | 'wanderer'
  | 'merchant'
  | 'sitter'
  | 'water_carrier'
  | 'guard'
  | 'priest'
  | 'farmer'
  | 'prisoner'
  | 'poet'
  | 'kahin'
  | 'elder'
  | 'feast_master'
  | 'official'
  | 'caravaneer'
  | 'musician'
  | 'envoy'
  | 'refugee';

export const ROLES: readonly NpcRole[] = ['wanderer', 'merchant', 'sitter', 'water_carrier', 'guard', 'priest', 'farmer', 'prisoner', 'poet', 'kahin', 'elder', 'feast_master', 'official', 'caravaneer', 'musician', 'envoy', 'refugee'];

const MALE = ['Amr', 'Harith', 'Qays', 'Zayd', "Imru' al-Qays", 'Aws', 'Kalb', 'Malik', 'Hani', 'Thalaba', 'Uday', 'Shanfara', 'Tarafa', 'Labid', 'Antara', 'Nabigh', 'Hatim', 'Duraid'];
const FEMALE = ['Hind', 'Salma', 'Laila', 'Rabab', 'Khawla', 'Asma', 'Mawiya', 'Zaynab', 'Su\'ad', 'Umayma'];

/** A person's name in the current language (names are stored in English). */
export function personName(name: string): string {
  return tOr(`names.${name}`, name);
}

export function randomName(female: boolean, rnd: () => number = Math.random, culture: Culture = 'hijazi'): string {
  const set = NAMES[culture] ?? NAMES.hijazi;
  const pool = female ? (set.female.length ? set.female : FEMALE) : set.male.length ? set.male : MALE;
  return pool[Math.floor(rnd() * pool.length)];
}

const pick = <T>(a: readonly T[], rnd: () => number): T => a[Math.floor(rnd() * a.length)];

/**
 * One conversation: maybe a greeting in the speaker's people's own words, 2–3
 * lines for their role (a merchant may haggle), and maybe their farewell.
 */
export function conversation(role: NpcRole, rnd: () => number = Math.random, culture: Culture = 'hijazi'): string[] {
  const pool = [...L().lines[role]];
  const n = 2 + (rnd() < 0.5 ? 1 : 0);
  const out: string[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  if (role === 'merchant' && rnd() < 0.5) out.push(pick(L().lines.haggle, rnd));
  const speech = L().speech[culture];
  if (speech && rnd() < 0.5) out.unshift(pick(speech.greet, rnd));
  if (speech && rnd() < 0.35) out.push(pick(speech.farewell, rnd));
  return out;
}

/**
 * A recitation: an opening remark, the verses (two hemistichs per line), and
 * the attribution. Arabic shows the original, vocalised; English the translation.
 * `index` walks through the poems this people knows, one per conversation.
 */
export function recitation(culture: Culture, index: number, rnd: () => number = Math.random): { lines: string[]; verse: boolean[] } {
  const poems = poemsFor(culture);
  const poem = poems[index % poems.length];
  const ar = lang() === 'ar';
  const lines = [pick(L().poetry.intro, rnd)];
  const verse = [false];
  for (const v of poem.verses) {
    const [a, b] = ar ? v.ar : v.en;
    lines.push(`${a}\n${b}`);
    verse.push(true);
  }
  lines.push(fill(L().poetry.after, { poet: ar ? poem.poet.ar : poem.poet.en, title: ar ? poem.title.ar : poem.title.en }));
  verse.push(false);
  return { lines, verse };
}

export const hurtLines = (): string[] => L().hurt;
