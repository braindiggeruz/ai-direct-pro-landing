// The table of meanings the AI reading rests on (roadmap section 3): short,
// traditional keywords of Western astrology, one line per body, sign, house,
// aspect and element. The model explains the chart's facts with these and
// does not invent other meanings. To be reviewed by an astrologer (roadmap §9.3).
import type { AspectId, BodyId, SignId } from '../../../src/tools/natal/engine/zodiac';

export const BODY_MEANING: Readonly<Record<BodyId, string>> = {
  sun: 'core self, will, vitality, what gives life meaning, the father figure',
  moon: 'feelings, needs, habits, the sense of safety, the mother figure, home',
  mercury: 'thinking, speech, learning, how one communicates and decides',
  venus: 'love, affection, taste, what one values and how one relates',
  mars: 'drive, action, desire, courage, how one asserts and competes',
  jupiter: 'growth, optimism, faith, teachers, where luck and generosity flow',
  saturn: 'duty, limits, patience, maturity, where effort builds lasting results',
  uranus: 'independence, change, originality, sudden insight (a generation-wide placement in signs)',
  neptune: 'imagination, compassion, ideals, dissolving boundaries (generation-wide in signs)',
  pluto: 'deep transformation, power, renewal (generation-wide in signs)',
  node: 'direction of growth',
};

export const SIGN_MEANING: Readonly<Record<SignId, string>> = {
  aries: 'initiative, directness, courage, impatience',
  taurus: 'steadiness, comfort, patience, possessiveness',
  gemini: 'curiosity, words, variety, restlessness',
  cancer: 'care, memory, protectiveness, sensitivity',
  leo: 'warmth, pride, creativity, need for recognition',
  virgo: 'precision, service, analysis, self-criticism',
  libra: 'harmony, fairness, partnership, indecision',
  scorpio: 'intensity, loyalty, depth, secrecy',
  sagittarius: 'freedom, meaning, travel, bluntness',
  capricorn: 'ambition, structure, responsibility, reserve',
  aquarius: 'independence, ideas, friendship, detachment',
  pisces: 'empathy, imagination, devotion, escapism',
};

export const HOUSE_MEANING: Readonly<Record<number, string>> = {
  1: 'self-presentation, body, first impression', 2: 'money one earns, possessions, self-worth', 3: 'siblings, neighbours, everyday learning, talk',
  4: 'home, family, roots', 5: 'creativity, romance, children, play', 6: 'daily work, health habits, service',
  7: 'partnership, marriage, open rivals', 8: 'shared resources, intimacy, crises and renewal', 9: 'higher learning, travel, beliefs',
  10: 'career, reputation, public role', 11: 'friends, groups, hopes', 12: 'solitude, the hidden, rest, inner life',
};

export const ASPECT_MEANING: Readonly<Record<AspectId, string>> = {
  conjunction: 'the two act as one: strong, blended, can be either easy or intense',
  sextile: 'an opportunity that works when used: friendly cooperation',
  square: 'friction that pushes to act: tension, growth through effort',
  trine: 'easy flow, natural talent, comfort (can make one passive)',
  opposition: 'a pull between two sides that asks for balance, often seen through another person',
};

export const ELEMENT_MEANING: Readonly<Record<'fire' | 'earth' | 'air' | 'water', string>> = {
  fire: 'enthusiasm, action, inspiration', earth: 'practicality, reliability, the material world',
  air: 'ideas, communication, social life', water: 'emotion, intuition, empathy',
};

export const MODALITY_MEANING: Readonly<Record<'cardinal' | 'fixed' | 'mutable', string>> = {
  cardinal: 'starting things, taking the lead', fixed: 'persistence, holding on, stability', mutable: 'adapting, flexibility, change',
};
