# Проверка W1-13: техгигиена (/?lang=ru, Cache-Control llms/md, title 404)

Роль: adversarial verifier. Дата: 2026-10-24. Источники: живой GET (curl, desktop Chrome UA, ≤2 req/s), файлы рабочего дерева `F:\Claude\gptbot-snippets-translator-20261024` (dist = прод d54d5b61), OpenSEO GSC (бесплатные вызовы).

## Вердикт

**Не опровергнуто, но действие (a) требует исправления.** Все три факта из evidence воспроизведены. Части (b) и (c) корректны и безопасны как есть. Часть (a) указывает на `functions/index.ts`, но на проде этот файл для `/` **не выполняется**: правка в нём ничего не изменит. Первый 301 отдаёт правило Page Rule на уровне зоны Cloudflare, а не репозиторий. Прирост кликов везде 0. Пункт в бэклоге честно помечен как гигиена.

## (a) /?lang=ru: два шага редиректа

| Проверка | Результат | Источник |
|---|---|---|
| `GET /?lang=ru` | 301 → `https://gptbot.uz/ru/`; в ответе **нет** x-frame-options / cache-control из `_headers` | curl 2026-10-24 |
| `GET /ru/` | 301 → `/`; в ответе есть заголовки из `_headers` (значит, это `_redirects`) | curl; `dist/_redirects:46` `/ru/  /  301` |
| `GET /?lang=uz` | 301 → `/uz/` → 200 (один шаг, в порядке) | curl |
| `GET /?lang=ru&a=1` | **200** (не редирект) | curl |
| `GET /?lang=en` | **200** (не редирект) | curl |
| `GET /ru/?lang=ru` | 301 → `/?lang=ru` → 301 `/ru/` → 301 `/` (три шага) | curl |
| `_routes.json` include | `/api/*`, `/ru/blog*`, `/uz/blog*`, `/admin-tools/*`, `/admin/*`, `/robots.txt`; **`/` не входит** | `dist/_routes.json` |
| `functions/index.ts` | обработчик `?lang=` для `/`, цель `/ru/`; покрыт только юнит-тестом | `functions/index.ts:26-49`, `tests/canonical-url-redirects.test.ts:28-39` |
| Комментарий в middleware | «The primary fix is via Cloudflare Zone-level Page Rules … gptbot.uz/?lang=ru → 301 → /ru/» | `functions/_middleware.ts:47-50` |
| GSC, страницы с `lang=`, 28 дн. (2026-09-24..10-21) | 0 строк (0 показов) | get_search_console_performance, dims=page, filter contains `lang=` |
| GSC URL Inspection `/?lang=ru` | «Page with redirect», googleCanonical = `https://gptbot.uz/`, последний обход 2026-10-12 | inspect_urls |
| Внутренние ссылки на `?lang=` в dist | 0 html-файлов | grep `href="…?lang=` по dist |

Выводы:
1. Факт из evidence («два шага») подтверждён.
2. Слой определён. Первый шаг отдаёт Page Rule зоны: в ответе нет заголовков `_headers`, а `?lang=ru&a=1` (не совпадает с точным URL правила) отдаёт 200. Значит, ни `functions/index.ts`, ни `_middleware.ts` для `/` не запускаются, потому что `/` нет в `_routes.json` include. Правка `functions/index.ts` из `files` ничего не даст на проде. К тому же она сломает `tests/canonical-url-redirects.test.ts:34` без реального эффекта.
3. Чтобы исправить в один шаг, нужно сменить цель Page Rule `gptbot.uz/?lang=ru` с `/ru/` на `https://gptbot.uz/`. Это конфигурация зоны Cloudflare (API или дашборд), её нет в репо и `deploy_runner.py` её не выкатывает. Альтернатива «добавить `/` в `_routes.json`» хуже: главная (защищённый путь `/`, `scripts/seo-protection.ts:151`) станет вызовом Functions на каждый запрос. Ради URL с 0 показов это не оправдано.
4. Польза нулевая. У Google URL уже в статусе «Page with redirect» с правильным каноникалом, показов нет. Цепочка из 2 шагов для неканонического URL лежит в пределах лимита Googlebot. Часть (a) можно отложить или сделать как опциональную правку зоны.

## (b) Cache-Control у /llms.txt, /llms-full.txt, /*.md склеен

| URL | Живой Cache-Control | Источник |
|---|---|---|
| `/llms.txt` | `public, max-age=0, s-maxage=3600, stale-while-revalidate=86400, public, max-age=21600` | curl |
| `/llms-full.txt` | то же | curl |
| `/ru/ai-bot-dlya-biznesa/index.html.md` | `public, max-age=0, s-maxage=3600, stale-while-revalidate=86400, public, max-age=3600` | curl |
| `/sitemap.xml` (уже с `! Cache-Control`) | `public, max-age=0, s-maxage=300, must-revalidate`, одно значение | curl; `scripts/generate-robots.ts:278-283` |
| `/llms` (rewrite на llms.txt) | только глобальное значение | curl |

- Причина: блоки `/llms.txt` (`generate-robots.ts:287-289`), `/llms-full.txt` (`:290-292`) и `/*.md` (`:303-306`) не отцепляют унаследованный `/*` Cache-Control. У sitemap/robots/feeds это уже сделано через `  ! Cache-Control`. Живой sitemap показывает, что синтаксис detach на этом проекте работает.
- Действие корректно: вставить `headers.push('  ! Cache-Control');` перед строками 288, 291 и 306. Тесты, которые ассертят эти значения, не найдены (grep `max-age=21600` по tests/ = 0).
- Дополнение (опционально): `/llms` после правки останется с глобальной политикой. Это допустимо, отдельный блок не обязателен.
- Влияние на клики: 0 (`/llms.txt` в GSC — «URL is unknown to Google», inspect_urls). Чистая гигиена.

## (c) title 404

| Проверка | Результат | Источник |
|---|---|---|
| `public/404.html:8` | `<title>404 — Страница не найдена \| GPTBot</title>` | Read |
| `dist/404.html:8` и живой 404 (`/does-not-exist-xyz/`) | тот же title, статус 404, noindex | grep dist; curl |
| Правило бренда | суффикс title `\| GPTBot.uz` | `AGENTS.md` §2 |
| Тест | `tests/gsc-indexation-hygiene.test.ts:162` проверяет только noindex; title не ассертится | grep |

Действие корректно: заменить `| GPTBot` на `| GPTBot.uz`. Страница noindex, влияние на клики 0, риск нулевой, путь не защищён.

## Исправленное действие

- (b) `scripts/generate-robots.ts`: добавить `  ! Cache-Control` перед Cache-Control в блоках `/llms.txt`, `/llms-full.txt`, `/*.md`. После `build:production` проверить live: одно значение в каждом заголовке.
- (c) `public/404.html:8` → `404 — Страница не найдена | GPTBot.uz`.
- (a) Исключить `functions/index.ts` из scope. Если делать, то как правку зоны Cloudflare вне репо-деплоя: в Page Rule `gptbot.uz/?lang=ru` сменить цель `https://gptbot.uz/ru/` на `https://gptbot.uz/`. После этого проверить: `/?lang=ru` → 301 `/` → 200 и `/?lang=uz` → `/uz/` без изменений. Без доступа к API зоны часть откладывается: показов 0, Google уже склеил URL. Попутно отметить, что `functions/index.ts` на проде мёртв (не в `_routes.json`), а юнит-тест создаёт ложную уверенность. Удалять его в этом пункте не нужно.
