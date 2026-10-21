/**
 * Peoples of pre-Islamic Arabia: who lives on each map, what they are called,
 * and (in locales/, `speech.<culture>`) how they greet and part.
 *
 * Names are attested in inscriptions or the classical sources, or modelled on
 * attested forms where a people's women are poorly recorded: Nabataean tomb
 * owners at Hegra (Kamkam, Wushuh, Hinat), Lihyanite kings at Dadan (Talmi,
 * Han'as), Sabaean mukarribs and kings (Karib'il, Yitha'amar, Sumhu'alay),
 * Himyarite kings (Shammar, Abikarib), the Kindite house (Hujr, Imru' al-Qays),
 * and the classical Arabic names of the Hijaz and the tribes. English
 * transliteration is the key; the Arabic forms are in locales/ar.ts `names`.
 */

export type Culture =
  | 'hijazi'
  | 'bedouin'
  | 'nabataean'
  | 'lihyanite'
  | 'thamudic'
  | 'kindite'
  | 'sabaean'
  | 'minaean'
  | 'qatabanian'
  | 'hadrami'
  | 'himyarite'
  | 'gulf';

export const CULTURES: readonly Culture[] = ['hijazi', 'bedouin', 'nabataean', 'lihyanite', 'thamudic', 'kindite', 'sabaean', 'minaean', 'qatabanian', 'hadrami', 'himyarite', 'gulf'];

const HIJAZI_M = ["Amr", "Harith", "Qays", "Zayd", "Aws", "Kalb", "Malik", "Hani", "Thalaba", "Uday", "Hatim", "Duraid", "Urwa", "Sakhr", "Asad", "Rabi'a", "Kulayb", "Muhalhil"];
const HIJAZI_F = ["Hind", "Salma", "Laila", "Rabab", "Khawla", "Asma", "Mawiya", "Zaynab", "Su'ad", "Umayma", "Abla", "Hurayra", "Tumadir", "Unayza", "Fatima"];

export const NAMES: Record<Culture, { male: string[]; female: string[] }> = {
  hijazi: { male: HIJAZI_M, female: HIJAZI_F },
  bedouin: { male: ["Sakhr", "Duraid", "Urwa", "Kulayb", "Muhalhil", "Jassas", "Shanfara", "Ta'abbata", "Sulayk", "Zuhayr", "Antara", "Hatim", "Qays", "Bakr"], female: ["Tumadir", "Abla", "Laila", "Hind", "Salma", "Mawiya", "Unayza", "Khawla"] },
  nabataean: { male: ["Haritat", "Obodat", "Maliku", "Rabbel", "Abd-Obodat", "Wahballat", "Abd-Dushara", "Zaydu", "Kahilu", "Shullay", "Taymu", "Wushuh"], female: ["Shaqilat", "Huldu", "Gamilat", "Kamkam", "Wa'ilat", "Hinat", "Shalamat"] },
  lihyanite: { male: ["Talmi", "Han'as", "Lawdhan", "Shahru", "Abd-Wadd", "Wahb", "Aws"], female: ["Salma", "Hind", "Amat-Wadd", "Khawla"] },
  thamudic: { male: ["Aws", "Wahb", "Malik", "Shahr", "Zayd", "Sa'd"], female: ["Salma", "Hind", "Laila"] },
  kindite: { male: ["Hujr", "Amr", "Harith", "Ma'dikarib", "Shurahbil", "Qays", "Yazid", "Murra"], female: ["Hind", "Fatima", "Umm Jundab", "Unayza"] },
  sabaean: { male: ["Karib'il", "Yitha'amar", "Sumhu'alay", "Ilsharah", "Yada'il", "Abikarib", "Dhamar'ali", "Wahab'il", "Nasha'karib", "Ma'adkarib"], female: ["Bar'at", "Shamsiyat", "Laila", "Hind"] },
  minaean: { male: ["Abiyada'", "Ilyafa", "Waqah'il", "Ammiyada'", "Hawfi'athat"], female: ["Laila", "Hind", "Salma"] },
  qatabanian: { male: ["Shahr", "Yada'ab", "Hawfi'amm", "Waraw'il", "Nabat"], female: ["Laila", "Hind", "Salma"] },
  hadrami: { male: ["Yada'il", "Ili'azz", "Ammdhakhar", "Sadiq", "Abiyasa"], female: ["Laila", "Hind", "Salma"] },
  himyarite: { male: ["Shammar", "Abikarib", "Yasir", "Sharahbil", "Ma'dikarib", "Marthad", "Yazan", "Sayf"], female: ["Hind", "Laila", "Salma"] },
  gulf: { male: ["Tarafa", "Abd-Amr", "Mundhir", "Nu'man", "Jabala", "Imru' al-Qays", "Harith"], female: ["Khawla", "Hind", "Laila", "Mawiya"] },
};

/** The people of the maps built so far (level.json `culture` overrides this). */
export const MAP_CULTURE: Record<string, Culture> = {
  oasis: 'hijazi',
  hegra: 'nabataean',
  caravanserai: 'bedouin',
  wadi: 'hijazi',
  raider_fort: 'bedouin',
  rooftops: 'hijazi',
  cliffs: 'nabataean',
  ruined_temple: 'nabataean',
};

export function isCulture(c: unknown): c is Culture {
  return typeof c === 'string' && (CULTURES as readonly string[]).includes(c);
}

/** Culture of a spawn: its own, the level's, the map's, or the Hijaz. */
export function cultureOf(map: string, level: { culture?: string }, spawn?: { culture?: string }): Culture {
  if (isCulture(spawn?.culture)) return spawn.culture;
  if (isCulture(level.culture)) return level.culture;
  return MAP_CULTURE[map] ?? 'hijazi';
}
