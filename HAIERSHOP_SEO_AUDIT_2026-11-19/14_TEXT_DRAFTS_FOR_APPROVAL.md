# 14 — Черновики текстов для утверждения (до публикации на сайте)

**Дата:** 20.11.2026.
**Статус:** НЕ опубликовано. Публикую только после вашего «да» по каждому блоку (можно «да на всё»).
**Принципы:**
- существующие тексты не переписываю, только **добавляю** или точечно исправляю факты;
- URL, заголовки страниц (title) и H1 не трогаю;
- в текстах нет обещаний, которых нет в ваших данных. Доставка — по вашим словам: Ташкент бесплатно за 24 часа, регионы платно до 72 часов.

UZ-тексты лучше дать прочитать носителю языка. Если что-то звучит неестественно, поправьте прямо в ответе.

**Уровень защиты и риск каждого блока** (уровни — из `11_BASELINE_URL_INVENTORY.csv`):

| Блок | Страницы | Уровень | Риск |
|---|---|---|---|
| 1 | `/ru/pravila-vozvrata-tovarov`, `/uz/qaytarish-siyosati` | T4 | GREEN: исправление фактов |
| 2a | `/uz/sovutgichlar` | T3 | GREEN: добавление текста |
| 2b | `/uz/muzlatgichlar` | T2 | YELLOW: ссылка уведёт часть посетителей на холодильники; это и есть цель |
| 3 | `/ru/otopitelnoe-oborudovanie` | **T1** | GREEN по типу (только добавление). Но это страница T1 в пик сезона, поэтому правка станет **единственной** на этой странице на 28 дней |
| 4 | 4 категории без текста | T3 | GREEN: текст там, где его нет |

---

## Блок 1. Страница возврата — точечная правка фактов (RU и UZ)
**Страницы:** `/ru/pravila-vozvrata-tovarov`, `/uz/qaytarish-siyosati`. Меняются только два блока; остальной текст остаётся как есть.

### 1a. Срок возврата: 7 → 14 дней
| Где | Было | Станет |
|---|---|---|
| RU, «Сроки возврата и обмена» | «вернуть или обменять товар можно в течение **7 дней** с момента получения» | «… в течение **14 дней** с момента получения» |
| RU, там же | «После истечения **7‑дневного** периода…» | «После истечения **14‑дневного** периода…» |
| UZ, «Qaytarish va almashtirish muddatlari» | «… **7 kun** ichida qaytarish yoki almashtirishingiz mumkin» | «… **14 kun** ichida …» |
| UZ, там же | «**7 kunlik** muddat tugagandan so'ng…» | «**14 kunlik** muddat …» |

### 1b. Стоимость обратной доставки — бесплатно
**RU, «Стоимость возврата и обратная доставка»**
- **Было:** «Если причиной возврата является производственный брак или повреждение при доставке, мы компенсируем стоимость обратной доставки. В иных случаях обратную доставку оплачивает покупатель. Товар следует отправлять на адрес, который предоставит наш менеджер, с указанием номера заказа и причины возврата.»
- **Станет:** «**Обратная доставка при возврате — бесплатно**: её стоимость мы берём на себя. Товар следует отправлять на адрес, который предоставит наш менеджер, с указанием номера заказа и причины возврата.»

**UZ, «Qaytarish narxi va teskari yetkazib berish»**
- **Станет:** «**Qaytarishda teskari yetkazib berish bepul** — uning xarajatlarini o'zimiz qoplaymiz. Tovarni menejerimiz taqdim etadigan manzilga, buyurtma raqami va qaytarish sababini ko'rsatib jo'natish kerak.»

**Два вопроса, от которых зависит итоговый текст:**
1. 14 дней бесплатно — для **любого** возврата, в том числе «товар не подошёл»? Сейчас в блоке «Когда возможен возврат» написано, что без дефекта возврат «только в рамках законодательства, уточните у менеджера». Если ответ «да», я поправлю и этот блок.
2. Как проходит возврат: **курьер забирает** у клиента или клиент **сам привозит**? Если курьер забирает, фразу «отправлять на адрес, который предоставит менеджер» заменю на «наш курьер заберёт товар».

---

## Блок 2. UZ «muzlatgich» → холодильники (HS-05)
Узбекоязычные покупатели ищут холодильник словом «muzlatgich» (~1 300 запросов в месяц против 390 у «sovutgich»). Сейчас Google ведёт их на раздел морозильников.

### 2a. `/uz/sovutgichlar` — добавить абзац **в начало** описания (существующий текст остаётся)
> **Sovutgich yoki muzlatgich?** Ko'pchilik xaridorlar oziq-ovqat saqlanadigan xolodilnikni «muzlatgich» deb ham ataydi. Haier sovutgichlari (muzlatgichlari) aynan shu bo'limda jamlangan — rasmiy kafolat va Toshkent bo'ylab 24 soat ichida bepul yetkazib berish bilan.

### 2b. `/uz/muzlatgichlar` — добавить абзац-ссылку **в начало** описания
> **Sovutgich (xolodilnik) qidiryapsizmi?** Oziq-ovqatni saqlash uchun Haier sovutgichlari — [«Sovutgichlar» bo'limida](/uz/sovutgichlar). Bu bo'limda esa mahsulotlarni muzlatish va uzoq saqlash uchun muzlatish texnikasi jamlangan.

---

## Блок 3. Раздел «Двухконтурные газовые котлы Haier» на `/ru/otopitelnoe-oborudovanie`
Это добавление **в конец** описания категории; существующий текст не меняется. На странице сейчас нет ни одного упоминания слова «двухконтурный», хотя запросы «двухконтурный котёл» дают ~4 560 показов за 3 месяца на позиции около 8. Все цифры взяты из карточек товаров сайта.

**Почему именно эта страница.** По Search Console 98% показов по запросам со словом «двухконтурный» уже приходятся на эту категорию. Раздел добавляется туда, где Google её и так показывает.

**Осторожность.** Страница уровня T1: 1 412 кликов за 12 месяцев, сейчас пик сезона.
- Это будет её единственная правка на 28 дней.
- **Проверка эффекта** через 14 и 28 дней:
  - показы и позиция по «двухконтурный»;
  - клики страницы против того же окна прошлого года.
- **Откат:** удалить добавленный раздел.

**Когда публиковать.** В дорожной карте этот шаг стоял с 07.12, после запуска мониторинга. Предлагаю не ждать: отопительный сезон уже идёт, а добавление раздела — самый безопасный вид правки. Если хотите строго по плану, опубликую 07.12.

> ## Двухконтурные газовые котлы Haier
> Двухконтурный котёл одновременно отапливает дом и нагревает воду для кухни и душа (ГВС), поэтому отдельный бойлер не нужен. Двухконтурные настенные модели Haier в нашем каталоге:
> - [Haier Urban S 2.14](/ru/otopitelnoe-oborudovanie/nastennyy-gazovyy-kotyol-haier-urban-s-214) — 3.9–14.0 кВт, площадь отопления до 140 м²
> - [Haier Urban S 2.18](/ru/otopitelnoe-oborudovanie/nastennyy-gazovyy-kotyol-haier-urban-s-218) — 3.9–18.4 кВт, до 180 м²
> - [Haier ProLine S 2.18](/ru/otopitelnoe-oborudovanie/nastennyy-gazovyy-kotyol-haier-proline-s-218) — 3.9–18.4 кВт, до 180 м², ГВС 10.5 л/мин
> - [Haier Urban S 2.24](/ru/otopitelnoe-oborudovanie/nastennyy-gazovyy-kotyol-haier-urban-s-224) — 3.4–23.9 кВт, до 240 м²
> - [Haier ProLine S 2.24](/ru/otopitelnoe-oborudovanie/nastennyy-gazovyy-kotyol-haier-proline-s-224) — 3.4–23.9 кВт, до 240 м², ГВС 13.7 л/мин
> - [Haier ProLine S 2.32](/ru/otopitelnoe-oborudovanie/nastennyy-gazovyy-kotyol-haier-proline-s-232) — 3.4–32.0 кВт, до 300 м², ГВС 18.5 л/мин
> - [Haier ProLine S 2.35](/ru/otopitelnoe-oborudovanie/nastennyy-gazovyy-kotyol-haier-proline-s-235) — 3.9–35.0 кВт, до 350 м², ГВС до 22 л/мин
>
> **Как выбрать мощность:** ориентируйтесь на площадь дома и число точек горячей воды, которыми пользуются одновременно. Точный подбор с учётом утепления и высоты потолков сделают наши специалисты — позвоните или напишите в Telegram. Доставка по Ташкенту бесплатно в течение 24 часов, в регионы — до 72 часов.

---

## Блок 4. Описания категорий, у которых текста нет совсем (HS-12)
Категории с товарами, где сейчас 0 слов. Пустые категории (микроволновки, духовки, морозильные шкафы, витринные холодильники) пропускаю: пока разработчик не поправит шаблон (ТЗ, задача B6), описание там не выводится.

### 4a. `/ru/vstraivaemaya-tekhnika/vytyazhki`
> Кухонная вытяжка убирает дым, пар, запахи и жир во время готовки и защищает мебель и стены от налёта. В этом разделе — вытяжки Haier с официальной гарантией.
>
> **Как выбрать вытяжку:**
> - **Ширина** — не меньше ширины варочной панели.
> - **Производительность** (м³/ч) — чем больше кухня и чем чаще вы готовите, тем выше она должна быть.
> - **Режим работы** — отвод воздуха в вентиляцию или рециркуляция с угольным фильтром, если воздуховод вывести нельзя.
> - **Уровень шума** и тип управления.
>
> Доставка по Ташкенту бесплатно в течение 24 часов, в регионы Узбекистана — до 72 часов (платно). Поможем подобрать вытяжку под вашу [варочную панель](/ru/vstraivaemaya-tekhnika/varochnye-paneli) — звоните или пишите в Telegram.

### 4b. `/uz/ornatilgan-tehnika/dudboronlar`
> Oshxona dudbo'roni (vityajka) ovqat pishirish paytida tutun, bug', hid va yog' zarralarini so'rib oladi, mebel va devorlarni dog'lardan himoya qiladi. Bu bo'limda rasmiy kafolatli Haier dudbo'ronlari jamlangan.
>
> **Dudbo'ronni qanday tanlash kerak:**
> - **Kengligi** — pishirish panelining kengligidan kam bo'lmasligi kerak.
> - **Unumdorligi** (m³/soat) — oshxona qanchalik katta bo'lsa va qanchalik tez-tez ovqat pishirsangiz, shunchalik yuqori bo'lishi kerak.
> - **Ishlash rejimi** — havoni ventilyatsiyaga chiqarish yoki havo yo'lini chiqarib bo'lmasa, ko'mir filtrli resirkulyatsiya.
> - **Shovqin darajasi** va boshqaruv turi.
>
> Toshkent bo'ylab 24 soat ichida bepul yetkazib berish, O'zbekiston viloyatlariga — 72 soatgacha (pullik). Dudbo'ronni [pishirish panelingizga](/uz/ornatilgan-tehnika/plitalar) mos tanlashda yordam beramiz — qo'ng'iroq qiling yoki Telegramga yozing.

### 4c. `/ru/morozilniki/morozilnye-lari`
> Морозильный ларь — горизонтальная морозильная камера с откидной крышкой. Он вмещает больше продуктов, чем морозильное отделение холодильника, и подходит для дома, дачи, магазина или кафе.
>
> **На что обратить внимание:**
> - **Объём** — выбирайте с запасом под ваши потребности.
> - **Климатический класс** — для жаркого лета важна стабильная работа при высокой температуре в помещении.
> - **Энергопотребление**, наличие корзин и замка на крышке.
>
> Доставка по Ташкенту бесплатно в течение 24 часов, в регионы — до 72 часов (платно). Официальная гарантия Haier. Если вам нужен холодильник, смотрите [холодильники Haier](/ru/kholodilniki).

### 4d. `/uz/muzlatgichlar/muzlatish-qutisi`
> Muzlatish qutisi (sandiqli muzlatgich) — ochiladigan qopqoqli gorizontal muzlatish kamerasi. U sovutgichning muzlatish bo'limiga qaraganda ko'proq mahsulot sig'diradi va uy, dacha, do'kon yoki kafe uchun mos keladi.
>
> **Nimalarga e'tibor berish kerak:**
> - **Hajmi** — ehtiyojingizga zaxira bilan tanlang.
> - **Iqlim sinfi** — issiq yozda xona harorati yuqori bo'lganda barqaror ishlashi muhim.
> - **Energiya iste'moli**, savatlar va qopqoq qulfi borligi.
>
> Toshkent bo'ylab 24 soat ichida bepul yetkazib berish, viloyatlarga — 72 soatgacha (pullik). Haier rasmiy kafolati. Sovutgich kerak bo'lsa, [Haier sovutgichlarini](/uz/sovutgichlar) ko'ring.

---

## Как я опубликую после вашего «да»
Так же, как и 26 уже сделанных правок:
1. копия «до»;
2. правка одного поля;
3. проверка, что адрес не изменился и вторая языковая версия не тронута;
4. журнал изменений.

Откат любой правки — за минуту.
