// replySafetyValidator — pure post-generation checks. Catches the failure
// modes that damage trust most: invented commercial numbers, wrong output
// language, leaked system instructions, meta-preambles.
import { guessLanguage } from './prompts';

export interface ValidationIssue {
  code: 'invented_number' | 'invented_fact' | 'wrong_language' | 'system_leak' | 'meta_preamble';
  detail: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

/** Digit sequences that look like prices/dates/quantities (2+ digits). */
function significantNumbers(text: string): string[] {
  return (text.match(/\d[\d\s.,:%-]{1,}\d|\d{2,}/g) || []).map((n) => n.replace(/[\s.,:%-]/g, ''));
}

const SYSTEM_LEAK = /(system prompt|системн(ый|ая) (промпт|инструкц)|как языковая модель|as an ai|я — ai-помощник gptbot|инструкции внутри пересланного)/i;
const META_PREAMBLE = /^(вот ваш ответ|вот готовый ответ|я подготовил|вы можете написать|вы можете ответить|конечно[,!.]|разумеется[,!.]|mana javob|tayyor javob)/i;

const UNGROUNDED_FACT_RULES: Array<{ source: RegExp; reply: RegExp; detail: string }> = [
  {
    source: /(есть ли|в наличии|наличие|доступен|bormi|mavjud|sotuvda)/i,
    reply: /(^|[.!?]\s*)(да[,! ]|albatta[,! ]|ha[,! ])?[^.!?]*(есть в наличии|имеется в наличии|доступен(?:а|о|ы)? для (?:заказа|покупки)|mavjud|sotuvda bor)/i,
    detail: 'availability assertion not grounded in source',
  },
  {
    source: /(где (?:вы|находит)|ваш адрес|адрес|qayerda|manzil)/i,
    reply: /(мы находимся|наш адрес|bizning manzil|biz .*joylashgan|manzilimiz)/i,
    detail: 'address assertion not grounded in source',
  },
  {
    source: /(когда|срок|достав|qachon|muddat|yetkaz)/i,
    reply: /(привез(?:ём|ем)|доставим|будет готов).*(сегодня|завтра|послезавтра|к вечеру|в течение)|(?:сегодня|завтра|послезавтра|bugun|ertaga|indin|tez orada).*(привез|достав|готов|yetkaz|tayyor)/i,
    detail: 'date or delivery promise not grounded in source',
  },
  {
    source: /(скидк|chegirma)/i,
    reply: /(сдела(?:ем|ю) скидк|предостав(?:им|лю) скидк|дадим скидк|chegirma (?:qil|ber))/i,
    detail: 'discount promise not grounded in source',
  },
];

/**
 * Validate a generated reply against its source.
 * expectedLanguage: 'ru' | 'uz' | null (null = don't enforce, e.g. mixed).
 */
export function validateReply(source: string, reply: string, expectedLanguage: 'ru' | 'uz' | null): ValidationResult {
  const issues: ValidationIssue[] = [];

  // 1. Grounding: every significant number in the reply must exist in the
  //    source (normalized). Times like "24" inside words are rare enough that
  //    a false positive just costs one regeneration.
  const srcNums = new Set(significantNumbers(source));
  for (const n of significantNumbers(reply)) {
    if (!srcNums.has(n)) {
      issues.push({ code: 'invented_number', detail: n });
    }
  }

  // High-risk commercial assertions can be fabricated without digits
  // ("есть в наличии", "привезём завтра", "наш адрес ..."). When the
  // source only asks for such a fact, an assertive answer is unsafe.
  for (const rule of UNGROUNDED_FACT_RULES) {
    if (rule.source.test(source) && rule.reply.test(reply)) {
      issues.push({ code: 'invented_fact', detail: rule.detail });
    }
  }

  // 2. Language conformity.
  if (expectedLanguage) {
    const got = guessLanguage(reply);
    if (got !== 'other' && got !== expectedLanguage) {
      issues.push({ code: 'wrong_language', detail: `expected ${expectedLanguage}, got ${got}` });
    }
  }

  // 3. No system/meta leakage.
  if (SYSTEM_LEAK.test(reply)) issues.push({ code: 'system_leak', detail: 'system-instruction marker in output' });
  if (META_PREAMBLE.test(reply.trim())) issues.push({ code: 'meta_preamble', detail: reply.trim().slice(0, 40) });

  return { ok: issues.length === 0, issues };
}

/**
 * Check that facts survived a modifier/translation: numbers present in the
 * previous result should not mutate into DIFFERENT numbers (dropping some is
 * fine for «Короче»; inventing new ones is not).
 */
export function validateModifier(source: string, previous: string, next: string): ValidationResult {
  const allowed = new Set([...significantNumbers(source), ...significantNumbers(previous)]);
  const issues: ValidationIssue[] = [];
  for (const n of significantNumbers(next)) {
    if (!allowed.has(n)) issues.push({ code: 'invented_number', detail: n });
  }
  if (SYSTEM_LEAK.test(next)) issues.push({ code: 'system_leak', detail: 'system-instruction marker in output' });
  return { ok: issues.length === 0, issues };
}
