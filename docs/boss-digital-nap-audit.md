# Boss Digital — NAP Audit (Name / Address / Phone)

Дата аудита: 2026-07-02
Источник истины: действующая карточка Boss Digital в Google Maps
(https://maps.google.com/?cid=15658123710081809529, feature id `/g/11vkhm8nth`,
plus code `87PC+GW Tashkent`). Карточка проверена публично 2026-07-02.

Страницы: `/boss-digital/` (RU, canonical) и `/uz/boss-digital/` (UZ, hreflang-пара).
Schema: узел `ProfessionalService`/`Organization` `@id=https://gptbot.uz/boss-digital/#boss-digital`.

| Поле | Google Profile (карточка) | Страница /boss-digital/ | Schema (JSON-LD) | Статус | Действие |
|---|---|---|---|---|---|
| Название | Boss Digital | Boss Digital | `name: Boss Digital` | ✅ Совпадает | — |
| Категория | Маркетинговое агентство (Marketing agency, gcid:marketing_agency) | «маркетинговое агентство / digital-агентство» | `@type: ProfessionalService, Organization` | ✅ Согласовано | Не менять основную категорию карточки без владельца |
| Адрес | Kichik Xalqa Yo'li 57, Tashkent, Узбекистан | Kichik Xalqa Yo'li 57, Ташкент, Узбекистан | `streetAddress: Kichik Xalqa Yo'li 57, addressLocality: Tashkent, addressCountry: UZ` | ✅ Совпадает | — |
| Телефон | +998 93 122 00 60 | +998 93 122 00 60 | `telephone: +998931220060` (E.164) | ✅ Совпадает | — |
| Город | Ташкент | Ташкент | `addressLocality: Tashkent` | ✅ Совпадает | — |
| Часы работы | Подтверждено частично: чт 10:00–19:00; «откроется в 10:00 (пт)». Полная неделя в ограниченном виде карточки не видна | «10:00–19:00 (актуальный график — в карточке Google)» + ссылка на карточку | `openingHours` НЕ добавлен (неполное подтверждение) | ⚠️ Частично | Владелец: подтвердить график на всю неделю; после подтверждения можно добавить openingHoursSpecification |
| Сайт | canonical.uz (устаревшее значение) | gptbot.uz / boss-digital | `url: https://gptbot.uz/boss-digital/` | ❌ Расхождение | Владелец: обновить поле website в карточке на https://gptbot.uz/boss-digital/ после проверки production |
| Формат обслуживания | Адрес публичный (карточка с адресом, не service-area) | «Принимает клиентов по адресу офиса, встреча по согласованию; с другими городами — дистанционно» | `areaServed: Uzbekistan, Tashkent` | ✅ Согласовано | — |
| Google Maps URL | https://maps.google.com/?cid=15658123710081809529 | Кнопка «Открыть карточку Boss Digital в Google Maps» | `sameAs: [maps cid link]` | ✅ Совпадает | — |
| E-mail | Не указан в карточке | Не публикуется (нет подтверждённого адреса) | Не добавлен | ✅ Без ложных данных | Владелец: сообщить рабочий e-mail, если нужно опубликовать |
| Rating / отзывы | Отзывов на карточке не видно в ограниченном виде | Не публикуются | `aggregateRating`/`review` НЕ добавлены | ✅ Соответствует правилам | — |

## Выводы

1. Ключевые NAP-поля (название, адрес, телефон, город, категория) на странице и в schema
   полностью совпадают с действующей карточкой Google.
2. Единственное критическое расхождение — поле **website** в карточке указывает на
   `canonical.uz`. После успешного deployment и smoke-теста владелец должен обновить его на
   `https://gptbot.uz/boss-digital/` через официальный интерфейс Google Business Profile.
3. Часы работы подтверждены частично (чт 10:00–19:00, открытие в пт 10:00). На странице график
   указан со ссылкой на карточку; в JSON-LD `openingHours` сознательно не добавлен, чтобы не
   публиковать неподтверждённые данные.
4. ПИНФЛ, паспортные данные, личные адреса, e-mail без подтверждения — не публикуются.
