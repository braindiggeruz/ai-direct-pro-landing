# R5: видимые ссылки главной. R8: границы проверки производительности

Дата: 08.10.2026. Реализация локальная; публикация и результат в Google здесь не заявляются.

## Основание и решение

Аудит production обнаружил на `/` 295 уникальных внутренних URL в исходном HTML и 45 после React mount. 251 исходный URL исчезал; после рендера добавлялся `/sitemap.xml`. Источник: `docs/seo/audits/2026-10-08-regression/RAW/crawl_render_analysis.json`. Это старый механизм замены shell, а не доказанная причина свежего падения позиций.

Новый `src/components/HomeResources.tsx` выводит 14 полезных ссылок в трёх видимых группах: узбекский чат и инструкции, учёба и документы, русскоязычные AI и бизнес-руководства. Обе языковые группы доступны при любом языке интерфейса; `lang` и `hrefLang` соответствуют целевым страницам. Инструкции по официальному ChatGPT явно отделены от запуска самостоятельного сервиса GPTBot.uz.

Компонент включён в уже существующий ниже первого экрана lazy chunk `PromotionServices`, сразу после раздела продвижения. Для него не добавлены запросы данных, изображения, зависимости, отдельный lazy boundary или CSS-файл. Использованы текущие стили карточек, заголовков и ссылок. Ссылки не спрятаны в disclosure, анимации появления или служебном каталоге. Их минимальная высота — 44 px.

В `PromotionServices` узбекская карточка таргета теперь открывает опубликованный `/uz/instagram-target-yoqish/`. Ряд ссылок на другой язык сохраняет прежние адреса и добавляет этот URL.

Первый экран, title, H1, canonical, hreflang, SEO shell и маршруты не менялись этим пакетом. `scripts/prerender-home.ts`, исторические baselines и protected comparator не редактировались. Review остальных параллельных изменений главной выполняется на общем build.

## Приоритетные маршруты

«До» — наличие URL после рендера в production-аудите 08.10. «Локальный компонент» — ожидаемая ссылка в JSX; окончательная браузерная проверка выполняется на общей сборке.

| URL | До | Локальный компонент |
|---|---|---|
| `/uz/gpt-uzbek-tilida/` | Да, hero | HomeResources; hero сохранён |
| `/ru/gpt-chat/` | Да, hero | HomeResources; hero сохранён |
| `/uz/gpt-chat-qollanma/` | Нет | HomeResources |
| `/uz/blog/chatgptga-qanday-kirish-mumkin/` | Нет | HomeResources |
| `/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/` | Нет | HomeResources |
| `/uz/blog/chatgpt-ozbekistonda-vpnsiz-ishlaydimi/` | Нет | HomeResources |
| `/uz/blog/chatgpt-uzbek-tilida-promptlar/` | Нет | HomeResources |
| `/uz/blog/ai-chat-nima-va-qanday-turlari-bor/` | Нет | HomeResources |
| `/ru/blog/chatgpt-i-claude-v-uzbekistane/` | Нет | HomeResources |
| `/ru/blog/kak-oplatit-chatgpt-v-uzbekistane/` | Нет | HomeResources |
| `/ru/kak-sdelat-ai-bota-telegram-instagram/` | Нет; единственный raw donor — home | HomeResources |
| `/uz/blog/kurs-ishi-yozish/` | Нет | HomeResources |
| `/uz/blog/tushuntirish-xati-va-ariza-yozish/` | Нет | HomeResources |
| `/uz/blog/biznes-reja-tuzish/` | Нет | HomeResources |
| `/uz/instagram-target-yoqish/` | Нет | PromotionServices; обе версии интерфейса |

Все 15 URL уже присутствуют в существующем no-JavaScript shell. Пакет сохраняет 13 ранее исчезавших приоритетных ссылок; это осознанный небольшой набор, а не обещание паритета всех 295 URL.

## Проверки и acceptance

Новый `tests/home-resources.test.ts` проверяет результат реального React server render компонента PromotionServices для RU и UZ, наличие всех 15 обычных ссылок, понятные подписи и языковые атрибуты, ограниченный объём списка и отсутствие скрывающих контейнеров. Отдельно проверяются опубликованность, robots и self-canonical целевых JSON; если собран `dist/index.html`, проверяется наличие тех же URL в no-JavaScript shell. Тест размещения удерживает раздел в существующей группе ниже Offer, внутри main, без нового startup request.

Выполнено: `NODE_OPTIONS=--max-old-space-size=512 node --import tsx --test tests/home-resources.test.ts` — **4/4 PASS, 0 skipped**, около 1,6 s. No-JavaScript проверка выполнена по существующему `dist/index.html`; это ещё не новая общая сборка. `git diff --check` по изменённым файлам — PASS. Дополнительно на общей сборке: `tests/homepage-crawler-shell.test.ts`, `tests/homepage-premium.test.ts`, `tests/homepage-lists-frozen.test.ts`, typecheck, changed-file ESLint и protected checks. Итоговые результаты общей сборки фиксирует основной агент, чтобы не запускать параллельные тяжёлые процессы при низком объёме свободной RAM.

Браузерная приёмка общей сборки: `/` при 390 и 1280 px, свежий контекст RU и UZ; `#home-resources` должен существовать через 1 и 5 s, содержать 14 видимых ссылок без горизонтального переполнения. Все 15 URL из таблицы доступны из DOM; target находится в PromotionServices. Проверить клавиатурный focus и читаемые подписи, одну H1 и прежний head. Для visibility below-fold секцию прокрутить в область просмотра; нахождение ниже экрана само по себе не является скрытием.

## R8: что не объявляется исправленным

Полевые CWV остаются неизвестными: предыдущий аудит получил CrUX notConfigured и PSI quota 0. Его unthrottled mobile lab нельзя сравнивать с другим устройством или выдавать за field p75. Поэтому в этом пакете нет спекулятивного переписывания lazy boundaries, удаления возможностей чата или изменения checkout ради условного результата.

Новая навигация использует существующую границу загрузки и не добавляет сетевой зависимости. Это ограничение архитектуры, а не измерение LCP/INP/CLS. Реальный размер chunk, CSS и результат первого взаимодействия проверяются на общей сборке; при возможности повторить одинаковые traces до/после. Field p75 принимать только по доступному полному окну и указанному URL/origin/device. Пока такого измерения нет, R8 остаётся открытой измерительной задачей.

## Откат и наблюдение

При технической регрессии удалить только HomeResources и его подключение, вернуть конкретную карточку/ряд ссылок PromotionServices. Не откатывать trial, платежи, content fixes, другие релизы или D1. Для отдельной проблемы target-карточки вернуть только её href, сохранив остальные полезные ссылки.

После разрешённой публикации проверить доступность и DOM, затем lastCrawlTime/index status новых traffic URL и home-only guide. Оценивать impressions/clicks в полных 14/28-дневных окнах после нового обхода, с сохранением family totals. Сам факт появления ссылок не равен приросту авторитетности или позиций.
