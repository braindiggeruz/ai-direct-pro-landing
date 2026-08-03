# Bormi Admin — инвентаризация TailAdmin

Дата: 2026-08-03.

```
TAILADMIN_SKILL_INSTALLED=NO
TAILADMIN_USED_AS_SOURCE_TEMPLATE=YES
TAILADMIN_UPSTREAM_PINNED=YES
TAILADMIN_LICENSE_RECORDED=YES
```

TailAdmin — это MIT-шаблон исходников, а не Claude Skill, и он не устанавливался
как skill. Репозиторий склонирован и зафиксирован на конкретном коммите:

```
repo   TailAdmin/free-react-tailwind-admin-dashboard
sha    21dc917cb6cb22b5f1d12e5af57359a849d19aa8
дата   2026-04-28, v2.3.0
путь   F:\Claude\vendor\tailadmin-react-21dc917   (вне репозитория Bormi)
.git   удалён · submodule не добавлялся
```

Лицензия: [docs/licenses/TAILADMIN_MIT_LICENSE.md](../licenses/TAILADMIN_MIT_LICENSE.md).

## 1. Сравнение стека

| | Bormi root | Mini App | TailAdmin 21dc917 | вывод |
|---|---|---|---|---|
| React | 19.2.7 | 19.2.7 | ^19.0.0 | совместимо |
| React Router | 8.3.0 | — | ^7.1.5 | мажор расходится |
| Tailwind | 3.4 (config-файл) | нет Tailwind вообще | ^4.0.8 (CSS-first) | мажор расходится |
| Vite | ^8.0.12 | ^8.0.12 | ^6.1.0 | мажор расходится |
| TypeScript | ~6.0.2 | ~6.0.2 | ~5.7.2 | расходится |

Отсюда решение: **изолированный app со своим package.json**. Root не
обновляется, Tailwind 3 в root не трогается, lockfile не удаляется, Mini App
design system не меняется. Новый app берёт Tailwind 4 (как upstream), но Vite и
React — версии Bormi, а не TailAdmin.

## 2. Инвентарь компонентов

| элемент upstream | решение | что сделано |
|---|---|---|
| `AppLayout` / `AppSidebar` / `AppHeader` | ADAPT | композиция сохранена (фиксированный сайдбар, тонкий sticky-хедер, main), разметка переписана: `<nav>`/`<main>` landmarks, `aria-current`, разделы Bormi |
| `SidebarContext` | REBUILD | один `useState` в shell; контекст ради двух значений — лишний слой |
| off-canvas по transform | REBUILD | заменено на mount/unmount: transform-вариант не доводил панель до конца (проверено в браузере), а панель за экраном остаётся в tab-order |
| `ThemeToggle` / `ThemeContext` | ADAPT | класс `.dark` на `<html>`, запись в localStorage, анти-FOUC скрипт в `index.html` |
| metric cards (`EcommerceMetrics`) | ADAPT | `Metric` умеет `null` = «нет данных»; ноль и «не измеряется» больше не выглядят одинаково |
| `Badge` | ADAPT | статус — слово, цвет вторым сигналом |
| таблицы | ADAPT | `TableFrame` со sticky-заголовком и собственным горизонтальным скроллом |
| `Alert` | ADAPT | превратился в `ErrorState` с кодом ответа и повтором |
| skeleton | REUSE-AS-IS (идея) | один `.skeleton` на весь панель |
| dropdown / modal | не перенесены | в ADMIN-1 нет ни одного write-действия, для которого нужен диалог; появятся вместе с ADMIN-8 |
| `ApexCharts` + `react-apexcharts` | REJECT (пока) | ни один график ADMIN-1/2 не строится: нечего строить, пока нет исторических событий. Библиотека — отдельное решение вместе с ADMIN-6 |
| `FullCalendar` (5 пакетов) | REJECT | нет домена календаря |
| `@react-jvectormap` | REJECT | нет географии; «demo world map» — ровно то, что запрещено |
| `flatpickr` | REJECT | нет ни одного выбора даты в первом срезе |
| `swiper` | REJECT | карусели в операционной панели не нужны |
| `react-dnd` (+backend) | REJECT | нет drag-and-drop |
| `react-dropzone` | REJECT | загрузка файлов не входит в срез |
| `react-helmet-async` | REJECT | один `<title>`, статический |
| `tailwind-merge`, `clsx` | REJECT | классы собираются шаблонной строкой; для этого объёма зависимость не нужна |
| SVG-иконки TailAdmin | REBUILD | 6 inline-иконок нарисованы заново, без sprite и без icon-шрифта |
| demo-данные, demo-пользователи, фейковые заказы | REJECT | ничего из demo не перенесено |
| sign-in / sign-up экраны | REJECT | у панели нет своей аутентификации, регистрации нет вовсе |
| TailAdmin logo, Pro-бейджи, ссылки на тарифы, промо-виджет | REJECT | не перенесены |
| demo-фотографии | REJECT | в бандле нет ни одного растрового ассета |

## 3. Зависимости, которые реально добавлены

```
react 19.2.7 · react-dom 19.2.7 · react-router 8.3.0       (версии Bormi)
tailwindcss 4 + @tailwindcss/postcss + postcss             (dev)
vite 8 + @vitejs/plugin-react + typescript 6               (dev, версии Bormi)
```

Из 22 upstream-зависимостей перенесены три, и все три уже есть в Bormi. Ни
одного пакета для графиков, календарей, карт, каруселей и dnd не установлено.

## 4. Что осталось от TailAdmin в буквальном смысле

Ни одного файла не скопировано целиком. Перенесены композиция экрана и
представления о том, как выглядит карточка, бейдж, метрика и таблица. Весь код
в `apps/bormi-admin/` написан заново под токены и домены Bormi.
