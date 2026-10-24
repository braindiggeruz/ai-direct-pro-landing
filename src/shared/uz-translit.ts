// Uzbek Cyrillic ↔ Latin conversion: deterministic, letter by letter, in the
// visitor's browser. No model call and no network request, so it has no quota
// and never touches the chat's 3 trial replies (translator pages, option D of
// docs/seo/research/2026-10-24-snippets-translator/translator-market.md §4.3).
//
// Output follows the site convention for Uzbek Latin: o‘ and g‘ with U+2018,
// the tutuq belgisi (Cyrillic ъ) with U+2019. Input may use any apostrophe
// people type: U+0027 ', U+2018 ‘, U+2019 ’, U+02BB ʻ, U+02BC ʼ, U+0060 `,
// U+00B4 ´.
//
// Cyrillic → Latin (official 1995 alphabet):
//   а a, б b, в v, г g, д d, ё yo, ж j, з z, и i, й y, к k, л l, м m, н n,
//   о o, п p, р r, с s, т t, у u, ф f, х x, ч ch, ш sh, э e, ю yu, я ya,
//   ў o‘, қ q, ғ g‘, ҳ h; ь is dropped;
//   е → ye at the start of a word and after a vowel, ъ or ь (ер → yer,
//       поезд → poyezd, съезд → s’yezd), otherwise e (кел → kel);
//   ц → ts after a vowel (милиция → militsiya), otherwise s (цирк → sirk,
//       концерт → konsert);
//   ъ → ’ (маъно → ma’no), except after ў, where o‘ already carries the mark
//       (мўъжиза → mo‘jiza);
//   сҳ → s’h, so that it does not read as sh (Исҳоқ → Is’hoq).
//   A digraph keeps only its first letter capital when the Cyrillic letter is
//   capital on its own (Шаҳар → Shahar) and goes all capitals when a
//   neighbouring letter is a capital too (ШАҲАР → SHAHAR).
//
// Russian-only letters (decision 2026-10-24): щ and ы are not in the Uzbek
// Cyrillic alphabet. Uzbek Latin spells Russian loanwords with them as they
// are pronounced in Uzbek, so щ → sh and ы → i (ящик → yashik, Рыбаков →
// Ribakov). The tool converts Uzbek, not Russian: scriptNotes() reports both
// letters so the page can say so.
//
// Latin → Cyrillic (the inverse):
//   sh ш, ch ч, yo ё, yu ю, ya я, ye е; o‘ ў and g‘ ғ with any apostrophe
//   (for o, a closing-quote-like mark ' ’ ` ʼ ´ counts only before a letter,
//   so 'kino' stays a quoted word; ‘ and ʻ always do); yo‘ → йў (yo‘l → йўл);
//   e → э at the start of a word and after a vowel (poeziya → поэзия), else е;
//   s’h → сҳ; any other apostrophe between two letters → ъ (ma’no → маъно);
//   q қ, h ҳ, x х, and the remaining letters one to one.
//   A g at the end of a word that opened with a quote keeps the quote
//   ('miting' → 'митинг'), while tog' with no opening quote is тоғ.
//   Links and e-mail addresses (https://…, www.…, name@host) stay as they are.
//   ts and ng stay тс and нг. Known ambiguities, left as written because a
//   letter-by-letter tool cannot know the word:
//     - ц: Latin writes Russian ц as s or ts, so militsiya → милитсия, not
//       милиция, and sirk → сирк, not цирк;
//     - й + о: rayon → раён, not район (Latin yo is always ё here);
//     - ъ/ь in loanwords: obyekt → обект, premyer → премер, mo‘jiza → мўжиза;
//     - a quoted word ending in g‘ written with a plain apostrophe ('tog')
//       reads as a quote: 'тог';
//     - c and w are not Uzbek letters (brands, English words): a word that
//       has one stays Latin as a whole (WhatsApp, Coca-Cola), so no word comes
//       out half Latin, half Cyrillic.
//   scriptNotes() reports c and w for the page.

/** o‘ and g‘ (U+2018 LEFT SINGLE QUOTATION MARK, site convention). */
export const UZ_LETTER_MARK = '‘';
/** Tutuq belgisi (U+2019 RIGHT SINGLE QUOTATION MARK, site convention). */
export const UZ_TUTUQ = '’';

/** Every apostrophe people type for o‘, g‘ and the tutuq. */
const APOSTROPHES = new Set(["'", '‘', '’', 'ʻ', 'ʼ', '`', '´']);
/** Marks that only ever mean o‘ / g‘ (never a closing quote). */
const LETTER_MARKS = new Set(['‘', 'ʻ']);

const CYR_LETTER = /^[а-яёўқғҳ]$/;
const LAT_LETTER = /^[a-z]$/;
const CYR_VOWELS = new Set([...'аеёиоуэюяўы']);
const LAT_VOWELS = new Set([...'aeiou']);

const CYR_TO_LAT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
  ф: 'f', х: 'x', ч: 'ch', ш: 'sh', щ: 'sh', ы: 'i', э: 'e', ю: 'yu', я: 'ya',
  ў: `o${UZ_LETTER_MARK}`, қ: 'q', ғ: `g${UZ_LETTER_MARK}`, ҳ: 'h', ь: '',
};

const LAT_TO_CYR: Record<string, string> = {
  a: 'а', b: 'б', d: 'д', f: 'ф', g: 'г', h: 'ҳ', i: 'и', j: 'ж', k: 'к', l: 'л',
  m: 'м', n: 'н', o: 'о', p: 'п', q: 'қ', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в',
  x: 'х', y: 'й', z: 'з',
};

const lower = (ch: string | undefined): string => (ch ?? '').toLowerCase();
const isUpper = (ch: string | undefined): boolean => !!ch && ch !== ch.toLowerCase();
const isCyr = (ch: string | undefined): boolean => CYR_LETTER.test(lower(ch));
const isLat = (ch: string | undefined): boolean => LAT_LETTER.test(lower(ch));
const isApostrophe = (ch: string | undefined): boolean => !!ch && APOSTROPHES.has(ch);

/** A capital Cyrillic letter turned into a Latin digraph: Sh, or SH beside another capital. */
function caseLatin(out: string, chars: string[], i: number): string {
  if (!out || !isUpper(chars[i])) return out;
  const next = chars[i + 1];
  const prev = chars[i - 1];
  const neighbour = isCyr(next) || isLat(next) ? next : isCyr(prev) || isLat(prev) ? prev : undefined;
  if (out.length === 1 || isUpper(neighbour)) return out.toUpperCase();
  return out[0].toUpperCase() + out.slice(1);
}

/** Uzbek Cyrillic to Uzbek Latin. Anything that is not Cyrillic passes through. */
export function toLatin(text: string): string {
  const chars = [...text];
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const c = lower(ch);
    if (!isCyr(ch)) { out += ch; continue; }
    const prev = lower(chars[i - 1]);
    let latin: string;
    if (c === 'е') {
      latin = !isCyr(chars[i - 1]) || CYR_VOWELS.has(prev) || prev === 'ъ' || prev === 'ь' ? 'ye' : 'e';
    } else if (c === 'ц') {
      latin = CYR_VOWELS.has(prev) ? 'ts' : 's';
    } else if (c === 'ъ') {
      out += prev === 'ў' ? '' : UZ_TUTUQ;
      continue;
    } else if (c === 'с' && lower(chars[i + 1]) === 'ҳ') {
      out += (isUpper(ch) ? 'S' : 's') + UZ_TUTUQ;
      continue;
    } else {
      latin = CYR_TO_LAT[c] ?? ch;
    }
    out += caseLatin(latin, chars, i);
  }
  return out;
}

/** o at i with an apostrophe after it that makes it o‘. */
function isOMark(chars: string[], i: number): boolean {
  if (lower(chars[i]) !== 'o' || !isApostrophe(chars[i + 1])) return false;
  return LETTER_MARKS.has(chars[i + 1]) || isLat(chars[i + 2]);
}

const caseCyr = (out: string, upper: boolean): string => (upper ? out.toUpperCase() : out);

const IOTATED: Record<string, string> = { o: 'ё', u: 'ю', a: 'я', e: 'е' };

/** The letter at i starts a word: no Latin letter before it, and no tutuq inside a word. */
function startsLatinWord(chars: string[], i: number): boolean {
  const prev = chars[i - 1];
  if (isLat(prev)) return false;
  return !(isApostrophe(prev) && isLat(chars[i - 2]));
}

/** Where the Latin word that starts at i ends: letters, and apostrophes between two letters. */
function latinWordEnd(chars: string[], i: number): number {
  let j = i;
  while (isLat(chars[j]) || (isApostrophe(chars[j]) && isLat(chars[j - 1]) && isLat(chars[j + 1]))) j++;
  return j;
}

/**
 * The apostrophe at k, after a word's last letter, closes a quote that opened
 * right before the word ('miting'), so it is not the mark of g‘.
 */
function closesQuote(chars: string[], k: number): boolean {
  if (isLat(chars[k + 1])) return false;
  let start = k - 1;
  while (isLat(chars[start - 1]) || (isApostrophe(chars[start - 1]) && isLat(chars[start - 2]) && isLat(chars[start]))) start--;
  return isApostrophe(chars[start - 1]);
}

/** g at i with an apostrophe after it that makes it g‘. */
const isGMark = (chars: string[], i: number): boolean =>
  lower(chars[i]) === 'g' && isApostrophe(chars[i + 1]) && !closesQuote(chars, i + 1);

/** Links and e-mail addresses, which no conversion touches. */
const LINK = /(?:https?:\/\/|www\.)[^\s<>«»"“”]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gi;

/** convert() applied to the text between links and e-mail addresses. */
function outsideLinks(text: string, convert: (part: string) => string): string {
  let out = '';
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    const at = match.index ?? last;
    out += convert(text.slice(last, at)) + match[0];
    last = at + match[0].length;
  }
  return out + convert(text.slice(last));
}

/** c (outside ch) or w: not Uzbek letters, so the word is a brand or a foreign word. */
const FOREIGN_LATIN = /c(?!h)|w/i;

/** Uzbek Latin to Uzbek Cyrillic. Anything that is not an Uzbek Latin letter passes through. */
export function toCyrillic(text: string): string {
  return outsideLinks(text, cyrillicPart);
}

function cyrillicPart(text: string): string {
  const chars = [...text];
  let out = '';
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];
    const c = lower(ch);
    const next = lower(chars[i + 1]);
    const up = isUpper(ch);
    if (isApostrophe(ch)) {
      // A tutuq between two letters is ъ; anything else is a quote and stays.
      out += isLat(chars[i - 1]) && isLat(chars[i + 1]) ? 'ъ' : ch;
      i += 1;
      continue;
    }
    if (!isLat(ch)) { out += ch; i += 1; continue; }
    if (startsLatinWord(chars, i)) {
      // A word with c or w (WhatsApp, Coca-Cola) stays Latin as a whole.
      const end = latinWordEnd(chars, i);
      const word = chars.slice(i, end).join('');
      if (FOREIGN_LATIN.test(word)) { out += word; i = end; continue; }
    }
    if (c === 's' && next === 'h') { out += caseCyr('ш', up); i += 2; continue; }
    if (c === 's' && isApostrophe(chars[i + 1]) && lower(chars[i + 2]) === 'h') {
      out += caseCyr('с', up) + caseCyr('ҳ', isUpper(chars[i + 2]));
      i += 3;
      continue;
    }
    if (c === 'c' && next === 'h') { out += caseCyr('ч', up); i += 2; continue; }
    if (isOMark(chars, i)) { out += caseCyr('ў', up); i += 2; continue; }
    if (isGMark(chars, i)) { out += caseCyr('ғ', up); i += 2; continue; }
    if (c === 'y') {
      if (next === 'o' && isOMark(chars, i + 1)) { out += caseCyr('й', up); i += 1; continue; }
      if (IOTATED[next]) { out += caseCyr(IOTATED[next], up); i += 2; continue; }
      out += caseCyr('й', up);
      i += 1;
      continue;
    }
    if (c === 'e') {
      out += caseCyr(startsLatinWord(chars, i) || LAT_VOWELS.has(lower(chars[i - 1])) ? 'э' : 'е', up);
      i += 1;
      continue;
    }
    out += LAT_TO_CYR[c] ? caseCyr(LAT_TO_CYR[c], up) : ch;
    i += 1;
  }
  return out;
}

/**
 * Uzbek Latin with the site's apostrophes: o‘ and g‘ with U+2018, a tutuq
 * between two letters with U+2019. Letters are not touched.
 */
export function normalizeLatin(text: string): string {
  return outsideLinks(text, normalizePart);
}

function normalizePart(text: string): string {
  const chars = [...text];
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (isOMark(chars, i) || isGMark(chars, i)) {
      out += ch + UZ_LETTER_MARK;
      i += 1;
      continue;
    }
    if (isApostrophe(ch) && isLat(chars[i - 1]) && isLat(chars[i + 1])) { out += UZ_TUTUQ; continue; }
    out += ch;
  }
  return out;
}

export type UzScript = 'cyrillic' | 'latin' | 'none';

/** The script most of the letters are in, to preselect the direction. */
export function detectScript(text: string): UzScript {
  let cyr = 0;
  let lat = 0;
  for (const ch of text) {
    if (isCyr(ch)) cyr++;
    else if (isLat(ch)) lat++;
  }
  if (!cyr && !lat) return 'none';
  return cyr >= lat ? 'cyrillic' : 'latin';
}

export type ScriptNote = 'russian-letters' | 'foreign-latin';

/**
 * What the visitor should know about this input: Russian-only letters going to
 * Latin (щ, ы), or c / w going to Cyrillic (not Uzbek letters; words with
 * them stay Latin). Links and e-mail addresses do not count.
 */
export function scriptNotes(text: string, to: 'latin' | 'cyrillic'): ScriptNote[] {
  if (to === 'latin') return /[щыЩЫ]/.test(text) ? ['russian-letters'] : [];
  return FOREIGN_LATIN.test(text.replace(LINK, '')) ? ['foreign-latin'] : [];
}
