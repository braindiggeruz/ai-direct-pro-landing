# Приём и атрибуция заявок + блоки «заказать» — 2026-09-29

Основание: roadmap `C:/Users/Borinio/Desktop/seo-skills-main/gptbot.uz-audit/ROADMAP-ADS-TGBOTS-2026-09-29.md`
(пункты 1, 2, 5, 8, 9, 10 — кодовая часть). Владелец поручил выполнить автономно и задеплоить.

## Что сделано

| # | Что | Где |
|---|---|---|
| 1 | **Калькулятор снова принимает заявки.** С 04.09 (3ec1c761) он слал `contactType: 'calculator_contact'`, сервер отклонял каждую отправку. Теперь контакт определяется сервером; `source='calculator'`, `service='telegram-bot'`, requestId, понятные ошибки + ссылка в Telegram | `src/calculator/CalculatorApp.tsx` |
| 2 | **Атрибуция заявок.** `/api/gpt/lead` принимает `source` (gpt_chat / calculator / page_form, белый список), `service` (slug) и `attribution` (страница входа, хост источника, gclid/yclid/fbclid, дата). Хранится в `gpt_leads.source` и `utm_json.attribution`; utm-ключи не перезаписываются. В уведомлении владельцу — строка «Источник · услуга · страница» | `functions/lib/gpt-chat/validate.ts`, `functions/api/gpt/lead.ts`, `lead-outbox.ts`, `notify.ts` |
| 3 | **Определение контакта по форме строки.** `@ник`, `t.me/…` → Telegram; другой `@` → e-mail; цифры и знаки → телефон. Ник с цифрами больше не превращается в «телефон» | `validate.ts` |
| 4 | **Первый визит.** Инлайн-скрипт один раз пишет `localStorage['gptbot_ft_v1']` (страница входа, источник, UTM, gclid/yclid); формы отправляют его вместе с заявкой. Вне блока аналитики — тест приватности соблюдён | `scripts/attribution-snippet.ts`, шаблоны, `index.html` |
| 5 | **Telegram-кнопки с готовым текстом** «Интересует: <услуга>. Страница: <путь>» (`t.me/<username>?text=` — документировано в core.telegram.org/api/links). Не на защищённых страницах и не на `/uz/` | `scripts/telegram-cta.ts` |
| 6 | **Цели Метрики:** прежняя `telegram_cta_click` сохранена; новые `telegram_cta_studio`, `telegram_cta_bot`, `phone_click`, `lead_form_success`, `calculator_lead_success`, `chat_lead_success`. GA4/GTM: `generate_lead` (lead_source, service_slug, page_path), `lead_form_failed`. Персональные данные в аналитику не уходят | `scripts/analytics-metrika.ts`, `analytics-snippet.ts`, `src/lib/analytics/yandexMetrika.ts` |
| 7 | **Форма из двух полей** (имя — необязательно; телефон или Telegram; согласие со ссылкой на политику) на 24 коммерческих страницах рекламы и Telegram-ботов RU/UZ + `/boss-digital/`. Без JS не отправляется (кнопка disabled, `<noscript>` со ссылкой в Telegram). Нет на главной, `/uz/`, защищённых, тестовых и калькуляторе | `scripts/lead-form.ts` |
| 8 | **Закреплённая панель «Позвонить / Telegram»** на `/boss-digital/` и `/uz/boss-digital/` | `scripts/prerender.ts` |
| 9 | **Навигация на лендингах** (Решения / Цены / Реклама / Блог; UZ-аналоги), переключатель RU/UZ 44px. Не на `/uz/` и не на 9 тестовых страницах | `scripts/prerender.ts` |
| 10 | **Блоки «заказать»**: статья про Payme/Click (RU + UZ, цена из опубликованного тарифа «Pro»), `/ru/telegram-bot-dlya-biznesa/` (от 990 000 сум + кнопка), `/ru/stoimost-chat-bota/` (кнопка под таблицей), статья про SMM-специалиста (пакеты = копия таблицы SMM-страницы) | `content/…` |
| 11 | **DIRECTORY_LEDGER**: goldenpages/Яндекс/Google-карточки уже существуют → `LIVE_NEEDS_FIX`, ссылки больше не на `/ru/` | `docs/seo/DIRECTORY_LEDGER_2026-08-25.md` |
| 12 | **Журнал изменений** для замеров 03.10 и 20.10 | `docs/seo/CHANGE_LOG_2026-09.md` |
| 13 | **Тест 03.10 сохранён:** три description тестовых страниц, укороченные утром 29.09 (2cea30dc), возвращены к версии 19.09 — `/uz/internet-reklama-toshkent/`, `/uz/blog/target-reklama-nima/`, `/uz/blog/instagram-direct-ai-bot-qanday-ishlaydi/` | `content/…` |

Защищённые 10 страниц и 9 тестовых страниц (`scripts/measurement-hold.ts`) видимо не менялись:
на тестовых меняется только href Telegram-кнопки (текст ссылки тот же) и инлайн-скрипт в `<head>`.

## Проверка
- `tsc -b` и `tsc -p tsconfig.functions.json` — 0; ESLint изменённых файлов — 0.
- `npm test` — 675/677; два падения в `tests/lead-radar.test.ts` воспроизводятся на чистом main (датозависимые фикстуры).
- Новые тесты: `lead-attribution` 17/17, `lead-capture-templates` 26/26 (добавлены в `npm test` и TEST_MATRIX).
- `build:fast` — exit 0; `seo-audit` — 0 critical; `seo-protection check` — 10/10 unchanged.
- Независимое ревью (корректность, приватность, SEO): 19 замечаний, 5 существенных — все исправлены.

## Владельцу
1. **Метрика → Цели:** создать JS-цели `telegram_cta_studio`, `telegram_cta_bot`, `phone_click`, `lead_form_success`, `calculator_lead_success`, `chat_lead_success`.
2. **GA4:** зарегистрировать пользовательские параметры `service_slug`, `cta_zone`, `page_path`, `lead_source`.
3. **Политика конфиденциальности:** стоит добавить, что вместе с заявкой сохраняются страница входа и рекламные метки (UTM, gclid/yclid) — текст юридический, решение за вами.
4. **Реестр заявок** (LEAD-REGISTER) — «где вы нас нашли?» у каждого обращения.
5. Если за 8 недель через форму не придёт ни одной заявки — форму убираем (roadmap п. 9).
