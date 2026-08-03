# Bormi Admin — ADMIN-1 и ADMIN-2, релизная запись

Дата: 2026-08-03. Ветка `feature/bormi-quickpost`.

Панель собрана, проверена и закоммичена. В production **не выкладывалась**:
выкладка и домен — отдельный owner-гейт.

```
ADMIN_1_IMPLEMENTED=YES     ADMIN_1_TESTED=YES
ADMIN_2_OVERVIEW_IMPLEMENTED=YES  ADMIN_2_TESTED=YES
ADMIN_PREVIEW_DEPLOYED=NO   ADMIN_PRODUCTION_DEPLOYED=NO
D1_MIGRATIONS_ADDED=NO      D1_ROWS_WRITTEN=NO
BORMI_ADMIN_V2_ENABLED=false
```

## 1. Коммиты

| commit | что |
|---|---|
| `7ef8ce5` | документы: инвентарь TailAdmin, матрица данных, безопасность, спецификация, лицензия |
| `e4b38eb` | `GET /api/admin/overview` + `BORMI_ADMIN_V2_ENABLED` |
| `9746bc3` | приложение `apps/bormi-admin` + скрипт `build:admin` |
| `9c36489` | 31 тест |

## 2. Что появилось

```
apps/bormi-admin/                 изолированное приложение
functions/api/admin/overview.ts   один bounded endpoint, owner-only, GET
tests/bormi-admin.test.ts         31 тест
docs/admin/*.md                   4 документа
docs/licenses/TAILADMIN_MIT_LICENSE.md
wrangler.toml                     +1 var (false)
package.json                      +1 скрипт build:admin
```

Экраны: командный центр, магазины и доступы, аудит, состояние системы.

## 3. Гейты

| гейт | результат |
|---|---|
| TypeScript functions / root / admin app | 0 / 0 / 0 |
| ESLint по изменённым файлам | 0 |
| `tests/bormi-admin.test.ts` | 31/31 |
| полный корпус | 1361/1364 |
| secret scan | 14/14 clean |
| сборка admin | PASS |
| `git diff --check` | clean |
| новых миграций | 0 (ledger 32) |
| записей в production D1 | 0 |

Унаследованные падения — те же три: productization route baseline (`blocked`
вместо `pass`), sitemap 240≠234, sotuvchi-onboarding. Проверены поимённо, к
панели отношения не имеют.

## 4. Бандл

| файл | размер | gzip |
|---|---|---|
| entry `index` | 227.35 kB | 73.17 kB |
| CSS | 15.17 kB | 4.13 kB |
| `ui` (общий) | 14.07 kB | 5.17 kB |
| `Overview` (lazy) | 6.50 kB | 2.38 kB |
| `Access` (lazy) | 5.66 kB | 2.12 kB |
| `System` (lazy) | 3.91 kB | 1.68 kB |
| `Audit` (lazy) | 2.18 kB | 0.97 kB |

Ни одного шрифта, изображения, иконочного спрайта и внешнего запроса. Ни
графиков, ни календаря, ни карт, ни каруселей: 19 из 22 upstream-зависимостей
не установлены. Фикстуры в production-бандле отсутствуют — проверено grep по
собранным ассетам.

## 5. Visual и accessibility QA

Проведена на живом dev-сервере с фикстурами. Скриншоты недоступны (панель
браузера не композитит кадры), поэтому зафиксированы DOM-геометрия, вычисленные
стили и accessibility tree.

| проверка | результат |
|---|---|
| 320 / 768 / 1024 / 1440 / 1920, все 4 экрана | горизонтального скролла страницы нет |
| таблицы | скроллятся внутри своей карточки |
| сайдбар < 1024 | `display: none`, открывается бургером, закрывается Esc и по клику вне |
| фокус при открытии меню | уходит на кнопку закрытия |
| `aria-expanded` / `aria-controls` / `aria-current` | есть |
| landmarks | 1 nav, 1 main, 1 header |
| иерархия заголовков | h1 → h2 (группы меню перестали быть h2) |
| контраст light | текст 16.79:1, вторичный 5.98:1 |
| контраст dark | текст 17.0:1, вторичный ~9.7:1 |
| тема | применяется до первой отрисовки, переживает перезагрузку |
| touch targets | ни одной цели меньше 44 px |
| `prefers-reduced-motion` | анимации отключаются |
| console | ни одной ошибки и ни одного лога |
| фикстуры | плашка `SYNTHETIC` видна, пока они включены |

Две находки исправлены прямо в ходе QA: горизонтальный скролл на 320 px
(grid-элементам не хватало `min-w-0`, а у таблицы были отрицательные поля) и
off-canvas сайдбар, который по классу открывался, но фактически оставался за
экраном — заменён на mount/unmount.

WCAG PASS целиком не заявляется: измерены контраст, размеры целей, порядок
заголовков, landmarks и клавиатурные пути; полный аудит не проводился.

## 6. Как выкладывать (не выполнено)

Панель собирается в `dist/admin` **после** сборки root, иначе root-сборка
затрёт каталог:

```bash
npm run build && npm run build:admin
```

Перед первой production-выкладкой потребуется:

1. правило в `_redirects`: `/admin/* /admin/index.html 200` (генерируется
   `scripts/generate-robots.ts`, рядом с существующим правилом для
   `/admin-tools/*`);
2. `/admin/` в общий disallow `robots.txt`;
3. запись в `_headers`: `Cache-Control: no-store` для `/admin/*`;
4. `BORMI_ADMIN_V2_ENABLED=true` + root deploy по точному SHA;
5. записать rollback-деплой до выкладки.

Ни одно из этого не сделано: это и есть owner-гейт.

## 7. Откат

- `BORMI_ADMIN_V2_ENABLED=false` + root deploy — панель перестаёт себя рисовать;
- прежний Owner Control Center `/admin-tools/*` не изменялся и остаётся рабочим;
- удаление правила `/admin/*` из `_redirects` — панель становится недоступной;
- бандл ничего не пишет, поэтому откатывать в данных нечего.

## 8. Что не делалось

Записывающих операций нет вообще. Не трогались: Mini App, BotFather, QuickPost
и его флаги, церемония привязки продавца и её контракт, схема D1, Railway, n8n,
DNS. Не создавались: второй backend, вторая аутентификация, регистрация,
impersonation, прямой доступ к D1 из браузера. Не начинались: ADMIN-3 и далее,
QP-1B, QP-2, vision.
