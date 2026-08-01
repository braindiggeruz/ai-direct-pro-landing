# Top-page snapshots — rollback baseline, 2026-08-01

Taken from `main` at `8d27150` (the SHA deployed as Cloudflare Pages deployment
`795070eb`) before any phase-two content edit. Restore from this file, or from
`git show 8d27150:<path>`, if a change costs a position.

Search Console figures: `sc-domain:gptbot.uz`, 2026-01-29 → 2026-07-29.

---

## `/ru/gpt-chat/` — GSC 50 impr, 1 click, pos 6.48

- `pageType` gpt-chat · `searchIntent` informational · `primaryKeyword` AI-чат онлайн
- title: `AI-чат онлайн — попробовать бесплатно | GPTBot.uz`
- description: `Попробуйте AI-чат GPTBot.uz для текстов, идей, учёбы, рекламы и бизнеса. Русский и узбекский языки, бесплатный лимит, тариф Plus и B2B-внедрение AI-ботов.`
- h1: `AI-чат онлайн на русском и узбекском`
- 8 body blocks · 4 FAQ · 7 internal links
- Named queries: `chat gpt uz` 4 impr pos 5.25 · `chatgpt uz` 1 impr pos 10 · `gptbot` 1 impr pos 9
- Index state 2026-08-01: PASS, submitted and indexed, self-canonical

## `/ru/gpt-na-russkom/` — GSC 5 impr, pos 4.6

- `pageType` niche · `searchIntent` informational · `primaryKeyword` AI-чат на русском
- title: `AI-чат на русском — тексты, идеи, учёба и бизнес | GPTBot.uz`
- description: `AI-чат на русском языке от GPTBot.uz: тексты, идеи, учёба, работа и бизнес. Независимый сервис, бесплатный лимит, тариф Plus.`
- h1: `AI-чат на русском языке`
- 10 body blocks · 4 FAQ · 7 internal links
- All queries anonymised by GSC at this volume
- Index state 2026-08-01: PASS, submitted and indexed, self-canonical

## `/uz/gpt-uzbek-tilida/` — GSC 31 impr, 1 click, pos 7.84

- `pageType` gpt-chat · `searchIntent` transactional · `primaryKeyword` chatgpt uzbek tilida
- title: `ChatGPT o‘zbek tilida online — AI chat | GPTBot.uz`
- description: `O‘zbek tilida AI chatni online sinab ko‘ring: matn, tarjima, o‘qish, marketing va biznes vazifalari. Yuklash shart emas, brauzerda ishlaydi.`
- h1: `O‘zbek tilida AI chat online`
- 19 body blocks · 8 FAQ · 14 internal links
- Named queries: `chat gpt uzbek tilida` 2 impr pos 7 · `chatgpt yuklab olish uzbek tilida` 1 impr pos 35
- Index state 2026-08-01: PASS, submitted and indexed, self-canonical
- **Not modified in phase two.** Best-positioned UZ product asset; its cluster head
  `chatgpt uzbek tilida` measures 2,900/mo and the page already targets it directly.

## `/ru/gpt-vs-chatgpt-sravnenie/` — GSC 103 impr, 0 clicks, pos 8.27

- `pageType` blog · `searchIntent` informational · `primaryKeyword` GPT vs ChatGPT
- title: `GPT vs ChatGPT: в чём разница простыми словами | GPTBot.uz`
- description: `Чем GPT отличается от ChatGPT: GPT — это языковая модель (технология), ChatGPT — продукт на её основе. Разбираем термины и различия простыми словами.`
- h1: `GPT vs ChatGPT: в чём разница между технологией и продуктом`
- 17 body blocks · 6 FAQ · 5 internal links
- Named queries: `chatgpt vs gpt` 2 impr pos 4 · `gpt vs chatgpt` 1 impr pos 5 ·
  `chatgpt vs chatgpt` 1 impr pos 7 · `difference between chatgpt and gpt` 1 impr pos 33
- **Not modified in phase two.** The 0% CTR looks like a snippet failure but is not:
  the 103 impressions are spread across roughly a hundred anonymised queries at one
  impression each, and the five named queries total five impressions. Rewriting the
  title would be changing a page that ranks, against no evidence that the snippet is
  the constraint.

## `/ru/razrabotka-saytov-tashkent/` — GSC 56 impr, 0 clicks, pos 77.18

- Primary RU web-development page, absorbed `/ru/razrabotka-sayta-pod-klyuch/` in release 1
- title: `Разработка сайтов в Ташкенте под ключ | GPTBot.uz`
- h1 unchanged; hreflang pair `/uz/sayt-yaratish/`
- Index state 2026-08-01: PASS, submitted and indexed, last crawled 2026-07-31

## `/uz/sayt-yaratish/` — new in release 1

- GSC: no data (URL unknown to Google at Day 0, expected)
- title: `Sayt yaratish — biznes uchun veb sayt | GPTBot.uz`
- h1: `Sayt yaratish — biznesingizga ariza keltiradigan veb sayt`
- 1 H1 · 11 H2 · 10 FAQ · Service + FAQPage + BreadcrumbList + WebPage schema

---

## Pages changed in phase two

| Page | Change | Why |
| ---- | ------ | --- |
| `/ru/gpt-chat/` | title + description | Ranks pos 5.25 for `chat gpt uz` and pos 10 for `chatgpt uz` (1,300/mo measured) with a title that names neither |
| `/ru/blog/chat-gpt-na-russkom/` | keywords + title + H1 narrowed to how-to | Was targeting the same head cluster as `/ru/gpt-na-russkom/` and losing it at pos 74–85 against the money page's pos 4.6 |
| `/ru/instagram-direct-bot/` | commercial framing | C3 differentiation |
| `/ru/blog/instagram-direct-bot-kak-rabotaet/` | informational framing + link to money page | C3 differentiation |
| `/ru/ai-bot-dlya-salona-krasoty/` | commercial framing | C7 differentiation |
| `/ru/blog/ai-bot-dlya-salona-krasoty-zadachi/` | informational framing + link to money page | C7 differentiation |
