# Восстановление SEO и аналитики GPTBot.uz — 08.10.2026

Статус: локальный кандидат проверен; deployment и последующие IndexNow/GSC действия разрешены владельцем. Факт внешних действий записывается отдельно в PRODUCTION_READBACK.json и DISCOVERY_RECEIPTS.json, когда они выполнены.

Исходный код e2280e4494ccc272cc0838e91a77c0a20eb8ef19, production baseline a80dfcbd13212246fb650daa877dd295044bc298. Исходный независимый аудит: ../../audits/2026-10-08-regression/AUDIT_README.md. Handoff использован как карта, а не доказательство.

## Вывод аудита

Массовое падение органики не подтверждено: последние сопоставимые 7 завершённых дней GSC дали 382→462 клика (+20,9%), 14 дней 672→844 (+25,6%). Это не отменяет локальных потерь: узкий исторический кластер A_uzbek потерял 50→40 кликов, причём RU-chat14→0, UZ-chat36→40. Login guide60→44 за14дней. Причина не доказана единственным завершённым днём после R-S1. Общая органика, отдельный запрос, распределение URL и GA4 channel — разные измерения.

## Реализованный scope

| Roadmap | Результат |
|---|---|
| R0 | P0 crawl/index blocker не найден; массовый rollback не выполнялся. |
| R1 | В двух чатах, UZ manual/учебных статьях и LLM-файлах отражены 3 успешных пробных ответа всего, отсутствие ежедневного обновления и необходимость AI-пакета после пробы. Backend лимиты не менялись. |
| R2 | Обычный текстовый ответ отделён от режима презентаций/PPTX с собственными квотами. Нет ложного общего «только текст». |
| R3 | Studio UZ terms ведёт на существующую /uz/oferta/. |
| R4 | Условная смена snippets ради CTR отложена до зрелого окна после переобхода. Текущие description правки исправляют фактические условия продукта, не объявлены выигрышем эксперимента. |
| R5 | На главной добавлены14 обычных видимых ссылок в существующей lazy-группе; direct UZ targeting link. SSR проверяет15 приоритетных маршрутов. 13 из них ранее исчезали после hydration. |
| R6 | JSON-LD, sitemap и видимая дата используют последнюю authored updated/review date;16 актуальных URL сверены. Ни дата публикации, ни review-date не выдуманы. |
| R7 | Убраны неподтверждённые ROI/цены/зарплаты/проценты из business article, добавлен метод пилота;5 claims исправлены в hybrid architecture article. Разные RU/UZ intents больше не объявлены переводами. UZ letters guide получил первичный Gov.uz источник и корректный inline link. |
| R8 | Сохранена существующая загрузка; bundle budget пройден без поднятия caps. Field CWV не подтверждён: GSC сообщает недостаточно данных на mobile и desktop. |
| R9 | Только Pages alias/preview получают noindex; приватные auth/me и auth/login — no-store/noindex. Tests проверяют main/foreign hosts и сохранность response/status. |
| R10 | Практический пилот, условные примеры и первичные источники добавлены. Реальные клиентские кейсы/отзывы не выдумывались; outreach не отправлялся. |
| R11 | Не создано новых конкурирующих страниц без доказанного отдельного intent; keyword-owner matrix использует существующие URL. |
| M1/M2 | Baseline, сравнительные данные и технические receipts сохранены. Автоматизация мониторинга не создавалась. Manual actions/security GSC: «Проблем нет»; детальный Crawl Stats и today GA4 UI недоступны. |

## Отдельное исправление GA4

В source/medium обнаружены внутренние названия composer/answer_action и пути статей — 53 сеанса в этих строках. Четыре Google event boundaries теперь передают ui_source/entry_path вместо source. Backend и Meta payloads сохранены, UTM/gclid не подменены. Это предотвращает дальнейшую коллизию имён, но не переписывает историю GA4.

Вчерашние178 Cross-network sessions имеют source/medium=(data not available), campaign=(cross-network). [Google документирует такую комбинацию](https://support.google.com/analytics/answer/15509398?hl=en) при недоступной атрибуции, в том числе с любыми UTM. Это не доказательство рекламного происхождения. Июль–06.10 в текущем session report не содержит Cross-network. Пользователь мог наблюдать другой scope или intraday состояние; screenshot показывает newUsers и неполный день. Нельзя обещать, что user/session строки автоматически исправятся завтра. Подробнее: CROSS_NETWORK_DIAGNOSIS.md.

## Проверки и границы

build:fast, admin build, Studio build, tsc -b, functions typecheck, scoped26 ESLint — PASS. SEO audit —0 критических ошибок. Общий regression run288:283PASS,1 устаревшее15/5 ожидание,4 исторических skips (R-ST1 уже применён). После исправления ожидания suite14/14PASS; эффективный результат284PASS/4skip. Дополнительные worker checks сохранены отдельно и не суммируются повторно.

ARTIFACT_VALIDATION.json:300 HTML, self-canonical/indexable, один H1, valid JSON-LD,462 reciprocal alternate links;16 date rows; Gov.uz inline link;4 compiled analytics boundaries. Protected10/10PASS: у двух чатов только description/body, все10 title/H1/canonical/robots/hreflang/link contracts прежние. Старый review hash сохранён, comparator не ослаблен.

Общий secret scanner отметил неизменённый тестовый placeholder в tests/telegram-assistant.test.ts:639; это воспроизводимый false positive прежнего HEAD, не новый секрет. Scoped staged scan записывается отдельно. Local browser navigation был заблокирован клиентом даже при HTTP200 локального сервера: computed-layout проверка не объявлена пройденной. Нужен live browser readback после выпуска.

## Приёмка и откат

После clean source commit: stamp→guarded lineage check→deployment→exact custom-domain manifest→protected contracts/headers/changed URLs→browser links. Затем IndexNow и Google sitemap submission, при доступном UI ручные запросы приоритетных страниц. HTTP200/accepted не доказывают индексирование или позиции. Google Indexing API для обычных статей не применяется.

Откат — адресный revert recovery commit и guarded release. D1, оплаты, quotas и secrets не изменялись. Старый public artifact сохранён в BEFORE/manifest.json; чужой production commit не перезаписывать. Продолжить измерения через14/28 завершённых дней после подтверждённого recrawl, отдельно mobile/desktop, UZ/остальные страны и query×page; не считать день deployment началом индексного эксперимента.
