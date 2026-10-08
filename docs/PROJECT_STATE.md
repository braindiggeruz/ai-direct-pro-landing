# GPTBot.uz — актуальное состояние, 08.10.2026

## Текущий этап: Studio — покупка под задачу и отчёт владельца, локально

Реализована команда владельца по `docs/MONETIZATION_ROADMAP_20261008.md`. В основном чате free/full сравнение из server config, Kunlik первым для одной задачи, Oylik для повторных документов (в том числе после reload), явный тариф → существующий Checkout. Пример дизайна через настоящий SlideCanvas, без AI. Бесплатный PPTX/редактирование/возврат к документу сохранены; платная генерация отдельным подтверждением.

Owner-only `/api/admin/ai-chat/studio?days=7`, 7/14/30 дней: закрытые события без PII, live paid/refunds, источники, полученные части, оценка AI и ручные реальные расходы. Клик не равен покупке/сохранённому файлу; неизвестный расход не считается нулём. Расширена диагностика фискальной очереди и алертов.

Click read-only: **1 оплаченный live заказ чата**, `payment_id:click_-12`, **8 попыток**, без признаков собственного submit. Причина `-12` и внешний чек UNKNOWN; Merchant read-профиль недоступен. Не помечать чек готовым и не повторять Submit без сверки. Квитанция `reports/studio-monetization-20261008/fiscal-readonly.json`; копируемый запрос поддержке в `docs/STUDIO_MONETIZATION_IMPLEMENTATION_20261008.md`.

Предыдущий trial `485ca4e7`: **всего 3 пробных ответа**, org-scoped settlement и подписанная cookie; 0078 ещё требует reviewed production migration. Studio остаётся бесплатной 1 раз/сутки, Kunlik 5 900/Oylik 39 900 сум; тариф чата отдельно. Preview-only вместо бесплатного PPTX не внедрён. Startup performance caps не повышены; optional business classifier переиспользует lazy answer part.

Этот этап **не опубликован**. Production ранее проверен на `c4cd8c70`; перед выпуском сверить заново. Финальная локальная приёмка — `reports/studio-monetization-20261008/verification.json`; код — `docs/agents-platform/STATE.json.last_commit` после D-006 relay. P4 реальная покупка/возврат/receipt остаётся открытой. Внешний Merchant readback, затем по команде владельца backup/0078/full build/guarded release. Повторно не реконструировать Claude и не создавать второй генератор.

## Предыдущий локальный этап: рабочее пространство и покупка

Новый UX реализован в `F:/Claude/gptbot-codex-integration-20261007`: desktop чат рядом со слайдами; mobile Чат/Слайды; реальные правки/PPTX; безопасное восстановление/paid upgrade; смена RU/UZ открывает ordinary chat. Контекстная карточка AI-пакета появляется после первого ответа/у лимита с direct Click/Payme и честной ценой; скрывается на день, исключает paid/off/Studio. 339 regressions PASS; browser/typecheck/lint evidence и финальная сборка — `CHAT_STUDIO_WORKSPACE_IMPLEMENTATION_20261008.md` и `reports/chat-studio-workspace-20261008/`.

**Новая версия ещё не опубликована.** Live marker всё ещё `c4cd8c701d383f1139486c91b30cd5c2bf7f46e2`. Следующий этап — guarded release по команде владельца. Реальная оплата/генерация/PPTX/чек и измерение ROI остаются отдельной приёмкой. Тарифы и backend прежние; photo off. Не повторять Claude reconstruction и не путать локальный preview с production.

Код `432608408d11fa0119da33c3a627df9d9f11bc39` сохранён в Git. Combined production build/stamp/guard PASS, 998 файлов; финальный полный layout 446 сценариев PASS. Оба прежних FAIL по LCP/CLS сохранены: причина редкого большого CLS не подтверждена, это остаётся риском проверки загрузки. Release tests 42 PASS / 4 ожидаемых skip. Проверки и ограничения: `reports/chat-studio-workspace-20261008/verification.json`. Actual-build preview: http://127.0.0.1:19129/ru/gpt-chat/ — локальные примеры, AI/оплата offline.

## История опубликованного состояния до этого этапа


Рабочее дерево: `F:/Claude/gptbot-codex-integration-20261007`, ветка `codex/continuation-20261007`.
Production: `c4cd8c701d383f1139486c91b30cd5c2bf7f46e2`, deployment https://4842b403.ai-direct-pro-landing.pages.dev. Встроенные презентации опубликованы по прямой команде владельца; полный build/guard/deploy и независимый live readback PASS. Код интеграции `8ebb3d30`; квитанция `reports/chat-studio-local/production.json`. Последующие docs-only commits runtime не меняют. Реальных списаний этот этап не выполнял.
Опубликованы платная Studio, новый chat UI и shared Click. SHA релиза указан выше; последующие docs-only commits не меняют runtime.

## Продукт и решения владельца

- Cloudflare Pages/Functions + D1, отдельные сборки публичного сайта, admin и Studio. Чат не переносится на Railway/Supabase.
- Чат: Click и Payme, 20 000 сум, 300 ответов на календарный месяц, максимум 50/сутки. В live пока прежние бесплатные лимиты; локально подготовлены всего 3 пробных ответа. Включённые бесплатные ответы уже действующего AI-пакета сохраняют R2. Отдельного шага оферты нет, принятие действием, ссылки рядом с ценой.
- Studio: Kunlik 5 900 сум / 24 часа / 1 полная презентация; Oylik 39 900 сум / календарный месяц / 10. До 12 содержательных слайдов, до 8 изображений, 3 палитры, заметки. Чатовые права отдельно. Автосписаний нет.
- Владелец подтвердил 07.10, что Click одобрил обе суммы для текущей кассы. Выбран общий service: `STUDIO_CLICK_USE_CHAT_SERVICE=true`, callback `/api/payments/click` маршрутизирует `stu_*`. Новые secrets не копируются.
- Payme: live опубликован 07.10 вместе с Click для чата и обоих тарифов Studio; endpoint `/api/payments/payme`, действующие обработчики, cross-product ownership и fiscal detail. До активации был test — этот режим исторический, не текущий. Интегратор подтвердил успешные тесты; реальные списания/чеки ещё требуют контрольной покупки владельца. Отчёт `PAYME_ACTIVATION_20261007.md`. Uzum off; секреты не публикуются.
- Бесплатная Studio: одна презентация/день, до 6 слайдов/2 картинок; рампа $0.3/день, 50/день, 3 старта/минуту. Платный продукт не называется бесплатным.
- Фото: код сохранён, публично off/draft; запуск только после отдельного quality/privacy допуска. GA4 MP off; AI fallback off.

## Выпущено

Полные презентации, права, оплата/фискализация, восстановление доступа, операции возврата/компенсаций/продления, ограниченная очистка D1, тарифы RU/UZ и оферта v5. Обновлён chat UI с сохранением one-tap/Meta. Ненавязчивые тарифы после результата: можно скрыть на сессию, файл доступен сразу.
Миграции 0073/0075/0076/0077 применены; перед Studio есть приватный D1 backup. Cross-product transaction ownership атомарен.

## Что нельзя путать с готовностью

100 локальных shared Click/fiscal тестов не доказывают реальный денежный цикл. Реальное списание/возврат не выполнялись. AI может ошибаться в фактах: первая ручная проверка выявила ошибки, уточнены промпты; это не гарантия истинности любого будущего текста.
Состояние публичного релиза и окончательные checks — `STUDIO_RELEASE_20261007.md`, `CONTINUATION_REPORT.md` и `CLAUDE_COMPLETION_TRACKER.md`.
N1: скрипт исправлен и по последней команде запущен сейчас; NOT_DUE, окно 06–08.10 ещё не завершилось. Новое расписание не создано. GitHub: две заявки отправлены, принятие не заявляется; два каталога требуют отдельной личной проверки.

## Продолжение

Первый реальный платёж проверять отдельно с владельцем: оплата → права → генерация → скачивание → чек. Не повторять реконструкцию 62-МБ JSONL, не трогать исходные шесть dirty worktree и приватные архивы. Историческая реконструкция: `C:/Users/Borinio/Desktop/seo-skills-main/docs/CLAUDE_TO_CODEX_HANDOFF.md`.
Документация по-русски; никаких reset/clean/force push, скрытых списаний, секретов в Git. Все контрольные логи/реальные PPTX: приватный `F:/Claude/gptbot-tools/backups/codex-continuation-20261007-140534`.

## Текущая доработка UI по просьбе владельца, 07.10

Опубликована заметная текстовая кнопка «Купить пакет» / «Paket olish» с бирюзовой заливкой и плавный бирюзово-индиговый фон чата. Активным покупателям остаётся «Мой пакет» / «Paketim». Проверено 28 сочетаний RU/UZ/ширины/состояния аккаунта; typecheck, lint,104 targeted tests и18 one-tap сценариев зелёные. Полный layout gate446/302/0 и свежесть/SEO2/2 PASS; опубликовано и подтверждено live. Никаких новых тарифов, платёжных операций или модификаций backend. Код этого UI-этапа —35974128; docs-only commits после него не требуют нового deploy. Список31 проверенного URL для переиндексации — `SEO_REINDEX_20261007.txt`; После UI-выпуска Google-заявки ещё не отправлялись; актуальные действия см. GOOGLE_DISCOVERY_20261007.md.

IndexNow 07.10.2026,17:52 Asia/Karachi:31/31 URL заново проверены и отправлены одним POST; HTTP200. Квитанция: `reports/indexnow-receipts/2026-10-07T12-52-57-441Z_codex-cta-31-20261007.json`. Это подтверждает приём уведомления; переобход/индексация и позиции этим не установлены.

Google discovery07.10: обе sitemap и оба RSS приняты GSC, ошибочная регистрация /uz/feed.xml404 удалена. WebSub204/204;25 из31 URL indexed,6 unknown. Ручной Request indexing отклонён дневной квотой. Lastmod fix опубликован;40 tests/typecheck/lint и2 freshness/SEO tests PASS. Google повторно принял исправленные карты18:53; ожидается обработка. Доказательства: `GOOGLE_DISCOVERY_20261007.md` и `reports/google-discovery-receipts/2026-10-07-google-discovery.json`.

Payme опубликован07.10: source `96d2b8b7`, deployment https://ecaee3bc.ai-direct-pro-landing.pages.dev. Чат и оба тарифа Studio предлагают Click+Payme;166 targeted +13 built checks PASS, typecheck/lint/build/guard/deploy0. Exact marker/JS probes и RU/UZ mobile UI подтверждены. Один live invoice чата pending, правильные checkout/fiscal detail/idempotency, без выдачи прав. Studio live invoices/реальные списания/чеки не выполнялись; требуется контрольная покупка владельца. Отчёт `PAYME_ACTIVATION_20261007.md`.


## Новое направление: презентации в основном чате

Владелец07.10 принял roadmap и сначала заказал локальную реализацию **без push/deploy**, затем прямо разрешил production-выпуск. В `F:/Claude/gptbot-codex-integration-20261007` реализованы и опубликованы R0–R3: презентации в ленте основного чата, общий Studio flow, параметры/preview/PPTX, IndexedDB с namespace владельца, история/архивы, inline Kunlik/Oylik, возврат Click/Payme в ту же карточку и три контекстных предложения. Обычный чат не загружает Studio/PPTX и не отправляет карточки текстовой модели. Рекламные deep links: `/ru/gpt-chat/?tool=presentation` и `/uz/gpt-uzbek-tilida/?tool=presentation`.

Отчёт: `CHAT_STUDIO_IMPLEMENTATION_20261007.md`; текущая приёмка — `agents-platform/HANDOFF.md`. Тарифы 20 000/5 900/39 900 раздельные, фото off, full max12. Новый релиз подтверждён на RU/UZ mobile/desktop, 39 файлов/страниц, 10 SEO-контрактов, 8 pre-auth checkout probes; новые заказы/списания не создавались. Следующее действие — одна реальная покупка владельца с проверкой прав, генерации/PPTX и чека. Совместный SKU R4 и фото R5 остаются будущими этапами с проверкой экономики/качества; старый макет15 слайдов/фото/прибыли не обещает текущий состав.
