# SEO brief: AI-агент или чат-бот

Дата анализа: 2026-09-13  
Целевой сайт: https://gptbot.uz/  
Статус: статья реализована локально, публикация и деплой не выполнялись

## Решение

Публиковать одну русскоязычную статью:

- URL: `/ru/blog/ai-agent-ili-chat-bot/`
- H1: `AI-агент или чат-бот: что выбрать бизнесу в Узбекистане`
- Primary query: `AI-агент или чат-бот`
- Intent: informational and commercial investigation
- Target money page: `/ru/ai-bot-dlya-biznesa/`
- Traffic potential: `UNMEASURED`, так как в этой сессии нет свежего GSC или валидированного Uzbekistan keyword-volume export

Это не прогноз трафика. Решение основано на свежем SERP gap, совпадении с продуктом и отсутствии владельца этого интента на GPTBot.uz.

## Живое состояние сайта

- Основной sitemap отвечает `200` и содержит 288 canonical URL.
- В sitemap находится 165 blog URL.
- В репозитории 126 русскоязычных статей.
- Ограничения для поисковых и AI-краулеров отсутствуют за пределами `/admin/`, `/admin-tools/` и `/api/`.
- Site-restricted searches по `AI-агент` и `ИИ-агент` не вернули отдельную страницу GPTBot.uz.
- В локальном русскоязычном контенте термин `AI-агенты` встречался один раз, внутри обзорной статьи о нейросетях.

Вывод: контентная база широкая, но новый быстрорастущий термин пока не имеет отдельного владельца.

## Что показала выдача

### Информационный интент

По запросам `AI-агент или чат-бот`, `чем AI-агент отличается от чат-бота` и `что такое ИИ-агент` выдача содержит свежие материалы 2026 года. Просмотрены:

| Страница | Сильная сторона | Недостаток, который закрывает GPTBot |
| --- | --- | --- |
| AiUse, 2026-07-27 | Быстрый ответ и таблица отличий | Агент сводится в основном к диалогу и CRM, мало внимания правам и подтверждениям |
| Leadarr, 2026-04 | Понятное сравнение механики | Есть неподтверждённые сроки и продуктовые обещания |
| Нейро Альянс, 2026-07-13 | Простая декомпозиция на LLM, RAG, tools, memory | Слабая граница между генеративным ботом и агентным выполнением |
| WestStar, 2026-08 | Полезный акцент на действии и цене ошибки | Несколько сильных числовых заявлений требуют первичной верификации |
| azamat.ai, 2026 | Лучшее разделение chatbot, workflow и agent | Казахстанский контекст, нет сценариев RU/UZ, Payme/Click и локального клиентского контура |

Формат победителя: comparison article с быстрым verdict, таблицей, практическими сценариями, safety section и FAQ.

### Коммерческий интент в Узбекистане

По запросу `AI агент для бизнеса Узбекистан` уже присутствуют отдельные коммерческие страницы GreatSoft, Lynx AI, AXI, Kabulov Tech, Celion, Tezcode и других локальных компаний. Это подтверждает формирование категории, но не доказывает поисковый объём.

Решение: сейчас публикуем informational comparison. Отдельную money page создаём только после появления distinct GSC impressions или валидированного keyword-volume evidence.

## Cannibalization boundary

Новая статья не должна забирать коммерческий head intent у `/ru/ai-bot-dlya-biznesa/`.

| URL | Владеет | Не таргетирует |
| --- | --- | --- |
| `/ru/ai-bot-dlya-biznesa/` | `AI-бот для бизнеса`, заказ и внедрение | `AI-агент или чат-бот`, comparison intent |
| `/ru/blog/ai-agent-ili-chat-bot/` | сравнение chatbot, workflow и agent | `AI-бот для бизнеса`, `заказать AI-бота` |
| `/ru/blog/gpt-bot-vs-chat-bot/` | гибрид сценариев, RAG и GPT | AI-agent category |

Пара записана в `content/seo/intent-manifest.json` как `C21-ru-ai-agent-vs-chatbot`.

## Уникальная ценность статьи

1. Добавлен третий вариант: deterministic workflow. Большинству компаний не нужен выбор только между кнопочным ботом и автономным агентом.
2. Сравнение построено вокруг права менять состояние бизнеса, а не вокруг качества текста.
3. Есть локальные сценарии для клиники, интернет-магазина, учебного центра и отдела продаж.
4. Payme и Click упомянуты в корректной границе: платёжное событие проверяет детерминированный код, AI объясняет и готовит действия.
5. Дана лестница автономии: read-only, draft, low-risk write, human-approved high-risk action.
6. Источники ограничены первичными материалами OpenAI, Anthropic, OWASP и NIST.

## Internal link plan

Исходящие ссылки статьи:

- `/ru/ai-bot-dlya-biznesa/`
- `/ru/ai-bot-s-crm-amocrm-bitrix24/`
- `/ru/blog/chto-takoe-ai-bot-dlya-biznesa/`
- `/ru/blog/gpt-bot-vs-chat-bot/`
- `/ru/blog/priem-oplaty-payme-click-v-telegram-bote/`
- `/ru/blog/okupaemost-chat-bota-dlya-biznesa/`

Входящие ссылки добавлены из:

- `/ru/blog/chto-takoe-ai-bot-dlya-biznesa/`
- `/ru/blog/gpt-bot-vs-chat-bot/`

## Источники

- OpenAI, `A practical guide to building agents`: https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf
- Anthropic, `Building effective agents`: https://www.anthropic.com/engineering/building-effective-agents
- Anthropic, `Trustworthy agents in practice`: https://www.anthropic.com/research/trustworthy-agents
- OWASP GenAI Security Project, `OWASP Top 10 for Agentic Applications for 2026`: https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/
- NIST, `Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile`: https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence

## Acceptance criteria

- Article JSON parses and passes repository content types.
- SEO audit has no new critical errors.
- Intent guard shows no shared reserved keyword with the money page.
- New URL has at least two incoming internal links.
- Canonical, Article schema, FAQ schema and OG image render in prerendered HTML.
- 1200x630, 800x420 and 480x252 WebP assets exist.
- Full `npm run build:cf` succeeds before any production release.
- Deployment requires a separate explicit user instruction.
