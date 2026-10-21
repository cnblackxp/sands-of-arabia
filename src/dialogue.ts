import { L, tOr } from './i18n';

// Flavour lines for strangers in the oasis town (text in locales/). Each conversation picks a few.

export type NpcRole = 'wanderer' | 'merchant' | 'sitter' | 'water_carrier' | 'guard' | 'priest' | 'farmer' | 'prisoner';

export const ROLES: readonly NpcRole[] = ['wanderer', 'merchant', 'sitter', 'water_carrier', 'guard', 'priest', 'farmer', 'prisoner'];

const MALE = ['Amr', 'Harith', 'Qays', 'Zayd', "Imru' al-Qays", 'Aws', 'Kalb', 'Malik', 'Hani', 'Thalaba', 'Uday', 'Shanfara', 'Tarafa', 'Labid', 'Antara', 'Nabigh', 'Hatim', 'Duraid'];
const FEMALE = ['Hind', 'Salma', 'Laila', 'Rabab', 'Khawla', 'Asma', 'Mawiya', 'Zaynab', 'Su\'ad', 'Umayma'];

/** A person's name in the current language (names are stored in English). */
export function personName(name: string): string {
  return tOr(`names.${name}`, name);
}

export function randomName(female: boolean, rnd: () => number = Math.random): string {
  const pool = female ? FEMALE : MALE;
  return pool[Math.floor(rnd() * pool.length)];
}

/** 2–3 random lines for one conversation. */
export function conversation(role: NpcRole, rnd: () => number = Math.random): string[] {
  const pool = [...L().lines[role]];
  const n = 2 + (rnd() < 0.5 ? 1 : 0);
  const out: string[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  return out;
}

export const hurtLines = (): string[] => L().hurt;
