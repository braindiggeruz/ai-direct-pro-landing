# GPTBot.uz — актуальное состояние, 08.10.2026

## Текущий этап: 3 пробных ответа и покупка, локально

По подтверждённому решению владельца 08.10: **всего 3 пробных текстовых ответа**, без ежедневного обновления. Реализованы подписанная HttpOnly identity, постоянный org-scoped счётчик, атомарные резервации/settlement и миграция `0078_gpt_lifetime_trial.sql`. Новый чат/RU↔UZ/сутки не сбрасывают пробу; ошибка возвращает место; мобильные IP не делят один trial. После третьего завершённого ответа — закрываемый адаптивный banner с реальными условиями и существующим Click/Payme; история и черновик сохраняются, серверные paid rights снимают блокировку. При неизвестном аккаунте отправка ждёт проверки. Флаг `GPT_FREE_TRIAL_ENABLED` подготовлен в public runtime config, не изменён в production.

Тарифы Studio и бесплатный PPTX сохранены. Дорожная карта: `docs/MONETIZATION_ROADMAP_20261008.md` — отдельная воронка презентаций, апгрейд конкретного результата, Kunlik/Oylik, реальные оплаченные заказы и delivery. Отказ от бесплатного PPTX — только предложение, не внедрён. Включён P0 по `click_fiscal_failed`: скриншот двух алертов есть, причина по production D1/Click ещё **не проверена**, ошибка не объявляется исправленной. Новые проверки: `reports/chat-lifetime-trial-20261008/`.

Условия в контенте, FAQ, тарифах, оферте, приватности и llms обновлены. Новый reviewed SEO baseline меняет только body fingerprint двух чатовых страниц; metadata/link contracts всех 10 сохранены. Старые baseline immutable. После публикации новая бесплатная политика вмешивается в прежнее окно измерения конверсии/P-CTR; SEO-эффект не утверждать.

Код текущего trial: `485ca4e7697e2cbfb12733082be5c1abad17f8cc`. Локально PASS: 213 targeted tests, 3 actual-build browser suites, 446 layout-сценариев, root/functions typecheck, scoped lint/secret scan, bundle/10 SEO contracts, полный main/admin/Studio build + production stamp + guarded check. Артефакт: 998 файлов, `3dd048104854b255a93b20de83d0a871b6f942668708b2769dd56b182905e044`. Эти проверки не доказывают реальную покупку, чек или публикацию; квитанции — в текущем `verification.json`.

**Новый trial и workspace ещё не опубликованы.** Следующий этап: read-only диагностика фискализации → reviewed D1 backup/migration → guarded release по команде владельца → live readback. Данные прежней реконструкции не перечитывать. Для восстановления реального SHA/результатов смотреть `STATE.json`, `HANDOFF.md` и `reports/chat-lifetime-trial-20261008/verification.json`.

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
