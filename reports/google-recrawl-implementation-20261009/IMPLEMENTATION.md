# Уведомления о реальных обновлениях GPTBot.uz — 09.10.2026

## Что изменено

- RSS RU/UZ выбирает 50 статей по последнему содержательному обновлению. Первоначальная pubDate и canonical GUID сохранены. Полные ISO timestamps нормализуются без повторного T00:00:00Z; некорректные даты не превращаются в свежесть.
- /updates/atom.xml содержит 200 последних опубликованных canonical услуг и статей из существующих JSON. Draft/noindex/alias исключены. ID постоянный, updated берётся только из редактируемых данных документа; description служит описанием страницы, а не выдуманной историей изменений. Сборка не подставляет текущее время.
- SEO-файлы получают отдельную короткую политику кеширования. Реальный Wrangler/Miniflare GET подтвердил удаление унаследованного s-maxage=3600/stale-while-revalidate=86400. Порядок директив у провайдера может отличаться, поэтому сравнивается их набор.
- Существующий guarded Pages deploy вызывает WebSub после проверки точного live manifest. До POST дополнительно сравниваются байты, media type и cache policy всех трёх лент на canonical URL без query; повторный manifest проверяет конкурирующий релиз.
- Хеши и intent перед POST записываются в общий Git directory gptbot-websub (вне публикуемого сайта); между worktree есть lock. Accepted hash повторно не отправляется. Неопределённый сетевой результат сохраняется unknown/pending и автоматически не повторяется. Только явный HTTP429/5xx допускает ещё одну попытку на последующем запуске после пяти минут. Максимум две попытки на hash. Ошибка уведомления не вызывает новый upload или rollback рабочего сайта.
- При задержке custom-domain manifest deployment guard повторяет только GET, максимум три проверки. Все прежние проверки lineage, runtime, функций, SEO и биллинга сохранены.

## Полезный контент и ссылки

Усилены три существующих материала, URL/title/H1/canonical и datePublished сохранены:

1. /ru/blog/telegram-bot-dlya-zapisi-klientov/ — учебный запрос времени, отдельное подтверждение администратором, критерии приёмки, ссылки на демо, стоимость и выбор разработчика.
2. /ru/blog/telegram-bot-ili-mini-app/ — три варианта первой версии для мастерской, границы функций и ссылка на работающий локальный учебный сценарий.
3. /uz/blog/instagram-telegram-crm-bitta-ariza-voronkasi/ — этапы сохранения/доставки/согласования/оплаты, границы CRM и ссылки на три приоритетные UZ услуги.

Примеры явно учебные. Клиентские результаты, отзывы, выручка и гарантии не создавались. Новые коммерческие URL не добавлялись. Реальная редакционная дата трёх изменённых статей: 09.10.2026; даты остальных документов не менялись.

## Проверки до релиза

73/73 targeted tests PASS; после нормализации порядка cache directives — повторно 10/10 discovery tests PASS (подмножество, не 83 уникальных теста). TypeScript app/functions и targeted scripts PASS, scoped ESLint PASS, build:fast PASS, SEO audit без critical/orphans/broken links, protected SEO10/10. Browser3/3 при320/1280: HTTP200, selfcanonical, один H1, демо-ссылки, без pageerror и overflow документа. Таблицы используют существующий горизонтальный скролл контейнера. Production-проверки добавляются после выпуска.

## Выпуск и восстановление

Разрешение владельца: реализация принятого roadmap и ранее явная команда деплоить по завершении. Production до изменений: source63e9cee37c9a6acf45356c3494c511bb98f8b22f, artifact47d71f3eef4a5ae0126cfaa55d42d188104222d7e7d5220fde3d010322a7e51c, deployment3958a695. Выпуск только через DR_ROOT и F:/Claude/gptbot-tools/deploy_runner.py после build:production. Ни Git push, ни миграции, ни изменения credentials/webhook не требуются.

Rollback при реальной регрессии: адресный revert code commit этого этапа и guarded build/deploy. Не сбрасывать весь checkout и не удалять историю WebSub. Старый инцидент Click Merchant -12 / неизвестный чек этим этапом не затрагивается.

## После релиза

Проверить точный manifest и реальные feed/sitemap ответы, XML, hash, cache, ETag; commercial link graph;10protected contracts;3статьи в браузере. Подать новую Atom и обновлённые RSS/sitemap в GSC один раз. IndexNow относится к участвующим поисковикам; он не подтверждает обход Google.

Контрольные точки после релиза:3/7/14дней. Через OpenSEO Inspection сравнить lastCrawlTime с фактическим временем deployment, canonical и fetch state. Отдельно проверить загрузку sitemap/Atom в GSC. Только после накопления завершённых окон читать показы/клики/заявки. Accepted WebSub/GSC не означает обход, индексацию, позиции или прибыль. За пределами текущего release host дедупликация требует переноса durable state; автоматического сброса состояния нет.

Настоящие livestream/вакансии не запускались: для существующих статей и услуг используется документированный RSS/Atom/WebSub, без Google Indexing API и фиктивной разметки.

## Источники и воспроизведение

- Google RSS/Atom/WebSub: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- Cloudflare header merging/detach: https://developers.cloudflare.com/pages/configuration/headers/
- Google recrawl timing: https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl
- Исследование до реализации: ../google-recrawl-roadmap-20261009/ROADMAP.md и EVIDENCE.json.
- Локальные данные: content-changes.json, cache-local.json, browser-local.json; verify-artifact.py и verify-browser.mjs воспроизводят проверки.
