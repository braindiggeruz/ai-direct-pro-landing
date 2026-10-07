# Приёмка интерфейса чата GPTBot.uz — 07.10.2026

Перенесён и адаптирован frontend checkpoint `df264eb1` по `raw/chat-openai-2026-10-07/DESIGN-SPEC.md`. Сохранены one-tap, Meta, оферта `ai-paket-2026-10-v5` и текущий SEO baseline из `scripts/seo-protection.ts`. Старые JSON-доказательства UI-ветки и её ссылка BASELINE не перенесены: они предшествовали действующим SEO/one-tap изменениям.

Проверки ниже относятся к новой сборке интеграции. Финальный browser/layout v2 прошёл: 446 сценариев, 302 скриншота, 0 ошибок. Typecheck/lint прошли; итоговая production-сборка и live readback фиксируются в STUDIO_RELEASE_20261007.md.

| № | Условие приёмки | Проверка |
|---|---|---|
| 1 | Приветствие, задачи, поле, ответы и карточки используют одну ось и ширину | `composition.failures = 0`, A1/A2 |
| 2 | Задачи однострочные, равной ширины: 2×2 на телефоне, 1×4 от 640 px | A3 |
| 3 | На телефоне приветствие центрировано между шапкой и задачами; на широком экране центрирована вся группа | A4/A5 |
| 4 | Сноска читаема и однострочна от 360 px; раскрытие AI-провайдеров видно при вводе первого вопроса | A6/A19, honesty |
| 5 | Под ответом один ряд действий; платные продолжения в меню; у оборванного ответа доступно продолжение | A7, menuUnreachable |
| 6 | Формулы, таблицы, код, шаги и длинные ответы не ломают колонку | answerFormat, A2/A10 |
| 7 | Формулы имеют `role="math"` и экранированный линейный `aria-label`; чужой текст не создаёт HTML-атрибуты | renderer tests, answerFormat |
| 8 | Drawer и sidebar показывают активный инструмент и Telegram одинаково; история находится в меню | source/revision tests, drawer runs |
| 9 | Нет перекрытий текста, элементов управления или текста под composer | textUnderComposer/textOverlaps/controlOverlaps |
| 10 | Цели касания и контраст проходят; видимые кнопки и ссылки имеют имя | smallTargets/contrastFails, A16 |
| 11 | Keyboard, loading, streaming, error и limit сохраняют рабочее поле и понятные статусы | keyboardNotDetected, states, honesty |
| 12 | Desktop-переход composer завершается; reduced motion исключает анимацию; 1440×900 проверен в RU и UZ | transition, sizes |
| 13 | Оплата сохраняет 20 000 сум, 300 ответов, 50 в день, Click live и оферту v5; 640/700/701 px проверены | billing, `scripts/one-tap-check.ts` |
| 14 | Frame совпадает с mounted UI; classic scrollbars не нарушают края; светлая настройка системы сохраняет тёмный UI | frameVsMounted/classicScrollbars/lightRendersDark |
| 15 | Отрицательные контроли действительно ловят ошибки; CLS/LCP и исходные JS/CSS бюджеты не повышены | negativeControls/perf, chat-bundle-budget; premium.css ≤30 000 байт |
| 16 | Существующий SEO contract всех десяти защищённых страниц сохранён; прежние SEO baseline-файлы не переписаны | `assertSeoProtection`, seo-protection/seo-push-revision tests |

Дополнительные исправления поверх checkpoint: доступное имя формул, отступ 24 px у окна оплаты на 640–700 px, селекторы портального drawer, CSS в исходном бюджете. Layout fixture соответствует разрешённому релизу: `mode: live`, провайдер `click`, 20 000/300/50; все API и внешние хосты в checker изолированы.

После свежей сборки выполнить:

```powershell
node scripts/chat-layout-check.mjs --report docs/seo/evidence/2026-10-07-chat-ui/layout-report.json
node --import tsx --test tests/chat-ui-revision.test.ts tests/gpt-chat-rev-design.test.ts tests/chat-bundle-budget.test.ts tests/seo-protection.test.ts tests/seo-push-revision.test.ts
node --import tsx scripts/one-tap-check.ts
```

`tests/chat-ui-revision.test.ts` проверяет свежесть отчёта относительно UI-файлов, условия приёмки и текущий SEO contract. До появления отчёта браузерные проверки обозначаются skipped, а не выполненными. Отдельно остаётся проверка на реальном Android в Chrome и Telegram WebView из DESIGN-SPEC §11.4. Скриншоты headless Chromium не заменяют реальный телефон.
