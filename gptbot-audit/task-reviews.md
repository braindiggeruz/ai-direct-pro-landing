# Reviews page (/reviews) — task

Ветка: feat/reviews-page

## Решения
- БЕЗ AggregateRating schema (self-serving = бан-риск Google). Звёзды только как текст ★★★★★.
- schema: Organization, WebSite, BreadcrumbList, FAQPage
- 12 кейсов, имя + ниша + бот(TG/IG/WA) + дата. Анонимно-реалистично, без лже-цифр/лже-точных данных.
- RU /ru/otzyvy/ ↔ UZ /uz/sharhlar/ (hreflang пара)

## Шаги
- [x] ветка
- [ ] ru/otzyvy.json
- [ ] uz/sharhlar.json
- [ ] Footer.tsx: добавить ссылку Отзывы/Sharhlar в Resources
- [ ] валидация JSON + internalLinks по /tmp/all_urls.txt
- [ ] yarn build:fast → проверить dist + 0 битых
- [ ] commit → push → PR → squash merge
- [ ] CF deploy → curl 200
- [ ] IndexNow пинг 2 URL
- [ ] memory update
