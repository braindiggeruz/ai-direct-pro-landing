# Bormi Admin v1 — production release

Дата подготовки: 2026-08-04
Ветка: `feature/bormi-admin-v1-final`
Флаг раскатки: `BORMI_ADMIN_V2_ENABLED = "false"` (не менялся)

Этот документ — то, что нужно выполнить, чтобы Bormi Admin v1 стал рабочим
Owner Control Center в проде, и то, что нельзя выполнять без отдельного
подтверждения владельца.

---

## 1. Что вошло в v1

| Слой | Что появилось | Где |
| --- | --- | --- |
| ADMIN-3B | Три команды жизненного цикла объявления | `functions/platform/admin/listing-lifecycle.ts`, `functions/api/admin/listings/[id]/{publish,unpublish,archive}.ts` |
| ADMIN-3B | Расширение словаря аудита | `migrations/0033_owner_audit_listing_actions.sql`, `functions/platform/admin/{validation,audit}.ts` |
| ADMIN-3B | Блок «Действия» на карточке объявления | `apps/bormi-admin/src/pages/ListingDetail.tsx` |
| ADMIN-4A | Read-only «Заказы и вопросы» | `functions/platform/admin/operations.ts`, `functions/api/admin/{orders,questions}/**` |
| ADMIN-4A | Экраны очередей и карточек | `apps/bormi-admin/src/pages/{Operations,OrderDetail,QuestionDetail}.tsx` |
| Hardening | Правила края для `/admin/` | `scripts/generate-robots.ts`, `src/shared/robots-policy.ts`, `public/{_headers,_redirects,robots.txt}` |

Что **не** вошло и почему — в
[BORMI_ADMIN_V1_ROLLBACK.md](BORMI_ADMIN_V1_ROLLBACK.md) и в разделе 7 ниже.

---

## 2. Порядок сборки — он обязателен

```bash
npm run build
```

```bash
npm run build:admin
```

Корневая сборка пишет в `dist` и очищает его целиком. Панель собирается в
`dist/admin` (`apps/bormi-admin/vite.config.ts`, `outDir: '../../dist/admin'`,
`emptyOutDir: true`). Если поменять порядок местами, корневая сборка сотрёт
`dist/admin`, и на проде `/admin/` вернёт 404 при живом `_redirects` — то есть
пустой экран без единой ошибки в логе.

Проверка после сборки:

```bash
node -e "console.log(require('fs').existsSync('dist/admin/index.html'))"
```

---

## 3. Правила края

`scripts/generate-robots.ts` генерирует `dist/_redirects`, `dist/_headers` и
`dist/robots.txt` при каждой корневой сборке. Файлы в `public/` — страховка для
нестандартных сборок и держатся синхронно; за расхождением следит
`tests/bormi-admin-hardening.test.ts`.

**SPA fallback — Pages Function, а не `_redirects`**

Очевидное правило `/admin/*  /admin/index.html  200` **не работает**, и это было
воспроизведено на настоящем рантайме (`npx wrangler pages dev dist`), а не
предположено:

| Правило | Что происходит |
| --- | --- |
| `/admin/*  /admin/index.html  200` | **404 на каждом подмаршруте.** Pages срезает `.html` у назначения, попадает на `/admin/`, который снова совпадает с `/admin/*`; цикл обрывается отказом |
| `/admin/*  /admin/  200` | **200 на подмаршрутах и 200 на ассетах.** `_redirects` вычисляется *до* статических файлов, поэтому `/admin/assets/index-*.js` отдавал HTML-оболочку, и панель не загружала собственный код |

Записать «переписывай только то, что не является файлом» в `_redirects`
невозможно. Маркетинговое SPA на это не натыкается, потому что его ассеты лежат
в `/assets/*`, вне его шаблона `/admin-tools/*`.

Поэтому маршрутизация переехала в `functions/admin/[[path]].ts`, а
`_routes.json` исключает `/admin/assets/*`:

```json
{
  "version": 1,
  "include": ["/api/*", "/admin-tools/*", "/admin/*", "/robots.txt"],
  "exclude": ["/admin/assets/*"]
}
```

Один вызов Worker на документ, ноль на файл.

**Заголовки — там же**

`_headers` **склеивает** совпавшие блоки, а не отдаёт победу более
специфичному. Блок `/admin/*` поверх глобального `/*` давал:

```
Cache-Control: public, max-age=0, s-maxage=3600, stale-while-revalidate=86400, no-store, no-cache, must-revalidate, max-age=0
X-Frame-Options: SAMEORIGIN, DENY
```

— директиву кэша, противоречащую самой себе, и заголовок фрейминга, который
браузеры считают некорректным. Ответ Function обходит `_headers` целиком,
поэтому оболочка сама выставляет:

```
Cache-Control: no-store, no-cache, must-revalidate, max-age=0
X-Frame-Options: DENY
X-Robots-Tag: noindex, nofollow, noarchive, nosnippet
X-Content-Type-Options: nosniff
Referrer-Policy: same-origin
```

В `_headers` остался единственный блок для пути, который Function намеренно не
обслуживает:

```
/admin/assets/*
  Cache-Control: public, max-age=31536000, immutable
  X-Robots-Tag: noindex, nofollow, noarchive, nosnippet
```

**`robots.txt`** — `Disallow: /admin/` добавлен в каждый блок агента, рядом с
уже существовавшими `/admin-tools/` и `/api/`.

Общего `/*` fallback в `_redirects` по-прежнему нет: неизвестный публичный URL
обязан возвращать 404.

**Проверено локально** на `wrangler pages dev dist`:

| Путь | Ответ |
| --- | --- |
| `/admin/`, `/admin/listings`, `/admin/operations`, `/admin/categories`, `/admin/audit`, `/admin/system` | 200, оболочка, `no-store` + `DENY` + `noindex, nofollow, noarchive, nosnippet` |
| `/admin/assets/index-*.js` | 200, настоящий JS (≈199 КБ), `immutable`, `noindex` |
| `/admin-tools/agents` | 200, без изменений |
| `/`, `/robots.txt` | 200, без изменений |

Известное ограничение: у `/admin/assets/*` `Cache-Control` склеивается с
глобальным (`public, max-age=0, s-maxage=3600, …, public, max-age=31536000,
immutable`). Ровно то же самое происходит с `/assets/*` публичного сайта и
происходило до этой работы — это существующее поведение `_headers` в этом
проекте, а не регрессия.

---

## 4. Миграция аудита

`migrations/0033_owner_audit_listing_actions.sql` расширяет два CHECK в
`owner_audit_events`:

* `action` — добавлены `listing.publish`, `listing.unpublish`, `listing.archive`;
* `target_type` — добавлен `product`.

`reason_code` не расширялся. SQLite не умеет менять CHECK на месте, поэтому
таблица пересобирается; все столбцы, значения по умолчанию, PK, UNIQUE и три
явных индекса переносятся без изменений.

Репетиция и её результаты —
[BORMI_ADMIN_AUDIT_ACTION_MIGRATION_REHEARSAL.md](BORMI_ADMIN_AUDIT_ACTION_MIGRATION_REHEARSAL.md).

Без этой миграции панель **не ломается молча**: старый CHECK отклоняет строку
аудита, `INSERT OR IGNORE` её проглатывает, UPDATE зависит от существования той
самой строки и не срабатывает, и команда отвечает `listing_transition_conflict`
(409). Объявление остаётся там, где было. Это доказано тестом
`behaviour: without migration 0033 nothing is published at all`.

---

## 5. Что должно быть выполнено в проде (требует подтверждения владельца)

Порядок обязателен.

1. **Свежий бэкап D1.**

```bash
npx wrangler d1 export gptbot-drafts --remote --output backups/bormi-d1-<YYYYMMDD-HHMM>.sql
```

2. **Репетиция миграции на этом бэкапе** (локально, прод не трогается).

```bash
npm run admin:audit-rehearsal -- backups/bormi-d1-<YYYYMMDD-HHMM>.sql
```

Ожидается `ADMIN_AUDIT_MIGRATION_REHEARSAL=PASS`. При `FAIL` — остановиться.

3. **Применение миграции.**

```bash
npx wrangler d1 execute gptbot-drafts --remote --file migrations/0033_owner_audit_listing_actions.sql
```

4. **Проверка схемы после применения.**

```bash
npx wrangler d1 execute gptbot-drafts --remote --command "SELECT COUNT(*) AS rows FROM owner_audit_events"
```

Число строк обязано совпасть с числом до применения.

5. **Деплой по точному SHA** (после `npm run build` и `npm run build:admin`).

6. **Включение флага** `BORMI_ADMIN_V2_ENABLED = "true"` в `wrangler.toml` —
   это коммит, а не правка в дашборде.

7. **Одна канареечная транзакция**: опубликовать одно черновое объявление через
   панель и проверить, что в `owner_audit_events` появилась ровно одна строка с
   `action = 'listing.publish'` и `target_type = 'product'`.

Ни один из шагов 1–7 не выполнен в этой сессии.

---

## 6. Точная команда владельца

```
BORMI ADMIN V1 PRODUCTION APPLY APPROVED.
APPLY THE AUDIT MIGRATION, DEPLOY THE OWNER CONTROL CENTER,
AND RUN ONE LISTING CANARY.
```

---

## 7. Что осталось за пределами v1

* Массовые действия над объявлениями — нет.
* Запись в категории — нет.
* Любая запись в заказы и обращения (подтверждение, отмена, ответ, закрытие,
  возврат) — нет: это действия продавца по отношению к его же покупателю.
* Восстановление из архива — нет, потому что такого перехода нет в домене
  каталога.
* Фильтр по магазину на экране операций: сервер его поддерживает, экран его пока
  не показывает — в маркетплейсе один активный магазин, и селектор из одного
  значения был бы шумом.
* Сортировка на экране операций одна (новые сверху): см. раздел о планах запросов
  в [BORMI_ADMIN_ORDERS_HANDOFFS_DATA_CONTRACT.md](BORMI_ADMIN_ORDERS_HANDOFFS_DATA_CONTRACT.md).
