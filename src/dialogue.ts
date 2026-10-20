// Flavour lines for strangers in the oasis town. Each conversation picks a few.

export type NpcRole = 'wanderer' | 'merchant' | 'sitter' | 'water_carrier' | 'guard' | 'priest';

export const ROLE_TITLE: Record<NpcRole, string> = {
  wanderer: 'Traveller',
  merchant: 'Merchant',
  sitter: 'Resting townsman',
  water_carrier: 'Water carrier',
  guard: 'Gate guard',
  priest: 'Priest of the shrine',
};

const LINES: Record<NpcRole, string[]> = {
  wanderer: [
    'The caravan from Gerrha came in at noon. Frankincense, pearls, and a great deal of complaining.',
    'Mind the dunes past the tomb, friend. The sand moves when no one is looking.',
    'I came for the market and stayed for the dates. Three days now.',
    'They say a poet will recite at the shrine tonight. I hope he is better than the last one.',
    'Peace upon you. Have you seen a grey camel with a red tassel? No? Neither have I, since morning.',
    'The sun sits low and the stalls light their lamps. This is the best hour of the day.',
    'My uncle swears the rock tomb belongs to a Nabataean king. My uncle swears a great deal.',
    'Walk with me a while? No? Then may your road be short and your water sweet.',
  ],
  merchant: [
    'Cumin, saffron, pepper from across the sea! Smell it, friend, smelling is free.',
    'This copper pot? Hammered in Dedan. For you, a fair price. For your enemy, double.',
    'Silk from the far east, dyed in Tyre. Feel it. No, gently!',
    'Business is good while the wells are full and the roads are quiet.',
    'Frankincense from the southern hills. The gods themselves are fond of it.',
    'I take silver, salt, or a good story. The story had better be very good.',
    'Twelve drachmas. Ten? You wound me. Eleven, and I throw in a handful of dates.',
  ],
  sitter: [
    'Sit, sit. The shade will still be here when the sun is gone.',
    'My knees have walked enough roads. Now they watch the market for me.',
    'In my youth this well gave twice the water. Or I was half as thirsty.',
    'Every evening the same faces, every evening a new tale. That is a town.',
    'Do not trust a man who counts his coins twice in public.',
  ],
  water_carrier: [
    'Water from the spring, cool and clean! A copper for a cup.',
    'The pool is lower this year. The elders pretend not to notice.',
    'Forty trips a day, pool to market and back. My shoulders keep count.',
    'Careful near the palms. The roots are slippery where the water spills.',
  ],
  guard: [
    'Keep your blade sheathed inside the walls, stranger.',
    'The gate closes at full dark. After that, you sleep with the camels.',
    'State your business. Trade? Pilgrimage? Trouble?',
    'We watch the desert road. Raiders have grown bold since the spring rains failed.',
    'The shrine is open to all who come in peace. Remember the peace part.',
  ],
  priest: [
    'Welcome to the house of the gods of this oasis. Leave an offering, if your heart moves you.',
    'The sacred stone has stood here since before the walls. It will stand after them.',
    'The stars are honest guides. Men are less so.',
    'In the holy months, no blood is shed and every traveller is a guest.',
    'Light incense for those on the road tonight. The desert is wide.',
  ],
};

const MALE = ['Amr', 'Harith', 'Qays', 'Zayd', "Imru' al-Qays", 'Aws', 'Kalb', 'Malik', 'Hani', 'Thalaba', 'Uday', 'Shanfara', 'Tarafa', 'Labid', 'Antara', 'Nabigh', 'Hatim', 'Duraid'];
const FEMALE = ['Hind', 'Salma', 'Laila', 'Rabab', 'Khawla', 'Asma', 'Mawiya', 'Zaynab', 'Su\'ad', 'Umayma'];

export function randomName(female: boolean, rnd: () => number = Math.random): string {
  const pool = female ? FEMALE : MALE;
  return pool[Math.floor(rnd() * pool.length)];
}

/** 2–3 random lines for one conversation. */
export function conversation(role: NpcRole, rnd: () => number = Math.random): string[] {
  const pool = [...LINES[role]];
  const n = 2 + (rnd() < 0.5 ? 1 : 0);
  const out: string[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  return out;
}

export const HURT_LINES = ['Ah! Are you mad?', 'Help! A madman with a sword!', 'Guards! Guards!', 'Stay back!'];
