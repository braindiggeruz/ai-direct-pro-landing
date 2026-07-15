# GPTBot — Secondary Search Engines Plan

**Domain:** https://gptbot.uz  
**Goal:** Дополнить Google индексацию ещё двумя поисковыми системами, релевантными для Узбекистана: Bing и Yandex. Плюс настроить IndexNow для мгновенной нотификации Bing/Yandex о новых страницах.

---

## TL;DR

- **Bing** — даёт быструю индексацию (24-72 часа), используется DuckDuckGo и ChatGPT-поиском.
- **Yandex** — для Узбекистана даёт 25-35% дополнительного органик-трафика, особенно русскоязычной аудитории.
- **IndexNow** — открытый протокол: одним HTTP-запросом уведомляет Bing + Yandex + Seznam + Naver одновременно. Бесплатно, без лимитов.

Сейчас в этом репо: подготовлены **только документы**. Никаких новых API-ключей или сервисов **не подключено** до отдельного разрешения владельца.

---

## 1. Bing Webmaster Tools

### 1.1 Регистрация
1. Перейти на https://www.bing.com/webmasters/
2. Войти через Microsoft-аккаунт.
3. **Add a site** → ввести `https://gptbot.uz`.

### 1.2 Импорт из Google Search Console (быстрый путь)
Bing Webmaster Tools поддерживает прямой импорт настроек из GSC:
1. **Import from GSC** в меню добавления сайта.
2. Авторизоваться через Google.
3. Bing подтянет верификацию + sitemap автоматически.

### 1.3 Ручная верификация (если импорт недоступен)
Через один из вариантов:
- **HTML-файл:** скачать `BingSiteAuth.xml`, положить в `/public/BingSiteAuth.xml`, задеплоить.
- **Meta-tag:** добавить `<meta name="msvalidate.01" content="<KEY>">` в `index.html` <head>.
- **DNS:** добавить TXT-запись (только если есть доступ к DNS).

Предпочтительно — **HTML-файл**: меньше риск, не трогает шаблон сайта.

### 1.4 Sitemap submit
- **Sitemaps** → **Submit sitemap** → `https://gptbot.uz/sitemap.xml`
- Через 1-3 дня появится "Sitemap status: Success" и количество найденных URLs.

### 1.5 Что проверять после submission
- **Sitemaps**: status = Success, URLs found = 42, URLs indexed > 0 через 3-5 дней.
- **URL Inspection**: для homepage + 5 priority money pages.
- **Site Explorer** → **Inbound Links**: смотреть рост (>0 свидетельствует о crawl active).

### 1.6 Priority URLs для Bing (Submit URL вручную)
Bing даёт квоту до **10 URLs/день** для ручной отправки:

Day 1:
- `https://gptbot.uz/`
- `https://gptbot.uz/ru/ai-bot-dlya-biznesa/`
- `https://gptbot.uz/ru/gpt-bot-dlya-biznesa/`
- `https://gptbot.uz/ru/telegram-bot-dlya-biznesa/`
- `https://gptbot.uz/ru/instagram-direct-bot/`
- `https://gptbot.uz/ru/chat-bot-dlya-biznesa/`
- `https://gptbot.uz/ru/avtomatizatsiya-zayavok/`
- `https://gptbot.uz/uz/biznes-uchun-ai-bot/`
- `https://gptbot.uz/uz/telegram-bot-biznes-uchun/`
- `https://gptbot.uz/uz/instagram-bot-biznes-uchun/`

Day 2 — niche RU money pages + blog.

---

## 2. Yandex.Webmaster

### 2.1 Регистрация
1. Зайти на https://webmaster.yandex.com/
2. Создать Yandex.ID (если ещё нет) или войти.
3. **+** → ввести `https://gptbot.uz` → **Добавить**.

### 2.2 Верификация
Лучший способ — **Мета-тег**:
- Yandex выдаст `<meta name="yandex-verification" content="<HASH>">`.
- Добавить в `index.html` <head> (правка `index.html` в репо, не критичная).
- Нажать **Проверить**.

Альтернативно: HTML-файл `yandex_<hash>.html` в `/public/`.

### 2.3 Регион
- В **Настройках сайта** → **География** → выбрать **Узбекистан, Ташкент**.
- Это критично для ранжирования в локальных Yandex Search и Yandex.Услуги.

### 2.4 Sitemap submit
- **Индексирование** → **Файлы Sitemap** → **Добавить** → `https://gptbot.uz/sitemap.xml`.
- Через 5-14 дней появится статус "Индексируется" и счётчик URLs.

### 2.5 Что проверять
- **Индексирование** → **Страницы в поиске** — рост числа индексированных страниц.
- **Поисковые запросы** — ключи, по которым уже есть показы.
- **Внешние ссылки** — рост внешней SEO-силы.

### 2.6 Yandex Indexing API (опционально, для скорости)
Yandex поддерживает быструю переиндексацию через **«Переобход страниц»**: до **30 URLs/день** ручной отправки в Webmaster. Использовать так же, как GSC Request indexing.

---

## 3. IndexNow (Bing + Yandex одновременно)

### 3.1 Что это
Открытый протокол, поддерживаемый **Bing, Yandex, Seznam, Naver, Yep**. Одним HTTPS-вызовом уведомляешь сразу все эти системы о появлении/обновлении страниц.

Лимит: **до 10 000 URLs/день** через один key.

### 3.2 Настройка
1. Сгенерировать произвольный ключ (32-64 hex символа), пример:
   ```
   a1b2c3d4e5f6789012345678901234567890abcd
   ```
2. Положить файл `<KEY>.txt` в `/public/`, содержимое — только сам ключ.
3. Файл должен быть доступен по `https://gptbot.uz/<KEY>.txt`.
4. Уведомлять можно одним из:
   - **GET**: `https://api.indexnow.org/indexnow?url=https://gptbot.uz/ru/foo/&key=<KEY>`
   - **POST batch**: см. https://www.indexnow.org/documentation

### 3.3 Когда вызывать
Идеально — на каждом успешном деплое через Cloudflare Pages **Deploy hook** или GitHub Actions step:
1. После `wrangler pages deploy` → выполнить ping всех URL из `dist/sitemap.xml`.
2. Это даст ~5-минутную индексацию свежих изменений в Bing.

### 3.4 Готовый pinger (NE АКТИВИРОВАН)
В этом репо подготовлен скрипт-заготовка `scripts/indexnow-ping.ts` (опциональный, **disabled by default**) — запускается только если передан env `INDEXNOW_KEY`.

```bash
# чтобы активировать (после ручной регистрации ключа):
INDEXNOW_KEY=<KEY> yarn tsx scripts/indexnow-ping.ts
```

Скрипт читает `dist/sitemap.xml`, дёргает `https://api.indexnow.org/indexnow` batch endpoint и логирует ответы. **Не вызывается автоматически** до явного включения.

---

## 4. Priority URL list (для всех 3 систем)

Приоритет одинаковый — самые коммерческие/высокочастотные URLs первыми.

### Tier 1 (8 URLs) — гланвная + core money pages
```
https://gptbot.uz/
https://gptbot.uz/ru/ai-bot-dlya-biznesa/
https://gptbot.uz/ru/gpt-bot-dlya-biznesa/
https://gptbot.uz/ru/telegram-bot-dlya-biznesa/
https://gptbot.uz/ru/instagram-direct-bot/
https://gptbot.uz/ru/chat-bot-dlya-biznesa/
https://gptbot.uz/uz/biznes-uchun-ai-bot/
https://gptbot.uz/uz/telegram-bot-biznes-uchun/
```

### Tier 2 (10 URLs) — automation + niche RU money
```
https://gptbot.uz/ru/avtomatizatsiya-zayavok/
https://gptbot.uz/ru/avtomatizatsiya-prodazh/
https://gptbot.uz/ru/ai-prodavec/
https://gptbot.uz/ru/ai-menedzher-dlya-instagram/
https://gptbot.uz/ru/bot-dlya-obrabotki-zayavok/
https://gptbot.uz/ru/ai-bot-dlya-kliniki/
https://gptbot.uz/ru/ai-bot-dlya-salona-krasoty/
https://gptbot.uz/ru/ai-bot-dlya-uchebnogo-tsentra/
https://gptbot.uz/ru/ai-bot-dlya-magazina/
https://gptbot.uz/ru/ai-bot-dlya-horeca/
```

### Tier 3 (8 URLs) — UZ money pages
```
https://gptbot.uz/uz/gpt-bot-biznes-uchun/
https://gptbot.uz/uz/instagram-bot-biznes-uchun/
https://gptbot.uz/uz/arizalarni-avtomatlashtirish/
https://gptbot.uz/uz/savdoni-avtomatlashtirish/
https://gptbot.uz/uz/klinika-uchun-ai-bot/
https://gptbot.uz/uz/salon-uchun-ai-bot/
https://gptbot.uz/uz/oquv-markazi-uchun-ai-bot/
https://gptbot.uz/uz/dokon-uchun-ai-bot/
```

### Tier 4 (16 URLs) — Blog
- `https://gptbot.uz/ru/blog/`
- + все 15 опубликованных статей `/ru/blog/<slug>/`

---

## 5. Чек-лист действий владельца

| Задача | Сервис | Время |
|---|---|---|
| Регистрация + верификация | Bing Webmaster | 10 мин |
| Submit sitemap | Bing | 1 мин |
| Manual URL submit Tier 1 | Bing | 5 мин |
| Регистрация + верификация | Yandex.Webmaster | 10 мин |
| Указать регион Узбекистан | Yandex | 1 мин |
| Submit sitemap | Yandex | 1 мин |
| Manual «Переобход» Tier 1 | Yandex | 5 мин |
| Сгенерировать IndexNow key | (любой) | 1 мин |
| Положить `<KEY>.txt` в `/public/` | репо | 2 мин |
| Активировать `yarn tsx scripts/indexnow-ping.ts` после первого деплоя | репо | 3 мин |

**Итого ~40 минут.**

---

## 6. Что проверять через 14 дней

- **Bing**: URLs indexed > 30/42 (≈70%). Если меньше — usability errors в Bing Webmaster → исправить.
- **Yandex**: «Страниц в поиске» > 25/42. Если меньше — посмотреть «Исключённые URLs» в Yandex.Webmaster.
- **Google**: ≥ 30/42 indexed (продолжение действий из `docs/GSC_INDEXING_ACTION_PLAN.md`).

Через 30 дней ожидать первые показы в **Performance** в каждой из 3 систем + first organic clicks по long-tail запросам ("AI bot biznes Tashkent", "GPT бот Узбекистан", "telegram бот для салона красоты").

---

## 7. Что НЕ делать без отдельного согласования

- ❌ Не подключать **Yandex Metrika** / **GA4** API без обсуждения (это analytics, а не SEO).
- ❌ Не покупать ссылки в Yandex/Bing — банят, ROI отрицательный для маленьких сайтов.
- ❌ Не запускать **автоматический IndexNow ping** на каждый CI-run без owner-approval — может расходовать квоту впустую при mass-rebuild.
- ❌ Не использовать сторонние «бесплатные» SEO-сервисы автоматического submission — большинство нелегально парсят и могут вызвать manual action.
