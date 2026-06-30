# CONTENT TASK — 3 RU SEO articles for gptbot.uz

## Goal
SEO top-3 on informational queries (Google.uz). Local Tashkent audience. CTA + internalLinks → /ru/ai-bot-dlya-biznesa/.

## GAP analysis (done 2026-06-30)
Competitors (Media Solutions, UPSOFT, iCORP, Lynx AI, Muna AI, aisolution.uz, Aisha, Zukko) sell services but lack deep informational content. 3 uncovered high-intent clusters with local UZ specificity:

1. **Uzbek-language AI** — huge demand (Aisha, Uzbekvoice, "узбекский — проблема для AI?") but NO normal guide on how a bot handles Uzbek / mixed uz-ru speech / dialects / voice.
2. **Payme/Click payments inside bot** — many commercial pages, NO informational guide "how to accept Payme/Click inside a Telegram bot". Pure UZ specificity.
3. **Lost leads without bot** — strong pain query, stats-driven, ROI angle.

## Articles
| # | slug | h1 | status |
|---|------|----|--------|
| 1 | ai-bot-uzbekskiy-yazyk-kak-rabotaet | Как AI-бот понимает узбекский язык | TODO |
| 2 | priem-oplaty-payme-click-v-telegram-bote | Приём оплаты Payme и Click в Telegram-боте | TODO |
| 3 | skolko-zayavok-teryaet-biznes-bez-ai-bota | Сколько заявок теряет бизнес без AI-бота | TODO |

## Schema (match existing content/blog/ru/*.json)
status, locale:"ru", slug, url, title, description, h1, intro, targetMoneyPage:"/ru/ai-bot-dlya-biznesa/", topicCluster, keywords[8], body[](h2/h3/p/cta), faq[5], internalLinks[4], ogTitle, ogDescription, canonical, robotsIndex:true, robotsFollow:true, author:"GPTBot", schemaTypes:["Article","FAQPage","BreadcrumbList"], datePublished:"2026-06-30", dateModified, updatedAt.

## Build/deploy
yarn build:fast → verify prerender → atomic commits → push main → CF Pages autodeploy.
