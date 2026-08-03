# Bormi QuickPost — product specification

Дата: 2026-08-03 · Ветка: `feature/bormi-quickpost` · База: `7fd74fc`
Статус: QP-0 реализован · QP-1 специфицирован · QP-2 заблокирован ADR · QP-3 отложен

Обещание: **«Фото, голос, цена — объявление готово»**
UZ: **«Surat, ovoz, narx — e’lon tayyor»**

---

## 1. Текущий путь и почему он не целевой

Подать → sheet → «Продать через бота» → выход в `@BormiMarketBot`.
Подпись говорит про создание магазина, чего частный продавец не просил.

Внутри Mini App объявление создаётся только в `ProductEditor`
(`SellerApp.tsx:747`). Аудит формы по реальному коду:

| Проблема | Факт в коде |
| --- | --- |
| Цена вводится в минорных единицах | `useState(String(product.priceMinor))`, поле `type=number`, без разрядов и без предпросмотра |
| Характеристики — ручная двуязычная таблица | продавец обязан ввести `labelRu`, `labelUz` и `value` для каждой строки |
| `searchTerms` как первоклассное поле | отдельный редактор тегов на первом уровне формы |
| Складские понятия всем | `availability: available/unavailable/preorder` показывается любому |
| Нет состояния, локации, контакта | таких полей нет ни в форме, ни в домене |
| Нет черновика | закрытие модалки теряет всё введённое |
| Нет голоса и подсказок | текст набирается руками целиком |
| Порог входа | форма живёт за `sellerCommands`, открыть её без прав нельзя |

Это форма для магазина. Для «продать одну вещь» она непроходима за минуту.

---

## 2. Reuse matrix (по коду, не по памяти)

| Возможность | Где | Вердикт |
| --- | --- | --- |
| Создание товара | `POST /seller/products` → `catalog.createProduct` | **AS_IS** |
| Draft status | `sotuvchi_products.status IN ('draft','published','archived')` | **AS_IS** |
| Update product | `PATCH /seller/products/:id` + `expectedVersion` | **AS_IS** |
| Publish | `POST /seller/products/:id/publish` + `expectedVersion` | **AS_IS** |
| Archive | `POST /seller/products/:id/archive` | **AS_IS** |
| Media upload | `POST /seller/media` → private R2 `MARKET_MEDIA` | **AS_IS** |
| R2 handles | `r2.<16>` refs, `mediaObjectKey(org, store, ref)` | **AS_IS** |
| Client image compression | `compressImage`, long side 1600, JPEG 0.82 | **AS_IS** |
| Categories | `sotuvchi_categories`, **живут внутри магазина** | **AS_IS** для одной витрины |
| Specifications | `specifications_json`, ≤12, key `^[a-z][a-z0-9_]{0,31}$`, label ≤40, value ≤100 | **PRESENTER** |
| SearchTerms | `search_terms_json`, ≤12 × ≤60 | **PRESENTER** (в фон) |
| Price validation | `normalizePriceMinor`, ≤1e12, целое | **AS_IS** |
| Stock | `sotuvchi_inventory` | **AS_IS**, частнику не показывается |
| Seller access | `access.sellerOrg !== null` → `sellerRead`; + флаг → `sellerCommands` | **AS_IS** |
| Voice transcription | `functions/market/voice/service.ts`, Groq Whisper → OpenAI | **ADAPTER** |
| AI structured completion | `createAiFacade` + `facade.structured(req, SCHEMA, {task})` | **ADAPTER** |
| Catalog vocabulary | `CatalogVocabularyEntry`, уже грунтует AI-поиск | **AS_IS** |
| Preview card | `ProductCard` / `ProductDetail` в `BuyerApp.tsx` | **PRESENTER** |
| Idempotency | `requireIdempotencyKey` на всех seller-командах | **AS_IS** |
| expectedVersion | на publish/patch/transition | **AS_IS** |
| Rate limits | `enforceMarketRateLimit('command', ...)` | **AS_IS** |
| Feature flags | `marketFlag` + additive optional bootstrap поля | **AS_IS** |
| Back-навигация | **отсутствовала** | **NEW** → реализовано в QP-0 |
| Состояние вещи | нет колонки | **PRESENTER** через `specifications` или **MIGRATION_REQUIRED** |
| Локация | нет колонки | **PRESENTER** через `specifications` или **MIGRATION_REQUIRED** |
| Тип продавца | нет колонки | **MIGRATION_REQUIRED** |
| Contact preference | нет домена | **NOT_AVAILABLE** |
| Vision (анализ фото) | `LlmCallInput = { system: string; user: string }` | **NOT_AVAILABLE** |

### Ответы на десять контрольных вопросов

1. **Черновик до authority?** Нет. `sellerCommands(context)` начинается с
   `requireSellerCommands(context)` — любой `/seller/*` мутирующий вызов
   отклоняется. Серверный draft без прав невозможен → значит локальный.
2. **Private seller без новой схемы?** Формально да (org+store+membership), но
   **бесполезно** — см. ADR §3, товар будет невидим.
3. **Требует ли товар organization/store?** Да, FK составной и NOT NULL.
4. **Магазин как невидимая оболочка частника?** Нет: покупательская сессия
   привязана к одной витрине.
5. **Нарушается ли `stores.org_id` UNIQUE?** Нет — но только потому, что
   создаётся и новая организация, что и есть проблема.
6. **Откуда publisher берёт sellerOrg?** `resolveMarketAccess` → `access.sellerOrg`,
   строго из membership по identity. Клиент на это не влияет.
7. **Граница read/commands?** `sellerRead = sellerOrg !== null`;
   `sellerCommands = sellerRead && MARKET_MINI_APP_SELLER_COMMANDS_ENABLED`.
8. **Идемпотентная команда провижининга?** Технически да — не пишется по ADR.
9. **Локальный черновик до провижининга?** Да, и это единственный способ дать
   ценность до регистрации.
10. **Обязательные поля create/publish?** `name`, `priceMinor`, `currency='UZS'`,
    `availability`. Остальное опционально: `categoryId`, `description`, `sku`,
    `mediaRefs`, `searchTerms`, `specifications`.

---

## 3. Выбранный паттерн: **Q1 — smart single-page composer**

Сравнение проведено против ограничений, а не вкуса.

| Критерий | Q1 одна страница | Q2 три шага |
| --- | --- | --- |
| 320 px | работает: секции складываются вертикально | работает |
| Дешёвый Android | один mount, одно дерево | три mount, три перерисовки |
| Системная клавиатура | sticky CTA нужно поднимать — решаемо | на каждом шаге та же задача ×3 |
| Возврат назад | один уровень до выхода | три уровня, каждый со своим guard |
| Draft recovery | одно состояние | состояние + номер шага |
| Ошибки валидации | скролл к первому полю | ошибка может быть на другом шаге |
| Ощущение | заявление на одной странице | **checkout 1/6 — прямо запрещено** |
| Несколько фото | лента наверху, всегда видна | видна только на шаге 1 |

**Выбран Q1** с двумя уровнями навигации: composer → preview. Это два
back-уровня, а не шесть, и совпадает с запретом на checkout-подобный flow.

---

## 4. Golden path

```
Подать → Продать → QuickPost
  [ Добавить фото ]  ← primary, камера на мобильном
  [ Рассказать голосом ] | [ Написать ]
  название · категория · цена · состояние · район
  ▸ Подробнее (магазин): наличие, остаток, характеристики, поисковые слова
  ─────────────────────────────
  sticky:  [ Проверить объявление ]
                → preview (buyer card)
                → [ Опубликовать ] [ Исправить ]
```

Максимум два логических уровня. Никаких «1/6».

---

## 5. Первый экран

```
                                      Черновик сохранён

Продайте за минуту

┌─────────────────────────────┐
│      [icon camera]          │
│      Добавить фото          │
│      До 5 фотографий        │
└─────────────────────────────┘

[ icon mic ]  Рассказать голосом
[ icon edit ] Заполнить вручную
```

После первого фото лента `[фото][+]`, затем:
«Расскажите, что это, в каком состоянии и что важно знать» + два те же действия.
Двенадцать пустых полей до первого действия не показываются. Emoji не
используются — только существующий SVG `Icon`.

---

## 6. Поля

**Обязательные (частник):** фото (для визуальных категорий), название,
категория, цена, состояние, город/район, способ связи, подтверждение владения.

**Прогрессивные (только при `sellerCommands` и раскрытом блоке «Подробнее»):**
наличие, остаток, характеристики, поисковые слова, SKU, состояние публикации.

Частнику не показываются: остатки, склад, SLA, organization, membership и слово
«магазин создан». Один composer, одна доменная команда, разная подача по
capability. Второй `ProductEditor` не заводится.

---

## 7. Фото

Переиспользуется целиком: `<input type=file accept=image/*>` (+`capture` на
мобильном как primary), `compressImage` (1600 / 0.82), последовательная
загрузка, максимум 5, приватный R2, `r2.<id>` refs.

Добавляется: видимый прогресс по каждому файлу, retry одного фото без потери
остальных, метка обложки, удаление с отзывом ref (`DELETE /seller/media/:ref`).
Публичных R2 URL нет. Blob'ы в localStorage не пишутся — только refs.
**Риск orphan media:** ref, загруженный и не сохранённый в товар, остаётся в
бакете; текущий редактор чистит их при удалении из формы, QuickPost делает так
же, но брошенный черновик оставляет объекты — документировано, сборщик не
входит в slice.

## 8. Голос

`Groq Whisper → OpenAI fallback`, тот же pipeline, что у голосового поиска.
Голос готовит **черновик**, ничего не публикует.

Raw audio не сохраняется, transcript не логируется, в analytics не уходит, в URL
и localStorage не кладётся, после успешного draft отбрасывается.

## 9. AI-схема

Разрешённый выход — и физически только он:

```ts
{ suggestedTitle, suggestedCategoryId, suggestedDescription,
  suggestedSpecifications, suggestedSearchTerms,
  clarificationQuestions, confidence }
```

Запрещённые поля отсутствуют в runtime-схеме, поэтому модель не может их
вернуть: `price`, `stock`, `availability`, `status`, `seller`, `phone`,
`location`, `publish`, `rating`, `delivery`, `discount`.

`suggestedCategoryId` проверяется против реального списка категорий витрины —
неизвестная категория не создаётся и отбрасывается, при низкой уверенности
человек выбирает сам. Спецификации — только безопасные строки в существующих
лимитах, помечены как предложенные, редактируются и удаляются. `searchTerms`
генерируются в фоне и не показываются частнику как обязательная настройка.

Если пользователь сам произнёс цену — она показывается как **распознанное
предложение**, поле остаётся неподтверждённым, требуется явный tap. AI цену не
исправляет.

## 10. Vision — вердикт: НЕДОСТУПНО

`functions/lib/llm/types.ts`:

```ts
export interface LlmCallInput { feature; system: string; user: string; ... }
```

Строки, не content parts. Ни `image_url`, ни вложений, ни capability провайдера.
Значит анализ фото **не имитируется**: фото — это медиа, смысл берётся из голоса
или текста, и UI никогда не пишет «Bormi распознал предмет по фото».

QP-3 потребует расширения API (`AiTask += vision`, части сообщения, capability
провайдера, лимиты размера и приватности, отдельная схема, fallback) и
отдельного owner gate по стоимости и приватности.

## 11. Цена, состояние, локация, контакт

**Цена** — крупное целое UZS с разделителями и предпросмотром `350 000 сум`,
подсказка «Проверьте разряды», ошибка рядом с полем, значение не стирается.
Запрещены: AI-цена, «рекомендуемая цена» без источника, зачёркнутая цена,
конвертация валюты.

**Состояние** — шкала: Новое · Как новое · Хорошее · Есть следы использования ·
Требует ремонта. В домене колонки нет. До QP-2 живёт как зарезервированная
запись `specifications`: `key='condition'`, `labelRu='Состояние'`,
`labelUz='Holati'`, `value` из шкалы. Выбирает человек; AI может только
попросить выбрать.

**Локация** — город + район/ориентир, без координат, без точного адреса, без
permission. Хранится тем же способом (`key='location'`). Справочник районов не
хардкодится как истина; модель локации рассчитана на Узбекистан, а не только на
Ташкент. Пока проверенного справочника нет — свободный короткий текст с
подсказкой города.

**Контакт** — предпочтение «написать в Bormi» / «позвонить, если номер добавлен» /
оба. Телефон не публикуется по умолчанию, Telegram ID покупателю не передаётся.
Полноценные conversations не создаются — домена нет. Переходно: контакт ведёт в
существующий handoff-канал.

## 12. Черновик

Локально: debounce 300–500 мс, жизнь 7 дней, versioned schema, `kind='listing'`,
поля + R2 refs. Не хранятся: file blobs, токены, raw transcripts, телефоны,
Telegram ID.

На сервере: если authority уже есть — существующий `draft` товар, один активный,
через idempotency и `expectedVersion`. Дублирующие серверные черновики не
создаются.

Восстановление: «Продолжить объявление» с возрастом черновика, выбор
Продолжить / Начать заново, destructive delete с подтверждением, миграция версии
старого локального черновика, повреждённый — безопасно удаляется с нейтральным
сообщением.

## 13. Навигация — реализовано в QP-0

`MARKET_NAV_BACK_ENABLED`. Один стек открытого; back закрывает верхнее;
приложение закрывается только в корне; ровно одна history-запись; уровень может
отказаться закрыться (`onBack() === false`) — это и есть guard для несохранённых
изменений composer'а. Telegram BackButton показывается ровно пока что-то открыто
и не дублирует видимую «Назад». Deep link `startapp=quickpost` не выдумывается —
он появится только после проверки launch-контракта Telegram.

## 14. Preview и публикация

Preview использует тот же buyer-презентер (`ProductCard`/`ProductDetail`), а не
приблизительную копию, и подписан «Так объявление увидят покупатели». Фальшивых
просмотров, рейтинга, верификации, доставки и срочности нет. Preview не
публикует.

Публикация — только по явному tap «Опубликовать» / «E’lon qilish»:
`POST /seller/products` (draft, idempotency) → `POST /seller/products/:id/publish`
(`expectedVersion`). Identity и capability берутся сервером. Успех показывает
карточку и действия: посмотреть, поделиться (только при реальной ссылке),
создать ещё. Фальшивая публичная ссылка не создаётся — публичного веб-листинга
нет.

## 15. Флаги

| Флаг | Назначение | Значение |
| --- | --- | --- |
| `MARKET_NAV_BACK_ENABLED` | back-спина (QP-0) | объявлен, `false` |
| `MARKET_QUICKPOST_ENABLED` | composer вместо bot-ветки (QP-1) | вводится с QP-1 |
| `MARKET_QUICKPOST_AI_ENABLED` | подсказки; выкл — ручной flow цел | вводится с QP-1 |
| `MARKET_PRIVATE_SELLER_PROVISIONING_ENABLED` | QP-2 | **не вводится**, кода за ним нет |
| `MARKET_QUICKPOST_VISION_ENABLED` | QP-3 | не вводится |

Все — default false, additive optional поля bootstrap, старый клиент цел, ни
один не выдаёт authority.

## 16. Analytics

События: `quickpost_opened`, `_input_selected`, `_photo_added`, `_voice_started`,
`_voice_completed`, `_draft_generated`, `_field_corrected`, `_preview_opened`,
`_publish_attempted`, `_published`, `_failed`, `_draft_resumed`, `_abandoned`.

Разрешённые свойства: input mode enum, photo count, has description/category/
condition, step, error class, latency bucket, seller capability enum, locale.

Запрещены: title, description, transcript, search terms, price, phone, address,
Telegram ID, media ref, свободный текст категории.

Метрики, которые они поддерживают: median time to preview (`_opened` → `_preview_opened`),
median time to publish (`_opened` → `_published`), completion rate, abandonment by
step (`_abandoned.step`), доля фото/голоса (`_input_selected`), доля правок
AI-подсказки (`_field_corrected`), publish failure rate (`_failed.error class`),
resumed draft completion (`_draft_resumed` → `_published`), доля, ушедшая в бот
(`seller capability enum`).

**North Star пилота:** доля начавших QuickPost, дошедших до корректного preview
без посторонней помощи. Публикация не называется продажей — платежей нет.

## 17. Что уже сделано и что дальше

* **QP-0 · реализовано** — back-спина, 14 тестов, флаг, откат одной строкой.
* **QP-1 · специфицировано** — composer для тех, у кого `sellerCommands` есть.
  Ноль миграций, ноль новой authority.
* **QP-2 · BLOCKED** — ADR отклонил Model A по данным; Model B требует миграции
  и переписанного покупательского чтения. Owner gate.
* **QP-3 · NOT_STARTED** — vision невозможен без расширения LLM-контракта.
