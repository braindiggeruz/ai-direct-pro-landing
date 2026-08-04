# 07. INTERNAL_LINK_MAP

**Дата:** 2026-08-04. Все ссылки проверены сборкой: `scripts/seo-audit.ts` сообщает `Broken intl. links: 0`, `Links via redirect: 0`, `Orphan pages: 0`.

## Обозначения

- **Placement** — где физически находится ссылка: `body` (блок `linkp` внутри текста, контекстная), `list` (массив `internalLinks`, используется для блока связанных материалов).
- Ссылка в `body` весит больше: она стоит в предложении, а не в списке.

## Новые ссылки

### На новые страницы (входящие)

| Source URL | Target URL | Anchor | Placement | Reason |
|---|---|---|---|---|
| `/ru/smm-prodvizhenie-tashkent/` | `/ru/blog/stoimost-i-pakety-smm-uslug-v-tashkente/` | стоимости SMM-услуг в Ташкенте | body | Раздел о стоимости на hub отвечает кратко; читатель, которому нужны детали сметы, получает продолжение |
| `/ru/smm-prodvizhenie-tashkent/` | `/ru/blog/stoimost-i-pakety-smm-uslug-v-tashkente/` | стоимость SMM-услуг и пакеты | list | Блок связанных материалов |
| `/ru/smm-prodvizhenie-tashkent/` | `/ru/blog/chto-vhodit-v-uslugi-smm-specialista/` | состав работ SMM-специалиста | body | Возражение «что именно я покупаю» снимается до заявки |
| `/ru/smm-prodvizhenie-tashkent/` | `/ru/blog/chto-vhodit-v-uslugi-smm-specialista/` | что входит в услуги SMM-специалиста | list | Блок связанных материалов |
| `/ru/smm-prodvizhenie-tashkent/` | `/ru/blog/dogovor-na-okazanie-smm-uslug-v-uzbekistane/` | договоре на оказание SMM-услуг | body | Возражение «как это оформляется» — последний барьер перед сделкой |
| `/ru/smm-prodvizhenie-tashkent/` | `/ru/blog/dogovor-na-okazanie-smm-uslug-v-uzbekistane/` | договор на оказание SMM-услуг | list | Блок связанных материалов |
| `/ru/smm-prodvizhenie-tashkent/` | `/ru/blog/chto-takoe-smm-prodvizhenie/` | как работает продвижение в соцсетях | body | **Исправление односторонней связи**, найденной в аудите |
| `/ru/smm-prodvizhenie-tashkent/` | `/ru/blog/chto-takoe-smm-prodvizhenie/` | что такое SMM-продвижение | list | То же |
| `/ru/blog/chto-takoe-smm-prodvizhenie/` | `/ru/blog/stoimost-i-pakety-smm-uslug-v-tashkente/` | стоимость SMM-услуг в Ташкенте | body | Раздел про стоимость передаёт читателя туда, где вопрос разобран полностью |
| `/ru/blog/chto-takoe-smm-prodvizhenie/` | `/ru/blog/chto-vhodit-v-uslugi-smm-specialista/` | что входит в услуги SMM-специалиста | body | Переход от «что это» к «что я покупаю» |
| `/ru/blog/chto-takoe-smm-prodvizhenie/` | `/ru/blog/dogovor-na-okazanie-smm-uslug-v-uzbekistane/` | договор на оказание SMM-услуг | body | Следующий шаг после выбора исполнителя |
| `/ru/blog/chto-takoe-smm-prodvizhenie/` | все три новые | (см. list) | list | Блок связанных материалов |
| `/ru/blog/stoimost-digital-marketinga-v-tashkente/` | `/ru/blog/stoimost-i-pakety-smm-uslug-v-tashkente/` | смета на ведение соцсетей | list | Общий бюджет → детализация по каналу |
| `/ru/blog/kak-vybrat-digital-agentstvo-v-tashkente/` | `/ru/blog/chto-vhodit-v-uslugi-smm-specialista/` | состав работ по ведению соцсетей | list | Выбор агентства → проверка конкретно SMM-исполнителя |
| `/ru/blog/kak-vybrat-digital-agentstvo-v-tashkente/` | `/ru/blog/dogovor-na-okazanie-smm-uslug-v-uzbekistane/` | договор на SMM-услуги по нормам Узбекистана | list | В статье есть раздел про договор — естественное продолжение |
| `/ru/blog/stoimost-i-pakety-smm-uslug-v-tashkente/` | `/ru/blog/chto-vhodit-v-uslugi-smm-specialista/` | состав работ SMM-специалиста | body | Взаимная связка spoke ↔ spoke |
| `/ru/blog/stoimost-i-pakety-smm-uslug-v-tashkente/` | `/ru/blog/dogovor-na-okazanie-smm-uslug-v-uzbekistane/` | договора на SMM-услуги по узбекскому праву | body | Вопрос о правах на аккаунт ведёт в правовой разбор |
| `/ru/blog/chto-vhodit-v-uslugi-smm-specialista/` | `/ru/blog/stoimost-i-pakety-smm-uslug-v-tashkente/` | стоимость SMM-услуг в Ташкенте | body | Состав работ → смета |
| `/ru/blog/chto-vhodit-v-uslugi-smm-specialista/` | `/ru/blog/dogovor-na-okazanie-smm-uslug-v-uzbekistane/` | договора на SMM-услуги | body | Договорённости → документ |
| `/ru/blog/dogovor-na-okazanie-smm-uslug-v-uzbekistane/` | `/ru/blog/chto-vhodit-v-uslugi-smm-specialista/` | услуги SMM-специалиста | body | Предмет договора описывается составом работ |
| `/ru/blog/dogovor-na-okazanie-smm-uslug-v-uzbekistane/` | `/ru/blog/stoimost-i-pakety-smm-uslug-v-tashkente/` | стоимости SMM-услуг в Ташкенте | body | Цена услуг — существенное условие |

### На hub (исходящие из новых страниц)

| Source | Anchor | Placement |
|---|---|---|
| `/ru/blog/stoimost-i-pakety-smm-uslug-v-tashkente/` | ведение социальных сетей в Ташкенте | body |
| `/ru/blog/stoimost-i-pakety-smm-uslug-v-tashkente/` | SMM-услуги в Ташкенте | list |
| `/ru/blog/chto-vhodit-v-uslugi-smm-specialista/` | SMM под ключ в Ташкенте | body |
| `/ru/blog/chto-vhodit-v-uslugi-smm-specialista/` | Ведение соцсетей в Ташкенте | list |
| `/ru/blog/dogovor-na-okazanie-smm-uslug-v-uzbekistane/` | SMM-сопровождение бизнеса | body |
| `/ru/blog/dogovor-na-okazanie-smm-uslug-v-uzbekistane/` | SMM-сопровождение в Ташкенте | list |

## Разнообразие анкоров

Тест `internal anchors to a hub are varied, not one exact-match phrase` требует, чтобы самый частый анкор занимал не более 60 % ссылок на hub.

Существовавшие анкоры на hub: «SMM-продвижение в Ташкенте» (из `/ru/blog/chto-takoe-smm-prodvizhenie/` и `/ru/blog/pochemu-reklama-v-instagram-ne-prinosit-zayavki/`) и один из `/ru/digital-marketing-tashkent/`.

Добавлено шесть новых, все различные: «ведение социальных сетей в Ташкенте», «SMM-услуги в Ташкенте», «SMM под ключ в Ташкенте», «Ведение соцсетей в Ташкенте», «SMM-сопровождение бизнеса», «SMM-сопровождение в Ташкенте». Ни одна формулировка не повторяется, точное вхождение `smm услуги ташкент` в анкорах не используется ни разу.

**Тест пройден** — см. `09_QA_EVIDENCE.md`.

## Итоговые показатели

| Требование | Порог | Факт |
|---|---|---|
| Входящих контекстных ссылок на каждый новый материал | ≥ 3 | 4 источника на каждый (hub, обзорная статья + два соседних spoke; плюс внешние доноры) |
| Исходящих ссылок из каждого нового материала | ≥ 2 | 6 / 6 / 4 |
| Ссылок на hub из каждого spoke | ≥ 1 | 2 (body + list) |
| Orphan pages | 0 | 0 |
| Broken internal links | 0 | 0 |
| Ссылок через редирект | 0 | 0 |
| Кросс-локальных ссылок в кластере | 0 | 0 |

## Что намеренно не сделано

- Не добавлены ссылки в страницы про ботов и AI ради количества: связь «SMM ↔ Telegram-бот» естественна только там, где речь о приёме обращений, и она уже реализована ссылками на `/ru/ai-menedzher-dlya-instagram/`.
- Не менялась существующая перелинковка: ни одна имеющаяся ссылка не удалена и не переписана, только добавлены новые.
- Не использовались точные коммерческие анкоры вида «заказать SMM услуги» — это выглядело бы как манипуляция.
