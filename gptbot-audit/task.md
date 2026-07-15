# Полный фикс + E-E-A-T (топ-3)

## DONE
- [x] 12 коротких meta description (<120) → 120-160. Все в норме. 0 коротких осталось.
- [x] img без alt: проверено. Единственный — facebook-пиксель alt="" (корректно, декоративный). Реальной проблемы нет.

## IN PROGRESS — E-E-A-T страницы (6 шт, RU+UZ)
- [ ] /ru/o-kompanii/ + /uz/biz-haqimizda/  (About, schema AboutPage+Organization)
- [ ] /ru/komanda/ + /uz/jamoa/  (Author/Team, schema ProfilePage+Person)
- [ ] /ru/politika-konfidentsialnosti/ + /uz/maxfiylik-siyosati/ (Privacy, noindex? → нет, index follow)
- [ ] Привязать footer: t.footer.privacy href="#" → реальный URL; добавить ссылки About/Команда
- [ ] yarn build:fast → 0 битых, страницы в dist
- [ ] commit/push/PR/merge → CF deploy → прод-проверка → IndexNow

## ФАКТЫ (из content/global/site.json)
- GPTBot.uz, студия из Ташкента, RU+UZ, Telegram @XGame_changerx, github braindiggeruz
- pageType info, schemaTypes без Service
- prerender читает content/pages/**/*.json, money-страницы чисто статичные (React bundle не грузится)
