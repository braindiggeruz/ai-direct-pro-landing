# R3, R6, R9 — технические исправления SEO recovery

Дата: 8 октября 2026. Реализация в рабочем дереве, без commit, push, deployment, миграций, AI-запросов и операций оплаты. Другие участники одновременно меняют контент и главную; их изменения сохранены.

## Что исправлено

### R3 — ссылка на оферту Studio

В `apps/studio/scripts/studio-page.ts` общий `tariffTerms(locale)` теперь возвращает существующий canonical `https://gptbot.uz/${locale}/oferta/`. Раньше UZ-ветка отправляла посетителя `/uz/tariflar/` на `/uz/ommaviy-oferta/`, настоящий 404 по аудиту. Исправление одновременно применяется к статической карточке тарифов и к данным для её React-гидратации. RU-путь прежний. URL документов, тарифы, согласия, order creation и checkout не менялись.

Тест читает оба настоящих offer JSON, проверяет `published`, canonical и indexability, затем рендерит RU/UZ карточки и целую UZ-страницу тарифов. Старый путь отсутствует в SSR и данных острова.

Остальные вхождения старого пути — исторические синтетические test fixtures; это не production-конфигурация. Связанные серверные runtime bindings здесь не читаются и не меняются. До публикации дополнительно проверить public config/readback только разрешённым способом, если отдельная release-проверка использует URL оферты из bindings.

### R6 — дата реальной последней правки

Новый `scripts/content-dates.ts` содержит прежние правила нормализации дат sitemap и общий `pageModifiedDate`: максимум из существующих `lastReviewedAt` и `updatedAt`. `scripts/prerender.ts` использует его для `dateModified` в JSON-LD и видимого «Обновлено / Yangilangan». `scripts/generate-sitemap.ts` использует тот же helper; правило sitemap фактически прежнее.

Ни одна дата в authored JSON самим R6 не переписана. `lastReviewedAt` остаётся отдельным источником и не выдаётся за новую ручную проверку. Дата build или запуска аудита не используется. При отсутствующих/невалидных датах новая дата не придумывается. Опубликованная дата `createdAt` не меняется.

В аудите было 15 страниц с преждевременно старой датой schema. Во время параллельной реализации исправления контента добавили ещё один обоснованный новый `updatedAt` — UZ manual. На момент targeted проверки политика меняет отображение **16** страниц; полный список старого и нового значения: [date-policy-changes.json](date-policy-changes.json). Это сравнение старого/нового генератора на текущих authored sources, а не финальная production revision. Конечный список необходимо сверить с собранным output и protected revision после объединения работ.

### R9 — точная политика для alias и приватных auth responses

**Alias и preview.** В `scripts/generate-robots.ts` и fallback `public/_headers` добавлены только две absolute host rules:

```text
https://ai-direct-pro-landing.pages.dev/*
  X-Robots-Tag: noindex
https://:version.ai-direct-pro-landing.pages.dev/*
  X-Robots-Tag: noindex
```

Основной `gptbot.uz`, `www` redirect и другие Pages-проекты под эти правила не подпадают. Redirect alias не добавлен: alias остаётся пригодным для release checks, и API/auth request semantics сохраняются. Публичные страницы проходят мимо Functions согласно существующему `_routes.json`; поэтому правка только middleware не решила бы дефект.

Для существующих Function routes `functions/_middleware.ts` применяет ту же точную проверку hostname: сам alias или один preview label перед ним. Добавляется только `noindex`, без изменения body, status, cache, CORS, auth и route selection. Уже установленный более строгий `noindex, nofollow, noarchive` сохраняется. Не добавлялся wildcard для всех `pages.dev`, глобальный noindex или новые Function routes. OPTIONS и существующие canonical redirects проходят прежние ветки.

Синтаксис проверен по [официальной документации Cloudflare Pages](https://developers.cloudflare.com/pages/configuration/headers/): absolute host rules и hostname placeholders поддерживаются; `_headers` не применяется к ответам Pages Functions. Поэтому обе ветки нужны. Их реальное применение Cloudflare остаётся предметом readback после отдельного разрешённого deployment.

**Приватные ответы.** Адресная инвентаризация обнаружила:

| Handler | Прежний ответ | Исправление |
|---|---|---|
| `/api/auth/me` 200 | `email`, `role`; только Content-Type | no-store, noindex/nofollow/noarchive, nosniff |
| `/api/auth/me` 401/403 | auth helper уже ставил no-store, но не noindex | сохранены код и JSON, добавлены private headers |
| `/api/auth/login` success/error | token/session JSON; только Content-Type | те же private headers через локальный JSON helper |
| `/api/auth/config` | публичный Turnstile configuration | не изменён, персональных данных здесь не установлено |

Новый `functions/lib/private-response.ts` оборачивает только два перечисленных handler. Общая роль/пароль/JWT/lockout/Turnstile логика и глобальный `requireAdminSession` не менялись. Это адресное закрытие доказанных gaps, а не утверждение, что абсолютно каждый legacy API прошёл security audit. Авторизованные production responses с реальными данными не запрашивались.

## Выполненные проверки

Ограничение памяти: `NODE_OPTIONS=--max-old-space-size=512`; сборки и браузеры этот участник не запускал.

| Проверка | Результат |
|---|---|
| `tests/seo-recovery-technical.test.ts` | 9/9 PASS |
| `tests/studio-middleware-cors.test.ts` | 5/5 PASS |
| `tests/gpt-api-cors.test.ts` | 3/3 PASS |
| `tests/canonical-url-redirects.test.ts` | 4/4 PASS |
| Targeted ESLint всех изменённых TS-файлов и двух date assertions | 0 ошибок |
| `git diff --check` | без whitespace errors; только штатные CRLF/LF notices |

Новый suite проверяет оба порядка review/edit, отсутствие/ошибочность дат, неизменность source review, SSR тарифов, обе host rules, **9 hosts × 5 paths**, сохранность body/status/cache, отсутствие foreign CORS на Studio preflight и сохранность более строгих robots directives. Для auth используются только синтетические локальные claims: валидные admin/owner/support, отсутствие/невалидность токена, запрещённая роль, неправильный пароль, успешная выдача JWT и обратная проверка token claims. Реальные пользовательские данные не используются.

Адаптированы date assertions `tests/ai-chat-guide-schema.test.ts` и `tests/gpt-chat-prerender-links.test.ts`: после новой сборки ожидается самая поздняя authored дата. Эти dist-зависимые suites передаются основной интеграционной проверке, чтобы не тестировать устаревший build.

## Интеграционные acceptance gates

1. Root build/typecheck/targeted suites и protected revision по новому body/schema diff, без ослабления comparator.
2. Проверка всего output: schema modified соответствует visible badge и sitemap для одного типа изменения; будущих/синтетических дат нет; unrelated source dates не изменены.
3. Generated `dist/_headers` содержит ровно заданные host rules и не ставит noindex в глобальном/main-domain блоке. Не считать один факт изменения fallback достаточным.
4. После отдельного разрешения на deployment: проверить root, чаты, Studio, 404 и sample API на main/alias/immutable preview; main индексируем, alias и preview noindex, status/body/routing без изменений. Auth readback — только synthetic fixtures, без снятия чужих данных.
5. Тарифная ссылка видна до и после JS и ведёт к опубликованной UZ-оферте. Canonical документов и механизм согласия не меняются.

## Rollback

Откатывать только отдельный механизм при доказанной регрессии: host-specific правила и соответствующую middleware ветку; date helper/prerender mapping; literal ссылки в tariff renderer; private-response wrapper в двух auth handlers. Не применять общий revert параллельного контента и не возвращать ошибочные trial/продуктовые утверждения. При откате date mapping реальные authored dates не переписывать. При откате headers сначала независимо проверить indexability основного домена и приватность auth responses.

SEO-эффект этих исправлений не гарантируется: это устранение воспроизводимых дефектов. Рейтинг и Google canonical оцениваются отдельно после crawl, с полными GSC окнами.
