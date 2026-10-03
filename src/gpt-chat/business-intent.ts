// Is the first question of a conversation about ordering a business service:
// a bot, a site, ads or a CRM (plan WP-20, map 03 §9)? Then, after the first
// answer, the chat shows one line offering the studio's help (AiBusinessLine,
// lazy part chat-lead). Runs in the browser on text the visitor just sent and
// sends nothing: the topic alone, from the closed list below, reaches the
// counter and GA4.
//
// Plain string work, no \b and no lookbehind: \b does not see Cyrillic
// letters (AGENTS.md §11), and a lookbehind in a regex literal stops Safari
// before 16.4 from parsing the whole start bundle. Topic words are exact word
// forms, so "botir", "ботинки" or "работа" are not bots; intent and context
// words are prefixes, minus the few words they would wrongly catch.

export type BusinessTopic = 'bot' | 'site' | 'ads' | 'crm';

const words = (list: string) => list.split(' ').filter(Boolean);

/** Exact word forms, checked in this order: the first topic that qualifies wins. */
const TOPICS: ReadonlyArray<readonly [BusinessTopic, ReadonlySet<string>]> = [
  ['bot', new Set(words(
    'bot boti botni botga botlar botlari botlarni botim botimni botingiz botingizni botini botdan chatbot telegrambot '
    + 'бот бота боту ботом боте боты ботов ботам ботами ботах чатбот ботни ботга ботлар',
  ))],
  ['crm', new Set(words('crm amocrm амосрм срм'))],
  ['site', new Set(words(
    'sayt sayti saytni saytga saytim saytingiz saytlar saytini saytda websayt website landing '
    + 'сайт сайта сайту сайтом сайте сайты сайтов лендинг лендинга сайтни сайтга интернет-магазин интернет-магазина интернет-магазины',
  ))],
];
const CRM_PREFIXES = words('bitrix битрикс');
const ADS_PREFIXES = words('reklama target smm таргет реклам продвижени');

/** Wanting it done, priced or set up. */
const INTENT = words(
  'yarat qilib kerak buyurtma narx qancha ochmoqchi ishlab sozla joriy xizmat ulab ulash ulang ulamoqchi avtomatlashtir '
  + 'керак нарх қанча буюртма ярат хизмат '
  + 'сдела созда заказ нуж стоим сколько цен разработ настро внедр подключ автоматиз',
);
/** Ads are ordered, not merely written about: "reklama matnini yoz" is a task, not an order. */
const ADS_INTENT = words(
  'kerak buyurtma narx qancha xizmat керак нарх қанча буюртма хизмат заказ нуж стоим сколько цен настро',
);
/** A business behind the question. */
const CONTEXT = words(
  'biznes do\'kon kompaniya firma mijoz sotuv restoran kafe salon klinika дўкон мижоз сотув '
  + 'бизнес магазин компани клиент продаж ресторан кафе салон клиник фирм',
);
/** Prefixes of words the lists above would wrongly catch: mood, a centre or a cent, valuable, a university department. */
const NOT = words('настроени цент ценн kafedr кафедр');
/** Homework is a task for the chat, not an order: these switch the line off. */
const STUDY = words('insho referat mavzu diplom эссе реферат сочинени курсовая курсовую курсовой диплом');

const APOSTROPHES = /[‘’ʻʼ`´]/g;
const SEPARATORS = /[^a-z0-9'а-яёўқғҳ-]+/;

const startsWithAny = (word: string, prefixes: readonly string[]) =>
  prefixes.some((prefix) => word.startsWith(prefix)) && !NOT.some((prefix) => word.startsWith(prefix));

/** Lower case, one apostrophe, words; a hyphenated word counts whole and by its parts. */
function tokens(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().replace(APOSTROPHES, '\'').split(SEPARATORS)) {
    const word = raw.replace(/^['-]+|['-]+$/g, '');
    if (!word) continue;
    out.push(word);
    if (word.includes('-')) out.push(...word.split('-').filter(Boolean));
  }
  return out;
}

/**
 * The business topic of `text`, or null. A bot, a site or a CRM needs a wish
 * to have one done or a business behind it; ads need a commercial wish (an
 * order, a price, a setup). Any study word turns the answer to null.
 */
export function detectBusinessTopic(text: string): BusinessTopic | null {
  const list = tokens(text);
  if (/kurs ishi/.test(list.join(' ')) || list.some((word) => startsWithAny(word, STUDY))) return null;
  const has = (prefixes: readonly string[]) => list.some((word) => startsWithAny(word, prefixes));
  const wanted = has(INTENT) || has(CONTEXT);
  for (const [topic, forms] of TOPICS) {
    const named = list.some((word) => forms.has(word)) || (topic === 'crm' && has(CRM_PREFIXES));
    if (named && wanted) return topic;
  }
  return has(ADS_PREFIXES) && has(ADS_INTENT) ? 'ads' : null;
}

/** The message the chat just sent, as far as the business line needs to know it. */
export interface FirstTurn {
  text: string;
  /** 1 for the first message of the conversation. */
  messageNumber: number;
  /** The tool it was sent in: the line runs in the plain chat (the business tool has its own card). */
  tool: string;
  /** Typed by the visitor (the composer, a chip it prefilled), not a template, an answer action or a retry. */
  typed: boolean;
  /** The line showed already in this browser session, or a business offer was closed today. */
  spent: boolean;
}

/** The topic the line will offer once this message is answered, or null. */
export function businessLineTopic(turn: FirstTurn): BusinessTopic | null {
  if (turn.messageNumber !== 1 || turn.tool !== 'chat' || !turn.typed || turn.spent) return null;
  return detectBusinessTopic(turn.text);
}
