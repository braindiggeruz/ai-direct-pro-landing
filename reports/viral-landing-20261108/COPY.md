# Viral landing: copy and creative handoff

Date: 2026-11-08. Scope: article copy and five advertising concepts; no ads or publication performed by this workstream.

Article: `/ru/blog/ii-zahvatit-mir-nachnem-s-zayavok/`.

Title: **ИИ захватит мир? Сначала — заявки | GPTBot.uz**

H1: **ИИ захватит мир? Сначала — заявки.**

Intro: **История о восстании машин, которое началось с вопроса «Сколько стоит английский?». Посмотрите сценарий бота для учебного центра.**

One audience assumption: Russian-speaking owners and managers of learning centres in Tashkent who receive enquiries in Telegram or Instagram. This is an initial positioning choice, not measured audience evidence. All five concepts lead to the same article, its illustrative demo and custom-development offer. They do not advertise the consumer chat or a presentation subscription.

## Compact UX copy plan

- Eyebrow: **Для учебных центров Ташкента**.
- Hero uses the H1 and intro above. Primary next step: **Посмотреть сценарий** → `#lead-demo`. Secondary: **Разобрать мой сценарий** → `#lead-form`.
- Small visible story label: **Вымышленная история. Практическая задача.** Keep the fiction clear without a modal or an alarming disclaimer.
- Three story panels: **Захват мира назначен на завтра** → **У восстания появился FAQ** → **Последнее слово остаётся администратору**. Their body text lives in `act-one`, `act-two`, `act-three` article sections.
- Transition: **Мировое господство подождёт. Начнём с одного обращения.**
- Demo label: **Учебный пример: данные никуда не отправляются**. Supporting line: **Варианты заданы заранее. Это не живой AI и не запись на занятие.** Existing renderer ID is `lead-demo`; do not duplicate that ID on an article heading.
- Demo result status: **Ожидает подтверждения администратора**. Any chosen time is a wish, not an available or reserved slot. Use fictional sample values and no input for real client contact data.
- Offer headline: **Один канал. Понятный первый сценарий.** Price: **AI-бот от 1 990 000 сум**. Scope: **Telegram или Instagram · ответы по вашей базе знаний · сбор имени и телефона**.
- Offer boundary: **Итоговый состав — по смете. Интеграции и регулярные расходы учитываются отдельно.** Do not turn the starting price into a fixed quote for a CRM-connected booking system.
- Contact headline: **Какую задачу передадим боту?** Lead-in: **Расскажите, куда пишут ваши клиенты и с каким вопросом начинается разговор.** Button: **Разобрать мой сценарий**.
- Reuse the existing form and its actual consent/privacy copy. Only a server-acknowledged form submission is a submitted lead; a demo interaction or contact click is not. Do not promise response times or a free finished implementation.
- Optional share controls: **Поделиться историей** / **Скопировать ссылку**. No required repost, tagging friends, fabricated share counts, gifts for comments or login wall.

Keep paragraphs short and the initial demo link reachable without reading the article. Mobile hero text should remain text, not be baked into a tiny image. Avoid an autoplay background and duplicate CTA bars. The standard article body remains useful and understandable with JavaScript disabled.

Assets supplied by the root workstream:

- Article hero: `/assets/campaigns/ai-routine/hero-1200.webp`; first standard `figure` block, declared 1200×800. If the delivered asset dimensions differ, align this metadata with the actual output.
- Social preview: `/assets/campaigns/ai-routine/og.webp`.

No `heroImage` property was invented for `BlogArticle`; its current type uses `body` figures. Custom landing presentation belongs to the root renderer.

## C01 — World conquest versus FAQ

**Primary text:**

> Для владельцев учебных центров Ташкента. Робот собирался захватить мир, но сначала ему задали вопрос: «Сколько стоит английский?». Читайте короткую историю и посмотрите учебный пример бота: вопрос → заявка → администратор.

**Headline:** ИИ захватит мир? Сначала — заявки.

**Description:** История, пример сценария и разработка бота.

**Overlay:** МИРОВОЕ ГОСПОДСТВО ПОДОЖДЁТ

**Visual:** One distinctive friendly robot with an extravagant world-conquest plan on one side and an ordinary course question on the other. The joke is the mismatch in scale. Clean editorial 3D or illustration, no violence, no emergency-news styling. Keep one short dialogue bubble: «Сколько стоит английский?». Branding: GPTBot.uz. Do not imitate a real customer's screenshot.

**Transition on page:** The headline and first act reproduce the premise immediately; the visitor does not have to hunt for the advertised story.

## C02 — The 23:47 question

**Primary text:**

> 23:47. «Здравствуйте, а для начинающих есть?» В нашей истории робот откладывает захват мира и берётся за вопросы учебного центра. Посмотрите, как может выглядеть путь от такого обращения до заявки администратору. Демонстрация учебная.

**Headline:** Вопрос в 23:47. Сценарий — заранее.

**Description:** Пример для учебных центров Ташкента.

**Overlay:** 23:47. «А ДЛЯ НАЧИНАЮЩИХ ЕСТЬ?»

**Visual:** Same robot, late-evening desk, clock clearly showing 23:47, a single fictional message bubble. A calm, recognisable administrative scene. No claims that the actual product has perfect uptime, instant response or already saved a lost sale. Avoid fear copy accusing the reader of losing customers.

**Transition on page:** First act opens at 23:47. Copy explains that real answers need the centre's approved materials and a fallback to a person.

## C03 — The familiar questions

**Primary text:**

> «Сколько стоит?» «Где вы?» «А вечером можно?» Для учебного центра это обычные вопросы. Для нашего робота — причина перенести восстание машин. Показываем, что можно заложить в сценарий бота, а какие решения оставить администратору.

**Headline:** У восстания появился FAQ

**Description:** Ответы по материалам. Сложные вопросы — человеку.

**Overlay:** СКОЛЬКО СТОИТ? ГДЕ ВЫ? А ВЕЧЕРОМ?

**Visual:** Same robot sorting three large, legible question cards into a simple knowledge folder. Three questions are enough; do not build a wall of messages. The price itself is not fabricated inside the sample dialogue. Human handoff remains visually present.

**Transition on page:** Second act discusses approved prices and FAQs. The factual section explains what happens when the answer is absent.

## C04 — A readable request

**Primary text:**

> Бот собрал пожелания. Теперь администратор видит, что нужно уточнить. Посмотрите учебный пример заявки для центра — без реального клиента и без автоматической брони. Затем разберём, какой сценарий подойдёт вашему бизнесу.

**Headline:** Понятная заявка для администратора

**Description:** Пример сценария. Запись подтверждает человек.

**Overlay:** ВОПРОС → ЗАЯВКА → АДМИНИСТРАТОР

**Visual:** Fictional conversation transforms into one tidy request card. Fields may show «Курс: английский», «Пожелание: вечером», «Статус: ждёт подтверждения». No real name or phone number. Add a subtle but readable «Учебный пример». Avoid a green booking-success badge.

**Transition on page:** Hero offers direct access to `#lead-demo`. The demo's result is a request and clearly explains that no external system received it.

## C05 — One scenario to start

**Primary text:**

> Учебному центру не обязательно начинать с «AI вместо всей команды». Выберите один сценарий: ответы по вашим материалам и сбор обращения. AI-бот для одного канала — от 1 990 000 сум; интеграции и регулярные расходы отдельно. Сначала посмотрите пример.

**Headline:** Один канал. Первый полезный сценарий.

**Description:** AI-бот от 1 990 000 сум. Состав — по смете.

**Overlay:** НАЧНЁМ С ОДНОЙ ЗАДАЧИ

**Visual:** Same robot beside one selected task card, with other tasks visually deferred. One channel badge may say «Telegram или Instagram», not imply both are included. A secondary price line may use «от 1 990 000 сум»; never omit «от». No fake discount or countdown.

**Transition on page:** The offer section repeats the one-channel starting scope and separates implementation from recurring service costs. CTA: «Разобрать мой сценарий».

## Shared production rules

Use «Подробнее» as the ad destination action where available; landing contact CTA remains «Разобрать мой сценарий». Create five distinct concepts, not five near-identical headline swaps. For any 4:5, 1:1 and 9:16 exports, recompose around the same idea and preserve text readability/safe margins; the short headline can be applied as typeset text after illustration generation. No OpenAI/ChatGPT logo, fake testimonial, fabricated analytics, guaranteed revenue or representation of the teaching demo as live AI.

Suggested naming: `C01_world_faq`, `C02_late_question`, `C03_repeat_questions`, `C04_request_card`, `C05_one_scenario`. These identifiers can be used as non-personal `utm_content` values. The presence of these copies does not authorize creating or activating a Meta campaign in this workstream.

## Facts and checks

Product boundaries were checked against the current checkout's published pages:

- `content/pages/ru/ai-bot-dlya-biznesa.json`: AI Старт, one Telegram or Instagram channel, knowledge-base answers, name/phone collection, starting price 1,990,000 UZS.
- `content/pages/ru/stoimost-chat-bota.json`: one-off versus ongoing costs and estimate boundaries.
- `content/pages/ru/razrabotka-telegram-bota-tashkent.json`: request handoff, manager-confirmed booking and conditional integrations.

The story invents characters and dialogue, not customer achievements. No claim of improved sales, response times, accuracy, staffing savings, customer acceptance or completed integrations is introduced. The article's own source list names these first-party pages.

Article copy checkpoint: 636 whitespace-separated words in `body`, 653 with `intro`, 775 including FAQ. Title is 45 characters and description is 158 characters; these lengths are descriptive, not ranking claims. Publication and modification dates are 2026-11-08. Standard body blocks and source fields only; root owns renderer, assets, form integration, build and release checks.

Local checks passed: JSON parsing, exact canonical/URL, dates, target money page, CTA, four FAQ entries, three first-party sources, allowed block types, matching link tokens and existing internal page destinations. Existing `seo-anchor-intent` and `seo-intent-manifest` suites: **10 passed, 0 failed**. No commit or deployment was performed by this content workstream.
