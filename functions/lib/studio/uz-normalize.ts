// Deterministic fixes of the model's Uzbek (spec §7.3), from the 30-topic
// measurement T0.1 (studio/measure/uz-error-dictionary.json, MEASURE-30 §9).
//
// Applied to Uzbek text values only: titles, points, bullets, talk. Never to
// image_prompt (English, «farmer's»), never to Russian decks. Order:
//   1. NFC;
//   2. the six character rules, in order (o‘/g‘ before the glottal stop);
//   3. the word list: forms the agent's review found in the 30 decks, each
//      checked to be no Uzbek word, so it can be replaced blindly.
// tests/studio-uz-normalize.test.ts runs every Uzbek text of the measurement
// through it and allows only the reviewed fixes, and runs the word list over
// the site's own content/ and src/ (0 hits).
//
// The agent is not a native speaker: the list grows with the native speaker's
// review before R-ST1 (spec §14.6), and every new entry goes through the same
// two tests. Context-dependent pairs (auto=false in the dictionary) are never
// replaced here; UZ_CONTEXT_PAIRS keeps them for tests and future glossaries.

export interface UzRule {
  readonly id: string;
  readonly pattern: RegExp;
  readonly replace: (match: string, ...groups: string[]) => string;
}

const LATIN = "A-Za-z";
const NOT_WORD = "(?![\\p{L}\\p{N}_])";
const NOT_AFTER_WORD = "(?<![\\p{L}\\p{N}_])";

/** Cyrillic letters that look like Latin ones (а е о р с х у к), by code point. */
const CYRILLIC_TWINS: ReadonlyMap<string, string> = new Map(
  ([[0x430, "a"], [0x435, "e"], [0x43e, "o"], [0x440, "p"], [0x441, "s"], [0x445, "x"], [0x443, "y"], [0x43a, "k"]] as const)
    .map(([code, latin]) => [String.fromCodePoint(code), latin]),
);
const TWIN_CLASS = [...CYRILLIC_TWINS.keys()].join("");

/**
 * Words that end in -kga / -qga without being a dative. None is known yet; a
 * native speaker's find goes here (lower case, whole word).
 */
export const DATIVE_EXCEPTIONS: ReadonlySet<string> = new Set<string>();

/** The character rules of the dictionary, in the order they run. */
export const UZ_CHAR_RULES: readonly UzRule[] = [
  // o‘ and g‘ take U+2018 (a T=0.3 part wrote 31 ASCII apostrophes; uz08 had 2).
  { id: "ok-gk-apostrophe", pattern: new RegExp(`(?<=[OoGg])['\`ʻʼ’](?=[${LATIN}])`, "g"), replace: () => "‘" },
  // The glottal stop takes U+2019 (ta’sir, ma’ruza); after the rule above.
  { id: "glottal-apostrophe", pattern: new RegExp(`(?<=[${LATIN}])['\`ʻʼ](?=[${LATIN}])`, "g"), replace: () => "’" },
  // Turkish dotless ı (shaharları in the pilot deck).
  { id: "turkish-dotless-i", pattern: new RegExp(String.fromCodePoint(0x131), "g"), replace: () => "i" },
  // A soft hyphen inside a word (almash­tirish, uz20).
  { id: "soft-hyphen", pattern: new RegExp(String.fromCodePoint(0xad), "g"), replace: () => "" },
  // A Cyrillic twin inside a Latin word (kattalsа with a Cyrillic а, uz07).
  {
    id: "cyrillic-homoglyph-in-latin-word",
    pattern: new RegExp(`(?<=[${LATIN}‘’])[${TWIN_CLASS}](?=[${LATIN}‘’]|${NOT_WORD})`, "gu"),
    replace: (twin) => CYRILLIC_TWINS.get(twin) ?? twin,
  },
  // After a final q or k the dative is -qa / -ka: ravnaqga → ravnaqqa, sharqga → sharqqa.
  {
    id: "dative-after-q-k",
    pattern: new RegExp(`${NOT_AFTER_WORD}([\\p{L}\\p{N}_]*?)([qk])ga${NOT_WORD}`, "gu"),
    replace: (word, stem: string, letter: string) =>
      DATIVE_EXCEPTIONS.has(word.toLowerCase()) ? word : `${stem}${letter}${letter}a`,
  },
];

export interface UzWordFix {
  readonly wrong: string;
  readonly right: string;
  /** nonword | spelling | wrongword | term | fact (the review's type). */
  readonly type: string;
  /** Only the whole word: the wrong form plus a suffix would be a real word (Pulsl + ar = pulslar). */
  readonly whole?: true;
}

/**
 * The 40 auto=true entries of uz-error-dictionary.json. A wrong form matches
 * at the start of a word, in any case, and keeps the suffix that follows it
 * (gaslardan → gazlardan), unless `whole`.
 */
export const UZ_WORD_FIXES: readonly UzWordFix[] = [
  { wrong: "Avlodalari", right: "Avlodlari", type: "nonword" },
  { wrong: "Madarislar", right: "Madrasalar", type: "nonword" },
  { wrong: "Mavarounnahr", right: "Movarounnahr", type: "spelling" },
  { wrong: "Temurlar sulolasi", right: "Temuriylar sulolasi", type: "spelling" },
  { wrong: "Temur tuzoqlari", right: "Temur tuzuklari", type: "wrongword" },
  { wrong: "Quvnatli saltanat", right: "Qudratli saltanat", type: "nonword" },
  { wrong: "gumbasti", right: "gumbazi", type: "nonword" },
  { wrong: "minoyalar", right: "minoralar", type: "nonword" },
  { wrong: "meridiian", right: "meridian", type: "spelling" },
  { wrong: "zonalarari", right: "zonalari", type: "nonword" },
  { wrong: "zonaslar", right: "zonalar", type: "spelling" },
  { wrong: "Muhofoza", right: "Muhofaza", type: "spelling" },
  { wrong: "Jadvlda", right: "Jadvalda", type: "spelling" },
  { wrong: "jarayandan", right: "jarayondan", type: "spelling" },
  { wrong: "gaslar", right: "gazlar", type: "spelling" },
  { wrong: "Klapapan", right: "Klapan", type: "nonword" },
  { wrong: "Pulsl", right: "Puls", type: "spelling", whole: true },
  { wrong: "qontalanish", right: "qon aylanish", type: "nonword" },
  { wrong: "inertsionlik", right: "inertlik", type: "term" },
  { wrong: "domennomi", right: "domen nomi", type: "spelling" },
  { wrong: "obrozi", right: "obrazi", type: "spelling" },
  { wrong: "ma’suliyat", right: "mas’uliyat", type: "spelling" },
  { wrong: "totlik", right: "totuvlik", type: "spelling" },
  { wrong: "yeish", right: "yeyish", type: "spelling" },
  { wrong: "Bulohlar", right: "Buloqlar", type: "nonword" },
  { wrong: "Bulok‘", right: "Buloq", type: "spelling" },
  { wrong: "o‘zgarinsa", right: "o‘zgarsa", type: "nonword" },
  { wrong: "ko‘paytsak", right: "ko‘paytirsak", type: "nonword" },
  { wrong: "Issiganda", right: "Isiganda", type: "spelling" },
  { wrong: "ta’siz", right: "ta’msiz", type: "nonword" },
  { wrong: "tekkananda", right: "tekkanda", type: "nonword" },
  { wrong: "tekishanda", right: "tekkanda", type: "nonword" },
  { wrong: "to‘rttan", right: "to‘rtdan", type: "spelling" },
  { wrong: "hayot beringadi", right: "hayot beradi", type: "nonword" },
  { wrong: "Chiroyi havoda", right: "Ochiq havoda", type: "nonword" },
  { wrong: "bir-ketin", right: "ketma-ket", type: "nonword" },
  { wrong: "ta’lib olgan", right: "ta’lim olgan", type: "spelling" },
  { wrong: "Jim jism", right: "Tinch jism", type: "nonword" },
  { wrong: "Tasodifiy kuchlar muvozanati", right: "Kuchlar muvozanati", type: "wrongword" },
  { wrong: "Kumushbeka", right: "Kumushbibi", type: "fact" },
];

/**
 * The 13 auto=false pairs: right in one context, wrong in another («fanqa»,
 * «Bulb», «yoriladi» …). Never replaced; the tests check they stay as written.
 */
export const UZ_CONTEXT_PAIRS: ReadonlyArray<readonly [wrong: string, right: string]> = [
  ["kaft tomir", "bilak tomir"],
  ["Romadan", "Rimdan"],
  ["Bulb", "Lampochka"],
  ["Ruhoniy kamolot", "Ruhiy kamolot"],
  ["o‘g‘iramiz", "o‘giramiz"],
  ["Teng yo‘nalgan tezlik", "O‘zgarmas tezlik"],
  ["yoriladi", "yoritiladi"],
  ["fanqa", "fanga"],
  ["Fransiya olimi", "fransuz olimi"],
  ["Qadam qo‘yib yechamiz", "Bosqichma-bosqich yechamiz"],
  ["barmoqdek ushlab turdi", "mustahkam boshqardi"],
  ["pulpasida", "etida"],
  ["Eng kichik umumiy bo‘luvchi", "Eng katta umumiy bo‘luvchi"],
];

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The case of the match carried to the fix: Avlodalari → Avlodlari, avlodalari → avlodlari, KUMUSHBEKA → KUMUSHBIBI. */
function inCaseOf(match: string, right: string): string {
  const letters = match.replace(/[^\p{L}]/gu, "");
  if (letters.length > 1 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) return right.toUpperCase();
  const first = match.charAt(0);
  const head = first === first.toUpperCase() && first !== first.toLowerCase() ? right.charAt(0).toUpperCase() : right.charAt(0).toLowerCase();
  return head + right.slice(1);
}

/** The word list as rules: at the start of a word (a letter, digit, _ or ‘’ before it ends the match). */
export const UZ_WORD_RULES: readonly UzRule[] = UZ_WORD_FIXES.map((fix) => ({
  id: `word:${fix.wrong}`,
  pattern: new RegExp(`(?<![\\p{L}\\p{N}_‘’])${escapeRegExp(fix.wrong)}${fix.whole ? NOT_WORD : ""}`, "giu"),
  replace: (match: string) => inCaseOf(match, fix.right),
}));

export interface UzNormalized {
  readonly text: string;
  /** How often each rule fired (ids of UZ_CHAR_RULES and "word:<wrong>"); counts only, never text. */
  readonly fixes: Readonly<Record<string, number>>;
}

/** One Uzbek text value, fixed. Pure; never throws. */
export function normalizeUz(text: string): UzNormalized {
  let out = text.normalize("NFC");
  const fixes: Record<string, number> = {};
  for (const rule of [...UZ_CHAR_RULES, ...UZ_WORD_RULES]) {
    out = out.replace(rule.pattern, (...args: unknown[]) => {
      // (match, ...groups, offset, input): the groups end where the numeric offset begins.
      const match = args[0] as string;
      const groups = args.slice(1, args.findIndex((arg) => typeof arg === "number")).map((arg) => (typeof arg === "string" ? arg : ""));
      const fixed = rule.replace(match, ...groups);
      if (fixed !== match) fixes[rule.id] = (fixes[rule.id] ?? 0) + 1;
      return fixed;
    });
  }
  return { text: out, fixes };
}

/** normalizeUz(text).text. */
export function normalizeUzText(text: string): string {
  return normalizeUz(text).text;
}

/** Adds the counts of `next` into `total` (for a whole deck). */
export function addFixes(total: Record<string, number>, next: Readonly<Record<string, number>>): Record<string, number> {
  for (const [id, count] of Object.entries(next)) total[id] = (total[id] ?? 0) + count;
  return total;
}
