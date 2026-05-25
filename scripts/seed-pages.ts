// One-off seed: creates draft stubs for every money page slug in MONEY_PAGES
// that does not already have a JSON file. Safe to re-run — existing files
// are left untouched.
import fs from 'node:fs';
import path from 'node:path';
import { MONEY_PAGES, HREFLANG_PAIRS, SITE_URL } from '../src/shared/site-config';

const ROOT = path.resolve(import.meta.dirname, '..');
const PAGES_DIR = path.join(ROOT, 'content', 'pages');

const RU_HEADLINES: Record<string, { title: string; h1: string; description: string; keyword: string }> = {
  '/ru/ai-bot-dlya-biznesa/': { title: '', h1: '', description: '', keyword: 'AI-бот для бизнеса' },
  '/ru/gpt-bot-dlya-biznesa/': { title: 'GPT-бот для бизнеса в Узбекистане — 24/7 ответы клиентам | GPTBot', h1: 'GPT-бот для бизнеса в Узбекистане', description: 'GPT-бот отвечает клиентам в Telegram и Instagram 24/7, понимает RU и UZ, собирает имя и телефон, передаёт горячий лид менеджеру.', keyword: 'GPT-бот для бизнеса' },
  '/ru/chat-bot-dlya-biznesa/': { title: 'Чат-бот для бизнеса в Узбекистане — AI с GPT в Telegram и Instagram | GPTBot', h1: 'Чат-бот для бизнеса в Узбекистане с AI', description: 'Чат-бот с AI отвечает клиентам в Telegram и Instagram 24/7, собирает контакты и передаёт горячие заявки менеджеру.', keyword: 'чат-бот для бизнеса' },
  '/ru/telegram-bot-dlya-biznesa/': { title: '', h1: '', description: '', keyword: 'Telegram-бот для бизнеса' },
  '/ru/instagram-direct-bot/': { title: 'Instagram Direct бот с AI — отвечает 24/7 и собирает заявки | GPTBot', h1: 'Instagram Direct бот с AI для бизнеса', description: 'Instagram Direct бот с AI отвечает клиентам 24/7, квалифицирует, собирает имя и телефон и передаёт лида менеджеру.', keyword: 'Instagram Direct бот' },
  '/ru/ai-menedzher-dlya-instagram/': { title: 'AI-менеджер для Instagram — авто-ответы в Direct 24/7 | GPTBot', h1: 'AI-менеджер для Instagram, который отвечает за вас', description: 'AI-менеджер для Instagram Direct отвечает 24/7 на русском и узбекском, собирает контакты и передаёт горячие лиды менеджеру.', keyword: 'AI-менеджер для Instagram' },
  '/ru/ai-prodavec/': { title: 'AI-продавец для бизнеса — GPT отвечает и продаёт 24/7 | GPTBot', h1: 'AI-продавец, который не теряет клиентов', description: 'AI-продавец на базе GPT берёт первый контакт, отвечает за секунды, квалифицирует и передаёт горячую заявку менеджеру.', keyword: 'AI-продавец' },
  '/ru/avtomatizatsiya-zayavok/': { title: 'Автоматизация заявок в Telegram и Instagram с AI | GPTBot', h1: 'Автоматизация заявок с AI', description: 'Автоматизируем приём и обработку заявок: AI отвечает 24/7, собирает данные и передаёт горячих лидов менеджеру.', keyword: 'автоматизация заявок' },
  '/ru/avtomatizatsiya-prodazh/': { title: 'Автоматизация продаж с AI в Узбекистане — Telegram + Instagram | GPTBot', h1: 'Автоматизация продаж с AI', description: 'Автоматизация продаж с AI: бот отвечает 24/7, квалифицирует лидов и передаёт готовые заявки менеджеру или в CRM.', keyword: 'автоматизация продаж' },
  '/ru/bot-dlya-obrabotki-zayavok/': { title: 'Бот для обработки заявок с AI — Telegram и Instagram | GPTBot', h1: 'Бот для обработки заявок с AI', description: 'Бот для обработки заявок отвечает клиентам 24/7, уточняет потребность, собирает имя/телефон и отправляет лида менеджеру.', keyword: 'бот для обработки заявок' },
  '/ru/ai-bot-dlya-kliniki/': { title: 'AI-бот для клиники — авто-запись и ответы 24/7 в Telegram | GPTBot', h1: 'AI-бот для клиники: запись пациентов 24/7', description: 'AI-бот для клиники отвечает на вопросы пациентов 24/7, записывает на приём и передаёт лид администратору.', keyword: 'AI-бот для клиники' },
  '/ru/ai-bot-dlya-salona-krasoty/': { title: 'AI-бот для салона красоты — авто-запись и ответы 24/7 | GPTBot', h1: 'AI-бот для салона красоты в Узбекистане', description: 'AI-бот для салона красоты отвечает клиентам 24/7, записывает на услуги и передаёт лидов администратору в Telegram.', keyword: 'AI-бот для салона красоты' },
  '/ru/ai-bot-dlya-uchebnogo-tsentra/': { title: 'AI-бот для учебного центра — заявки и консультации 24/7 | GPTBot', h1: 'AI-бот для учебного центра', description: 'AI-бот для учебного центра отвечает абитуриентам 24/7, рассказывает о курсах и собирает заявки в CRM.', keyword: 'AI-бот для учебного центра' },
  '/ru/ai-bot-dlya-magazina/': { title: 'AI-бот для магазина — приём заказов и ответы клиентам 24/7 | GPTBot', h1: 'AI-бот для магазина: продажи 24/7', description: 'AI-бот для магазина принимает заказы 24/7, отвечает на вопросы по товарам и передаёт лидов менеджеру.', keyword: 'AI-бот для магазина' },
  '/ru/ai-bot-dlya-horeca/': { title: 'AI-бот для HoReCa — бронирование столиков и заявки 24/7 | GPTBot', h1: 'AI-бот для HoReCa: бронь и заявки 24/7', description: 'AI-бот для HoReCa принимает брони и заявки 24/7 в Telegram и Instagram, собирает контакты и передаёт админу.', keyword: 'AI-бот для HoReCa' },
};

const UZ_HEADLINES: Record<string, { title: string; h1: string; description: string; keyword: string }> = {
  '/uz/biznes-uchun-ai-bot/': { title: '', h1: '', description: '', keyword: 'biznes uchun AI bot' },
  '/uz/gpt-bot-biznes-uchun/': { title: 'GPT bot biznes uchun — 24/7 javob | GPTBot', h1: 'GPT bot biznes uchun O‘zbekistonda', description: 'GPT bot biznes uchun Telegram va Instagram’da 24/7 javob beradi, ism va telefonni yig‘adi va lidlarni menejerga uzatadi.', keyword: 'GPT bot biznes uchun' },
  '/uz/telegram-bot-biznes-uchun/': { title: 'Telegram bot biznes uchun — AI bilan 24/7 | GPTBot', h1: 'Telegram bot biznes uchun, AI bilan', description: 'Telegram bot biznes uchun AI bilan ishlaydi: 24/7 javob beradi, kontaktlarni yig‘adi va lidlarni menejerga uzatadi.', keyword: 'Telegram bot biznes uchun' },
  '/uz/instagram-bot-biznes-uchun/': { title: 'Instagram bot biznes uchun — Direct’da AI menejer | GPTBot', h1: 'Instagram bot biznes uchun — Direct’da AI', description: 'Instagram bot biznes uchun Direct’da 24/7 javob beradi, kontaktlarni yig‘adi va lidlarni menejerga yuboradi.', keyword: 'Instagram bot biznes uchun' },
  '/uz/arizalarni-avtomatlashtirish/': { title: 'Arizalarni avtomatlashtirish — Telegram va Instagram’da AI | GPTBot', h1: 'Arizalarni avtomatlashtirish AI bilan', description: 'Arizalarni avtomatlashtirish: AI bot 24/7 javob beradi, mijozni saralaydi va tayyor lidni menejerga uzatadi.', keyword: 'arizalarni avtomatlashtirish' },
  '/uz/savdoni-avtomatlashtirish/': { title: 'Savdoni avtomatlashtirish — AI bilan Telegram + Instagram | GPTBot', h1: 'Savdoni avtomatlashtirish AI bilan', description: 'Savdoni avtomatlashtirish: AI bot mijozlarni saralaydi, ism va telefonni yig‘adi va lidlarni menejerga yoki CRM’ga uzatadi.', keyword: 'savdoni avtomatlashtirish' },
  '/uz/klinika-uchun-ai-bot/': { title: 'Klinika uchun AI bot — 24/7 yozilish va javoblar | GPTBot', h1: 'Klinika uchun AI bot: 24/7 yozilish', description: 'Klinika uchun AI bot bemorlarga 24/7 javob beradi, ularni qabulga yozadi va administratorga lid uzatadi.', keyword: 'klinika uchun AI bot' },
  '/uz/salon-uchun-ai-bot/': { title: 'Salon uchun AI bot — go‘zallik salonlari uchun 24/7 | GPTBot', h1: 'Salon uchun AI bot, mijozlarni yo‘qotmaydi', description: 'Salon uchun AI bot mijozlarga 24/7 javob beradi, xizmatga yozadi va lidlarni administratorga Telegram’da yuboradi.', keyword: 'salon uchun AI bot' },
  '/uz/oquv-markazi-uchun-ai-bot/': { title: 'O‘quv markazi uchun AI bot — talabalar uchun 24/7 | GPTBot', h1: 'O‘quv markazi uchun AI bot', description: 'O‘quv markazi uchun AI bot abituriyentlarga 24/7 javob beradi, kurslar haqida gapiradi va arizalarni CRM’ga yig‘adi.', keyword: 'o‘quv markazi uchun AI bot' },
  '/uz/dokon-uchun-ai-bot/': { title: 'Do‘kon uchun AI bot — buyurtmalar va javoblar 24/7 | GPTBot', h1: 'Do‘kon uchun AI bot: savdo 24/7', description: 'Do‘kon uchun AI bot buyurtmalarni 24/7 qabul qiladi, mahsulotlar haqida javob beradi va lidlarni menejerga uzatadi.', keyword: 'do‘kon uchun AI bot' },
};

function pairFor(url: string): string | undefined {
  for (const [ru, uz] of HREFLANG_PAIRS) {
    if (ru === url) return uz;
    if (uz === url) return ru;
  }
  return undefined;
}

function stubFor(url: string, locale: 'ru' | 'uz'): Record<string, unknown> {
  const slug = url.replace(/^\/(ru|uz)\//, '').replace(/\/$/, '');
  const meta = locale === 'ru' ? RU_HEADLINES[url] : UZ_HEADLINES[url];
  const pair = pairFor(url);
  return {
    status: 'draft',
    locale,
    url,
    slug,
    pageType: 'money',
    primaryKeyword: meta?.keyword ?? '',
    secondaryKeywords: [],
    searchIntent: 'commercial',
    h1: meta?.h1 ?? '',
    title: meta?.title ?? '',
    description: meta?.description ?? '',
    canonical: `${SITE_URL}${url}`,
    hreflangRu: locale === 'ru' ? url : pair,
    hreflangUz: locale === 'uz' ? url : pair,
    ogTitle: meta?.title ?? '',
    ogDescription: meta?.description ?? '',
    ogImage: 'https://gptbot.uz/assets/landing/1.png',
    robotsIndex: true,
    robotsFollow: true,
    breadcrumbLabel: meta?.keyword ?? slug,
    heroTitle: meta?.h1 ?? '',
    heroSubtitle: '',
    ctaPrimaryLabel: locale === 'ru' ? 'Запустить демо в Telegram' : 'Telegram’da demoni ko‘rish',
    ctaPrimaryHref: `https://t.me/XGame_changerx`,
    ctaSecondaryLabel: locale === 'ru' ? 'Посмотреть, как работает' : 'Qanday ishlashini ko‘rish',
    ctaSecondaryHref: '#how',
    bodyBlocks: [],
    faq: [],
    internalLinks: [],
    schemaTypes: ['Organization', 'WebSite', 'BreadcrumbList', 'Service'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

let created = 0;
for (const locale of ['ru', 'uz'] as const) {
  const urls = MONEY_PAGES[locale];
  fs.mkdirSync(path.join(PAGES_DIR, locale), { recursive: true });
  for (const url of urls) {
    const slug = url.replace(/^\/(ru|uz)\//, '').replace(/\/$/, '');
    const file = path.join(PAGES_DIR, locale, `${slug}.json`);
    if (fs.existsSync(file)) continue;
    fs.writeFileSync(file, JSON.stringify(stubFor(url, locale), null, 2) + '\n', 'utf-8');
    created++;
    console.log(`  + ${file.replace(ROOT + '/', '')}`);
  }
}
console.log(`Seeded ${created} draft page(s).`);
