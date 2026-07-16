// replyContextClassifier + ambiguity check — pure heuristics, no AI cost.
// The generator prompt re-assesses context internally; these heuristics only
// drive routing (clarify vs answer) and analytics categories. No fake
// confidence scores surface in the UI.
import { guessLanguage } from './prompts';

export type SituationType =
  | 'question' | 'request' | 'complaint' | 'objection' | 'offer'
  | 'greeting' | 'confirmation' | 'information';

export type AudienceContext = 'client' | 'colleague' | 'manager' | 'personal' | 'unknown';

export interface Classification {
  language: 'ru' | 'uz' | 'other';
  situation: SituationType;
  audience: AudienceContext;
  needsClarification: boolean;
  /** Commercial fact the sender asks for that we must not invent. */
  asksCommercialFact: boolean;
}

// NB: JS \b is ASCII-only — useless after Cyrillic. Use explicit lookaheads.
const NOT_LETTER = "(?![а-яёa-z’‘'])";
const RU_Q = new RegExp(`(\\?|сколько|когда|где|какой|какая|можно ли|есть ли|почему|как${NOT_LETTER})`, 'i');
const UZ_Q = /(\?|qancha|qachon|qayer|qanday|bormi|nega|necha)/i;
const COMPLAINT = /(жалоб|недоволен|возмущ|ужасно|обман|верните|плохо|не работает|shikoyat|norozi|yomon|ishlamayapti|aldab)/i;
const OBJECTION = /(дорого|подумаю|не уверен|у других дешевле|qimmat|o['‘’]ylab)/i;
const GREETING = new RegExp(`^(привет|здравствуй|добрый|салом|salom|assalomu|hi|hello)`, 'i');
const CONFIRM = new RegExp(`^(да|ок|окей|хорошо|договорились|принято|ha|xo['‘’]p|mayli|kelishdik)${NOT_LETTER}`, 'i');
const REQUEST = /(пришлите|отправьте|сделайте|нужно|прошу|можете|yuboring|qiling|kerak|iltimos)/i;
const PRICE_ASK = /(сколько стоит|цена|стоимость|прайс|narxi|qancha turadi|price)/i;
const AVAIL_ASK = /(есть в наличии|наличие|когда доставка|срок доставки|bormi|qachon yetkaz|yetkazib berish)/i;

export function classifyMessage(text: string, languageHint?: 'ru' | 'uz' | 'other'): Classification {
  const language = languageHint && languageHint !== 'other' ? languageHint : guessLanguage(text);
  const t = text.trim();

  // Priority: substance beats politeness — a greeting followed by a question
  // is a question.
  let situation: SituationType = 'information';
  if (COMPLAINT.test(t)) situation = 'complaint';
  else if (OBJECTION.test(t)) situation = 'objection';
  else if (RU_Q.test(t) || UZ_Q.test(t)) situation = 'question';
  else if (REQUEST.test(t)) situation = 'request';
  else if (CONFIRM.test(t) && t.length < 40) situation = 'confirmation';
  else if (GREETING.test(t) && t.length < 60) situation = 'greeting';

  const asksCommercialFact = PRICE_ASK.test(t) || AVAIL_ASK.test(t);

  // Audience is rarely inferable from a single message — stay honest.
  const audience: AudienceContext = 'unknown';

  // Clarify ONLY when any auto-reply is likely wrong: an ultra-short,
  // intent-free fragment (not greeting/confirmation/question).
  const needsClarification =
    t.length > 0 && t.length < 12 &&
    situation === 'information' &&
    !asksCommercialFact;

  return { language, situation, audience, needsClarification, asksCommercialFact };
}
