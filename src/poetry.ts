import type { Culture } from './lore';

/**
 * Real pre-Islamic poetry, recited by poets, elders and princes in the world.
 *
 * Arabic: the classical texts (public domain), vocalised. The Mu'allaqat follow
 * the received text as in al-Zawzani's Sharh al-Mu'allaqat al-Sab' and al-Tabrizi's
 * commentary; the other poems their diwans and Abu Tammam's Hamasa.
 *
 * English: translated for this game (not taken from any modern copyrighted
 * translation). Each verse is two hemistichs, shown on two lines.
 *
 * `cultures` says who would know and recite the poem: a Kindite court for
 * Imru' al-Qays, Tayyi' elders for Hatim, the fair of Ukaz for almost everyone.
 */

export interface Verse {
  ar: [string, string];
  en: [string, string];
}

export interface Poem {
  id: string;
  poet: { en: string; ar: string };
  title: { en: string; ar: string };
  /** Where the Arabic text comes from (all public domain). */
  source: string;
  cultures: Culture[];
  verses: Verse[];
}

const MUALLAQA = "Mu'allaqa (al-Zawzani, Sharh al-Mu'allaqat al-Sab')";

export const POEMS: Poem[] = [
  {
    id: 'imru_qifa',
    poet: { en: "Imru' al-Qays", ar: 'امرؤ القيس' },
    title: { en: 'the Mu’allaqa, “Halt, my two friends”', ar: 'المعلقة «قفا نبك»' },
    source: MUALLAQA,
    cultures: ['kindite', 'hijazi', 'bedouin', 'nabataean'],
    verses: [
      {
        ar: ['قِفَا نَبْكِ مِنْ ذِكْرَى حَبِيبٍ وَمَنْزِلِ', 'بِسِقْطِ اللِّوَى بَيْنَ الدَّخُولِ فَحَوْمَلِ'],
        en: ['Halt, my two friends, and let us weep for a love remembered and a camp,', 'where the sand-tongue ends, between al-Dakhul and Hawmal;'],
      },
      {
        ar: ['فَتُوضِحَ فَالْمِقْرَاةِ لَمْ يَعْفُ رَسْمُهَا', 'لِمَا نَسَجَتْهَا مِنْ جَنُوبٍ وَشَمْأَلِ'],
        en: ['and Tudih and al-Miqrat, whose traces are not yet gone', 'for all the south wind and the north have woven over them.'],
      },
      {
        ar: ['وَلَيْلٍ كَمَوْجِ الْبَحْرِ أَرْخَى سُدُولَهُ', 'عَلَيَّ بِأَنْوَاعِ الْهُمُومِ لِيَبْتَلِي'],
        en: ['And many a night like the sea’s swell has let its curtains down', 'upon me, with every kind of care, to try me.'],
      },
    ],
  },
  {
    id: 'tarafa_khawla',
    poet: { en: 'Tarafa ibn al-Abd', ar: 'طرفة بن العبد' },
    title: { en: 'the Mu’allaqa, “Khawla has ruins”', ar: 'المعلقة «لخولة أطلال»' },
    source: MUALLAQA,
    cultures: ['gulf', 'hijazi', 'bedouin'],
    verses: [
      {
        ar: ['لِخَوْلَةَ أَطْلَالٌ بِبُرْقَةِ ثَهْمَدِ', 'تَلُوحُ كَبَاقِي الْوَشْمِ فِي ظَاهِرِ الْيَدِ'],
        en: ['Khawla has ruins on the stony slope of Thahmad;', 'they glimmer like a tattoo’s last trace on the back of a hand.'],
      },
      {
        ar: ['سَتُبْدِي لَكَ الْأَيَّامُ مَا كُنْتَ جَاهِلًا', 'وَيَأْتِيكَ بِالْأَخْبَارِ مَنْ لَمْ تُزَوِّدِ'],
        en: ['The days will show you what you did not know,', 'and news will come to you by one you never gave provisions.'],
      },
    ],
  },
  {
    id: 'zuhayr_umm_awfa',
    poet: { en: 'Zuhayr ibn Abi Sulma', ar: 'زهير بن أبي سلمى' },
    title: { en: 'the Mu’allaqa, “Is it from Umm Awfa”', ar: 'المعلقة «أمن أم أوفى»' },
    source: MUALLAQA,
    cultures: ['hijazi', 'bedouin'],
    verses: [
      {
        ar: ['أَمِنْ أُمِّ أَوْفَى دِمْنَةٌ لَمْ تَكَلَّمِ', 'بِحَوْمَانَةِ الدَّرَّاجِ فَالْمُتَثَلَّمِ'],
        en: ['Is it Umm Awfa’s, this trace of a camp that will not speak,', 'in the stony ground of al-Darraj and al-Mutathallam?'],
      },
      {
        ar: ['سَئِمْتُ تَكَالِيفَ الْحَيَاةِ وَمَنْ يَعِشْ', 'ثَمَانِينَ حَوْلًا لَا أَبَا لَكَ يَسْأَمِ'],
        en: ['I am weary of life’s burdens; whoever lives', 'eighty years, upon my word, grows weary.'],
      },
      {
        ar: ['وَمَنْ يَجْعَلِ الْمَعْرُوفَ مِنْ دُونِ عِرْضِهِ', 'يَفِرْهُ وَمَنْ لَا يَتَّقِ الشَّتْمَ يُشْتَمِ'],
        en: ['Whoever sets kindness before his honour as a shield keeps it whole;', 'whoever will not guard against reproach is reproached.'],
      },
    ],
  },
  {
    id: 'labid_afat',
    poet: { en: 'Labid ibn Rabi’a', ar: 'لبيد بن ربيعة' },
    title: { en: 'the Mu’allaqa, “Effaced are the dwellings”', ar: 'المعلقة «عفت الديار»' },
    source: MUALLAQA,
    cultures: ['hijazi', 'bedouin'],
    verses: [
      {
        ar: ['عَفَتِ الدِّيَارُ مَحَلُّهَا فَمُقَامُهَا', 'بِمِنًى تَأَبَّدَ غَوْلُهَا فَرِجَامُهَا'],
        en: ['Effaced are the dwellings, the brief halts and the long stays,', 'at Mina; gone wild are al-Ghawl and al-Rijam.'],
      },
    ],
  },
  {
    id: 'antara_mutaraddam',
    poet: { en: 'Antara ibn Shaddad', ar: 'عنترة بن شداد' },
    title: { en: 'the Mu’allaqa, “Have the poets left”', ar: 'المعلقة «هل غادر الشعراء»' },
    source: MUALLAQA,
    cultures: ['bedouin', 'hijazi'],
    verses: [
      {
        ar: ['هَلْ غَادَرَ الشُّعَرَاءُ مِنْ مُتَرَدَّمِ', 'أَمْ هَلْ عَرَفْتَ الدَّارَ بَعْدَ تَوَهُّمِ'],
        en: ['Have the poets left a single place unmended?', 'Or did you know the dwelling only after long doubt?'],
      },
      {
        ar: ['يَا دَارَ عَبْلَةَ بِالْجِوَاءِ تَكَلَّمِي', 'وَعِمِي صَبَاحًا دَارَ عَبْلَةَ وَاسْلَمِي'],
        en: ['O dwelling of Abla at al-Jiwa’, speak!', 'Good morning to you, dwelling of Abla, and be safe.'],
      },
    ],
  },
  {
    id: 'amr_hubbi',
    poet: { en: 'Amr ibn Kulthum', ar: 'عمرو بن كلثوم' },
    title: { en: 'the Mu’allaqa, “Ho, rise with your bowl”', ar: 'المعلقة «ألا هبي بصحنك»' },
    source: MUALLAQA,
    cultures: ['bedouin', 'nabataean', 'gulf'],
    verses: [
      {
        ar: ['أَلَا هُبِّي بِصَحْنِكِ فَاصْبَحِينَا', 'وَلَا تُبْقِي خُمُورَ الْأَنْدَرِينَا'],
        en: ['Ho, rise with your bowl and pour us the morning draught,', 'and leave nothing of the wines of al-Andarin.'],
      },
    ],
  },
  {
    id: 'harith_asma',
    poet: { en: 'al-Harith ibn Hilliza', ar: 'الحارث بن حلزة' },
    title: { en: 'the Mu’allaqa, “Asma’ has told us”', ar: 'المعلقة «آذنتنا ببينها»' },
    source: MUALLAQA,
    cultures: ['bedouin', 'gulf'],
    verses: [
      {
        ar: ['آذَنَتْنَا بِبَيْنِهَا أَسْمَاءُ', 'رُبَّ ثَاوٍ يُمَلُّ مِنْهُ الثَّوَاءُ'],
        en: ['Asma’ has told us she is leaving;', 'many a guest outstays the welcome of his staying.'],
      },
    ],
  },
  {
    id: 'shanfara_lamiyya',
    poet: { en: 'al-Shanfara', ar: 'الشنفرى' },
    title: { en: 'The Lamiyyat al-Arab', ar: 'لامية العرب' },
    source: 'Lamiyyat al-Arab (al-Zamakhshari, A’jab al-Ajab)',
    cultures: ['bedouin', 'hijazi', 'thamudic'],
    verses: [
      {
        ar: ['أَقِيمُوا بَنِي أُمِّي صُدُورَ مَطِيِّكُمْ', 'فَإِنِّي إِلَى قَوْمٍ سِوَاكُمْ لَأَمْيَلُ'],
        en: ['Sons of my mother, raise the breasts of your mounts and go;', 'for it is to a people other than you that I lean.'],
      },
      {
        ar: ['وَفِي الْأَرْضِ مَنْأًى لِلْكَرِيمِ عَنِ الْأَذَى', 'وَفِيهَا لِمَنْ خَافَ الْقِلَى مُتَعَزَّلُ'],
        en: ['The earth holds a refuge for the noble from harm,', 'and for one who fears men’s hatred, a place apart.'],
      },
    ],
  },
  {
    id: 'khansa_sakhr',
    poet: { en: 'al-Khansa’', ar: 'الخنساء' },
    title: { en: 'Elegy for her brother Sakhr', ar: 'رثاء أخيها صخر' },
    source: 'Diwan al-Khansa’',
    cultures: ['hijazi', 'bedouin'],
    verses: [
      {
        ar: ['قَذًى بِعَيْنِكِ أَمْ بِالْعَيْنِ عُوَّارُ', 'أَمْ ذَرَّفَتْ إِذْ خَلَتْ مِنْ أَهْلِهَا الدَّارُ'],
        en: ['Is it a mote in your eye, or a soreness in it,', 'or has it streamed since the house was emptied of its people?'],
      },
      {
        ar: ['وَإِنَّ صَخْرًا لَتَأْتَمُّ الْهُدَاةُ بِهِ', 'كَأَنَّهُ عَلَمٌ فِي رَأْسِهِ نَارُ'],
        en: ['And Sakhr: the guides themselves would follow him,', 'as if he were a mountain with a fire upon its peak.'],
      },
    ],
  },
  {
    id: 'hatim_mawiya',
    poet: { en: 'Hatim al-Ta’i', ar: 'حاتم الطائي' },
    title: { en: 'To Mawiya', ar: 'إلى ماوية' },
    source: 'Diwan Hatim al-Ta’i',
    cultures: ['bedouin', 'thamudic', 'hijazi'],
    verses: [
      {
        ar: ['أَمَاوِيَّ إِنَّ الْمَالَ غَادٍ وَرَائِحٌ', 'وَيَبْقَى مِنَ الْمَالِ الْأَحَادِيثُ وَالذِّكْرُ'],
        en: ['Mawiya, wealth comes with the morning and goes with the evening;', 'of wealth, all that stays are the stories and the remembrance.'],
      },
    ],
  },
  {
    id: 'samawal_ird',
    poet: { en: 'al-Samaw’al ibn Adiya', ar: 'السموأل بن عادياء' },
    title: { en: 'On honour', ar: 'في العرض' },
    source: 'Abu Tammam, al-Hamasa',
    cultures: ['hijazi', 'nabataean', 'lihyanite'],
    verses: [
      {
        ar: ['إِذَا الْمَرْءُ لَمْ يُدْنَسْ مِنَ اللُّؤْمِ عِرْضُهُ', 'فَكُلُّ رِدَاءٍ يَرْتَدِيهِ جَمِيلُ'],
        en: ['When a man’s honour is not soiled by meanness,', 'every cloak he wraps himself in is handsome.'],
      },
    ],
  },
  {
    id: 'nabigha_umayma',
    poet: { en: 'al-Nabigha al-Dhubyani', ar: 'النابغة الذبياني' },
    title: { en: '“Leave me, Umayma”', ar: 'كليني لهم يا أميمة' },
    source: 'Diwan al-Nabigha al-Dhubyani',
    cultures: ['hijazi', 'gulf', 'bedouin'],
    verses: [
      {
        ar: ['كِلِينِي لِهَمٍّ يَا أُمَيْمَةَ نَاصِبِ', 'وَلَيْلٍ أُقَاسِيهِ بَطِيءِ الْكَوَاكِبِ'],
        en: ['Leave me, Umayma, to a care that wears me down,', 'and a night I must endure, slow in its stars.'],
      },
    ],
  },
  {
    id: 'asha_hurayra',
    poet: { en: 'al-A’sha', ar: 'الأعشى' },
    title: { en: '“Bid Hurayra farewell”', ar: 'ودع هريرة' },
    source: 'Diwan al-A’sha (Maymun ibn Qays)',
    cultures: ['hijazi', 'sabaean', 'himyarite', 'hadrami', 'gulf'],
    verses: [
      {
        ar: ['وَدِّعْ هُرَيْرَةَ إِنَّ الرَّكْبَ مُرْتَحِلُ', 'وَهَلْ تُطِيقُ وَدَاعًا أَيُّهَا الرَّجُلُ'],
        en: ['Bid Hurayra farewell, for the riders are moving on;', 'but can you bear a farewell, O man?'],
      },
    ],
  },
];

/** Poems a reciter of this culture would know (everyone knows a few from Ukaz). */
export function poemsFor(culture: Culture): Poem[] {
  const own = POEMS.filter((p) => p.cultures.includes(culture));
  return own.length ? own : POEMS.filter((p) => p.cultures.includes('hijazi'));
}
