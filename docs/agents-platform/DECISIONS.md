# DECISIONS — журнал принятых архитектурных решений

## D-DISCOVERY-20261009 — authored feeds and verified notification

RSS freshness follows actual authored updates, keeping publication dates and canonical IDs. A200entry Atom feed includes existing eligible services and articles, using their descriptions without inventing a change history. Detach the inherited HTML cache policy for discovery files. Guarded Pages release verifies the exact custom-domain manifest and feed bytes before WebSub. The shared Git directory holds hash dedupe and a publisher lock; accepted hashes and ambiguous writes are not automatically resent. Explicit429/5xx may retry once later after5minutes. Notification failure never causes upload retry or rollback. No unsupported Google Indexing API, fake jobs/live streams, or build-time date changes.

## D-COMMERCIAL-20261009 — existing pages, local demo and truthful lead acknowledgements

Keep the six core Telegram lead pages and supporting CRM/Mini App/site pages at their existing URLs. Commercial cluster ownership is modelled separately from informational blog coverage. A local teaching demo sends no network request and no conversion. Lead conversion is gated by a server acknowledgement and bounded opaque-key dedupe; contacts and task text never enter analytics. A changed task on an earlier contact is not silently claimed as saved: preserve the form and explain the direct-contact path. Reuse the existing outbox and maintenance route, draining at most one pending lead with a four-second transport budget and its existing lease; no new scheduler or schema. Delivery remains at least once and is distinct from qualification or revenue.

## D-SEO-ADS-20260928 — factual advertising content and opt-in conversion layout

Preserve existing URLs, titles, H1, canonical, publication dates and the ten protected SEO contracts. Refresh 15 advertising documents in place. Own tariffs are not market benchmarks; illustrative calculations are not client results. SMM scope must agree between landing, article and FAQ. Direct Telegram Ads rules must not be confused with reseller conditions or post placements.

Reuse the existing prerenderer with an optional compactHero flag on two advertising pages, preserving the full H1 and other pages' layout. A brief with a source URL is a manual contact aid, not automatic attribution. Keep contact_click separate from acknowledged and qualified leads; do not fabricate generate_lead. No new API, schema, provider or production mutation. Release is separate from local preparation. Evidence: docs/seo/advertising-2026-09-28/REPORT-RU.md.

## D-SEO-ADS-20260928C — homepage service links and blog freshness without touching protected text

The homepage links the advertising and marketing landings from a visible React section inside <main> (src/components/PromotionServices.tsx), not from the SEO shell, so the protected homepage text and hash stay unchanged. The blog indexes list up to eight articles whose dateModified is later than datePublished above the publication-date grid. Titles of blog articles listed in the homepage shell are part of the protected homepage text: change them only with a reviewed baseline update, never as a side effect of an article edit. Evidence: docs/seo/advertising-2026-09-28/REPORT-RU.md, section «Третий проход».

## D-SEO-ADS-20260928B — one sourced fact set, honest availability, guarded content

Money pages cite only primary platform sources; reseller conditions (eLama, 25.02.2025) live in the Telegram Ads article, labelled as a provider condition with its source, never as a platform rule. Published tariffs are repeated verbatim on the RU and UZ hubs; no new prices are invented. Services delivered by the team declare the organisation hours (Mon-Sat 10:00-19:00) and no 24/7 hoursAvailable; only bot services keep it. A landing never hands its own main query to another URL as anchor text, except a consolidation link to the URL that owns the same query and the traffic-protected GPT cluster. Absolute links to https://gptbot.uz are internal. tests/seo-content-guards.test.ts enforces raw-token, empty-CTA, anchor, Telegram-threshold, hub-tariff and availability rules. Evidence: docs/seo/advertising-2026-09-28/REPORT-RU.md, section «Второй проход».

## D-041 — voice search is AI for hearing only; understanding stays deterministic (2026-08-02)

**Decision.** The only model in the Bormi voice path is speech-to-text.
Converting a transcript into a catalog query — budget, stock, attributes,
category, product words — is deterministic code that reuses the existing
`parseBudget`, `normalizeKnowledgeText` and `CATALOG_LIMITS`. Voice and typed
search execute through one shared `runCatalogSearch`, so `searchPublishedProducts`
and `rankCatalogProducts` remain the only ranking authority. A model may never
name a product, a price, an availability state or a category. Ambiguity is
resolved by exactly one short question or left unapplied; it is never guessed.
Attribute words rank inside the query rather than being turned into a filter the
catalog cannot honour, and words that matched nothing are disclosed through the
existing `unmatchedConstraints`.

**Why.** Grounding is the product promise: Bormi shows what the connected
catalog actually has. A generative interpreter would be the single point at
which a plausible-but-absent product, or a silently invented price ceiling,
could enter a grounded storefront. Deterministic interpretation is also
testable, free, instant and degrades to plain text search when speech fails —
which is the failure mode a marketplace can survive.

## D-042 — search is grounded in the catalog's own words, and the model may select from them but never add to them (2026-08-02)

**Decision.** A shopper's sentence is understood in two steps. First, every word
is matched against the storefront's real vocabulary — product names, seller
search terms and category names — by stem rather than by equality, and the
**catalog's** form is what is searched. Only when a sentence contains no catalog
word at all is a model asked to map its meaning onto that same vocabulary, and
its answer is intersected with the vocabulary and the real category ids before
anything is searched. The model may choose among the store's products; it can
never introduce one. `searchPublishedProducts` and `rankCatalogProducts` stay
unchanged, so retrieval and grounding remain deterministic.

The user-visible "Не нашли по условию: …" line is retired. It reported the words
that failed, which is only fair if you can tell a real condition from a shopper
clearing their throat — and that requires a filler list nobody can finish. Since
the query now contains only catalog words, nothing dropped was ever applied as a
condition. The replacement states the positive fact: «Искали: блокнот».

**Why.** The first version of this reduced a sentence with a hand-written
stop-word list. It cannot work in Russian or Uzbek. The catalog stores «Блокнот»
and shoppers say «блокноты», «блокнотов», «bloknotlar»; the ranking layer matches
by substring, so the stored word is found inside one form and not the other, and
the query word is reported as unmatched. No list of endings fixes that, and the
first list was already missing «слушай», «можешь» and «дать». Inverting the rule
— keep only what the catalog knows — removes both problems at once and needs no
maintenance: filler is dropped because no product contains it.

**This supersedes the D-040 clause that "the only model in the request path is
speech-to-text".** The owner asked for meaning, not pattern matching. The
grounding invariant that clause protected is preserved by a stronger mechanism
than absence: the model's output is validated against the live catalog, so a
hallucinated product name produces an empty query rather than a search for
something the store does not sell.

**Cost and failure.** The vocabulary is one additional read-only listing, cached
per isolate for a minute, so a search does not pay for it repeatedly. The model
call happens only on the sentences that grounded nothing, is bounded at four
seconds, and every failure — outage, timeout, malformed answer, invented product
— degrades to the deterministic result rather than to an error. Kill switch:
`MARKET_AI_SEARCH_ENABLED`; anything but `"true"` skips the call and leaves
typed and voice search working.

## D-040 — Bormi voice reuses the production speech stack behind the platform AI contract (2026-08-02)

**Decision.** Speech recognition for Bormi uses the existing Voice-to-Reply
implementation (Groq Whisper first, optional OpenAI fallback, in-memory audio,
two size gates, bounded timeout) exposed through the platform AI facade's
previously declared but unimplemented `transcribe` capability, via the single
allow-listed `LEGACY-SHIM` adapter. No second transcription path, no new
provider and no new credential is introduced; `GROQ_API_KEY` and the optional
`OPENAI_API_KEY` are reused. Audio is never persisted, cached or logged, and
the transcript is returned to the speaker only. Voice is gated by
`MARKET_VOICE_SEARCH_ENABLED` and is advertised to the client only when that
switch is on and a speech credential is configured.

**Why.** Copying the speech stack would duplicate model names, retry policy and
privacy discipline in a second place, and would double the surface where audio
handling can drift. Routing it through the platform contract keeps the provider
behind a driver, gives the route a bounded deadline and per-attempt metadata for
free, and makes the capability honestly reportable — a microphone that cannot
work is never shown.

## D-039 — Bormi replaces GPTBot Market as the public consumer brand (2026-08-02)

**Decision.** The production Telegram marketplace uses **Bormi** and the
mechanic **Bormi? — Bor.** across the Mini App, dedicated Market-bot response
copy, menu button and mutable profile metadata. Stable technical identifiers,
including `@gptbot_market_bot`, Pages project names, API paths, D1 tables and
feature flags, remain unchanged. The app uses a dedicated semantic light/dark
design system and adapted mobile interaction patterns without adding a generic
component framework or fabricated marketplace proof.

**Why.** Public brand recognition and consumer clarity do not require a risky
identity, data or infrastructure migration. Keeping stable identifiers protects
deep links, webhook isolation, authorization and rollback while the controllable
surface becomes a coherent standalone product. Profile metadata synchronizes
idempotently on a bounded cadence; username changes require a separate Telegram
owner action and are not inferred from this release.

## D-038 — Telegram review uses isolated static hosting and the existing secret boundary (2026-08-02)

**Decision.** The owner-authorized review uses a dedicated static Pages
project for the Mini App and the existing `gptbot.uz` BFF for authenticated
domain access. The encrypted Agents bot token stays in its existing production
secret boundary. The bot receives native `web_app` response buttons and a
TTL-limited idempotent global menu sync. Exact-origin CORS, official Telegram
HMAC validation, short memory-only sessions and server-derived seller
authority remain mandatory.

**Why.** Preview Pages environments do not inherit production secrets, and
copying a live bot token into a second environment would expand credential
exposure. This split isolates browser assets while keeping identity and domain
truth behind the already-protected Functions runtime. Rollback is flags/menu
first, then exact Pages deployment; D1 needs no rollback because no migration
was added.

## D-037 — Mini App synthetic candidate reuses Sotuvchi truth (2026-08-02)

**Decision.** MA-ADR-001 through MA-ADR-018 are accepted for the isolated
synthetic candidate. The Mini App is a presentation adapter: its BFF derives
identity/store authority server-side and calls existing Sotuvchi services.
The client receives opaque media handles and memory-only short sessions. All
four capability flags default off; the bot remains entry, notification and
fallback. No new schema or production operation belongs to MA-0–MA-8.

**Why.** This delivers buyer and verified-seller product journeys without
creating a second business truth or expanding the live release authority.
MA-9 remains a separately authorized, reversible cohort decision.

## D-030 (2026-07-31, R1.1) Telegram feedback leaves domain work off the network critical path

Production telemetry and the owner walkthrough established a real latency
baseline of 4,019–13,629 ms (average 8,849 ms) for four completed GPTBot
Market interactions. D1 aggregate reads were sub-millisecond at the provider;
the visible amplification matched multiple sequential Telegram sends and a
serialized callback acknowledgement.

The R1.1 latency decision is deliberately bounded:

- preserve ordered, awaited `sendMessage` delivery because Telegram does not
  guarantee the order of concurrent independent sends;
- reduce the first result page from four to three grounded cards and keep the
  existing deterministic `Показать ещё` pagination;
- send one best-effort typing action only for text updates;
- bound typing and callback acknowledgement to two seconds with no retry,
  because late feedback has no product value;
- track callback acknowledgement in the Worker lifecycle, but execute Runtime
  concurrently because callback acknowledgement is not a domain precondition;
- retain all existing message-delivery, update deduplication, tenant, order
  and inventory semantics.

This is a product/transport optimization, not authorization to batch,
parallelize or reorder Telegram product messages. If the post-fix canary is
still slow, the next step is privacy-safe phase timing for context, Runtime and
delivery—not speculative unordered sending.

## D-029 (2026-07-30, P3.1) Owner Control Center released; R1 remains a separate provider-gated pilot

P3.1 was released from merge commit
`9629db58e6b7ec334b680acad053fce161d05137` only after independent review,
fresh verified D1 backup, additive migration `0025`, exact-source manual Pages
deployment and production canaries.

The release preserves these decisions:

- `support_readonly` may read Owner projections but cannot use legacy SEO-admin
  reads or any mutation;
- tenant and automation authority are resolved server-side;
- owner audit and the guarded domain transition are one D1 batch;
- idempotency binds actor, action, target, organization and reason;
- the legacy JWT has no audience contract, but requires HS256, the configured
  issuer, expiry, email and role;
- first-party D1 + Queue automation is the sole supported automation path;
- n8n is retired, automatic publication is disabled and the public marketplace
  remains out of scope.

P3.1 completion is not authorization to start R1. R1 remains gated by
owner/provider creation and ownership of a dedicated Telegram Agents bot,
protected credential installation, exact `getMe` verification, separate
webhook authorization and selection of 1–3 verified stores.

## D-026 (2026-07-28, R0.4-RC1) Поддерживаемая Router lineage без изменения release sequence

**Уязвимая lineage удалена, а не скрыта исключением.** Root web runtime
переведён на exact React/React DOM `19.2.7` и React Router `8.3.0`.
`react-router-dom` удалён из manifest, Yarn lock и installed graph. Все 17
declarative imports механически перенесены в `react-router`; data router,
framework mode, SSR и RSC не внедрялись. Активное исключение для
`GHSA-qwww-vcr4-c8h2` удалено, production-only audit обязан быть нулевым.

**Маршрутизация остаётся прежней.** BrowserRouter живёт только в lazy admin
chunk. Generated parity фиксирует 207 static canonical routes + 17 admin
patterns = 224/224 без additions/removals или изменения invariant. Public
catch-all по-прежнему отсутствует, unknown public route остаётся 404, admin
rewrite ограничен `/admin-tools/*`, protected/auth/redirect/prerender/sitemap
границы не менялись.

**Package-manager authority уточнён.** Root authoritative lock — только
`yarn.lock`; неожиданно tracked stale root `package-lock.json` удалён.
Backend npm authority `apps/gpt-backend/package-lock.json` не менялся.
Никаких wildcard, broad overrides, audit fix или unrelated dependency upgrade
не применялось.

**RC локальный и не меняет governance sequence.** Code commit
`052ba20a1e31ebedd1f584377b78a7ac1cbfb8c0`; полный baseline 788/788 по
33 suites. `react_router_security_migration: completed_locally` и
`local_release_candidate: prepared_locally` не означают завершение R0.4.
R0.3 остаётся `in_progress`, R0.3B blocked, R0.4 incomplete, R1/P3 not started.
Push, deploy, remote rewrite и production mutation не разрешены.

## D-025 (2026-07-28, R0.3/R0.4-prep) Безопасная параллельная подготовка, внешний owner vault и строгий live-rewrite gate

**Классификация credentials.** Admin credential подтверждён как затронутый.
`N8N_INGEST_TOKEN` из-за противоречивого исторического описания консервативно
считается потенциально раскрытым. Для обоих CSPRNG-замены уже сгенерированы, но
хранятся только вне Git в Windows DPAPI CurrentUser vault с ACL текущего
пользователя. В репозиторий попадают лишь names/status, никогда не значения,
фрагменты, хеши или длины. Owner kit также не является repository artifact.

**Порядок R0.3B неизменен.** Live rewrite запрещён, пока владелец не установит
замены в потребителях, не перезапустит и не проверит их, не отзовёт старые
credentials и не подтвердит freeze всех writers: Railway auto-deploy,
Cloudflare Pages auto-deploy, SEO scheduler и другие automation writers.
Автоматизация затем использует свежий mirror, очищает все пять путей, сохраняет
remote-only refs, прогоняет полный gate и обновляет только явный allowlist refs
с точными force-with-lease. `git push --mirror` запрещён.

**R0.4 допускает только обратимую локальную подготовку.** Пока R0.3B
заблокирован, разрешены names-only env contract, checksum/order validation,
synthetic local migration и backup/restore rehearsals, deployment dry-run и
runbooks. Code commit:
`27e7ddbe03695a859c9a7c11e7e93b450309946b`. Это
`R0.4-prep: completed_locally`, а не завершение R0.4; production остаётся
заблокированным, R1 не начат. Remote D1 migration, deploy, production
env/secret mutation, webhook mutation и pilot не выполняются.

**Root advisory policy узкая и fail-closed для R1.** Root audit сообщает
`GHSA-qwww-vcr4-c8h2` для `react-router` и `react-router-dom`. Текущий
declarative SPA не импортирует затронутые unstable RSC API, поэтому локальная
R0.4-prep может продолжаться с явным warning. Исключение не является общим:
оно блокирует R1 и требует review не позднее 2026-08-11.

Этот исторический temporary exception superseded решением D-026 после
доказанной миграции на patched dependency lineage.

## D-024 (2026-07-28, R0.3) Порядок incident response, repository-local secret gate и incident-исключение из лимита коммитов

**Инцидент шире, чем предполагалось.** Credential-файл существовал по **пяти**
путям: `memory/test_credentials.md`, два дубликата внутри `gptbot-audit/`
(мусор Bolt) и два исторических под `repo/`. Rewrite по одному «очевидному»
пути оставил бы живые копии — это и есть главный результат репетиции R0.3A.
Материал затронут в 12 commits, переписать нужно 409 из 459; заражены 11/11
локальных веток, 38/42 remote-веток, 5/5 тегов, обе записи stash и 5 открытых
PR. Репозиторий **публичный**, материал был открыт с 2026-06-21.

**Ротация строго до rewrite.** Переписать историю раньше ротации — значит
уничтожить след инцидента, оставив действующие значения валидными. Поэтому
порядок зафиксирован: ротация → проверка потребителей → отзыв старого →
rewrite → force-update. В этой сессии ротация **не выполнена**: в окружении нет
ни CLI, ни токенов Cloudflare, Railway, Supabase и n8n, а проверять доступ
самими скомпрометированными значениями запрещено. Следовательно rewrite и
force-update 38 веток и 5 тегов не запускались.

**Почему детектор живёт в репозитории.** GitHub secret scanning и push
protection на репозитории **уже были включены** и не дали ни одного алерта за
пять недель: значения — generic high-entropy без provider-префикса, а
провайдерский движок такие не видит. Настройку
`secret_scanning_non_provider_patterns`, которая их покрыла бы, включить через
API на текущем плане нельзя (PATCH принимается, статус остаётся `disabled`).
Значит защита обязана быть внутри репозитория: `scripts/scan-secrets.ts`.

**Как проектировался gate — и почему первая версия была бесполезна.** Первая
редакция ловила только однострочное `LABEL: value` и заблокировала **0 из 23**
реальных версий файла инцидента: там имена и значения стоят на разных строках
прозы и markdown-таблиц. Вторая редакция добавила окно близости — 22 из 23, но
**268** находок по русскому маркетинговому контенту, где «токен» встречается
постоянно; шумный gate выключают, поэтому вариант отклонён. Принято правило
«любое высокоэнтропийное значение внутри файла с credential-именем»: те же
22 из 23 при **нуле** находок на 2463 отслеживаемых файлах. Единственная
непойманная версия — исходная пустая заглушка без материала. Побочно исправлены
две неточности: union-тип TypeScript (`... } | null`) читался как таблица, а
git-SHA в governance-таблицах принимались за секреты.

**Вывод находок только redacted.** Правило, путь и строка; значение, любой его
фрагмент, хеш и длина не печатаются никогда — иначе CI-лог сам становится
утечкой. Исключения ведутся поимённо, без wildcard, с обоснованием и
проверяются тестом, чтобы список нельзя было тихо расширить до сокрытия
реальной утечки.

**Incident-исключение из D-006.** R0.3 — не продуктовый этап, а реагирование на
инцидент, и оно не укладывается в «максимум два коммита»: current-tree
remediation и prevention gate уже сделаны, а после ротации потребуются ещё
операции — сам rewrite (не commit), remap governance-SHA поверх переписанной
истории и повторная фиксация baseline. Лимит D-006 для R0.3 явно снят.

**Backup.** Полный offline-bundle всей истории (62 refs, verified) лежит вне
репозитория, в Git не добавляется и не публикуется. Он единственный источник
отката и не удаляется до полного завершения операции.

## D-023 (2026-07-28, R0.2) Fastify 5 migration, npm lockfile policy и repository-sync merge вне лимита этапа

**Remote integration отдельным merge.** На старте R0.2 фактический `origin/main`
ушёл вперёд на два commit'а (`025a217`, `1a68a12`) — обе публикации SEO-кластеров
от GPTBot SEO Bot, затрагивающие только `content/`, `public/assets/` и
`reports/seo-clusters/`: 45 файлов, +4562/−10, ноль пересечений с backend,
`functions/`, `src/`, `migrations/`, governance и lockfiles. Пересечения путей с
27 локальными commit'ами нет вообще, `git merge-tree` дал чистое дерево без
конфликтов, secret-скан чист. Интеграция выполнена **обычным non-fast-forward
merge** `8f42081`, потому что 27 локальных stage SHA (включая R0.1 `6c0f723` и
`748de36`) обязаны остаться неизменными: rebase, reset и любая переписка истории
запрещены и не выполнялись. Этот merge — repository-sync, **он не входит в лимит
D-006 «максимум 2 commit'а на этап»**: R0.2 состоит ровно из code commit и relay
commit.

**Fastify 4 → 5 как контролируемая SemVer-major миграция.** `npm audit fix` и
широкий upgrade запрещены и не применялись. Fastify 4.29.1 переведён на 5.10.0
по официальному migration guide, потому что вся цепочка advisory (6 High)
закрывается только мажором: `fast-uri` 2.4.0/3.1.3 → 3.1.4/4.1.1 (path traversal
`GHSA-q3j6-qgpj-74h6`; host confusion `GHSA-v39h-62p7-jpjc`,
`GHSA-v2hh-gcrm-f6hx`, `GHSA-4c8g-83qw-93j6`), `find-my-way` 8.2.2 → 9.7.0
(`GHSA-c96f-x56v-gq3h`), `fast-json-stringify` 5.16.1 → 7.0.1,
`@fastify/ajv-compiler` 3.6.0 → 4.0.5, `@fastify/fast-json-stringify-compiler`
4.3.0 → 5.1.0, плюс сам Fastify (`GHSA-jx2c-rxcm-jvmq` content-type tab bypass,
`GHSA-444r-cwp2-x5xf` forwarded-header spoofing, `GHSA-mrq3-vjjr-p77c`).
Overrides для `find-my-way`, `fast-uri` и compiler-пакетов **не** использовались:
всё пришло через поддерживаемый граф Fastify 5. Supabase, OpenRouter, jose,
pino, zod, root-пакет и frontend не обновлялись.

**Node runtime.** Fastify 5 требует Node ≥ 20; backend уже объявляет
`engines.node: ">=20"`, и `railway.json` собирает через NIXPACKS, который это
объявление читает. Никакой deployment-файл менять не потребовалось и не менялся.

**Поверхность миграции оказалась узкой, потому что валидация — на zod.** Route
schema Fastify не используется, поэтому ужесточение «full JSON schema required»
неприменимо. Из удалённого/изменённого API не используется ничего: `routerPath`,
`routeConfig`, `request.connection`, `reply.redirect`, `getResponseTime`,
`reply.sent`, custom HEAD, `{version}`, decorator-reference-types,
нестандартные HTTP-методы. Логгер передаётся **опциями, а не инстансом**, так
что разделение `logger`/`loggerInstance` тоже не задело. Потребовалось ровно одно
изменение типов: `setErrorHandler` в v5 типизирует ошибку как `unknown`, пока не
закреплён generic — аннотирован `FastifyError`.

**Два осознанных изменения кода.** Первое: сборка приложения вынесена из
`server.ts` в новый `app.ts` с экспортом `buildApp()`, чтобы полностью собранное
приложение можно было прогонять через `app.inject()` без открытия порта;
`server.ts` остаётся единственным модулем, который слушает. Фейковые endpoint'ы
ради тестов запрещены и не создавались.

Второе: v5 отклоняет запрос с `Content-Type: application/json` и пустым телом
(`FST_ERR_CTP_EMPTY_JSON_BODY`). Cloudflare-gateway (`proxyToRailway`)
**безусловно** ставит этот заголовок на каждый forwarded-вызов, включая методы
без тела, поэтому `DELETE /v1/gpt/session/:id` начал бы отвечать 400 от
body-парсера вместо 401 от собственного auth-guard. Это подтверждено тестом до
исправления. Контракт v4 восстановлен точечным content-type parser: пустое тело
парсится в `undefined` и решение принимает route, а malformed JSON по-прежнему
fail-closed с контролируемым 400. Поскольку этот parser заменяет дефолтный,
построенный на `secure-json-parse` (`protoAction`/`constructorAction` = `error`),
его защита от prototype poisoning воспроизведена явно: ключ `__proto__` или
`constructor` отклоняется. Это единственное место, где миграция могла молча
ослабить безопасность, и оно закрыто тестом.

**npm как canonical backend package manager, lockfile — tracked.** `railway.json`
собирает `npm install && npm run build`, значит deployment-менеджер именно npm.
`apps/gpt-backend/package-lock.json` исторически лежал untracked, но **не был
gitignored** — его просто никогда не добавляли. Он соответствует manifest
(lockfileVersion 3), не содержит auth-материала и резолвится только на
`registry.npmjs.org`. Теперь он tracked и authoritative: `npm ci` в чистой
директории **вне репозитория** воспроизводит дерево и проходит typecheck и build,
то есть deploy становится воспроизводимым.

**Границы.** API-контракт сохранён; единственное поведенческое отличие,
которое внёс мажор, нейтрализовано и закрыто тестом. Push, deploy, Railway
deploy, применение migrations, настройка webhook, изменение и ротация secrets,
чтение credential-значений, переписка истории и force push не выполнялись.
`memory/test_credentials.md` не открывался — проверено только tracked-наличие.
Следующий этап — R0.3 Credential Incident Response.

## D-022 (2026-07-28, R0.1) Edge-first abuse control, isolated Turnstile actions и private Railway ingress

R0.1 сохраняет существующую optional-configuration policy Turnstile, но
устраняет fail-open при configured secret: объявленный server secret означает,
что каждый GPT Chat request обязан иметь валидный одноразовый token. Проверка
выполняется на Cloudflare edge до Railway, quota, IP hashing, D1 и provider
work. Network/non-2xx Siteverify error не включает fallback provider path.

Siteverify success недостаточен сам по себе: проверяются exact action и request
hostname. GPT Chat использует `gpt_chat`, admin login — `admin_login`; token
одного flow не может быть принят другим. Token ограничен по длине, живёт только
в React state, очищается после попытки и удаляется из Railway proxy body.
Public config раскрывает только required flag и public site key.

Railway `/v1/gpt/chat` является private costly ingress и до Origin/body/provider
проверяет constant-time internal gateway secret. Это не меняет Supabase,
provider, quota или плановую семантику и не является R0.2 dependency upgrade.

React Router обновлён в пределах 7.x до 7.18.1. Admin route constants и deep
route/wildcard regression связывают тест с реальным `AdminApp`. Public GPT
Chat/Sotuvchi/404/canonical routing остаётся вне Router. Оставшийся
`GHSA-qwww-vcr4-c8h2` документирован как RSC-only и неприменимый, пока приложение
не использует React Server Components; major migration отложена до реальной
applicability.

## D-021 (2026-07-28, P2.7) Domain tables как source-of-truth статистики, content-free best-effort события и owner-only `/stats`

P2.7 делает Sotuvchi измеримым и операционно готовым к пилоту. Payments, CRM,
staff-роли, рассылки, Mini App, внешний dashboard и полная история переписки в
этап не входят, production не изменяется.

Главное решение — не создавать вторую аналитическую истину. Каждое число,
которое продавец видит как точное, читается из таблицы, которой это число уже
принадлежит: опубликованные товары из `sotuvchi_products`, начатые оформления
и оформленные заказы из `sotuvchi_orders`, переходы
подтверждён/отменён/выполнен из `sotuvchi_notifications`, открытые и
отвеченные вопросы из `sotuvchi_handoffs`. `sotuvchi_notifications` подходит
как ledger переходов не случайно: `UNIQUE (order_id, audience, type)` даёт
ровно одну строку на переход, а строка пишется в том же D1 batch, что и сам
переход, поэтому счёт атомарен и устойчив к повтору. Дублировать эти же
переходы событиями означало бы завести второй, более слабый источник, который
неизбежно разойдётся с доменом.

Поэтому каталог событий Sotuvchi сознательно узкий — четыре имени:
`sotuvchi.buyer_started`, `sotuvchi.catalog_answered`,
`sotuvchi.catalog_no_result`, `sotuvchi.stats_viewed`. Они покрывают ровно то,
чего нет ни в одной domain-таблице: повторные открытия витрины и исход
buyer-вопроса. События не являются authority ни для статуса заказа, ни для
остатка, ни для состояния handoff, ни для прав продавца.

Новая migration не создавалась. События пишутся в существующий P0.3 outbox
`events` (migration `0013`), отчёт читает существующие таблицы. Отдельная
daily-aggregate таблица не заводилась: точные счётчики получаются bounded
tenant-scoped запросами, а таблица агрегатов немедленно стала бы третьим
источником истины с собственным лагом.

Гарантия доставки названа честно. `PlatformEventsService` сначала durable
append, затем emit, и duplicate по idempotency key не вызывает второй emit;
но доменная запись и append событий **не** атомарны. Recorder выполняется
после успешной доменной операции, никогда её не повторяет и глушит собственные
ошибки. Следствие зафиксировано прямо: аналитика может недосчитать, но не
может продублировать доменный эффект, и exactly-once для неё не заявляется.
Idempotency key — trusted channel `requestId`, поэтому повторный Telegram
update не добавляет вторую строку. Ради идеальной атомарности событий крупный
рефакторинг P2.1–P2.6 не проводился.

Точка съёма воронки — декоратор domain-порта `withSotuvchiAnalytics`. Он
читает уже произведённые scalar Facts buyer-операции (`catalog.query.intent`,
`catalog.result.count`, `catalog.result.full_card`) и физически не может
изменить, повторить или отменить доменный вызов. `buyer_started` пишется в
endpoint при разрешении deep-link витрины, потому что trusted route и org там
уже известны, а повторное открытие витрины не оставляет следа в домене.

Payload события — только closed-list токены, boolean и bounded счётчики.
`intent` валидируется по закрытому buyer-списку, поэтому строка покупателя не
может попасть в событие даже как «интент». Отклоняются произвольные строки,
длинные значения, неизвестное имя события, пустой org/request. Chat/thread
ref, storefront code, имя, телефон, адрес, текст вопроса и ответа не
передаются вовсе, а PII-guard платформы дополнительно режет опасные ключи.

`/stats` — owner-only и content-free. Authority только из trusted Runtime
`OrgContext.actorId` плюс active owner membership и active store через
существующий `catalog.resolveOwnerContext`. Покупатель, чужой владелец,
отключённое membership и другая identity в том же Telegram-чате получают
одинаковый content-free отказ, поэтому отчёт не подтверждает существование
чужого магазина. Tool не принимает параметров вообще: окно, tenant и store
определяются сервером. Запросы параметризованы, tenant-scoped, ограничены по
времени и возвращают только `COUNT(*)`; ни имя, ни телефон, ни адрес, ни текст
вопроса не читаются.

Отчёт разделён на два блока и это разделение видно продавцу: «Точные данные» и
«Оценка воронки (приблизительно, может быть занижена)». Смешивать их
запрещено. Revenue, прибыль, средний чек, conversion rate и
time-to-seller-reply не считаются: текущая схема не позволяет посчитать их
честно, а неверная метрика хуже отсутствующей. Все числа собираются кодом из
trusted query results и проходят существующий strict grounding.

Публичная ссылка на бота централизована в `src/shared/sotuvchi-config.ts`.
Username Agents-бота ещё не зарегистрирован, поэтому константа равна `null`, а
CTA лендинга ведёт на секцию `#pilot` вместо угаданного `t.me`-адреса: рабочая
ссылка на чужой бот в production опаснее отсутствующей ссылки. Хелпер отказывает
для `aidirectprobot` и `gptbot_javob_bot` и собирает `?start=agent_seller`
только для валидного username. Лендинги `/ru/sotuvchi/` и `/uz/sotuvchi/`
следуют существующему content/prerender-паттерну и позиционируют продукт как
независимый AI-сервис без обещаний роста, гарантий и выдуманных отзывов.

Setup остаётся read-only по умолчанию. `scripts/sotuvchi-pilot-check.ts` не
делает сетевых вызовов вообще, не печатает значения секретов и не меняет
webhook; мутация webhook остаётся исключительно за
`scripts/telegram-agents-setup.ts setup` без `--dry-run`. Release остаётся
blocked: `SOTUVCHI_PRODUCTION_READINESS.md` не отмечает ни одного пункта
автоматически, а в ROADMAP между P2.7 и P3 отсутствует security/release-фаза —
это зафиксировано как governance gap в `STATE.json`.

## D-020 (2026-07-28, P2.6) Durable human handoff bridge, channel address book и opportunistic dispatcher

P2.6 добавляет двусторонний мост между вопросом покупателя и владельцем
магазина, платформенную адресную книгу и outbound-диспетчер. CRM, ticketing,
назначение оператору, SLA-таймер, staff-роли, вложения, голос, payments и
Mini App в этап не входят.

Escalation остаётся явной. Автоматически создаётся только
`buyer_requested_human`: неизвестный вопрос по-прежнему получает safe help,
теперь с подсказкой, как позвать человека. Автоэскалация каждого непонятого
сообщения одновременно спамила бы продавца и сохраняла бы в БД текст, который
покупатель не собирался отправлять человеку. Причины `unknown_intent`,
`catalog_no_result`, `order_question` и `seller_initiated` объявлены в схеме,
но в P2.6 не создаются кодом — это точки расширения, а не мёртвые ветки.

Одна живая переписка на buyer-сессию обеспечивается partial unique index
`(buyer_session_id) WHERE status IN ('open','answered')`. Это делает
невозможным и флуд очереди одним покупателем, и потерю уже отправленного
вопроса: повторный запрос детерминированно резолвится в существующий handoff.

Bounded `question_text` и `reply_text` — единственные free-form колонки всего
агента. Оба очищаются, когда проходит `expires_at`, то есть окно retention
(7 дней) обеспечивается данными, а не договорённостью: после очистки handoff
переходит в `expired`, содержимое читается как null и ответ невозможен. Строка
остаётся как метаданные и никогда не удаляется, поэтому очередь и статистика
не искажаются задним числом. Transcript, вложения, профиль и chat id не
хранятся; operation log содержит только шаг, SHA-256 fingerprint и target.
Scheduler'а в платформе нет, поэтому sweep opportunistic на каждом scoped
чтении/записи: момент физической очистки не гарантируется, гарантируется
нечитаемость просроченного контента.

Reply-мост состоит из двух согласованных частей: durable `workflow_instances`
(FSM `sotuvchi-seller-reply` v1 с payload из одного `handoffId`) и
store-scoped `sotuvchi_seller_reply_sessions` с собственным TTL 24 часа,
заведомо более коротким, чем retention контента. FSM даёт переживание isolate
restart и единый способ отмены, таблица сессии даёт быстрый store-scoped
lookup и `request_key`-guard, из-за которого повторное нажатие «Ответить»
ничего не меняет.

Idempotent replay ответа разрешается раньше проверки состояния сессии.
Отправка ответа переводит сессию в `completed`, поэтому проверка состояния
первой заставляла повторный Telegram update читать settled-сессию как
отсутствующую цель и падать. Порядок теперь: найти сессию любого состояния →
проверить replay по trusted `requestId` → и только затем требовать
`awaiting_reply`. Fingerprint покрывает шаг и target, но не текст ответа —
как и в `handoff.create`.

Ровно один финальный ответ обеспечивается conditional UPDATE, который
одновременно требует `status = 'open'`, `reply_text IS NULL`, совпадения
`version`, непросроченности и owner membership. Ответ, проигравший гонку
конкурентному ответу, отклоняется как content-free `reply_conflict` и ничего
не перезаписывает.

`channel_addresses` вынесена в `functions/platform/channels`, а не в Sotuvchi,
потому что «где достать эту identity» — вопрос платформы, а не агента, и он
одинаков для будущих агентов. Адрес принципиально не является authority:
tenant membership, store ownership и принадлежность переписки заново выводятся
из домена перед каждой отправкой. `namespace` изолирует ботов, делящих канал,
поэтому адрес, привязанный через Agents-бота, не может быть использован для
Javob или lead-бота. Binding выполняется best-effort на inbound: его отказ не
ломает текущий turn, а лишь откладывает будущие pushed-сообщения.

Delivery state живёт на самом агрегате handoff, а не во втором outbox.
Conditional UPDATE, штампующий `seller_notified_at` или `buyer_delivered_at`,
и есть claim, поэтому один интент не может быть сохранён дважды, а дубликат
push не может создать второе доменное изменение. Успешная доставка ответа
покупателю и есть закрытие переписки. Неудачная доставка сохраняет ответ и
повторяется позже, поэтому второй ответ продавца никогда не требуется.

Диспетчер opportunistic: cron'а нет, поэтому pending-интенты магазина
доставляются сразу после turn'а, который их коснулся. Контракт —
durable intent + at-least-once попытка + идемпотентные доменные эффекты;
повторный текст возможен, exactly-once не заявляется. Тот же путь доставляет
notification-интенты заказов P2.5, которые до P2.6 физически некуда было
слать: это закрывает долг P2.5, не заводя второй транспорт.

Pushed-сообщения проходят тот же strict grounding, что и turn-ответы: черновик
собирается из scalar Facts и валидируется до отправки, поэтому неподдерживаемое
число не доставляется вообще. Ответ покупателю всегда несёт маркер авторства
(`Ответ продавца` / `Sotuvchining javobi`), поэтому человеческий ответ нельзя
принять за ответ бота. Seller notice сознательно не содержит текст вопроса:
превью уведомления — самое лёгкое место утечки текста покупателя на экран
блокировки.

Events P2.6 не публикуются: atomic domain-write/outbox policy платформы
по-прежнему не согласована, а фиктивная гарантия доставки запрещена. Migration
`0023` additive и не применялась. Rollback кода: relay revert, затем P2.6 code
revert. Если `0023` когда-либо применена отдельно, после отключения handoff
traffic удаляются только её пять индексов и четыре таблицы в обратном порядке;
удаление `channel_addresses` останавливает доставку интентов P2.5, но не
теряет их.

## D-019 (2026-07-27, P2.5) Inventory ledger, idempotent seller order transitions и durable notification intents

P2.5 добавляет seller-сторону поверх P2.4: управление заказом, количественный
inventory и durable notification outbox. Payments, refunds, partial
fulfillment, multi-item cart, multi-warehouse, variant inventory, CRM, human
handoff и Mini App в этап не входят.

Order lifecycle не получает новую колонку статуса. P2.4 зафиксировал узкий
`CHECK (status IN ('draft','placed','cancelled'))`, а SQLite не расширяет
CHECK без полного table rebuild; rebuild живой таблицы заказов — неоправданный
риск ради трёх значений. Поэтому добавлена одна additive колонка
`fulfillment_status IN ('none','confirmed','done')`, и фактический seller-статус
выводится из пары `(status, fulfillment_status)`: `placed`, `confirmed`,
`cancelled`, `done`. Любая другая пара считается corrupt row, а не новым
состоянием. Разрешены только `placed → confirmed`, `placed → cancelled`,
`confirmed → done`. `confirmed → cancelled` запрещён сознательно: компенсирующее
движение склада создало бы второй путь изменения баланса и риск двойного
возврата, поэтому compensation-движения не существует вовсе. Отменённый заказ
всегда сохраняет `fulfillment_status = 'none'`; инвариант держится conditional
SQL каждого перехода, потому что table-level CHECK к существующей таблице
SQLite добавить нельзя. Продавцу видны только заказы с `placed_at IS NOT NULL`,
поэтому отменённые покупателем draft-заказы в seller-скоуп не попадают.

Inventory — отдельный количественный источник истины, а не производная от
каталога. `sotuvchi_inventory` хранит integer `on_hand` `0..1 000 000` с
optimistic `version` и PK `(org_id, store_id, product_id)`;
`sotuvchi_inventory_moves` — append-only ledger с типами `initial`,
`manual_adjustment`, `order_confirmed`. Декларативное `availability` никогда не
превращается в число: `available` требует существующую строку баланса и
`on_hand >= quantity`, отсутствие строки — fail-closed, а не «бесконечный
остаток»; `preorder` подтверждается без списания и помечается явно;
`unavailable` подтвердить нельзя. Availability проверяется по живому товару в
момент подтверждения, поэтому продавец, снявший товар с продажи, обязан сначала
вернуть его в продажу. Manual arbitrary delta не добавлен: продавец задаёт
абсолютный остаток, а delta вычисляется сервером.

Подтверждение выполняется одним D1 batch: conditional decrement (по
`version` и `on_hand >= quantity`, с вложенной проверкой заказа, товара,
магазина и owner membership), вставка движения, условный переход
`placed → confirmed`, operation row и notification intent. Guard'ы вложены так,
что первый statement применяется тогда и только тогда, когда применяются
остальные; иначе не применяется ничего. Из-за этого недостижимы `confirmed` без
движения, движение без `confirmed`, отрицательный остаток, двойное списание,
дублирующее движение и дублирующий notification intent. Двойное списание
закрыто тремя независимыми барьерами: условием `fulfillment_status = 'none'`,
условием inventory `version` и partial unique index
`(order_id, type) WHERE order_id IS NOT NULL`.

Идемпотентность переиспользует существующую `sotuvchi_order_operations` как
единый store-scoped журнал для buyer checkout и seller операций: trusted
`requestId`, имя операции, SHA-256 fingerprint без PII, target и версия
результата. Повтор того же ключа возвращает сохранённый результат; другой
fingerprint на том же ключе даёт content-free conflict. Повтор перехода с
другим requestId, когда заказ уже в целевом состоянии, возвращает `unchanged`
и ничего не пишет; повторная установка того же остатка тоже ничего не пишет.

Notification — durable intent, а не отправка. Domain mutation никогда не
вызывает Telegram: placement и каждый seller transition пишут строку в
`sotuvchi_notifications` внутри собственного batch, а `UNIQUE (order_id,
audience, type)` не даёт создать второй intent. Строка не содержит payload
вообще: renderer заново читает trusted order, поэтому имя, телефон и адрес
покупателя физически не попадают в outbox. Таблица вынесена в отдельный модуль
`functions/agents/sotuvchi/outbox`, потому что у неё два писателя — checkout и
seller-переходы — и ни один модуль не должен импортировать другой. Delivery
semantics заявляются честно: durable intent плюс at-least-once попытка плюс
идемпотентные доменные эффекты; при падении после отправки возможен повторный
текст. Exactly-once не заявляется. Фактический push продавцу и покупателю в
P2.5 не реализован: он требует durable mapping identity → chat reference,
которого в repository нет, а его создание принадлежит транспортному этапу.
Platform events по-прежнему не публикуются до atomic outbox policy ядра.

Seller authority остаётся server-derived. Closed list из семи операций:
`seller.orders.list`, `seller.order.get`, `seller.order.confirm`,
`seller.order.cancel`, `seller.order.done`, `seller.inventory.get`,
`seller.inventory.set`. Актор берётся только из trusted Runtime
`OrgContext.actorId`, магазин — из active owner membership через существующий
`catalog.resolveOwnerContext`, и owner membership дополнительно проверяется
внутри каждого мутирующего SQL, чтобы авторитет не устарел между чтением и
записью. Продавец не может передать `orgId`, `storeId`, чужой заказ, баланс или
авторитет над товаром; покупатель seller tools не получает. PII-политика
разделена по представлениям: список заказов не содержит имя, телефон и адрес,
а detail отдаёт их авторизованному владельцу магазина, потому что именно он
выполняет доставку. Facts остаются scalar и namespaced, ответы собираются
deterministic composer'ом и проходят существующий strict grounding.

Migration `0022_sotuvchi_orders_inventory.sql` additive и не применялась.
Safe code rollback: relay revert, затем P2.5 code revert. Если `0022` будет
применена отдельно, после отключения seller traffic удаляются только её
индексы и три таблицы в обратном порядке; колонка `fulfillment_status`
остаётся, потому что её физическое удаление требует отдельного одобренного
SQLite table rebuild.

## D-018 (2026-07-27, P2.4) Single-product persistent checkout, immutable Catalog snapshot и PII-minimal order placement

P2.4 добавляет ровно один сценарий: покупатель оформляет **один published
product × целое quantity**. Корзины, второй позиции, inventory reservation,
списания остатка, seller order management, уведомления продавцу, платежей,
CRM, human handoff и Mini App в этапе нет. `ROADMAP.md` P2.4 и master handoff
§1.3 совпадают, поэтому выбран узкий MVP scope без расширения.

Checkout — declarative FSM `sotuvchi-checkout` v1 на существующем P1.2 Workflow
Engine: `idle → awaiting_quantity → awaiting_name → awaiting_phone →
awaiting_address → awaiting_confirmation → completed`, плюс `cancelled` из
любого нетерминального состояния. Таймеров и `expired` нет: без scheduler
фиктивный timeout не имитируется. Workflow payload содержит **только**
`{ orderId }`. Имя, телефон и адрес живут исключительно в `sotuvchi_orders`,
поэтому platform-таблицы `workflow_instances`/`workflow_transitions` остаются
PII-free.

Порядок внутри шага: сначала domain write (условный SQL по
`org+store+id+status='draft'+version+buyer_session_id`), затем workflow
transition. Падение между ними оставляет prompt на прежнем шаге, а повтор того
же значения идемпотентен; обратный порядок мог бы дать `placed` заказ без
данных, поэтому запрещён.

Trusted authority: Telegram identity → `sotuvchi_storefront_sessions` (active
route + active store) → server-side org/store → собственный draft заказа
покупателя. Из пользовательского ввода нельзя задать `orgId`, `storeId`,
`buyerSessionId`, workflow instance, владельца заказа, цену, валюту, статус
публикации и product authority. Checkout стартует только с trusted full card
action `buyer-checkout.<opaque productId>`; свободный текст checkout не
открывает, поэтому P2.3 Q&A не изменился.

Product eligibility проверяется через публичный Catalog API на старте и
повторно на подтверждении: published, active store, active или отсутствующая
category, availability `available|preorder`. `unavailable` запрещён, preorder
явно показывается покупателю. Цена всегда читается из Catalog; callback,
текст, карточка и tool arguments ценой быть не могут. Если цена изменилась,
подтверждение не проходит молча: snapshot обновляется, покупатель получает
новый review с пометкой и обязан подтвердить ещё раз; второй draft при этом не
создаётся.

Заказ хранится в трёх additive таблицах migration `0021_sotuvchi_checkout.sql`:
`sotuvchi_orders`, `sotuvchi_order_items`, `sotuvchi_order_operations`. Item
вынесен в отдельную таблицу ради будущей P2.5, но `UNIQUE (order_id)`
(`idx_sotuvchi_order_items_single`) делает второй item невозможным, а P2.4 API
его не принимает. `idx_sotuvchi_orders_active_draft` — partial UNIQUE по
`buyer_session_id WHERE status='draft'`: один активный checkout на покупателя.
Старт для другого товара при активном draft возвращает существующий заказ с
выбором «Продолжить/Отменить» и не создаёт второй. Table-level CHECK запрещает
`placed` без имени, телефона, адреса, суммы и `placed_at`; conditional UPDATE
дополнительно требует непустое quantity, совпадение `line_total_minor` с
`total_minor` и живой published product с той же ценой — placement и запись
operation выполняются одним D1 batch.

Идемпотентность: trusted `requestId` канала (`tg-agents-<update_id>`) —
store-scoped ключ в `sotuvchi_order_operations`. Ключ проверяется **до**
FSM-состояния, поэтому повтор start/quantity/name/phone/address/confirm/cancel
возвращает сохранённый результат вместо второго эффекта или ошибки состояния.
Тот же ключ с другим fingerprint fail-closed. Fingerprint покрывает только
шаг и не-PII значения: имя, телефон и адрес никогда не хешируются в operation
log.

Order number генерируется сервером: `S-` + 6 символов алфавита
`23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (30 бит, без 0/1/I/O), `UNIQUE (org_id,
store_id, order_number)` и до пяти попыток. Он не кодирует org, store, user или
row id.

Buyer-facing вывод строится только из scalar Facts
(`checkout.product.*`, `checkout.quantity`, `checkout.total_*`,
`checkout.customer.phone_masked`, `checkout.customer.address_present`,
`checkout.order.number/status`). Raw order row в renderer не попадает. Имя и
адрес не эхо-показываются вовсе, телефон только как `+998 ** *** ** NN`.
Поддержан один формат номера — Uzbekistan `+998` + девять цифр. Все числа и
claims проходят существующий strict grounding; unsupported total, цена,
quantity или order number отклоняются. Разрешённые actions: `Оформить`,
`Продолжить`, `Подтвердить`, `Отменить`; кнопок оплаты, управления заказом,
оператора и изменения остатка нет.

Заказ — заявка, а не оплаченная покупка: продавец на P2.4 уведомления и
интерфейса не получает, остаток не меняется, платёж не создаётся. Events по-
прежнему не публикуются до atomic outbox policy.

Migration `0021` не применялась ни локально, ни на production. Runtime
bootstrap `ensureSotuvchiCheckoutSchema` структурно эквивалентен и создаёт те
же объекты. Rollback кода: relay revert, затем P2.4 code revert. Если `0021`
была применена отдельно, после отключения checkout traffic удаляются только её
пять индексов и три таблицы в обратном порядке; shared store/catalog/session/
workflow/tenant таблицы не трогаются.

## D-017 (2026-07-27, P2.3) Deterministic Buyer Q&A, grounded cards и минимальный follow-up

P2.3 оставляет Catalog единственным source-of-truth и не добавляет LLM intent:
buyer parser полностью deterministic-first. Closed intents:
`catalog.list`, `catalog.search`, `product.price`, `product.availability`,
`product.details`, `catalog.filter_price`, `catalog.help`, `unknown`. Порядок
фиксирован: bounded/control validation, public Knowledge normalization,
conservative typo repair, exact phrases, integer price extraction, contextual
follow-up, RU/Uzbek Latin/mixed patterns, bounded plain product-name search,
unknown. Транслитерация, float/currency conversion и profile recommendations
запрещены.

Buyer authority существует только после trusted deep-link route lookup и
durable identity→org/store session. Read path всегда повторно проверяет active
route/store, published product и active category. User text/tool input не
задаёт org/store/agent/storefront code; buyer не получает seller mutation
authority. Opaque product ID разрешён как bounded action ref, потому что он
server-generated и каждый callback revalidated внутри current storefront.

Для card output Platform расширен generic `OutboundCard` и trusted deterministic
tool composer. Это channel-neutral contract, не Sotuvchi import: Runtime
валидирует bounds/controls/action IDs, затем grounding требует, чтобы card
title, description и field values буквально присутствовали в scalar Facts;
claims и numeric scan сохраняются. Telegram только рендерит card plain text и
safe buttons. Разрешены `Подробнее`, `Следующие товары`, `Назад к каталогу`;
Buy/checkout/order/handoff actions отсутствуют.

Facts namespaced по result index и содержат только opaque id, name, integer
price/source+localized display, currency, declarative availability/source+
localized display, bounded description, optional category и result metadata.
Raw rows, org/store/SKU/version/media/storefront code не доходят до renderer.
Unknown/help не содержит product claims. Price filter принимает только bounded
integer UZS и сортирует price asc → normalized name → opaque ID.

Для одного безопасного pronoun follow-up существующая
`sotuvchi_storefront_sessions` получает additive nullable
`last_product_id`, `last_intent`, `selection_request_key`, `selected_at`.
Сохраняются только exact single-product result и trusted request ID; raw
message/query/transcript/profile/contact не сохраняются. Conditional session
update идемпотентен, stale/unpublished/foreign product fail-closed. Conversation
table и TTL/profile memory не создаются.

Migration `0020` не применялась. Safe code rollback оставляет nullable columns;
их физическое удаление требует отдельного SQLite table rebuild change. Events
не добавлены до atomic outbox policy. Cart, checkout, order, quantity,
inventory, payments, seller notification, CRM/operator/human bridge, public
storefront и Mini App переходят только в отдельные этапы.

## D-016 (2026-07-27, P2.2) Catalog source-of-truth, deterministic domain search и trusted domain port

P2.2 хранит каталог в собственных tenant-scoped domain tables migration `0019`:
`sotuvchi_categories`, `sotuvchi_products`, `sotuvchi_catalog_operations` и
`sotuvchi_storefront_sessions`. Категории имеют server-generated opaque
`id`/`slug`, status `active|archived` и deterministic sort order. Category
version сознательно не добавлена: P2.2 требует optimistic concurrency только
для продукта; category mutation остаётся owner-only, идемпотентной и
archive-only вместо delete.

Продукт хранит optional same-store category/SKU, Unicode name, bounded plain
description, integer `price_minor` в единственной валюте `UZS`, декларативное
`available|unavailable|preorder`, opaque media refs, status
`draft|published|archived` и optimistic `version`. Разрешены только
`draft → published`, `published → draft`, `draft|published → archived`;
archived immutable и restore отсутствует. Conditional SQL проверяет
`org_id + store_id + version`, owner membership и active store. Publication
дополнительно требует active category, если она назначена.

Runtime получает новый agent-neutral optional `AgentDomainServicePort`. Manifest
по-прежнему задаёт closed-list tool и сам выбирает `agentId`/operation; caller
не может передать arbitrary operation, `orgId` или store authority. Sotuvchi
domain port разрешает owner store только из trusted Runtime `OrgContext.actorId`
и active membership. Buyer store разрешается из trusted storefront route/org.
Platform не импортирует Sotuvchi, endpoint не содержит catalog SQL, AI selection
остаётся disabled.

Category/product source-of-truth не проецируется в Knowledge на P2.2. Причина:
без атомарной связки catalog write + Knowledge write/outbox projection могла бы
стать stale и выдать неправильный publication/availability. Вместо этого
catalog переиспользует публичные Knowledge normalization/tokenization, а
parameterized domain search ранжирует exact normalized name → prefix → all
tokens → partial tokens → normalized name/id tie-break. Buyer query/result/token
ограничены; видны только published products активного store в active category
или без категории. Это решение можно пересмотреть после atomic outbox policy.

Повтор mutation использует channel-derived `requestId` как store-scoped
idempotency key. `sotuvchi_catalog_operations` хранит только operation,
SHA-256 fingerprint и target/version; mutation и operation row записываются
одним D1 batch. Повтор того же input возвращает сохранённый result, повтор ключа
с другим fingerprint fail-closed. Product name, description, SKU, price и raw
input в operation log не сохраняются.

Buyer deep-link по-прежнему разрешается существующей trusted route. P2.2
добавляет минимальную durable binding `(bot_username, platform identity) →
org/store`, чтобы следующий текст после `/start` остался в том же storefront.
Binding содержит только internal IDs/status/timestamps и при чтении повторно
проверяет active store и active route; storefront code не становится seller
authority. Seller UX — deterministic actions плюс короткие structured commands,
без нового conversational workflow. Buyer responses создаются из scalar
catalog Facts; raw row в renderer не передаётся, price/availability проходят
существующий grounding.

Catalog events не публикуются: atomic domain-write/outbox policy всё ещё не
согласована, поэтому exactly-once не имитируется. Checkout, orders, quantity,
inventory reservation/ledger, delivery/address/phone, payment integration,
human handoff, CRM, analytics, public web storefront, Mini App, R2 upload, CSV
и AI descriptions отсутствуют. Migration `0019` additive и не применялась.
Rollback кода: relay revert, затем P2.2 code revert. Если `0019` когда-либо
применена отдельно, после отключения catalog traffic удаляются только восемь её
индексов и четыре таблицы в обратном порядке; shared store/onboarding/tenant
tables не удаляются.

## D-015 (2026-07-27, P2.1) Recoverable Sotuvchi onboarding, opaque routes и один owner-store

P2.1 добавляет первый production manifest `sotuvchi` только с capability
`store.onboarding`, RU/UZ, deterministic rules, trusted workflow port и пустым
tool allowlist. AI и arbitrary update tool отсутствуют. Catalog, checkout,
orders, inventory, payments integration, handoff и Mini App не входят в этап.

Onboarding хранится в P1.2 Workflow Engine. Trusted TypeScript definition может
использовать optional `reducePayload`, но reducer output всегда повторно проходит
payload validation до commit. FSM:
`start → awaiting_name → awaiting_locale → awaiting_delivery →
awaiting_payment → review → completed`, плюс `cancelled`; payload содержит
только `storeName`, `locale`, `deliveryMode`, `paymentMethods`.

Поскольку workflow tenant-scoped уже при создании instance, orchestration
двухфазная и recoverable. `sotuvchi_onboardings` сначала атомарно закрепляет
уникальный platform identity claim, затем существующий P0.4
`createOrganizationWithOwner` создаёт organization + owner membership одним
D1 batch. После owner check финальный D1 batch создаёт `sotuvchi_stores` и
`telegram_agent_routes`. Foreign keys запрещают store без organization/owner и
route без store; strict inserts и unique constraints откатывают collision.
Interruption до completion оставляет максимум resumable provisional
organization, а не второй tenant/store. Автоматический GC provisional
organizations отсутствует.

MVP policy: одна owner identity имеет максимум один Sotuvchi store. Повторный
start возвращает active onboarding или existing store; completed confirmation и
duplicate Telegram update не повторяют side effects. Store profile хранит
validated name, `ru|uz`, `pickup|delivery|both`, декларативные `cash`,
`card_transfer`, `cash_on_delivery`, status и timestamps. Telegram profile,
phone/address, raw update, payment details и user-supplied org/storefront code
не сохраняются.

Storefront code генерируется сервером как `s-` + 16 lowercase RFC 4648 base32
символов (`a-z2-7`): 80 бит entropy, bounded length, unique constraint и до 5
collision retries. Он не кодирует org/identity/name/phone и служит только lookup
key. Seller входит через allowlisted `agent_seller`; buyer deep-link
`agent_<storefrontCode>` разрешается exact server-side lookup
`(bot_username, route_code) → org/agent/locale`. Buyer route никогда не
запускает seller onboarding.

Tenant-sensitive store API принимает trusted identity context. Owner membership
проверяется на read/write, workflow instance scoped к org, user/agent input не
может передать другой orgId. Endpoint связывает Telegram channel и Runtime, но
business SQL остаётся в Sotuvchi domain, а Runtime остаётся channel-neutral.

P2.1 events не публикуются: согласованной atomic domain-write/outbox policy для
этого completion нет, поэтому exactly-once не заявляется. Migration
`0018_sotuvchi_store_onboarding.sql` additive и не применялась. Rollback code —
relay revert, затем P2.1 code revert; если migration применена отдельно, после
отключения route удаляются только её три индекса и таблицы в обратном порядке,
без удаления shared organizations/memberships/workflow data.

## D-014 (2026-07-27, P1.4) Изолированный Telegram Agents transport и at-most-once update policy
P1.4 использует только новый env namespace `TELEGRAM_AGENTS_BOT_TOKEN`,
`TELEGRAM_AGENTS_WEBHOOK_SECRET`, `TELEGRAM_AGENTS_BOT_USERNAME`. Он не
переиспользует `TELEGRAM_BOT_TOKEN`, Javob credentials или endpoints.
`POST /api/telegram/agents` проверяет exact Telegram secret-header до чтения
body и D1; остальные HTTP methods дают 405. Raw update, secret и profile fields
не логируются.

Update после strict ingest резервируется отдельным ключом
`agents:<bot_username>:<update_id>` в additive
`telegram_agent_updates`, не связанной с legacy `telegram_updates`. Статусы
`reserved|completed|failed` фиксируют at-most-once policy: duplicate не
повторяет Runtime/send, а send/processing failure остаётся terminal и требует
операторского разбирательства вместо скрытого повторения side effects. Long
processing выполняется через `waitUntil` только после durable reserve.

Deep-link grammar P1.4 — `agent_<routeCode>`, где routeCode имеет safe bounded
charset и разрешается исключительно trusted server-side mapping. Payload не
содержит и не задаёт `orgId`; arbitrary agent/org и URL отклоняются. Route-local
registry содержит только demo manifest, global production registry остаётся
пустым. Реальный business/storefront mapping и durable identity→org channel
binding не создавались: offline E2E использует injected identity allowlist, а
route mapping принимает только allowlisted start code. Эта граница переходит к
P2.1 onboarding.

Telegram user id преобразуется в string и передаётся Identity service; Runtime
получает только platform `identityId`, trusted org/agent/locale и normalized
text/action. `chat_id`, `update_id`, token, raw user/profile/callback objects
остаются в channel adapter. Renderer отправляет plain text через существующий
`TelegramClient`, делит сообщения, превращает safe choices в bounded callback
buttons и предсказуемо игнорирует media ref beyond text.

Setup вынесен в неисполняемый автоматически
`scripts/telegram-agents-setup.ts`: `getMe` и exact expected username guard
выполняются до mutations; `aidirectprobot` и `gptbot_javob_bot` запрещены;
webhook path/secret обязательны; поддержан dry-run. Скрипт, migration, webhook
setup, push и deploy в рамках этапа не запускались.

## D-013 (2026-07-27, P1.3) Deterministic-first Runtime, explicit Facts и offline demo
P1.3 уточняет один общий `AgentManifest` вместо параллельного контракта:
manifest и его declarations runtime-validatable, а schema/rule/tool handlers
остаются trusted TypeScript-кодом без dynamic loading. Production registration
имеет одну явную точку в `functions/agents/registry.ts`; registry пуст до
отдельного product/channel этапа, demo не импортируется production path.

Turn order фиксирован: caller-provided active workflow через narrow injected
port → deterministic rules по уникальному ascending priority → optional
closed-list AI selection через существующий Platform AI façade → controlled
fallback. AI выбирает только manifest tool и structured arguments; tool input
повторно проходит runtime schema, а tenant override keys запрещены. Runtime
`orgId` — единственный tenant source.

Tool получает только `OrgContext`, request/locale и narrow Knowledge/Workflow
service ports: raw D1, channel clients, secrets и unrestricted platform
container не передаются. Tool output сначала проецируется в namespaced
scalar-only `FactSheet`, затем deterministic locale template формирует exact
claims. Grounding P1.3 механический, а не универсальный truth detector:
template-derived claims должны точно совпасть с Facts, и числа в text/choice
labels должны встречаться в Fact values. Unsupported claim/number даёт
`rejected` с пустым outbound.

Demo agent поддерживает только offline echo и один Knowledge lookup на fake
ports, не регистрируется production и не является Sotuvchi. Workflow
интеграция ограничена injected stub/port без real D1 product flow. Turn Events
не добавлены: существующая publish semantics и требуемая best-effort политика
для сохранения runtime result не согласованы. Conversation history/storage
также отложены. P1.3 не требует migration.

## D-012 (2026-07-27, P1.2) Persistent FSM, atomic transition history и ограниченная action policy
P1.2 хранит tenant-scoped instances и transition history в двух additive D1
таблицах, а доверенные определения FSM — только в TypeScript. Переход фиксируется
одним D1 `batch`: conditional history insert и optimistic instance update,
связанный существованием нового transition id; unique `(org_id, idempotency_key)`
делает create/transition replay идемпотентным, а duplicate проверяется раньше
stale-version. Guards получают только data context без переданных DB/network/AI
capabilities. Closed-list actions валидируются до commit, выполняются
последовательно после durable transition и не повторяются по тому же ключу;
history хранит только PII-safe type/status/code. Политика P1.2 для action —
at-most-once: isolate может умереть между commit и handler, поэтому
non-idempotent production actions требуют будущий durable action outbox/recovery.
Workflow events также отложены до policy, которая атомарно свяжет domain write и
outbox; фиктивная гарантия доставки запрещена. Timer runner/cron/scheduler
отсутствуют, nullable `wake_at` оставлен только как extraction point.

## D-011 (2026-07-27, P1.1) Две Knowledge tables, deterministic search и отложенные revisions/events
P1.1 использует tenant-scoped `knowledge_collections`/`knowledge_items` с
composite tenant FK, agent-owned runtime schema, strict JSON-safe projections и
optimistic item versions. Search v1 — NFKC/lowercase/punctuation normalization,
parameterized exact/prefix/token candidates и fixed deterministic score со
stable tie-break; empty query fail-closed. `knowledge_revisions` отложена до
доказанного audit/rollback требования Sotuvchi. Knowledge events отложены до
отдельной idempotency/dispatch policy. Media refs остаются opaque
channel/store references; доставка не принадлежит Knowledge Engine.

## D-010 (2026-07-27, P0.5) Capability AI façade, config policy и один exact legacy shim
`platform/ai` — provider-neutral capability layer с `complete` и generic
`structured`; streaming/transcription остаются отдельными typed driver
contracts. Task+tier policy задаёт ordered routes и limits. Structured result
успешен только после strict JSON parse и runtime schema validation; errors
content-free/fail-closed. Единственная platform→legacy зависимость разрешена в
exact `functions/platform/ai/drivers/legacy.ts` с маркером `LEGACY-SHIM`.
Production Javob/gpt-chat/STT consumers массово не переключались.

## D-009 (2026-07-26, P0.4) Identity без persons, organization как tenant root и PII-minimal contacts
P0.4 добавил independent identities, organizations, memberships и contacts без
изменения legacy users. Organization — tenant root; repository methods принимают
`orgId` первым бизнес-аргументом и маскируют cross-tenant доступ как not found.
Contacts не хранят raw profile/phone/display name. Organization+owner membership
создаются атомарным D1 batch; identity остаётся самостоятельной записью.

## D-008 (2026-07-26, P0.3) Events durable-first, PII-safe и с точечным bridge
Canonical platform outbox — additive D1 `events`; envelope имеет nullable
org/agent, aggregate ref и runtime-validated `PiiSafePayload`. Idempotency key
создаёт максимум одну row и duplicate не вызывает emit повторно. Service сначала
persist, затем последовательно вызывает in-process subscribers. P0.3 bridge
добавлен только к одному Javob direct-message потоку, не содержит raw content и
не ломает legacy behavior при отказе platform event path. Dispatcher/retries/
queue/cron не реализованы.

## D-007 (2026-07-17, P0.1) Отдельный functions typecheck gate
Официальный `tsc -b` исторически не покрывает `functions/**`. Обязательный gate:
`npx tsc -p tsconfig.functions.json --noEmit` с 0 ошибок в
`functions/{platform,agents,channels}`. Ровно 27 legacy errors в 6 старых файлах
зафиксированы и не должны расти. Включение functions в app build — отдельная
работа после устранения legacy debt.

## D-006 (2026-07-17, P0.1-pre) Правило SHA и максимум двух коммитов
`STATE.json.last_commit` хранит SHA code commit завершённого этапа. Следующий
metadata-only relay отмечается `state_commit: "HEAD"` и определяется git history,
не записывая собственный SHA. На этап разрешены максимум два коммита: code и
relay; рекурсивные SHA-fix commits запрещены.

## D-005 (2026-07-17, P0.0) Push/deploy только по явной команде
Commit обязателен по завершении этапа. Push в `main`, который запускает Cloudflare
deploy, выполняется только по отдельной явной команде владельца.

## D-004 (2026-07-17, P0.0) Baseline не ухудшается
TEST_MATRIX фиксирует минимальные числа pass. Глобальный ESLint признан
legacy-red debt, но новые файлы обязаны иметь scoped ESLint exit 0. Тесты на
машине владельца запускаются file-by-file из-за RAM/OOM.

## D-003 (2026-07-17, P0.0) Поэтапная relay-разработка
Один этап имеет ограниченный scope, проверяется целиком и заканчивается code
commit плюс полная перезапись HANDOFF по шаблону. `STATE.json` — машинная точка
продолжения, HANDOFF — фактологическая передача следующему агенту.

## D-002 (2026-07-17, P0.0) Приоритет источников истины
Фактический код и инфраструктура приоритетнее ARCHITECTURE, а актуальная
ARCHITECTURE приоритетнее старых handoff. Расхождения фиксируются, а не
замалчиваются.

## D-001 (2026-07-17, P0.0) Modular monolith в текущем репозитории
Платформа развивается в `functions/{platform,agents,channels}` без
микросервисов, форков и второго backend. Зависимости направлены
agents/channels → platform contracts; platform не знает agents/channels.

## Унаследованные продуктовые законы
- LLM не пишет точные цифры; deterministic-first и grounding fail-closed.
- Tenant isolation обеспечивается repository/store слоем и `orgId` в каждом SQL.
- Каждый внешний вход имеет idempotency key/unique constraint.
- PII и raw content не попадают в события, аналитику и ошибки.
- Telegram — канал; AI providers — заменяемые drivers.
- `aidirectprobot` неприкосновенен; новые боты имеют отдельные tokens/secrets.
- Sotuvchi MVP использует общий bot+deep links, D1 FSM, Telegram `file_id`,
  без Mini App и платёжных интеграций в v0.

## D-026 — n8n выводится полностью, а не остаётся выключенным (R0.4, 2026-07-30)

**Решение.** n8n удаляется из всех workflow GPTBot. Не флаг, не dormant
fallback, не «ROTATED на всякий случай». `N8N_DISPOSITION=RETIRED`.

**Почему именно удаление кода, а не флаг.** Выключенный путь — это путь,
который кто-то однажды включит. Пока в `Env` объявлен `N8N_INGEST_ENABLED`,
существует одна строка конфигурации между «интеграции нет» и «интеграция снова
принимает контент от третьей стороны». Поэтому удалены сами файлы
(`launch.ts`, `bridge-worker.ts`, `normalise.ts`,
`functions/api/seo-autopilot/run.ts`), а не только их вызовы.

**Почему `410`, а не `404`.** Маршрут существовал и снят намеренно. `410
Gone` — постоянный статус: выживший внешний вызывающий перестанет
ретраить, тогда как `404` он будет считать временной ошибкой.

**Почему исторические колонки `n8n_url`, `n8n_status`,
`n8n_execution_id` сохранены.** В них лежат настоящие значения исторических
строк, и Control Center их читает. Переименование уничтожило бы audit-историю
без выигрыша в безопасности. Ничего n8n-специфичного в них больше не пишется:
direct launcher записывает `cloudflare://llm-router/seo-autopilot-direct`.

**Порядок был обязателен.** Замена доказана до вывода, а не после: Sotuvchi
canary 43/43 и automation canary 56/56 против production D1 — и только затем
`FIRST_PARTY_AUTOMATION_ENABLED=true` и удаление секретов.

**Зафиксированное отступление.** Пункт owner-kit `workflow_disabled` требует
evidence из UI n8n. Credential для control-plane n8n не существует, поэтому
пункт оставлен неподтверждённым, а не записан на ложном основании. Внешний
workflow задокументирован как изолированный: маршрут `410`, bearer не читается
и не привязан, host n8n отсутствует в runtime — трафик невозможен ни в одну
сторону. Экземпляр n8n не удалён: там могут быть workflow других проектов.

**Rollback.** Только откат first-party релиза. Пути реактивации n8n нет.

## D-027 — несекретные биндинги Pages объявляются в `wrangler.toml` (R0.4, 2026-07-30)

**Решение.** Каждый несекретный биндинг и plain-text переменная, нужные
production, объявляются в `wrangler.toml`. Дашборд перестаёт быть источником
истины для них.

**Почему.** `wrangler pages deploy` заменяет конфигурацию биндингов и
plain-text переменных проекта тем, что объявлено в `wrangler.toml`. Биндинг,
добавленный только в дашборде, удаляется следующим direct upload — молча.

**Что это скрывало.** `LOGIN_ATTEMPTS` терялся так дважды. Хуже того, дефект
маскировал себя: `functions/lib/lockout.ts` при отсутствии биндинга падает на
in-isolate `Map`, поэтому пять неудачных входов подряд всё равно давали
`429` — все пять запросов попадали в один isolate. Проверка «поведенчески
подтверждено» проходила на подсистеме без долговременного хранилища.

**Как теперь проверяется.** Не по коду ответа, а по наличию реального ключа
`login:<ip>:<email>` с TTL в namespace `gptbot-login-attempts`. In-isolate
fallback оставил бы KV пустым.

**Секреты Pages (`secret_text`) wrangler не трогает** — они остаются в
дашборде; при этом деплое все 27 сохранились.

## D-028 — owner mutation и audit образуют одну условную D1-транзакцию (P3.1, 2026-07-30)

**Решение.** Каждая P3.1 mutation записывает audit event и меняет domain state
в одном атомарном D1 batch. Audit INSERT содержит optimistic guard по
предыдущему state/version, а domain statement зависит от случайного
`event_id`, созданного именно этим INSERT. Если guard устарел, не выполняется
ни одна часть. Отдельные публичные helpers «сначала audit, потом mutation»
удалены, чтобы будущий caller не мог случайно вернуть ghost audit.

**Идемпотентность описывает логическую операцию, а не только уникальную
строку.** Глобально уникальный key считается duplicate только при совпадении
actor, role, action, target type/id, org и reason. Повторное использование key
для другой операции даёт `409 idempotency_conflict`; второй domain effect и
второй audit event невозможны.

**Automation replay сохраняет границу внешнего side effect.** Audit, переход
`dead_letter → queued` и ledger event `dlq_replayed` атомарны в D1. Затем Queue
получает только bounded job reference. Если Queue временно недоступна, строка
остаётся `queued` и доступна first-party scheduled dispatcher; API retry с тем
же key не посылает второе сообщение. Автопубликация и GitHub writer из этого
пути недостижимы.

**PII и приватный контент не расширены.** Audit schema содержит только закрытые
tokens, IDs, request ID и allowlisted metadata с двойным лимитом 2 KiB
(application + D1 CHECK). Buyer contact fields и raw handoff text не
проецируются. Migration `0025` additive, repeat-safe и в production не
применялась.

**Rollback.** До deployment — `git revert` P3.1 commits. После будущего
разрешённого deployment таблицы audit/pilot не удаляются: приложение
откатывается, pilot ставится на паузу, evidence сохраняется и reconciles по
request/event IDs.

## D-029 — production обходит runtime bootstrap только через полный read-only контракт (R1.1, 2026-08-01)

**Решение.** Cold-isolate каскад из десятков `CREATE TABLE IF NOT EXISTS`,
`CREATE INDEX IF NOT EXISTS` и `ALTER TABLE ADD COLUMN` заменён одним
read-only fail-closed запросом контракта на Worker isolate. Bootstrap не
удалён: он остаётся единственной защитой fresh и test баз.

**Почему маркер привязан к объекту D1 binding, а не глобальный.** Флаг вида
«схема проверена» на уровне модуля пережил бы смену binding и разрешил бы
обход на базе, которую никто не проверял. Маркер — isolate-local
`WeakSet<D1Database>`, ключ — конкретный объект binding запроса. Без успешной
верификации именно этого объекта bypass недоступен, поэтому migration-тесты и
fresh SQLite работают как раньше.

**Почему в контракт входят unique-индексы, а не только таблицы и колонки.**
Пять индексов несут бизнес-инварианты, а не производительность: один магазин
на организацию, один активный draft-заказ, одна позиция в заказе, одно
движение склада на пару заказ+тип, один активный handoff. Обход bootstrap без
их проверки на частично мигрированной базе тихо снял бы ограничения, на
которых держатся идемпотентность заказа и exactly-once списание остатка.
Неуникальные индексы — производительность, в контракт не входят намеренно.

**Полное совпадение или отказ.** Частичное совпадение не считается
верификацией: одна отсутствующая таблица, колонка или уникальный индекс
означают, что база не помечается проверенной.

**Порядок в webhook обязателен.** method guard → проверка Telegram secret →
контракт → parse body → reservation → Runtime. Неаутентифицированный запрос
не должен стоить ни одного обращения к базе, поэтому контракт стоит строго
после проверки секрета. Несовпадение схемы даёт контролируемый `503` до
reservation, без запуска Runtime, с единственным allowlisted кодом
`schema_unavailable` — без SQL, текста ошибки драйвера и данных пользователя.

**Дрейф контракта проверяется тестом, а не дисциплиной.** Список таблиц,
уникальных индексов и runtime-колонок выводится из исходников всех модулей,
содержащих guard обхода, и сверяется с контрактом в обе стороны. Новый
bypassed модуль или новая таблица в существующем ломают тест, а не production.

**Rollback.** Откат приложения на предыдущий deployment. Миграции слайс не
несёт, действий с базой откат не требует.

## D-030 — best-effort post-turn работа уходит в lifecycle, но не становится floating promise (R1.1, 2026-08-01)

**Решение.** `recordWorkflowAnalytics` и `flush` больше не задерживают
buyer-facing ответ. Они собираются в один post-turn promise и передаются в
`waitUntil` того же request context, который уже держит `processAccepted`.

**Почему не просто убрать `await`.** Незарегистрированный promise Worker может
оборвать вместе с isolate — тогда seller notification потеряется. Поэтому
работа регистрируется в lifecycle, а не отпускается.

**Почему вложенный вызов `waitUntil` корректен.** Он происходит внутри ещё не
завершённого lifecycle-таска `processAccepted`, то есть event заведомо жив.

**Почему callers без scheduler продолжают `await`.** Тесты и не-Pages вызовы
сохраняют прежнее детерминированное поведение, поэтому существующие
интеграционные assertions не ослаблены. Оба пути покрыты тестами.

**Границы не сдвинуты.** `runtime.run` по-прежнему awaited; durable domain
effect (списание остатка, статус заказа) фиксируется до ответа. Post-turn
promise перехватывается до регистрации, поэтому его отказ не меняет ни
ответ, ни бизнес-операцию, и `waitUntil` никогда не видит rejection. Порядок
order/inventory и dedup не изменены.

## D-031 — Telegram UX адаптируется к серверной роли, но не создаёт её (R1.1, 2026-08-01)

**Решение.** Принята гибридная модель: вариант C (adaptive authority-aware)
определяет `/start` по trusted onboarding/store/pilot state, а вариант B
(buyer-first с видимым входом «Я продавец») используется для нового и
возвращающегося покупателя. Обязательный role chooser варианта A отклонён:
он добавляет шаг до ценности и заставляет пользователя описывать роль, которую
сервер всё равно обязан перепроверить.

**UX role не является authorization.** Buyer callback, seller deep link и
переключение режима не создают organization, membership, store или workflow
onboarding. Seller dashboard вызывается через owner-only stats service, который
заново выводит active owner store из identity+org. Callback `seller-*` без
завершённого trusted onboarding fail-closed до Runtime; route code и button id
не несут полномочий.

**Состояния различаются честно.** Active owner + active pilot получает
grounded dashboard. Paused pilot и suspended store получают отдельный экран с
support path и не видят «магазин активен». Неизвестный seller видит только
invite-only объяснение. Возврат в buyer mode эпизодический и не отнимает права;
`/start` снова выводит серверное состояние.

**Buyer home остаётся компактным.** На первом экране пять действий: поиск,
каталог, заказы, seller invitation и «Ещё». Пустое сравнение и глобальный
seller-contact удалены; сравнение и handoff остаются только в контексте товара,
заказа или уже выбранных позиций. RU и Uzbek Latin имеют одинаковую action
структуру.

**Транзакции важнее навигации.** Active checkout workflow проверяется раньше
seller dashboard и сохраняется при `/start` или попытке переключить режим.
Схема и миграции не менялись; аналитика использует существующий закрытый каталог
без нового role-choice event и без PII.

**Rollback.** Откат Pages deployment на
`ede1d0f4-6a06-40e2-9b6c-dee2a7812c69` (source `41ec9e3`) или `git revert`
merge `c670e4e`; D1 rollback не нужен.

## D-032 — GPTBot Market uses a four-level naming and evidence-bound promise (2026-08-01)

**Decision.** GPTBot is the master brand; GPTBot Market is the buyer product
and public bot; Sotuvchi by GPTBot is the verified seller program and operating
mode; GPTBot.uz is the company, support and Trust domain. The buyer promise is
limited to finding products in connected catalogs. Seller self-service,
seven-day analytics, payments, fulfillment, guaranteed demand and a public
marketplace are not claimed.

**Why.** Runtime is invite-only, today-only and catalog-grounded. The previous
mixed naming and broader copy created authority and capability expectations the
system did not meet. Every public claim now maps to code, D1 facts, a labelled
synthetic demonstration or a disclosed future gate.

## D-033 — product media remains an opaque Telegram file_id contract (2026-08-01)

**Decision.** The existing media-reference regex remains authoritative.
Telegram `file_id` values may be sent through `sendPhoto`; URL-shaped values are
rejected and fall back to text. Media captions never truncate material facts:
long cards send media first and the full grounded message separately.

**Why.** Adding URL fetches would create a new SSRF/content-validation and
storage contract without business evidence. No migration is justified for a
visual-only goal. Real seller photos must be sent through the bot or the pilot
must explicitly use no-photo cards.

## D-034 — synthetic product proof is adjacent, labelled and never success proof (2026-08-01)

**Decision.** Owner-independent website, Telegram preview and acquisition
assets use neutral synthetic products and explicit `SYNTHETIC / TEMPLATE`
metadata. No store identity, testimonial, rating, conversion result or seller
acceptance is invented. Real category photography and case metrics remain
Store Pilot #1 inputs.

**Why.** Packaging can be completed before supply exists, but demo evidence
must not be confused with market validation. Editable masters and deterministic
exports allow later replacement without rewriting the product system.

## D-035 — automated accessibility evidence is release evidence, not human certification (2026-08-01)

**Decision.** The release blocks on zero axe A/AA violations and incomplete
results, zero overflow across the prescribed RU/UZ widths, visible sequential
keyboard focus and reduced-motion compliance. The immutable deployment is the
final automated target. VoiceOver, TalkBack and native Uzbek review remain
named owner gates.

**Why.** Automation can prove many deterministic failures but cannot certify a
human assistive-technology or language experience. The status is therefore
`ACCESSIBILITY_AUTOMATED=PASS`, never a broader accessibility certification.

## D-036 — productization release is exact-SHA and data-neutral (2026-08-01)

**Decision.** The feature is normally merged, Cloudflare Git deployment stays
disabled, and the exact merge tree is uploaded manually. No D1 migration,
order, real seller, provider metadata, Railway or scheduler mutation belongs to
this release. The previous production deployment is the immediate rollback.

**Why.** This keeps product packaging independently reversible and prevents a
visual/UX release from silently activating a commercial pilot. Store Pilot #1
is a separate, explicit owner-authorized production mutation.


## D-AEO-001 — reviewed content analysis and observational evidence (2026-09-05)

AEO lives in the existing modular monolith and admin-tools shell. It reuses JWT, GitHub content reads, GPTBOT_DRAFTS_DB and the platform AI facade. The server owns the internal org scope; no client tenant is introduced. Analysis is deterministic and returns exact source text with content hashes. Model output is isolated evidence, never publishable content or a claim of ChatGPT/Google visibility. Measurement is disabled until a specific free model and existing secret binding are configured; a single bounded attempt has no fallback or search plugins. Content writes remain a separate reviewed local CAS/transaction pipeline. Additive D1 schema, idempotency, quotas and retention are tested locally; release and production canary require owner authorization.


## D-AEO-002 - 2026-09-05: review workflow and model answers

Keep immutable analysis separate from org-scoped versioned review decisions. Carry saved briefs into the existing editor as local form patches; no automatic publication. Compare up to three server-allowlisted free models with independent errors and idempotent recovery. Display exact answers, actual model and source provenance; literal brand mention is not endorsement. Additive migration 0063 and repeatable bootstrap. Fixture evidence is not a live provider or usability result. See docs/aeo/UX-IMPLEMENTATION-2026-09-05.md.


## D-CHAT-001 — одна сессия документа и две адаптивные поверхности (08.10.2026)

Controller owner/artifact извлечён из Studio Form, переиспользуется обеими поверхностями. Desktop: разговор рядом с документом; mobile: Chat/Slides. Видимость не задаёт жизненный цикл job. Старую карточку раскрывает только явное действие, язык никогда не выводит историю в активный режим.

## D-CHAT-002 — реальные bounded правки и явный новый платный запуск (08.10.2026)

Локальные действия выполняются закрытым deterministic parser и входят в PPTX; исходные server task/job/MAC не переписываются. Историю действий не отправлять LLM и не считать AI-ответами. Upgrade использует отдельное подтверждение и текущие server rights, с синхронным double-click guard. Версия без изменения не создаётся. SVG использует layout/fit/palette экспортера, но не обещает pixel identity.

## D-CHAT-003 — предложение после ценности, честные условия и измеримая воронка (08.10.2026)

Вместо порога десяти ответов предложение после первого полезного ответа/у лимита. Цена и состав — из account view, прямой существующий checkout, без нового шага оферты. Не показывать paid/off/Studio и параллельно business offer; разрешить скрыть на текущий UTC-день. View >=50% видимости; закрытые qualifiers без текстов и order IDs. Не обещать окупаемость; сравнивать реальную конверсию и расходы за совпадающие периоды.

## D-CHAT-004 — всего 3 пробных ответа и постоянный серверный учёт (08.10.2026)

Новое прямое решение владельца заменяет неоплаченный 15/5 режим и ежедневное предложение D-CHAT-003 при `GPT_FREE_TRIAL_ENABLED=true`. Проба закрепляется за случайной HMAC cookie, при входе — также за аккаунтом; без fingerprint/вечного лимита мобильного IP. Отдельная таблица `gpt_trial_usage` живёт независимо от очистки telemetry. Резервация с guard — один INSERT, обновление used — идемпотентный trigger settlement в той же транзакции. Pending не выдаётся за израсходованный ответ; fail/truncated возвращают слот. Аккаунт bootstrap обязателен перед первым AI-запросом, Web Locks сериализует claim вкладок где поддерживается. Четвёртый запрос не вызывает AI; платные R2 права/тарифы и Studio не меняются. Anonymous cookie erase/другое устройство невозможно надёжно сопоставить человеку без регистрации.

## D-CHAT-005 — предложение после третьего ответа и отдельная монетизация Studio (08.10.2026)

Trial banner только после settlement/завершения ответа и authoritative exhausted state, один автоматический показ на owner; закрывается, не блокирует чтение/локальный файл. Доступный inline checkout остаётся; права снимает только сервер. Никаких ложных скидок/срочности/«более умной» модели. Studio сохраняет бесплатный PPTX; roadmap продаёт полный документ за Kunlik и серию за Oylik. Preview-only вместо бесплатного PPTX — отдельное невнедрённое решение. `click_fiscal_failed` — отдельная P0 диагностика, не доказательство сбоя оплаты/AI; не повторять submit/оплату без сверки Click/ОФД.

## D-CHAT-006 — покупка под задачу и проверяемая экономика Studio (08.10.2026)

По команде владельца реализовать утверждённый roadmap: для одной задачи первым Kunlik, для нескольких документов текущей истории/рабочего пространства — Oylik. Это заменяет прежний безусловный порядок Oylik первым; цены/квоты/бесплатный PPTX не меняются. Явный выбор сразу открывает прежний Checkout с нужным планом. Нет заказа при просмотре, автогенерации после оплаты или второй системы прав. Пример дизайна — человеческий образец через SlideCanvas; не выдавать его за результат платной AI-генерации. 3 990 сум за единицу — только с условием использования всех 10.

События — закрытые enum без тем/PII. Owner-report читает существующий ledger с org isolation, различает браузерные действия, paid, фактически доставленные части и операции возврата. Расходы рекламы/комиссии/курс задаёт владелец; неизвестно не заменяется нулём, AI cost — оценка. Дополнительные UI/CSS ленивые. Необязательный классификатор бизнес-предложения перенесён в существующий answer part: не блокирует AI-запрос при загрузке/сбое, сохраняет прежние правила предложения, даёт запас startup bundle без поднятия caps.

Read-only Click: один live paid заказ чата, ошибка поиска `payment_id:click_-12`, 8 попыток, без признаков собственного submit. Существование внешнего чека не установлено, смысл `-12` не выдуман. Меняется диагностика алерта/админки; очередь не закрывать и Submit не повторять без Merchant readback. Публикация и реальная денежная приёмка — отдельный этап, P4 открыта.

## D-SEO-RECOVERY-20261008 — product truth, authored dates and isolated telemetry

Public trial copy follows the already released lifetime allowance, with separate presentation quotas. Shared authored date selection aligns page JSON-LD, visible labels and sitemap without inventing a review. Exact Pages project/preview hosts receive noindex; custom-domain pages stay indexable. Private auth responses are no-store. Google UI labels become ui_source/entry_path; backend and Meta keep their contracts. A new immutable review records two changed description/body contracts. Title/H1/URL ownership awaits mature post-recrawl evidence. Local tests do not prove field CWV or historical GA4 causality.


### D-SEO-RECOVERY-20261008 release readback

Source 5de9e3850468e1915d99729e4930b8750adcf433 is deployed to b50a8d04; manifest1002 matches exactly, live300/300 and protected10/10 pass. IndexNow300 HTTP202, GSC4/4 pending, WebSub2 HTTP204. Manual Google request hit daily quota. Browser acceptance remains partial due extension UI blocking; mature indexing/traffic measurement remains pending. Metadata relay records facts only and does not require redeployment.

## D-TRANSLATOR-20261024 — a gpt-chat page may open in a preset role; the Uzbek script converter needs no model

A gpt-chat page may declare `chatRole` from a closed list (today only `translator`, `CHAT_ROLE_PRESETS` in `src/shared/types.ts`). Prerender emits `data-chat-role` and `data-alt-href` and the Uzbek Cyrillic ↔ Latin converter only for such a page, so pages without it render byte for byte as before; the chat accepts the role only from the same list and starts in it. The backend `/api/gpt/chat` is unchanged: the role instruction still travels as a prefix inside the message, as when a visitor picks the role in the sidebar, so quota, trial and settlement stay identical. The converter (`src/shared/uz-translit.ts`) is deterministic, runs in the browser and is its own Vite entry loaded only on those pages. Drafts can be previewed locally with `PREVIEW_DRAFTS` (noindex,nofollow; sitemap, homepage and `_redirects` still treat them as drafts). Not decided here: a server-owned `mode:'translate'` with an injection shield (AGENTS.md §5), required before translation is advertised, as its own commit.

## D-AI-TOOL-PAGES-20261025 — AI tool pages: preset roles, page chips and in-browser widgets

A gpt-chat page with a `chatRole` is an AI tool page. The presets are `translator`, `teacher`, `smm`, `marketer`, `business` and the new `writer` (original texts on request, no copying of known authors or archives, respectful, no political or religious judgements, Uzbek in Latin with o‘ g‘ ’). Such a page may add `chatStarters` (at most 6 chips, label ≤ 40 and prompt ≤ 400 characters, plain text; the build refuses anything else, the chat takes the list only whole) and `widgets` (`uz-translit`, `calculator`, `irregular-verbs`), each prerendered as static HTML under the chat and bound by its own Vite entry loaded only on a page that lists it; no widget calls the model. A widget hands text to the chat only through the `gptbot:prefill` window event (`src/shared/chat-prefill.ts`); the chat's lazy part `chat-tool`, loaded only on a page with a role, puts it into the composer and focuses it, and never sends it. Page chips fill the composer the same way. The translator pages list `widgets: ["uz-translit"]` explicitly and render byte for byte as before. To keep the chat's start bundle under 110 kB, the roles' names in the picker moved to `role-labels.ts` in the lazy part `chat-role`; only what a role tells the model stays on the start. The chips' row style is inline in the head of a page with chips only (premium.css is held to 30 000 B). The backend is unchanged, so quota, trial and settlement are identical. Not decided here: the content pages that use the platform (next stage) and a server-side role allowlist.

## D-PRACTICE-QUIZ-20261025 — practice-quiz widget: typed question sets, crawlable key in <details>, AI explanation by prefill

An AI tool page may list the widget `practice-quiz` with `Page.quizSet`, the id of a question set; each needs the other, and the build refuses either alone. A set is a typed TS data module `src/tools/quiz/sets/<id>.ts` (`QuizSet`: id, locale, subject, title, questions of {id, grade?, topic, q, options ×4, answer 0–3, explanation}) registered in `src/tools/quiz/sets/index.ts`; the build checks it (`quizSetIssues`) and that every question's request for the chat fits the composer. Only the build reads the sets: the prerendered HTML carries every question, its four options and, in a native `<details>`, the key with its explanation (works and is crawlable without JavaScript), and the widget's own Vite entry reads the questions back from that HTML, so no set is in any bundle. The first pick counts. «AI bilan tushuntirish / Объяснить с AI» puts the subject, the question, the options and, after a pick, the pick and the page's key into the composer through `gptbot:prefill` (type-only import, never sent), so the chat explains from the same key the page shows; before a pick it asks for the reasoning. The page's JSON-LD gains one schema.org `Quiz` built from the same set (a set may not contain «</script» or «<!--»). Tailwind does not scan `src/tools/quiz/sets/**`, so the questions' words cannot add rules to the shared stylesheet. The questions are original practice questions with explanations, never leaked exam answers or a claim of official material. Not decided here: the content (sets and pages) and any separate «study-test» role.


## D-PSEO20-20261108 — useful bounded Uzbek resource cohort

Explicit owner instruction authorizes20 researched resources:10original editable document kits and10practice tools. Preserve all330existing URL/metadata owners, add contextual parent links and exact twenty sitemapentries. No frozen commercial-cluster expansion. A12 in content/seo/intent-manifest.json records why a nonofficial educational obyektivka kit differs from the older official-form prerequisite. Existing CV content remains. Layout opt-ins are exact; shared quiz and article templates are reused. A minimal mobilekeyboard fix scrolls to the actual chat top and is tested on both new and ordinary chat pages. No backend/billing/bot/webhook changes. Production acceptance and outcome monitoring remain distinct.


## D-MARKETING-GAP-20261109
Owner authorized ten new practical marketing resources and ten existing-page upgrades. Preserve all 350 SEO metadata contracts, current pricing/URL owners and bot/payment behavior. Tools have isolated browser-only code; worksheets are useful downloadable examples. Revise the protected homepage baseline only after exact reversal proof. Google indexing recovery remains an observed outcome, not a deployment claim. Evidence: reports/marketing-gap-20261109/IMPLEMENTATION.md.

## D-SEO-GROWTH-20261116 — demand-led samples and texts; one owner per document type; protected leaders untouched
Owner order of 2026-11-16 after the blind-spot audit. (1) New pages need measured demand and a weak SERP (OpenSEO, market 2860) and ship a usable artefact: a DOCX/PDF blank with a filled study example, or ready original texts. (2) One document type has one URL: the everyday term «bildirgi» joined the existing bildirishnoma sample instead of a second page. (3) Aggregator guides (insho, tabrik) keep the how-to; each head term moved to a page of its own with an intent-manifest pair. (4) New samples are ordinary articles with registered linkp downloads; the 2026-11-08 cohort list stays fixed. (5) The ten protected pages are not edited; the homepage baseline is revised only after exact reversal proof (reports/seo-growth-20261116/review.ts). (6) Titles and descriptions of both chats and the login guide stay frozen until 2026-12-21 (R14, R15). (7) The chat system prompt answers in Uzbek Cyrillic only on an explicit request, because the translator form offers that script. No payment, bot, webhook, pixel, CSP or chat-bundle change. Evidence: docs/seo/CHANGE_LOG_2026-11.md.

## D-SEO-WAVES-20261117 — every roadmap wave in one release; cohort observation knowingly interrupted; leaders stay frozen
Owner order of 2026-11-17 after the OpenSEO growth roadmap. (1) All waves ship at once instead of gated batches; the roadmap gate (GSC impressions of the main query family against the Ads monthly volume at day 28 after first crawl) now decides which clusters get further pages, not which get the first ones. (2) Additive edits of cohort pages inside their observation windows are accepted by the owner; baselines are in docs/seo/CHANGE_LOG_2026-11.md. (3) Titles and descriptions of the two chats and the login guide stay frozen until 2026-12-21. (4) Pages that would need new JavaScript (amount in words, nicknames, Roman numerals, periodic table, grammar test) ship as static references on chat pages with a teacher or writer role; no widget, quiz set or bundle change. (5) Provider facts come from official pages read on the day and are dated in the text; prices, card acceptance and universal sign-up are never promised. (6) Poems and greetings are original; the hayit page holds greetings only, no dates and no religious instruction. (7) One URL owns one intent: thirteen pairs W20261117-01…13 separate the new pages from their neighbours.

## D-CHAT-CRO-20261117 — the checkout speaks at every step; no owner notice for an unpaid attempt; a tap never fails on a read
Owner orders of 2026-11-17 after the chat conversion roadmap. (1) Evidence first: packs are not lost (all five guest buyers returned in the same browser), and none of the 59 unpaid orders was ever touched by a provider; the work therefore targets the path between the tap and the provider and the return without a payment, not the grant. (2) One tap stays one tap: every new screen is a state of the same window. (3) A notice to the owner for every unpaid attempt was weighed and rejected: at about 1.5 checkout starts a day it adds noise and no action, and the buyer gets a way on instead (continue, another way, ask someone to pay, a prefilled Telegram message with the order reference). (4) Contact capture before payment was rejected: it adds a step. (5) A tap made while the account view is being read waits for the read and pays only on the same account, order and offer; pay() itself still never starts during a read. (6) A link made for someone else is watched while the page lives and is not stored. (7) The five checkout steps are counted with closed lists only. (8) A repeating fiscal failure pages once a day per cause; a new cause, provider or count pages at once; nothing about receipts or their retries changed. (9) Titles, descriptions and visible text of the protected pages stay as they are until 2026-12-21.

## D-ONCE-PACK-20261117 — a second pack in its own order table, named by the request, stacked, behind a switch
Owner order of 2026-11-17: 5 000 UZS, 30 answers, 3 days. (1) gpt_payment_orders accepts one sum (CHECK amount=2000000), so the new pack's orders live in gpt_payment_orders_v2 under the id prefix pk_ (migrations/0085, additive); rebuilding the money table in place was rejected. (2) One catalog (packs.ts): the sum, size, term, plan and receipt line come from it when the order is made and from the order's row and id afterwards; no price is read from a request. (3) The store routes by the order id, so the Click and Payme callbacks are unchanged apart from the receipt detail. (4) Packs stack: each paid order opens its own pack for its own term; nothing is replaced, shortened or merged; turns draw from the pack that ends first. (5) Choosing the other pack closes an invoice no provider has seen and waits for one a provider holds (U7). A request key belongs to one pack. (6) The tap names its pack in the request itself (PackOpenRequest.sku); no module state. The monthly request is unchanged. (7) The cards list the small pack first for someone without a pack and the month first for a holder; the pack is called "На 3 дня" / "3 kunga", because "разовый" already means a non-recurring payment in the offer. (8) Free-first (R2) is unchanged for both packs. (9) GPT_PACK_ONCE is off until the offer edition that describes the pack is approved by the owner and the providers confirm the sum; the switch only opens new sales. (10) The view gpt_payment_orders_all2 is new; the 0065 view stays for a rollback. (11) To make room without raising a budget, the purchase report moved to the lazy part chat-pay and the sign-in screen became the nested part chat-login.

## D-ONCE-PACK-GOLIVE-20261117 — the 3-day pack sells under an edition that names it, and the gate keeps it so
(1) Offer edition ai-paket-2026-11-v6 (2026-11-17): the owner read sections 1, 3 and 5 and approved them in chat, without a lawyer, as the editions of 2026-10-07 were. The published text is checked word for word against the approved draft before the commit. (2) The edition is one for the chat and the studio: TERMS_PLAN gained v6 for the same studio plans and keeps v5 for orders already made; the privacy policies did not change and keep their review date. (3) GPT_PACK_ONCE "live" is allowed by the release gate only while both offers quote the pack's receipt name ("AI paket 30 (xizmat, 3 kun)"); "off" and "test" ask nothing, so the rollback always ships. (4) The packs are called "на месяц" / "на 3 дня" and "oylik" / "3 kunlik" on every page; a payment is "единовременная" in the offer, because "разовый" was the working name of the pack. (5) The pricing pages put the 3-day pack first (cheaper first, as the window lists it for someone without a pack) and state the price of one answer in each pack (about 167 and about 67 UZS): the monthly pack is the better value and the page says so with numbers. (6) The JSON-LD offers and the product blocks of the two chat pages stay the monthly pack's: those pages are protected or under observation. (7) The session never asks production for an order of the pack: after go-live such a request creates one. The live check reads, and drives the deployed bundle with the order endpoint answered locally; the money path is proven by the owner's own payment. (8) The number v6 is taken by this edition: the edition that docs/monetization/2026-10-25-tariffs-roadmap/ROADMAP.md plans as ai-paket-2027-02-v6 takes the next number. (9) GPT_PACK_ONCE may be "live" or "off" in the committed config and the tests accept both, as the Payme pins accept "live" and "test": a provider refusing 5 000.00 must be answerable by one value in two places and a deploy. (10) The two ready patches of the 17.12 runbook hold whole packed-JSON lines, so this release (and earlier ones) made them stop applying; they are rebuilt on top of b16e7356 by scripts/paid-chat/regen-cliff-patches.py, which carries a patch's change over key by key and proves that the result applies alone and together and changes the same keys. Any later change of the packed config needs the rebuild again.

## D-CHAT-CRO-C-20261117 — the wall sells, the question waits, and the server says who held a pack
(1) At a wall only a pack lifts, the send button is a way to the pack window, not a dead control: the visitor stands there with a question typed. A limit that time lifts keeps its clock, because there the honest answer is "wait". (2) The question is never sent by itself after a payment: it stays in the field (and in the one-hour draft across the trip to the provider), and the buyer sends it. An automatic send would spend an answer the buyer did not ask to spend and could fire on a stale page. The window says exactly this, in one line. (3) The question is shown only in the pay window, which the session recording masks; no event, order or link carries it. (4) Whether an account held a pack is the server's word (the account view's hadPack, from gpt_access_periods), not a guess from the newest order: the newest order stops being the paid one at the first unpaid new invoice, and most invoices are left unpaid. A refunded pack does not count. The read happens only when no pack runs and never fails the view. (5) Counters must not bend the funnel: session creation is paced per hashed address (the same table, key and two-day sweep the event counter already uses), fail-open, and past the ceiling nothing is refused; the chat answers and keeps no turns for a session that was not stored. (6) Release C was built on the owner's order to do the autonomous part and stops at the release check: a deploy and the push to the public main wait for the owner's word, as roadmap №2 told the owner.

## D-NATAL-20261117 — the chart is computed, the reading is AI on closed facts, and nothing personal leaves the browser
(1) Positions, houses and contacts are computed by code in the browser and tested against an independent reference (the Swiss Ephemeris, outside the repository; only its numbers are committed). (2) Birth time goes to UTC by committed zone tables built from the tz database, never by the device; a local time that never existed or existed twice is asked. (3) The AI reading receives closed fact ids only, the server renders every name, and the answer is accepted only as sections keyed by those ids, without digits or forecasts; one retry, then a refusal. (4) The owner decided that AI writes the reading and that the first natal and the first pair reading are free; the screen says the text is AI-written, not an astrologer's. (5) No compatibility percentage: it cannot be computed honestly. (6) Lilith is not shown: programs disagree by minutes of arc. (7) The paid next reading and the chat under the chart are later releases; until payment exists the next reading answers 402 and says so on screen.

## D-UZ-UNPAIR-20261118 — the two chats stay linked for people, not declared as an hreflang pair
Owner's report of 2026-11-18: Uzbek queries show the Russian chat's title and description. (1) Cause, observed: Google serves the member of a declared hreflang pair that matches the searcher's interface language; «chatgpt bepul», gl=uz, place 3 is the Uzbek chat under hl=uz and the Russian chat under hl=ru, while Uzbek pages of other sites stay in the hl=ru results. In Search Console (28 days, Uzbekistan, Uzbek-worded queries) the Russian chat took 22 % of the impressions at CTR 0.51 % against 0.75 %. (2) Change: page field hreflangUnpaired on /ru/gpt-chat/ and /uz/gpt-uzbek-tilida/ (no <link rel="alternate" hreflang>, no sitemap alternates; the visible pair and cross-links stay); intent-manifest A14; reviewed protected revision 2026-11-18-uz-unpair. (3) Timing: prepared first for release after observation R15; the owner then ordered the release on 2026-11-18 ("деплой всё и отправляй в индекс now"), knowing it mixes R15. Live since 2026-11-18 (655ce59a); R15 is read per query language with 2026-11-18 marked. (4) Measured, not predicted: success and rollback thresholds in docs/seo/research/2026-11-18-uz-unpair/EVIDENCE.md; rollback removes the field from both files, and Google takes days to weeks to re-read it.

## D-UZ-TOP1-20261120 — first among non-official results: video and off-site now, the core pages after the readouts, no page per spelling
Owner's order of 2026-11-19: research and a roadmap for #1 among non-official results and in AI Overview sources for the top Uzbek ChatGPT queries. (1) Frame: on navigational queries (chatgpt kirish, jaji piti, чачи пити) the OpenAI URLs stay above; the target there is the first non-official result, an AI Overview citation, a video slot and CTR. A full #1 is realistic for the alternative and how-to queries (chatgpt uzbekcha, uzbekcha online, uzbekcha bepul, uzbek tilida online, uzbek tilida gaplashish, kirish uzbek tilida, yuklab olish uzbek tilida, chachipiti o‘zbek tilida). (2) Evidence: GSC 28 days to 2026-11-16, Ads volumes of 476 spellings (2026-11-19), 62 mobile SERP snapshots, AI-visibility run c19b1ec6 (12 prompts, AI Overview and AI Mode, hl=ru; the tracker accepts only ru for Uzbekistan), backlinks and Lighthouse. Navigational families are on page 1 almost always at low CTR; the uzbekcha family is on page 1 in 36-47 % of searches; video and social results fill the non-official top and GPTBot.uz has no video; the RU chat took 16-21 % of Uzbek-worded impressions at 3-6x lower CTR (A14); Google cut the UZ chat title in 7 of 11 snapshots; «chachipiti» (22 200 a month) has 15 impressions in 28 days. (3) No page per spelling: «chachipiti» and the other spellings stay with the UZ chat (C22); one intent, one URL. (4) Nothing changes on the site before 2026-12-21 and no experiment is sacrificed: the largest early gain is under ~6 clicks a day against voiding R14, R15 or A14. Now: the owner requests indexing of /uz/gpt-uzbek-tilida/ (A14 clock), off-site video, honest listings, earned mentions, a spam report. (5) After the readouts, one change per URL per window: wave 1 (22-24.12) download guide, UZ chat snippet/H1/first screen, login guide, RU chat Cyrillic snippet; wave 2 (~25.01) UZ chat spellings and gaplashish blocks with video, the C23 301, chat TBT. The RU chat snippet goes before the 301 (order differs from steps a-c of D-GSC-TOP1000-20261119 in PR #61, not yet merged: larger expected effect); the owner decides. (6) OpenSEO SERP snapshots are not used for our positions: they miss gptbot.uz where GSC shows page 1. Plan, baselines and rules: docs/seo/research/2026-11-20-uz-top1-roadmap/ROADMAP.md.

## D-UZ-NOW-20261120 — «здесь и сейчас»: the chats and the download guide change now; R15 is given up, A14 is read jointly, R14 is kept
Owner's orders of 2026-11-20 («так мы что-то можем сделать сейчас…», «мне нужен роад мап чтобы получить первые места здесь и сейчас!!», after «полные права»). (1) Price, stated before the work: the clean R15 baseline of both chats' snippets is lost; A14 is read together with this release because both move impressions toward the UZ chat; R14 (login guide) stays untouched because acting early there gains at most ~1.5 clicks a day. (2) Release prepared in the branch, not deployed (the deploy is the owner's command on the owner's machine): the download guide takes the bare Latin «chatgpt skachat» (12 100 a month) and «chat gpt skachat» (4 400), which had no impressions on any of our URLs, into its title, H1, intro and keywords, with re-checked official links, an APK-catalog warning and two FAQ answers; the UZ chat title uses a colon instead of the dash (Google showed only the part after the dash in 7 of 11 snapshots), its H1 names the pair honestly («ChatGPT’ga o‘zbekcha muqobil»), «Chachipiti» (22 200 a month, 15 impressions) leads the spellings heading; the RU chat title names both languages for Uzbek speakers who search in Cyrillic. Intent-manifest C97 records the «skachat» ownership; reviewed revision 2026-11-20-uz-now. (3) Rollback thresholds per page are in docs/seo/research/2026-11-20-uz-top1-roadmap/NOW.md §1 and CHANGE_LOG_2026-11. (4) Off-site now (owner): four videos with the scripts in NOW.md, listings, a spam report, a media pitch. Still no page per spelling and no bought links.

## D-UZ-NOW-B-20261120 — second step of the same release: «gaplashish» on the UZ chat, honest anchors, named breadcrumbs, no «rasmiy» in new text
Owner's order of 2026-11-20 («сделай сейчас всё автономно! все твои предложения которые потенциально усилят сео и повысят позиции! … и сразу деплой!»). (1) Taken: a «ChatGPT bilan o‘zbek tilida gaplashish» section and FAQ answer on the UZ chat (the query, 1 600 searches in October 2026, sent 36 % of its impressions to the promptlar guide at CTR 0 %; intent-manifest C36 now forbids promptlar to target it); the BreadcrumbList of the download guide and both chats gets its name (they leave BREADCRUMB_NAME_HELD in their own revision, as planned; the login guide stays held for R14); five unprotected pages give their one link to the UZ chat an honest «ChatGPT … muqobil / o‘rniga» anchor, each worded differently. (2) The two sentences of the first step that said «rasmiy» about OpenAI's app are reworded («OpenAI’ning ChatGPT ilovasi», «Asl ChatGPT ilovasi»): the brief forbids the word in the site's new text and in the video scripts, and the pages' older wording is left as reviewed. (3) Not taken: the C23 301 and anything on the login guide (R14, read on 2026-12-21); chat TBT work (code change with conversion risk, needs its own window); anything against competitors beyond a spam report on obvious doorway domains — no complaints in the owner's name about third-party trademarks, no negative SEO. (4) Both steps ship in one deploy; reviewed revision 2026-11-20-uz-now-b (proof reports/uz-now-20261120/review-b.ts) chains from 2026-11-20-uz-now. The deploy remains the owner's command: this cloud session cannot reach deploy_runner.py on the owner's machine.

## D-DEPLOY-CI-20261120 — a second path for the same guarded deploy: a manual GitHub Actions workflow
Owner's question of 2026-11-20: «родной как сделать чтобы ты автономно мог всё задеплоить??». Facts: the guard is in the repository (scripts/release/pages-production.ts: SEO protection, chat bundle budget, live and Studio gates, clean runtime, stamped artifact, production lineage, upload, read-back of the production commit and of the live manifest); deploy_runner.py only runs it on the owner's machine with the Cloudflare credentials; on 2026-11-20 `npm run build:production` and `pages-production.ts check` passed in a Linux cloud session on 3477199 (2 192 files). Decision (prepared; effective once the owner adds the repository secret CLOUDFLARE_API_TOKEN with Account · Cloudflare Pages · Edit; the account ID defaults to 14ce9e04574f2e6d825e56ee603e5cd5, recorded in BORMI_SESSION_HANDOFF_2026-08-02, and a CLOUDFLARE_ACCOUNT_ID secret overrides it): .github/workflows/pages-production-deploy.yml runs `npm run build:production` and `npm run deploy:pages:production` on workflow_dispatch only, on main only, after typing `deploy`, one run at a time. The agent dispatches it only on the owner's command in chat; the owner can dispatch it from the GitHub UI. Checked on 2026-11-20 at the owner's request («у тебя уже были все ключи найди»): no Cloudflare credential exists in this session's environment, nor in the owner's cloud environments «ai-direct-pro-landing» (only an Instagram key for graph.facebook.com) and «BEK CORP preview (Cloudflare)» (none); the owner's machine deploys through a wrangler OAuth login that stays on that machine. Not taken: a token in chat or in code; a token in the cloud session's environment (it would be injected into every session of that environment, and the proxy replacing the Authorization header is untested with wrangler's upload JWT); raw `wrangler pages deploy`. AGENTS.md §2 records the second path.

## D-AI-MENTIONS-20261123 — more ChatGPT mentions through retrieval, not manipulation
Owner's order of 2026-11-23 («реализуй всё автономно максимально… чтобы GPT цитировал меня как можно больше»). Baseline: ChatGPT names GPTBot.uz in 0 of 16 neutral prompts while chatgpt.uz is named in 12 of 18 without citations; branded prompts 2 of 2. Decision: (1) answer the gap questions where ChatGPT already looks — an honest GPTBot.uz table and two FAQ answers in the unprotected Uzbek comparison article, a «Quick answers» block in llms.txt, all facts from the billing catalog and pricing pages (Click or Payme, «the button appears only while payment is open»); (2) Bing coverage: IndexNow for all sitemap URLs now; Bing Webmaster and the ChatGPT Business Hub through the owner's own browser (Claude in Chrome prompt), since this cloud session has no browser; (3) weekly OpenSEO ChatGPT tracking (32 prompts, ~36 credits a week). Not taken: hidden instructions to AI on pages, fake reviews, forum spam, new pages per query, changes to the protected chats within their 20.11 measurement window.

## D-COMMERCIAL-BOTS-20261122 — commercial bot queries: one owner per phrase family, a slimmed Telegram hub, the Uzbek price phrase, one Uzbek guide outside the freeze
Owner's order of 2026-11-22 («приступай и делай автономно комплексно улучшения согласно твоему роад мапу!»), on the roadmap F:/Claude/gptbot_seo/roadmap-commercial-top3-20261122.md (OpenSEO slice of the same day, 977 credits). Facts: every Russian «заказать / разработка / создание телеграм-бота» phrase is Google Ads 10–30 a month or null, «telegram bot yaratish narxi» 20, only the do-it-yourself «bot yaratish» has volume (590, October 1 900); the commercial bot pages drew ≈350 Uzbek impressions and 0 clicks over 19.08–19.11; Google showed 13 of our URLs for «чат бот на заказ ташкент» and 12 for «разработка чат ботов ташкент»; the Telegram hub had 31 Uzbek impressions at 36–96 despite 80 inbound internal links while the price article (1 inbound link) showed at #2 in snapshots. Decisions: (1) the hub owns the Telegram-bot wording and is cut to one job (151 → 63 blocks, 22 → 10 FAQ, title and H1 with «на заказ»); its rollback is a revert if Uzbek impressions fall below the recorded baseline. (2) /ru/luchshie-razrabotchiki-chat-botov-tashkent/ owns «чат-бот на заказ / разработка чат-ботов Ташкент» (decision K5 of 2026-10-26, recorded in the manifest); four pages add one link each to it as a falsifiable test of internal links, with the price queries as the control. (3) /uz/chat-bot-narxi/ names «telegram bot yaratish narxi», which the manifest already gave it. (4) The price page keeps its title and H1 (GSC #1 on its tails) and gains the Cyrillic «телеграм-бот» in an H2 and one paragraph. (5) New single-language /uz/blog/telegram-bot-yaratish/: a blog article, outside the demand gate's page types, so the bot-services freeze stays in force for commercial pages; no hreflang pair with the Russian guide (A15, the A11/A14 mechanism); pair W20261122-01 separates it from the Uzbek hub. (6) «бот для записи на маникюр» joins the frozen salon page as a section and one FAQ answer (owner's go-ahead on the roadmap item). (7) Everything ships in one release although the hub, the price page and the Uzbek hub sit in the 08.11 cohort: at 9–51 impressions a month the window proves nothing; the baselines are in CHANGE_LOG_2026-11. Not taken: city doorway pages, new commercial bot pages, bought links, a lead form in ordinary articles (needs a template change), unpairing /ru/stoimost-chat-bota/ and /uz/chat-bot-narxi/ (hypothesis only). The Uzbek copy is agent-written and not native-checked.

## D-CHAT-CRO-D-20261122 — the 3-day pack leads, the last-trial card sells it, two counters before any QR
Owner's order of 2026-11-22 («Модель оплачена! приступай и максимально улучши всё исходя из твоего роад мапа! осторожнее только чтобы сео не ухудшилось!»), on the conversion audit F:/Claude/gptbot_conversion/conversion-audit-20261122.md. Facts behind it (D1 aggregates, test payments excluded): since 17.11 every real purchase was the 3-day pack and 0 of 7 monthly invoices were paid; 74 % of real invoices start on a computer; the last-trial card had quoted only the monthly 20 000; 0 of 62 unpaid invoices got a provider call. Decided: (1) one pack leads by row order (pack-offers.ts listed: the 3-day pack for a guest, the month for a holder), the other pack stays one tap away with quiet buttons; (2) the trial_last card sells the 3-day pack while offered; (3) the no-refund rule stays beside the price and the summary line leads with «Разовая покупка, без автосписаний» (the chat never says «подписка», tests/gpt-chat-honesty); (4) pay_share and checkout_result_class are counted, checkout_result keeps its words for the admin; (5) the desktop QR waits for the owner's test payments from a computer and an iPhone, because Click's page already shows an app QR and the gap has not been seen first-hand.

## D-LEAD-RADAR-QUALITY-20261122 — export what was found, cut bots and bad contacts with a reason, never delete a discovered business before export
Owner's order of 2026-11-22 after the audit of the «TG Sender parser» (Lead Radar): «выбрал стоматологии - ташкент - он спарсил. я выгрузил. важно чтобы отсекались боты и кривые контакты», then «реализуй по максимуму всё автономно … и затем сразу деплой». Audit and roadmap: F:/Claude/lead-radar-audit-20261122/. Facts behind it (production D1 aggregates, no names, phones or usernames): contact-mode pools kept 10 of 127 dentists because the 60-minute deadline wiped every candidate not yet persisted; the CSV wrote `'@handle`, which TG Sender's importer rejects; only the first number of a multi-value OSM phone tag survived; TG Sender's bot/channel/group answer was mapped to a 60-second `failed`, re-asked every queue pass; the Worker has no 2GIS key, so OSM via public Overpass is the only source.
Decisions: (1) the export is the product: one row per business across the searches of one niche and city, mobiles and the landline in their own columns, usernames without `@`, every cut counted by reason in a header the UI shows. (2) Telegram kind comes from free public evidence first (the t.me card, behind a canary so a block page can never fake verdicts) and from TG Sender second; both write one shared, namespaced, expiring cache row per public username in the existing cache table — no schema change. Only bot, channel and group gate an account lookup; a public dead-username page does not. (3) TG Sender resolves usernames only, so the queue never spends the daily budget on phones there; dead results stand long enough not to loop (unavailable 1/5/15 min then 2 h, unsupported 30 d, unresolved 7 d); a positive proof still lasts one day. (4) Nothing discovered is deleted before the owner can export it: the pool remainder becomes inert company rows (terminal, no jobs, suppression respected) at every pool stop, at the deadline and before the retention purge. Accepted cost: those rows are never crawled or Telegram-checked, also if a time-limited pool resumes (with every public mirror failing, a resume that re-discovers nothing would otherwise lose them). Every new read or write fits the 50-queries-per-invocation D1 budget: niche export in one company read, verdicts in one statement, a full pool flush in at most 8 statements, one expired pool per cron tick. (5) Unchanged: phone-to-contact import stays forbidden; authorization, DNC and sending are untouched; the contact plan keeps its four selectors while every public mirror is failing (stage 1, an own OSM snapshot, replaces Overpass).

## D-LEAD-RADAR-HARDENING-20261122 — searches outlive map outages, dead sites and a broken lookup service
Owner's order of 2026-11-22 after the production-error audit (F:/Claude/lead-radar-audit-20261122/ROADMAP_PROD_RU.md). Facts: a contact search processed 10 of 100 candidates because one batch waited on dead sites (15 min then 1 h retries) and one Telegram check; a second search failed after 3 discovery attempts in ~2.5 minutes while every public Overpass mirror was down; one TG Sender `lookup_unavailable` candidate was re-asked 28 times in 30 minutes; Nominatim POI paging is forbidden by the OSMF policy, so it is not a fallback. Decisions: (1) discovery retries 1/4/10/20 minutes inside the 60-minute window and keeps per-mirror diagnostics; (2) a 30-day map-answer cache in the existing cache table, fresh for a day, served stale (and dated) when every mirror fails; (3) only first attempts of the current batch gate the next one, stragglers run in the background, batches of 25; (4) a dead or wrong website is terminal at once; (5) every non-transient lookup failure climbs a backoff ladder and a hosted lookup outage pauses lookups for the whole org; (6) no schema change, no new source, no change to sending, authorization or DNC.

## D-LEAD-RADAR-OSM-SNAPSHOT-20261122 — own OpenStreetMap snapshot in Workers KV before public Overpass
Roadmap stage 2 of the production-error audit. Every public Overpass mirror was down on 22.11.2026, Overpass answers stop at 240 objects, and the OSMF Nominatim policy forbids downloading POI lists ("get it from the OSM planet or an extract"). Decisions: (1) a Geofabrik extract is reduced to named business POIs and bucketed per canonical niche and 0.5° cell, keeping exactly the objects the niche's Overpass filters match; (2) stored in Workers KV (no schema change; 918 keys fit the Free plan's 1 000 writes a day; shards of at most 400 objects keep Free-plan CPU low); (3) the reader answers the Overpass question (objects inside the geocoded bounds), dates evidence with the snapshot date, and falls through to the cached / live Overpass path when the copy is absent, foreign, older than 60 days, empty or the niche is not canonical; (4) refresh is manual until a token with KV write exists.

## D-LEAD-RADAR-FREE-CATALOG-OFF-20261122 — the free catalog contact-source step is off by default
Measured on 22.11.2026: about 330 runs of the free catalog adapter produced no phone and no Telegram candidate, while one contact search paged its public rubric once per company (85 companies, 24+ pages each) and stayed open long after its 100 candidates were saved. The step now runs only with LEAD_RADAR_FREE_CATALOG_ENABLED="true"; the free t.me check and TG Sender lookups are unaffected. Also from the same search: TG Sender answers lookup_unavailable for a single non-existent username, so only our own client's unreachable / not-configured reasons pause lookups org-wide (PR #78).

## D-OPENAI-FEED-20261123 — the OpenAI product feed reads every price from the place the site prints it

Owner's request in chat, 23.11.2026: a hosted product feed for ChatGPT Business Hub → Products, regenerated on every deploy so its prices always match the site.

- The feed is `public/openai-product-feed.jsonl`, served at `https://gptbot.uz/openai-product-feed.jsonl` with `Content-Type: application/x-ndjson; charset=utf-8`, `Cache-Control: public, max-age=3600` and `Access-Control-Allow-Origin: *`. The header block lives in `scripts/generate-robots.ts` (it writes the production `dist/_headers`) and is mirrored in `public/_headers`; both detach the inherited `/*` Cache-Control so the edge sends one policy.
- No price is typed in feed code and no `data/offers` file was introduced: each price already has one source that the page prints. Chat packs come from `functions/lib/gpt-chat/packs.ts` (`CHAT_FACTS`), Studio plans from `functions/lib/studio/plans.ts` (`STUDIO_FACTS`, the plan of the published offer edition), agency services from the package table «Пакет | Что входит | Срок | Цена (сум)» on each service page, the same pattern as `scripts/service-offers.ts`. A missing table, row or an unreadable price cell fails the build.
- The generator runs in `prebuild`, `prebuild:fast` and `prebuild:cf` (the build chains themselves are pinned by tests). Output is deterministic, so an unchanged tree leaves the committed file untouched; a price edited without the regenerated feed fails `tests/openai-product-feed.test.ts` and the release guard's clean-tree check.
- `item_id` values are append-only (`LOCKED_ITEM_IDS`). English descriptions state only page facts; each package keeps the Russian cell it was translated from, and the test fails when the page cell changes.
- `return_policy` (`/ru/oferta/`) only on chat packs, the trial and Studio: the published offer does not cover agency services. `accepts_returns: false` on the two chat packs (the offer: a paid pack is not refundable). GPTBot Market is not in the feed.
- Known deviations from the OpenAI spec, kept because the owner asked for them: the trial is `0 UZS` (the spec asks for a positive price), five records use the pages' WebP og:image (the spec's examples are JPEG/PNG), and `target_countries` is `["UZ"]` (the shared format currently documents US, CA, MX).

## D-OPENAI-FEED-GZIP-20261123 — the Hosted URL is gzip JSONL, TSV is the fallback, feed images are JPEG

Business Hub rejected `https://gptbot.uz/openai-product-feed.jsonl`: "This JSON file is not in the required gzip-compressed JSONL format" (accepted: .parquet, .jsonl.gz, .csv.gz, .tsv.gz, plain .csv/.tsv/.txt).

- The generator writes three files from the same records: `openai-product-feed.jsonl.gz` (Hosted URL), `openai-product-feed.tsv` (fallback: header row, one item a line, arrays as JSON such as `["UZ"]`, booleans `true`/`false`, an absent optional field an empty cell, a tab or line break inside a value fails the build) and the plain `.jsonl`.
- The `.gz` is served as `application/gzip` with `Cache-Control: public, max-age=3600, no-transform`: Cloudflare does not compress that type, and `no-transform` keeps the edge from re-encoding or decompressing it, so the client receives the archive bytes with no `Content-Encoding`.
- Deflate output differs between zlib builds (Windows and Linux Node), so the writer keeps the committed `.gz` whenever it decompresses to the current JSONL; the header has mtime 0 and the OS byte pinned to Unix. The feed files are `eol=lf` in `.gitattributes` so Windows checkouts compare byte for byte.
- WebP og:images (12 records, 5 images) are linked through 1200px JPEG copies in `public/assets/feed/`, named with a content hash because `/assets/*` is cached as immutable. `scripts/openai-feed-images.json` records each WebP's sha256; a JPEG is regenerated (sharp) only when its WebP changes, and a stale copy fails `--check`. Page images are untouched.
- The 0 UZS trial row is behind `INCLUDE_FREE_TRIAL` (a committed constant, true): an environment variable would make the build differ from the committed feed and trip the release guard.

## D-AI-VISIBILITY-20261123 — AI visibility waves: honest answer-first content, one entity, no gate bypass

Owner's brief of 23.11.2026 («по максимуму поднять видимость gptbot.uz в ответах ChatGPT и других ИИ») with the analysis now in `docs/seo/research/2026-11-23-ai-visibility/ANALYSIS.md` and its production check in `VERIFICATION.md`.

Owner answers of 23.11.2026, in chat, to the step-0 questions:
1. «Kichik Xalqa Yo‘li 57 адрес» — the studio address everywhere, the offer pages included. The offer footer kept «Yahyo Gulyamov ko‘chasi 35» because `OFFER_EDITION_NAP` froze the offer's visible text per edition; changing it is a new offer edition (ai-paket-2026-11-v7), shipped as its own PR with the billing and Studio edition settings.
2. «@XGame_changerx» as the profile for `sameAs`. Not added: decision L14 took the founder's personal Telegram out of `Organization.sameAs` (it merged the company and the founder into one entity; `tests/studio-contact.test.ts` keeps the handle in `studioTelegram` only). The handle is already in the Organization's `contactPoint.url` on every page. A company Telegram channel or a map/directory card would be a valid `sameAs`.
3. Cases: www.cakecity.uz, www.mirac.uz, www.deutschexrepte.com, www.bekcorp.uz — client names given, but no task, result or timeline. Case pages state only what the owner confirms; numbers stay out until the owner gives them (TODO-owner).
4. «согласен» — comparisons naming other services (Uzbek AI chats; AI chats payable with Click/Payme) are allowed, with facts checked on each service's own site, a link and a check date, and no judgement of competitors.

Rules for the waves:
- New content goes through the normal gates. Articles (`content/blog`) are outside the demand policy by design; a new money/niche/tool page needs an approved keyword. The Uzbek chat-tariffs page has none (no measured volume for «ai chat narxi»-type phrases; new paid keyword slices are not bought before 21–22.12.2026), so it waits for a measurement instead of a looser page type.
- Every new published URL changes the protected homepage lists, so each content batch ships with a reviewed protection revision (pattern: `reports/commercial-bots-20261122/review.ts`). The four protected pages Bing Copilot cites (download guide, `/uz/gpt-uzbek-tilida/`, `chatgpt-i-claude-v-uzbekistane`, `kak-oplatit-chatgpt-v-uzbekistane`) are not edited in these waves: they carry the 20.11 and R14/R15 measurement windows.
- The `/en/` layer is a separate generator beside the ru/uz system (as Studio is), with hreflang only to unprotected counterparts; the protected chats keep A14 (no hreflang).
- `public/llms.txt` quotes business prices only through the managed `service-prices` block, read from the same package tables as the product feed; the feed generator keeps the committed file current.
- No text addressed to AI systems, no hidden text, no FAQPage without visible questions, no Offer/Review/Rating without visible data, no «official / rasmiy».

## D-OFFER-V7-20261123 — offer edition ai-paket-2026-11-v7: the studio address in the offer footer

Owner's answer in chat of 2026-11-23 to step-0 question 1 of the AI-visibility brief («Kichik Xalqa Yo‘li 57 адрес»): the studio address is the same everywhere, the offer pages included. The offer's visible text is frozen per edition, so the footer line moves with a new edition, ai-paket-2026-11-v7.

- Terms: v6 word for word (both packs, prices, VAT, refunds, Studio sections). Only the studio address in the footer of `/ru/oferta/` and `/uz/oferta/` changes, from the historical street to «Kichik Xalqa Yo‘li 57» (content/global/site.json). The seller's registered address in the requisites (content/global/legal-entity.json) is unchanged.
- Edition settings move together in one deploy: `termsVersion`, `lastReviewedAt` (2026-11-23, the day it takes effect) and `legalReviewedAt` on both offers; `GPT_BILLING_TERMS_VERSION` / `GPT_BILLING_TERMS_APPROVED_AT` (top level and in `GPTBOT_RUNTIME_CONFIG_JSON`); `STUDIO_TERMS_VERSION` / `STUDIO_TERMS_APPROVED_AT` in `STUDIO_RUNTIME_CONFIG_JSON`; `TERMS_PLAN` maps v7 to the same Studio plan (v5 and v6 stay, so orders of earlier editions keep their plan). An invoice opened under v6 gets 409 terms_changed, as designed.
- `scripts/contact-card.ts` `pageNap` returns site.json for every page; `OFFER_EDITION_NAP` is gone. The offer's contact set (phone and e-mail, no Telegram) is unchanged.
- Approval: the owner's chat answer, without a lawyer's review, as v3–v6 were.

## D-EN-LAYER-20261123 — the English layer /en/: six generated summary pages, hreflang only where the English page exists

AI-visibility wave 1c (owner's brief of 23.11.2026, priority 2: «Слой /en/ (6–8 страниц) с hreflang и sitemap»). Assistants answer English questions about Uzbekistan («free uzbek ai chat», «how to pay for chatgpt plus in uzbekistan», «ai chatbot development company in tashkent»); before this release `/en/` answered 404.

- Six pages, generated by `scripts/prerender-en.ts` from `scripts/en-pages.ts`, beside the ru/uz content system the way Studio pages are: `/en/`, `/en/uzbek-ai-chat/`, `/en/ai-presentation-maker/`, `/en/ai-chatbot-development-tashkent/`, `/en/pay-for-chatgpt-in-uzbekistan/`, `/en/uzbek-ai-chats-compared/`. Not content JSON: the homepage lists, the demand gate, the LLM twins and the protected-pages contract read only `content/pages` and `content/blog`, so no protected page and no homepage list changes.
- Every number is read from a source of truth at build time: chat packs and trial from `scripts/product-facts.ts` (billing code), Studio plans from `functions/lib/studio/plans.ts` and the Studio page's stated limits, business prices from the service pages' package tables through `scripts/openai-feed.ts`. `tests/en-pages.test.ts` requires every «N UZS» on the English pages to be a price of the product feed.
- Facts about other services (payment page, comparison) carry a source link and the check date 2026-11-23; nothing is ranked; no «official / rasmiy», no Offer/Review/Rating markup, FAQPage only from the visible questions.
- hreflang: an English page joins an existing RU/UZ pair only where both members are unprotected and declared (`scripts/en-alternates.ts`): `/ru/o-kompanii/` + `/uz/biz-haqimizda/` → `/en/`; `/ru/ai-bot-dlya-biznesa/` + `/uz/biznes-uchun-ai-bot/` → `/en/ai-chatbot-development-tashkent/`; the comparison pair → `/en/uzbek-ai-chats-compared/`. x-default stays the pair's Russian member. The protected chats keep A14 (no hreflang) and the Studio pair keeps its own set, so the chat, Studio and payment pages stand alone and link to the RU/UZ versions.
- `prerender-en.ts` runs in every build chain right after `vite build`: `build`, `build:fast` (production: `build:production` → `build:fast`) and `build:cf`, whose exact command the lead-radar release gate pins (`ALLOWLISTED_ROOT_SCRIPTS` and its test fixture updated together, as for Studio and the release stamp). `public/llms.txt`, copied by every chain, links the English pages (`tests/seo-trial-product-truth.test.ts`). A RU/UZ page still declares its English alternate only when the English page is in `dist/` (prerender.ts, prerender-blog.ts and generate-sitemap.ts check it), so a partial run never points to a missing page.
- The pair pages' language switch gains an «EN» link; the English header opens the Uzbek chat (one button, `tests/seo-push-revision.test.ts` R3-10).

## D-PRESENTATION-CLUSTER-20261123 — the presentation cluster: distinct intents, no new hub over the slide guide

AI-visibility wave 2a (owner's brief of 23.11.2026, priority 5: «Кластер презентаций: хаб + 10–15 страниц, UZ first»). Presentations are the first topic of ChatGPT mentions (Business Hub: 23,2%), with seven URLs on the site.

- Nine new articles on intents no page owned: defence presentation (coursework and diploma), business-plan presentation, slide design rules and a dated comparison of AI presentation tools — each as a uz/ru pair — plus the standalone Russian guide «как сделать презентацию». Fewer than ten pages on purpose: subject pages (tarix, biologiya…) and a second general guide had no measured demand (OpenSEO, 2860, 23.11) and would be thin or compete with existing pages.
- No new hub: `/uz/blog/slayd-tayyorlash/` already owns «slayd tayyorlash» / «taqdimot tayyorlash» (5 400 + 1 000 a month) and is the hub by content. It is not edited: the Studio release tests freeze its fields, its description is under the 17.11 measurement, and an hreflang pair with a Russian page would move part of its Uzbek queries to the Russian member (the A11 mechanism). The Russian guide therefore stands alone (no hreflang).
- Every Studio figure is checked against `STUDIO_FACTS` and the offer by `tests/presentation-cluster.test.ts`; facts about Gamma, Canva and Microsoft Copilot come from their own pages with the check date 2026-11-23, and what could not be checked (Canva help pages refuse automated access) is printed as «not checked», not guessed. No ranking; a «when Studio is not the best choice» block names Studio's 12-slide limit and the brand-kit and collaboration cases.
- Intent-manifest pairs W20261123-01…05 keep the new articles off the Studio pages' and the slide guide's declared keywords; the protected-pages revision 2026-11-23-ai-visibility-2a adds nine homepage list entries only.

## D-AI-PAYMENTS-20261123 — paying for AI services: product pages with provider facts, no card page without primary sources

AI-visibility wave 2b (owner's brief of 23.11.2026, priority 6). Demand sits on product names (midjourney 9 900, gemini pro 4 400, chatgpt plus 720, chatgpt go 590, google ai pro 590, claude pro 210 a month in Uzbekistan), not on «how to pay» phrases (10 or less).

- Three articles: the Uzbek ChatGPT Plus and Go guide (standalone: `/ru/blog/kak-oplatit-chatgpt-v-uzbekistane/` is protected and keeps its hreflang set) and a uz/ru pair on Claude Pro, Google AI Pro and Midjourney. Every external fact is from the provider's own page with the check date 2026-11-23; dollar prices only where the provider publishes them (OpenAI help: Plus $20; Claude help: Pro $20 in the US, local pricing elsewhere; Midjourney docs: $10/$30/$60/$120). Google AI Pro's price is not quoted: the plans page serves the US view.
- No promise that a card works and no workaround: the pages name the cards the providers name (Visa, Mastercard, American Express), say that Uzcard and Humo are not mentioned and send the reader to the bank. `tests/payment-cluster.test.ts` enforces the price sources, the bank advice and the absence of guarantees.
- Not built: a «which cards work» page (no primary source on Uzcard/Humo international acceptance was found on their own sites) and a «Click/Payme AI chats» list (only GPTBot.uz states it, per the 1b check — the page would only advertise the site).
- Intent pairs W20261123-06/-07; protected-pages revision 2026-11-23-ai-visibility-2b adds three homepage list entries only.

## D-AI-VISIBILITY-WAVE3-20261123 — wave 3: build only the gap, keep the rest as owner TODO

- One new article, `/uz/blog/toshkentda-ai-bot-pudratchisini-tanlash/` (a neutral contractor checklist). The Russian side already exists (`/ru/luchshie-razrabotchiki-chat-botov-tashkent/`, `/ru/blog/kak-proverit-podryadchika-reklama-sayt-uzbekistan/`), so the page is unpaired. Its slug sorts after the three «Foydali maqolalar» that `/uz/biznes-uchun-ai-bot/` shows (`renderRelatedArticles` takes the first three articles by file order), so no existing recommendation is displaced.
- Not built, with reasons: the Uzbek «Instagram va Telegram → CRM» guide (two existing paired articles cover it), a prompt library (the protected `/uz/blog/chatgpt-uzbek-tilida-promptlar/` owns the intent), Gemini/Claude/DeepSeek guide updates (need a separate fact pass; DeepSeek refused automated checks on 23.11), case pages (no owner facts — `CASES_TEMPLATE.md` lists what is needed).
- `OFFSITE.md` holds ready texts for external profiles and three media topics; publishing is the owner's.

## D-ADS-GPT-20261123 — the advertising cluster is built for AI answers; AI demand counts as evidence

- Owner in chat, 23.11.2026, after the roadmap `docs/seo/research/2026-11-23-ads-cluster/ROADMAP.md`: «сделай максимально комплексную работу чтобы забрать как можно больше трафика с GPT по рекламным и прочим запросам. Создавай максимальное количество статей - делай всё что нужно и не жалей кредитов!».
- Accepted: **D1** — AI demand (AnswerThePublic ChatGPT/Gemini prompts, the OpenSEO ChatGPT tracker, the Business Hub topic share) is evidence for informational articles of the advertising cluster, in place of the Google-volume requirement of D-SEO-GROWTH-20261116 / D-SEO-WAVES-20261117 for this cluster. **D2** — the telegram-uz «no spoke justified» gate, the channel-checklist gate of `TELEGRAM_ADS_ROADMAP_2026-08-26.md` and the «6–8 weeks of Search Console» gate of digital-paid-media-ru are lifted for waves B and C. **D6** — the advertising lane continues; it is measured by AI citations (tracker topic «Ads 2026-11-23») with the stop rule of ROADMAP §10.
- Not answered, so the safe default applies: **D3** no Telegram Ads agency price is published; **D4** no case pages (no facts); **D5** calls to action point only at services the site already sells (targeting, Telegram Ads launch, context, SMM); articles about bloggers or TikTok do not claim we sell those.
- Unchanged: money-page keyword gates (`demand-policy.json`), A7 («targetolog» never a primary keyword), protected pages, the homepage-revision procedure for every new URL, facts only from primary sources with a date, no prices of competitors.

## D-ADS-GPT-WAVE-B-20261123 — wave B: nine answer-first articles on the questions people ask ChatGPT about advertising

- Built under D-ADS-GPT-20261123: the targetologist checklist (ru/uz), Telegram channel prices and checks (ru/uz), the platform comparison / «reklama turlari» (ru/uz), ad creatives (ru/uz) and an unpaired Russian guide to launching Instagram ads from Uzbekistan (the Uzbek side is the «7 qadam» block of `/uz/instagram-target-yoqish/`).
- Facts only from primary sources checked on 23.11.2026; third-party prices only as attributed, dated ranges (Tanish Bilish via Spot, January 2025); tgmarket.io figures were not used because the page could not be read; the brief's ban on «official / официальный / rasmiy» is enforced by the wave test.
- No Telegram Ads agency price (D3 unanswered); calls to action point at the targeting, Telegram Ads, internet-advertising and ad-copy pages the site already sells.
- Slugs chosen so `renderRelatedArticles` (first three articles per money page by file order) displaces no existing recommendation; intent pairs W20261123-09…17; protected-pages revision 2026-11-23-ads-gpt-b.
- Wave A: `/uz/blog/target-reklama-nima/` gets an answer-first paragraph, the brand suffix and year in its title and an answering description (declared in `reports/ads-gpt-20261123-b/intended-metadata-changes.json`).

## D-ADS-GPT-WAVE-C1-20261123 — wave C1: the advertising law, ads with bloggers, ad payback and ads in two languages

- Built under D-ADS-GPT-20261123 (roadmap items C8, C5, C1 and C6), four ru/uz pairs: the advertising law ZRU-776 for online ads, ads with bloggers, ad payback (ROMI, ROAS, CPL, CAC) and ads in Uzbek and Russian.
- Facts only from primary sources checked on 23.11.2026: lex.uz (ZRU-776 with amendments up to ZRU-1187 of 10.11.2026, Administrative Code Art. 178¹ and 42, the Law on the state language Art. 20, ZRU-547), the Competition Committee posts of 12.08.2025, 03.09.2026, 21.10.2026 and 09.11.2026, the Tax Committee post of 06.05.2026, and the Google Ads, Google Analytics, Meta, Yandex Direct and Telegram Ads help pages. Key finding stated in the language pair: Google Ads does not support Uzbek as a targeting language and disapproves ads in unsupported languages, while the law requires the state language; the article gives both facts and sends the reader to a lawyer. The draft law on online platforms (regulation.adliya.uz project 6294) is described as not adopted. The law pages say they are an overview, not legal advice.
- The UZS figures in the ROMI pair are a labelled teaching example, not client data or market prices; `tests/ads-gpt-wave-c1.test.ts` recomputes them and forbids UZS amounts in the other six articles.
- D5 safe default: the blogger articles do not offer blogger placement; calls to action point at the internet-advertising hubs and the performance-marketing page.
- Slugs: C8, C5 and C6 follow the roadmap; C1 keeps the roadmap slug and targets `/ru/performance-marketing-tashkent/` (it gains a second related card, nothing is displaced); the Uzbek slugs are Uzbek phrases. No money page loses a related-article card. Intent pairs W20261123-18…25; protected-pages revision 2026-11-23-ads-gpt-c1.
- Erratum: the `source` and `invisibleToGate` strings of the revision 2026-11-23-ads-gpt-b were copied unchanged from the wave-3 script; its computed `reviewedChanges` and page contracts are correct. The C1 revision records the correction; immutable evidence is not rewritten.

## D-ADS-GPT-WAVE-C2-20261123 — wave C2: product ads, beauty salon, cafe and restaurant, Meta Ads Manager in Uzbek

- Built under D-ADS-GPT-20261123 (roadmap items C2, C3, C4, C7): three ru/uz pairs and an unpaired Uzbek Ads Manager guide (its Russian side is the Instagram launch guide of wave B).
- Facts checked on 23.11.2026 from vendor and regulator pages: uzumads.uz, Google Merchant Center country list (Uzbekistan supported in UZS, no Shopping tab for local users, Russian feed language), Meta catalog-ads and pixel-event help, Yandex Direct product campaign and payment methods, Google Business Profile countries, Yandex Business (free listing, paid priority placement in sums), 2GIS Tashkent, Yandex Eats restaurant help (pay-per-order promotion, banner CPC, 150 000 UZS minimum top-up via Yandex Direct), Express24 (restaurants moved to Yandex Eats), Uzum Tezkor, Meta Ads Manager structure, objectives and learning phase, lex.uz (ZRU-776 Art. 6, 12, 16, 21, 34, 38, 39; state-language law Art. 20).
- Media-only facts are attributed in the text: Wolt's exit on 05.03.2026 (kun.uz), Uzum's card-promotion tools (Uzum's paid article on Spot) and the 2024 test pricing (Kursiv). Uzum Tezkor promotion terms were not found publicly and the text says so.
- Corrected assumptions from the brief: no cosmetology article exists in the advertising law, Express24 is not Uzum Tezkor, Meta renamed Advantage+ catalog ads to ads with product media, the Ads Manager Uzbek interface is not confirmed.
- Intent pairs W20261123-26…32; protected-pages revision 2026-11-23-ads-gpt-c2; no related-article card displaced.

## D-TARGET-GPT-WAVE-TB-20261123 — targeting wave T-B: targeting in Instagram, audiences, Meta Pixel, ad account

- Built under D-ADS-GPT-20261123 from the targeting roadmap (`docs/seo/research/2026-11-23-target-cluster/ROADMAP.md`, items T1, T2, T3, T8): six articles — targeting in Instagram (ru, unpaired; the Uzbek side is `target-reklama-nima`), audiences (ru/uz), Meta Pixel (ru/uz), Meta ad account (ru, unpaired).
- Facts from Meta's help pages checked on 23.11.2026, with current names: Advantage+ audience is the default (location, minimum age 18+, excluded custom audiences and language are hard limits; age range, gender and interests are suggestions), Advantage+ detailed targeting, lookalike source of at least 100 people (1,000–5,000 recommended; no country choice), custom audience sources and the 500-per-account limit, Meta Ads Data Advisor (formerly Meta Pixel Helper), Conversions API alongside the pixel, no 8-event Aggregated Event Measurement setup, business portfolio ad-account limits and partner access, Business Support Home reviews. The radius range (1–80 km) is attributed to Meta's Marketing API docs.
- Not used because no live Meta page supports them: the 1–10 % lookalike range and a 180-day website audience cap; the wave test forbids both.
- Intent pairs W20261123-33…38; protected-pages revision 2026-11-23-target-gpt-tb; no related-article card displaced (`/ru/performance-marketing-tashkent/` gains its third card).
