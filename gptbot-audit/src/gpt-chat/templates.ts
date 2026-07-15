import type { Locale } from './types';

export type AiToolId = 'chat' | 'images' | 'smm' | 'business' | 'study';

export interface PromptTemplate {
  id: string;
  tool: Exclude<AiToolId, 'chat'>;
  label: Record<Locale, string>;
  description: Record<Locale, string>;
  prompt: Record<Locale, string>;
}

export interface ImagePreset {
  id: string;
  label: Record<Locale, string>;
  ratio: string;
  guidance: Record<Locale, string>;
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  template('smm-plan', 'smm', 'Контент-план на 7 дней', '7 kunlik kontent reja', 'Instagram: темы, форматы и CTA', 'Instagram: mavzu, format va CTA', 'Сделай контент-план на 7 дней для Instagram. Сначала задай 3 коротких вопроса о бизнесе, аудитории и цели.', 'Instagram uchun 7 kunlik kontent reja tuz. Avval biznes, auditoriya va maqsad haqida 3 ta qisqa savol ber.'),
  template('smm-stories', 'smm', '5 идей сторис', '5 ta stories g‘oyasi', 'Вовлечение без выдуманных обещаний', 'Asossiz va’dalarsiz jalb qilish', 'Напиши 5 идей сторис для бизнеса. Для каждой дай хук, содержание кадра и мягкий призыв к действию. Сначала уточни нишу.', 'Biznes uchun 5 ta stories g‘oyasini yoz. Har biri uchun hook, kadr mazmuni va yumshoq CTA ber. Avval nishani aniqlang.'),
  template('smm-telegram-ad', 'smm', 'Реклама для Telegram', 'Telegram reklama matni', 'Короткий текст с понятным оффером', 'Aniq offer bilan qisqa matn', 'Сделай рекламный текст для Telegram. Сначала уточни продукт, аудиторию, выгоду и ограничение по длине. Не придумывай скидки.', 'Telegram uchun reklama matni yoz. Avval mahsulot, auditoriya, foyda va matn uzunligini aniqlang. Chegirmani o‘ylab topmang.'),
  template('smm-instagram-post', 'smm', 'Пост для Instagram', 'Instagram posti', 'Структура, тон и призыв к действию', 'Tuzilma, ohang va CTA', 'Напиши Instagram-пост. Сначала спроси о продукте, аудитории, тоне и цели. Дай заголовок, основной текст и CTA.', 'Instagram posti yoz. Avval mahsulot, auditoriya, ohang va maqsadni so‘rang. Sarlavha, asosiy matn va CTA bering.'),
  template('business-reply', 'business', 'Ответ клиенту', 'Mijozga javob', 'Вежливо и по существу', 'Muloyim va aniq', 'Составь скрипт ответа клиенту. Сначала попроси вставить сообщение клиента и перечислить подтверждённые условия компании.', 'Mijozga javob skriptini tuz. Avval mijoz xabarini va kompaniyaning tasdiqlangan shartlarini so‘rang.'),
  template('business-faq', 'business', 'FAQ для сайта', 'Sayt uchun FAQ', 'Вопросы до покупки и честные ответы', 'Xariddan oldingi savollar va halol javoblar', 'Сделай FAQ для сайта. Сначала уточни нишу, продукт, географию, оплату, доставку и ограничения. Не придумывай условия.', 'Sayt uchun FAQ tuz. Avval nisha, mahsulot, hudud, to‘lov, yetkazib berish va cheklovlarni aniqlang. Shartlarni o‘ylab topmang.'),
  template('business-uzum', 'business', 'Описание товара для Uzum', 'Uzum uchun mahsulot tavsifi', 'Польза, характеристики и поиск', 'Foyda, xususiyat va qidiruv', 'Напиши описание товара для Uzum. Сначала запроси название, точные характеристики, комплектацию и аудиторию. Не добавляй неподтверждённые свойства.', 'Uzum uchun mahsulot tavsifini yoz. Avval nomi, aniq xususiyatlari, komplekt va auditoriyani so‘rang. Tasdiqlanmagan xususiyat qo‘shmang.'),
  template('business-sales', 'business', 'Скрипт продаж', 'Sotuv skripti', 'Диалог без давления', 'Bosimsiz muloqot', 'Составь этичный скрипт продаж: приветствие, вопросы, предложение, работа с возражением и следующий шаг. Сначала уточни продукт и клиента.', 'Halol sotuv skriptini tuz: salomlashuv, savollar, taklif, e’tiroz va keyingi qadam. Avval mahsulot va mijozni aniqlang.'),
  template('business-bot', 'business', 'Сценарий Telegram-бота', 'Telegram-bot ssenariysi', 'Лидмагнит: путь до заявки', 'Lid-magnit: arizagacha yo‘l', 'Составь сценарий Telegram-бота для моего бизнеса: вход, меню, FAQ, квалификация, сбор согласия, заявка и передача менеджеру. Сначала уточни нишу и текущий процесс.', 'Biznesim uchun Telegram-bot ssenariysini tuz: kirish, menyu, FAQ, saralash, rozilik, ariza va menejerga uzatish. Avval nisha va joriy jarayonni aniqlang.'),
  template('business-objections', 'business', 'Обработка возражений', 'E’tirozlar bilan ishlash', 'Ответы без манипуляций', 'Manipulyatsiyasiz javoblar', 'Подготовь ответы на возражения без давления. Сначала попроси список возражений, цену, реальные преимущества и ограничения продукта.', 'Bosimsiz e’tiroz javoblarini tayyorlang. Avval e’tirozlar, narx, haqiqiy afzallik va cheklovlarni so‘rang.'),
  template('business-ai-plan', 'business', 'План внедрения AI-бота', 'AI-botni joriy etish rejasi', 'Процесс, данные, интеграции и метрики', 'Jarayon, ma’lumot, integratsiya va metrika', 'Составь план пилотного внедрения AI-бота. Уточни нишу, каналы, частые обращения, CRM, ответственных и метрику успеха.', 'AI-bot pilotini joriy etish rejasini tuz. Nisha, kanallar, tez-tez murojaatlar, CRM, mas’ullar va muvaffaqiyat metrikasini aniqlang.'),
  template('study-explain', 'study', 'Объяснить тему', 'Mavzuni tushuntirish', 'Простыми словами и с проверкой понимания', 'Oddiy tilda va tushunishni tekshirish', 'Объясни тему простыми словами. Сначала спроси тему и уровень подготовки, затем дай пример и 3 вопроса для самопроверки.', 'Mavzuni oddiy tilda tushuntir. Avval mavzu va tayyorgarlik darajasini so‘rang, so‘ng misol va o‘zini tekshirish uchun 3 savol bering.'),
  template('study-summary', 'study', 'Сделать конспект', 'Konspekt tuzish', 'Главные мысли и термины', 'Asosiy fikr va atamalar', 'Сделай конспект текста: основные мысли, термины, примеры и вопросы, которые остались без ответа. Попроси вставить материал.', 'Matndan konspekt tuz: asosiy fikrlar, atamalar, misollar va javobsiz savollar. Materialni kiritishni so‘rang.'),
  template('study-essay-plan', 'study', 'План реферата', 'Referat rejasi', 'Структура для самостоятельной работы', 'Mustaqil ish uchun tuzilma', 'Помоги составить план реферата. Уточни тему, объём и требования. Дай структуру и вопросы для самостоятельного исследования, не пиши готовую работу.', 'Referat rejasini tuzishga yordam ber. Mavzu, hajm va talablarni aniqlang. Tayyor ish yozmasdan tuzilma va mustaqil tadqiqot savollarini bering.'),
  template('study-test', 'study', 'Тест по теме', 'Mavzu bo‘yicha test', 'Вопросы, ответы и объяснения', 'Savol, javob va izoh', 'Создай тест для подготовки. Сначала уточни тему, уровень и число вопросов. Не показывай ответы до завершения теста.', 'Tayyorlanish uchun test tuz. Avval mavzu, daraja va savollar sonini aniqlang. Test tugamaguncha javoblarni ko‘rsatmang.'),
  template('study-translate', 'study', 'Перевод RU ↔ Uzbek Latin', 'RU ↔ Uzbek Latin tarjima', 'Сохранить смысл и терминологию', 'Ma’no va atamalarni saqlash', 'Переведи материал между русским и Uzbek Latin. Сначала попроси текст, аудиторию и важные термины. Сохрани смысл и не добавляй факты.', 'Materialni rus tili va Uzbek Latin o‘rtasida tarjima qil. Avval matn, auditoriya va muhim atamalarni so‘rang. Ma’noni saqlang va fakt qo‘shmang.'),
  template('study-proofread', 'study', 'Проверить текст', 'Matnni tekshirish', 'Ошибки, объяснения и улучшенная версия', 'Xato, izoh va yaxshilangan variant', 'Проверь текст: сначала перечисли ошибки и объясни правила, затем предложи исправленную версию без изменения смысла.', 'Matnni tekshir: avval xatolarni va qoidalarni tushuntir, so‘ng ma’noni o‘zgartirmasdan tuzatilgan variantni ber.'),
  template('image-instagram', 'images', 'Промт для Instagram-поста', 'Instagram posti uchun prompt', 'Квадратный визуал и safe area', 'Kvadrat vizual va safe area', 'Создай подробный image prompt для Instagram-поста по моему описанию.', 'Tavsifim asosida Instagram posti uchun batafsil image prompt yarat.'),
  template('image-banner', 'images', 'Промт для рекламного баннера', 'Reklama banneri uchun prompt', 'Композиция под оффер и CTA', 'Offer va CTA uchun kompozitsiya', 'Создай подробный image prompt для рекламного баннера по моему описанию.', 'Tavsifim asosida reklama banneri uchun batafsil image prompt yarat.'),
  template('image-telegram', 'images', 'Промт для Telegram-обложки', 'Telegram muqovasi uchun prompt', 'Широкий формат и читаемый центр', 'Keng format va o‘qiladigan markaz', 'Создай подробный image prompt для Telegram-обложки по моему описанию.', 'Tavsifim asosida Telegram muqovasi uchun batafsil image prompt yarat.'),
];

export const IMAGE_PRESETS: ImagePreset[] = [
  imagePreset('instagram', 'Instagram post', 'Instagram post', '1:1', 'квадратная композиция, безопасные поля, место для короткого заголовка', 'kvadrat kompozitsiya, xavfsiz maydon, qisqa sarlavha uchun joy'),
  imagePreset('telegram', 'Telegram cover', 'Telegram cover', '16:9', 'широкая обложка, главный объект в центре, читается на телефоне', 'keng muqova, asosiy obyekt markazda, telefonda o‘qiladi'),
  imagePreset('banner', 'Ad banner', 'Ad banner', '16:9', 'рекламная композиция, зона под оффер и CTA, без мелкого текста', 'reklama kompozitsiyasi, offer va CTA uchun joy, mayda matnsiz'),
  imagePreset('product', 'Product visual', 'Product visual', '4:5', 'товар в фокусе, чистый фон, реалистичный свет, без изменения продукта', 'mahsulot fokusda, toza fon, realistik yorug‘lik, mahsulotni o‘zgartirmaslik'),
  imagePreset('article', 'Article cover', 'Article cover', '16:9', 'редакционная обложка, понятная метафора, свободная зона под заголовок', 'maqola muqovasi, aniq metafora, sarlavha uchun bo‘sh joy'),
];

export function getTemplates(tool: AiToolId, locale: Locale): Array<PromptTemplate & { localizedLabel: string; localizedDescription: string; localizedPrompt: string }> {
  if (tool === 'chat') return [];
  return PROMPT_TEMPLATES.filter((item) => item.tool === tool).map((item) => ({
    ...item,
    localizedLabel: item.label[locale],
    localizedDescription: item.description[locale],
    localizedPrompt: item.prompt[locale],
  }));
}

export function buildImagePromptRequest(description: string, presetId: string, locale: Locale): string {
  const preset = IMAGE_PRESETS.find((item) => item.id === presetId) ?? IMAGE_PRESETS[0];
  if (locale === 'uz') {
    return `Professional tasvir generatori uchun batafsil prompt yoz. Format: ${preset.label.uz}, ${preset.ratio}. Talablar: ${preset.guidance.uz}. G‘oya: ${description.trim()}. Natijada asosiy prompt, negative prompt, kompozitsiya va rang tavsiyasini ber. Tasvir yaratma — faqat prompt tayyorla. Faqat Uzbek Latin ishlat.`;
  }
  return `Подготовь подробный prompt для профессионального генератора изображений. Формат: ${preset.label.ru}, ${preset.ratio}. Требования: ${preset.guidance.ru}. Идея: ${description.trim()}. Дай основной prompt, negative prompt, рекомендации по композиции и цвету. Не создавай изображение — подготовь только текстовый prompt.`;
}

function template(id: string, tool: PromptTemplate['tool'], ruLabel: string, uzLabel: string, ruDescription: string, uzDescription: string, ruPrompt: string, uzPrompt: string): PromptTemplate {
  return { id, tool, label: { ru: ruLabel, uz: uzLabel }, description: { ru: ruDescription, uz: uzDescription }, prompt: { ru: ruPrompt, uz: uzPrompt } };
}

function imagePreset(id: string, ruLabel: string, uzLabel: string, ratio: string, ruGuidance: string, uzGuidance: string): ImagePreset {
  return { id, label: { ru: ruLabel, uz: uzLabel }, ratio, guidance: { ru: ruGuidance, uz: uzGuidance } };
}
