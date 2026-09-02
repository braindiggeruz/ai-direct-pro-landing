import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SIGNAL_SERVICES,
  SIGNAL_SERVICE_LABELS,
  detectSignalContact,
  pickSignalQuote,
  triageSignal,
  type SignalVerdict,
} from '../functions/platform/lead-radar/signal-triage';

const LEAD: Array<[string, string]> = [
  ['Ребят, нужен бот для записи клиентов. Бюджет до 3 млн сум. Пишите @manager', 'bots'],
  ['Ищу таргетолога, нужно настроить рекламу в Instagram, срочно', 'ads'],
  ['Кто может сделать сайт-визитку?', 'sites'],
  ['Нужен человек, кто сделает мобильное приложение для доставки, iOS и Android', 'apps'],
  ['Ищу исполнителя: лендинг для стоматологии, готов заплатить', 'sites'],
  ['Нужно продвижение в Инстаграм, кто занимается?', 'ads'],
  ['Кто знает толкового программиста? Надо бота для магазина.', 'bots'],
  ['Требуется SEO, хотим вывести сайт в топ 10 по Ташкенту', 'seo'],
  ['Посоветуйте, кто делает логотип и фирменный стиль, есть бюджет', 'design'],
  ['Нужно внедрить CRM, чтобы заявки не терялись. Кто возьмётся?', 'crm'],
  ['Заказать контекстную рекламу надо, подскажите хорошего специалиста', 'ads'],
  ['Сколько будет стоить чат-бот для Telegram с оплатой?', 'bots'],
];

const JOBSEEKER: string[] = [
  'Ищу работу, делаю ботов, возьмите в команду',
  'Резюме: таргетолог, 5 лет опыта, ищу работу в Ташкенте',
  'Ищем разработчика в команду, удалёнка, оформление по ТК',
  'Ищу стажировку в IT, готов работать бесплатно',
  'Ищу подработку: верстка лендингов, портфолио в профиле',
  'Отклик на вакансию: делаю сайты и SEO, резюме ниже',
  'В поисках работы, занимаюсь дизайном и SMM',
  'Ищу заказы на фрилансе, делаю ботов под ключ',
];

const SUPPLY: string[] = [
  'Делаю ботов под ключ, портфолио в личке, цены от 500$',
  'Занимаюсь SEO, вывод в топ 10, прайс по запросу',
  'Делаю дизайн логотипов, мои услуги, скидка 20%',
  'Разрабатываю сайты и лендинги. Бесплатная консультация, пишите в личку',
  'Наши услуги: таргет, контекст, SMM. Осталось 3 места, запись на июль',
  'Делаю чат-ботов, опыт более 6 лет, гарантия, кейсы по запросу',
  'Обучаю SEO, курс со скидкой, промокод в комментариях',
  'Предлагаю разработку мобильных приложений, цены от 2000$',
];

const DISCARD: string[] = [
  'Привет всем',
  'Погода сегодня отличная, гуляем',
  'Кто знает, где купить нормальный ноутбук в Ташкенте?',
  'Спасибо за помощь!',
  'Доброе утро, коллеги',
];

test('demand posts are classified as leads with the right service', () => {
  for (const [text, service] of LEAD) {
    const result = triageSignal(text);
    assert.equal(result.verdict, 'lead', `${text} -> ${JSON.stringify(result)}`);
    assert.equal(result.service, service, `${text} -> ${JSON.stringify(result)}`);
    assert.ok(result.score >= 60, `${text} -> score ${result.score}`);
  }
});

test('job seeking never becomes a lead, even with service words and budgets', () => {
  for (const text of JOBSEEKER) {
    const result = triageSignal(text);
    assert.equal(result.verdict, 'jobseeker', `${text} -> ${JSON.stringify(result)}`);
    assert.equal(result.score, 0);
  }
});

test('competitor advertising is supply, not demand', () => {
  for (const text of SUPPLY) {
    const result = triageSignal(text);
    assert.equal(result.verdict, 'supply', `${text} -> ${JSON.stringify(result)}`);
  }
});

test('posts about no service are discarded', () => {
  for (const text of DISCARD) {
    const result = triageSignal(text);
    assert.equal(result.verdict, 'discard', `${text} -> ${JSON.stringify(result)}`);
    assert.deepEqual(result.services, []);
  }
});

const UZBEK_LEAD: Array<[string, string]> = [
  ['Bot kerak, Telegram uchun. Kim qila oladi?', 'bots'],
  ['Sayt kerak, dokon uchun internet dokon qilish kerak', 'sites'],
  ['Reklama bo‘yicha yordam kerak, narxi qancha?', 'ads'],
  ['Mobil ilova yasash kerak, kim qilib bera oladi?', 'apps'],
];

const UZBEK_JOBSEEKER: string[] = [
  'Ish qidiryapman, dasturchi, tajriba 3 yil',
  'Rezume: SMM mutaxassis, ish kerak',
  'Amaliyot qidiryapman, dizayn bo‘yicha',
];

const UZBEK_SUPPLY: string[] = [
  'Bot qilaman, portfolio bor, narxlar arzon',
  'Sayt qilamiz, xizmatlarimiz, bepul konsultatsiya',
];

test('Uzbek-language demand is classified as a lead', () => {
  for (const [text, service] of UZBEK_LEAD) {
    const result = triageSignal(text);
    assert.equal(result.verdict, 'lead', `${text} -> ${JSON.stringify(result)}`);
    assert.equal(result.service, service, `${text} -> ${JSON.stringify(result)}`);
  }
});

test('Uzbek job seeking and supply are filtered too', () => {
  for (const text of UZBEK_JOBSEEKER) {
    assert.equal(triageSignal(text).verdict, 'jobseeker', `${text} -> ${JSON.stringify(triageSignal(text))}`);
  }
  for (const text of UZBEK_SUPPLY) {
    assert.equal(triageSignal(text).verdict, 'supply', `${text} -> ${JSON.stringify(triageSignal(text))}`);
  }
});

test('the primary service follows the post, not dictionary order', () => {
  // "сайт" is mentioned later and once; "CRM" is mentioned first. Both name a
  // service, so dictionary order is not a valid answer — the post must decide.
  const crm = triageSignal('Нужен CRM, чтобы заявки с сайта не терялись');
  assert.equal(crm.service, 'crm');
  assert.ok(crm.services.includes('sites'));

  const sites = triageSignal('Нужен сайт, потом внедрим CRM');
  assert.equal(sites.service, 'sites');
  assert.ok(sites.services.includes('crm'));
});

test('empty and whitespace input is discarded without throwing', () => {
  for (const text of ['', '   ', '\n\t', '!!!', '...']) {
    const result = triageSignal(text);
    assert.equal(result.verdict, 'discard');
    assert.equal(result.score, 0);
  }
});

test('the jobseeker filter wins over a strong demand signal', () => {
  // The nastiest real-world shape: a job post that reads exactly like a brief.
  const result = triageSignal('Ищу работу: нужен бот, делаю SEO и рекламу, срочно, бюджет');
  assert.equal(result.verdict, 'jobseeker');
  assert.equal(result.score, 0);
});

test('service nouns do not fire inside unrelated words', () => {
  // "бот" must not fire inside "ботаник" or "работа"; "сайт" not inside "сайты"
  // is fine, but "бот" inside "робот" would be a false positive.
  assert.equal(triageSignal('Куплю робота-пылесос').verdict, 'discard');
  assert.equal(triageSignal('Работа кипит, все молодцы').verdict, 'discard');
  assert.equal(triageSignal('Нужен бот для чата').verdict, 'lead');
});

test('contact details boost the score and are reported', () => {
  const withHandle = triageSignal('Нужен лендинг, писать @designstudio');
  const without = triageSignal('Нужен лендинг');
  assert.ok(withHandle.score > without.score, `${withHandle.score} > ${without.score}`);
  assert.equal(withHandle.hasContact, true);
  assert.equal(without.hasContact, false);
  assert.ok(withHandle.reasons.includes('contact'));
});

test('urgency and budget raise the score', () => {
  const plain = triageSignal('Нужен бот для записи');
  const urgent = triageSignal('Срочно нужен бот для записи');
  const budgeted = triageSignal('Нужен бот для записи, бюджет есть');
  assert.ok(urgent.score > plain.score);
  assert.ok(budgeted.score > plain.score);
});

test('score is always clamped to 0..100', () => {
  const everything = triageSignal(
    'Срочно нужен бот, сайт, лендинг, реклама, SEO, приложение, дизайн, CRM. '
    + 'Бюджет 10 млн сум, готов заплатить, срочно сегодня. Пишите @studio?',
  );
  assert.ok(everything.score <= 100);
  assert.ok(everything.score > 0);
  assert.equal(everything.verdict, 'lead');
});

test('a service noun with no demand marker is discarded as chatter', () => {
  const result = triageSignal('сайт');
  assert.equal(result.verdict, 'discard');
  assert.deepEqual(result.services, ['sites']);
  assert.ok(result.reasons.includes('no_demand'));

  // The same word in a real brief becomes a lead.
  assert.equal(triageSignal('Нужен сайт').verdict, 'lead');
});

test('every service has a label and a non-empty dictionary', () => {
  for (const service of SIGNAL_SERVICES) {
    assert.ok(SIGNAL_SERVICE_LABELS[service], `missing label for ${service}`);
    assert.equal(typeof SIGNAL_SERVICE_LABELS[service], 'string');
  }
});

test('detectSignalContact finds handles and phone numbers only', () => {
  assert.equal(detectSignalContact('пишите @my_handle'), true);
  assert.equal(detectSignalContact('звоните +998 90 123 45 67'), true);
  assert.equal(detectSignalContact('email: mail@example.com'), false);
  assert.equal(detectSignalContact('просто текст без контактов'), false);
});

test('pickSignalQuote keeps the sentence that carries the service', () => {
  const quote = pickSignalQuote(
    'Привет! Давно тут сижу. Ребят, нужен бот для записи клиентов в салон. '
    + 'Бюджет обсуждается. Заранее спасибо!',
  );
  assert.ok(quote.includes('бот'), quote);
  assert.ok(quote.length <= 280, String(quote.length));
});

test('pickSignalQuote clips very long single-sentence posts', () => {
  const long = `Нужен бот ${'очень длинное описание '.repeat(40)}`;
  const quote = pickSignalQuote(long);
  assert.ok(quote.length <= 280, String(quote.length));
  assert.ok(quote.endsWith('…'), quote);
});

test('pickSignalQuote returns short posts untouched', () => {
  assert.equal(pickSignalQuote('Нужен бот'), 'Нужен бот');
});

/* ══════════════════════════════════════════════════════════════════ *
 * Recruitment ads — the loudest real-world noise class
 *
 * The first entry is verbatim from production. It scored as a `bots` lead
 * with confidence 79 because it ends with `@yandex_ish_bot` and its tracking
 * URL contains a "?". Nothing in it asks for a bot.
 * ══════════════════════════════════════════════════════════════════ */

const JOB_OFFER: string[] = [
  'ISHGA TAKLIF QILAMIZ ‼️\n'
  + '📍TOSHKENT VA SAMARQAND SHAXRIDA\n\n'
  + '🟡 "Yandex Eats" bilan oyiga 13 million so‘mgacha daromad bilan kuryer bo‘ling\n'
  + '🚘🚲🛴🚶 Avtokuryer, velosiped, piyoda va skuter kuryerlar kerak.\n'
  + '➡️ Havola orqali ro‘yxatdan o‘ting\n\n'
  + 'https://reg.eda.yandex.uz/?advertisement_campaign=forms_for_agents'
  + '&user_invite_code=1b45b01dc4a142528d8bf9aac8283875&utm_content=blank\n\n'
  + '📞 Qo‘shimcha ma’lumot uchun:\n@yandex_ish_bot',
  'Набираем курьеров, зарплата 10 млн сум, график сменный, Ташкент',
  'Ищем менеджера по продажам в Ташкенте, оформление по ТК',
  'Требуются водители на постоянную работу, собеседование сегодня',
  'Kuryer kerak, maosh 8 mln, Toshkent',
  'Ishga taklif qilamiz! Sotuvchi kerak, ish jadvali qulay',
  'Xodimlar kerak, ish haqi kunlik, ariza qoldiring',
];

test('recruitment ads never become leads, in either language', () => {
  for (const text of JOB_OFFER) {
    const result = triageSignal(text);
    assert.equal(result.verdict, 'jobseeker', `${text.slice(0, 40)} -> ${JSON.stringify(result)}`);
    assert.equal(result.score, 0);
  }
});

test('a bot handle in the signature is not a request for a bot', () => {
  // The production failure: "@yandex_ish_bot" alone produced `bots:bot`.
  const result = triageSignal('Акция в нашем магазине, подробности у @shop_helper_bot');
  assert.equal(result.verdict, 'discard', JSON.stringify(result));
  assert.deepEqual(result.services, []);
});

test('a question mark inside a URL does not make the post a question', () => {
  const withUrl = triageSignal('Нужен бот https://t.me/x?ref=1');
  const plain = triageSignal('Нужен бот');
  assert.equal(withUrl.score, plain.score, JSON.stringify(withUrl.reasons));
  assert.ok(!withUrl.reasons.includes('question'));

  // A question a human typed still counts.
  assert.ok(triageSignal('Нужен бот, кто сделает?').reasons.includes('question'));
});

test('reasons are readable strings, never stringified objects', () => {
  const texts = [
    'Срочно нужен бот, бюджет 5 млн сум, кто сделает?',
    'Нужна реклама, срочно, сегодня, оплачу хорошо',
    'Ищу лендинг под ключ, сколько стоит?',
  ];
  for (const text of texts) {
    for (const reason of triageSignal(text).reasons) {
      assert.doesNotMatch(reason, /\[object Object\]/, `${text} -> ${reason}`);
      assert.ok(reason.length > 0);
    }
  }
});

test('a genuine buyer is still a lead after masking', () => {
  // The mask must not eat the demand: these all carry a handle or a link.
  for (const text of [
    'Ребят, нужен бот для записи клиентов. Бюджет до 3 млн сум. Пишите @manager',
    'Нужен сайт-визитка, кто сделает? Примеры: t.me/mysite',
    'Требуется SEO, хотим вывести сайт в топ 10 по Ташкенту',
  ]) {
    assert.equal(triageSignal(text).verdict, 'lead', `${text} -> ${JSON.stringify(triageSignal(text))}`);
  }
});

test('the verdict union is closed and stable', () => {
  const verdicts = new Set<SignalVerdict>();
  for (const [text] of LEAD) verdicts.add(triageSignal(text).verdict);
  for (const text of [...JOBSEEKER, ...SUPPLY, ...DISCARD]) verdicts.add(triageSignal(text).verdict);
  for (const verdict of verdicts) {
    assert.ok(['lead', 'review', 'discard', 'supply', 'jobseeker'].includes(verdict));
  }
});
