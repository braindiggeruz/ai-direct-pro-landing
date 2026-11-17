// Names of the natal chart's closed lists in Uzbek (Latin) and Russian: the
// page and the AI reading's prompt use the same words. Uzbek gives the
// traditional name first and the everyday one in brackets (roadmap §5).
// To be checked by a native speaker before launch (roadmap T11).
import type { AspectId, BodyId, SignId } from '../tools/natal/engine/zodiac';

export type NatalLocale = 'uz' | 'ru';

export const BODY_NAME: Readonly<Record<NatalLocale, Record<BodyId, string>>> = {
  uz: {
    sun: 'Quyosh', moon: 'Oy', mercury: 'Utorud (Merkuriy)', venus: 'Zuhra (Venera)', mars: 'Mirrix (Mars)',
    jupiter: 'Mushtariy (Yupiter)', saturn: 'Zuhal (Saturn)', uranus: 'Uran', neptune: 'Neptun', pluto: 'Pluton', node: 'Oy tuguni',
  },
  ru: {
    sun: 'Солнце', moon: 'Луна', mercury: 'Меркурий', venus: 'Венера', mars: 'Марс',
    jupiter: 'Юпитер', saturn: 'Сатурн', uranus: 'Уран', neptune: 'Нептун', pluto: 'Плутон', node: 'Лунный узел',
  },
};

export const SIGN_NAME: Readonly<Record<NatalLocale, Record<SignId, string>>> = {
  uz: {
    aries: 'Hamal (Qoʻy)', taurus: 'Savr (Buzoq)', gemini: 'Javzo (Egizaklar)', cancer: 'Saraton (Qisqichbaqa)',
    leo: 'Asad (Arslon)', virgo: 'Sunbula (Parizod)', libra: 'Mezon (Tarozi)', scorpio: 'Aqrab (Chayon)',
    sagittarius: 'Qavs (Oʻqotar)', capricorn: 'Jadiy (Echki)', aquarius: 'Dalv (Qovgʻa)', pisces: 'Hut (Baliq)',
  },
  ru: {
    aries: 'Овен', taurus: 'Телец', gemini: 'Близнецы', cancer: 'Рак', leo: 'Лев', virgo: 'Дева',
    libra: 'Весы', scorpio: 'Скорпион', sagittarius: 'Стрелец', capricorn: 'Козерог', aquarius: 'Водолей', pisces: 'Рыбы',
  },
};

// U+FE0E asks for the text glyph: Chrome on Windows draws bare zodiac signs as coloured emoji.
export const SIGN_GLYPH: Readonly<Record<SignId, string>> = {
  aries: '♈︎', taurus: '♉︎', gemini: '♊︎', cancer: '♋︎', leo: '♌︎', virgo: '♍︎',
  libra: '♎︎', scorpio: '♏︎', sagittarius: '♐︎', capricorn: '♑︎', aquarius: '♒︎', pisces: '♓︎',
};

export const BODY_GLYPH: Readonly<Record<BodyId, string>> = {
  sun: '☉︎', moon: '☽︎', mercury: '☿︎', venus: '♀︎', mars: '♂︎', jupiter: '♃︎', saturn: '♄︎', uranus: '♅︎', neptune: '♆︎', pluto: '♇︎', node: '☊︎',
};

export const ASPECT_NAME: Readonly<Record<NatalLocale, Record<AspectId, string>>> = {
  uz: { conjunction: 'qoʻshilish', sextile: 'sekstil', square: 'kvadrat', trine: 'trigon', opposition: 'qarama-qarshilik' },
  ru: { conjunction: 'соединение', sextile: 'секстиль', square: 'квадрат', trine: 'трин', opposition: 'оппозиция' },
};

export const ANGLE_NAME: Readonly<Record<NatalLocale, { asc: string; mc: string }>> = {
  uz: { asc: 'Ascendent (koʻtariluvchi burj)', mc: 'Osmon oʻrtasi (MC)' },
  ru: { asc: 'Асцендент', mc: 'Середина неба (MC)' },
};

export const ELEMENT_NAME: Readonly<Record<NatalLocale, Record<'fire' | 'earth' | 'air' | 'water', string>>> = {
  uz: { fire: 'olov', earth: 'tuproq', air: 'havo', water: 'suv' },
  ru: { fire: 'огонь', earth: 'земля', air: 'воздух', water: 'вода' },
};

export const MODALITY_NAME: Readonly<Record<NatalLocale, Record<'cardinal' | 'fixed' | 'mutable', string>>> = {
  uz: { cardinal: 'boshlovchi', fixed: 'barqaror', mutable: 'oʻzgaruvchan' },
  ru: { cardinal: 'кардинальный', fixed: 'фиксированный', mutable: 'мутабельный' },
};

export function houseName(locale: NatalLocale, house: number): string {
  return locale === 'uz' ? `${house}-uy` : `${house}-й дом`;
}

const HOUSE_ORDINAL: Readonly<Record<NatalLocale, readonly string[]>> = {
  uz: ['birinchi', 'ikkinchi', 'uchinchi', 'toʻrtinchi', 'beshinchi', 'oltinchi', 'yettinchi', 'sakkizinchi', 'toʻqqizinchi', 'oʻninchi', 'oʻn birinchi', 'oʻn ikkinchi'],
  ru: ['первый', 'второй', 'третий', 'четвёртый', 'пятый', 'шестой', 'седьмой', 'восьмой', 'девятый', 'десятый', 'одиннадцатый', 'двенадцатый'],
};

/** A house in words («oʻninchi uy», «десятый дом»): the AI reading's prompt, whose answer may carry no digits. */
export function houseWords(locale: NatalLocale, house: number): string {
  return `${HOUSE_ORDINAL[locale][house - 1]} ${locale === 'uz' ? 'uy' : 'дом'}`;
}
