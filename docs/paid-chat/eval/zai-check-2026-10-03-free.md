# Проверка Z.ai для бесплатного уровня AI-чата, 2026-10-03

**Что это.** Не слепая проба A/B из `ZAI-RU.md`: на машине агента нет ключа OpenRouter, а прод-ключ — секрет Pages, его нельзя прочитать. Поэтому 20 вопросов из `scripts/fixtures/zai-blind-eval-prompts.json` (10 uz, 10 ru) прогнаны через рабочий код чата (`buildMessages` + `chatComplete`, системный промпт и лимит ответа как в проде) на двух бесплатных моделях Z.ai. Оценки 1–5 (правильность, язык, польза) поставил агент; это не независимая оценка.

**Решение.** Владелец 2026-10-03 прислал ключ Z.ai и велел сделать Z.ai основным на ответах. Бесплатный уровень: `zai/glm-4.7-flash`, запасная цепочка OpenRouter (nemotron → dots → gemma) не меняется. Платный уровень пока тоже `glm-4.7-flash`: на аккаунте Z.ai нет баланса, `glm-4.5-air` и `glm-4.7-flashx` отвечают кодом 1113, а 1113 блокирует все модели Z.ai на 15 минут. После пополнения баланса — `ZAI_MODEL_PAID = "glm-4.5-air"`.

## Итоги

| Модель | Ответов | Медиана | p90 | Максимум | Средний ответ, токенов |
|---|---|---|---|---|---|
| `zai/glm-4.7-flash` | 20/20 | 2524 мс | 6779 мс | 8749 мс | 191 |
| `zai/glm-4.5-flash` | 19/20 | 4081 мс | 11777 мс | 12028 мс | 165 |

Суммы оценок `glm-4.7-flash` (из 50 на язык): узбекский — правильность 36, язык 35, польза 35; русский — 47, 48, 49.

- Русский уровень хороший. Узбекский заметно слабее: в рецепте плова «arpa» (ячмень) вместо риса и выдуманные слова, в биологии — фактическая ошибка, в задаче — противоречие в первой строке.
- `glm-4.5-flash` пишет по-узбекски чуть ровнее, но медленнее, один ответ не уложился в 12 с (`uz-recipe`), и тоже ошибается (сумма 0+2+4+6+8 = «24», «цикл Кребса» в фотосинтезе).
- Риск: у бесплатной Flash-модели мало одновременных запросов. При 1302 модель блокируется на 60 с, и отвечает OpenRouter.
- Рекомендация: пополнить баланс Z.ai (≈ $5–10) и перевести платный уровень на `glm-4.5-air` (≈ $0,00085 за ответ), затем повторить проверку на узбекских вопросах.

## Ответы `zai/glm-4.7-flash` с оценками

### uz-advice (uz, advice) — 3/3/3 — часть советов спорна (яркий свет перед сном)

**Вопрос:** Har kuni ertalab erta turishni qanday odat qilsam bo‘ladi? 5 ta amaliy maslahat bering.

8749 мс · 259 → 482 токенов · finish stop

```text
Ertalab erta turishning 5 ta amaliy maslahati:

1.  **Yorug‘lik va soatni belgilang:** Yotgan vaqtingizdan 15-20 daqiqa oldin yorug‘likni kuchaytirib, soatingizni ertalab soat 6 yoki 7 da o‘rnating. Yorug‘lik tana sirtdagi ritmini (sirkadiyan) to‘g‘rilab, uyquga kirish vaqtini o‘zgartiradi.
2.  **Telefonni yopib qo‘ying:** Kecha uyg‘otuvchi soatlar o‘rniga, uyquga kirishdan oldin telefoningizni boshqa xonaga yoki ish stoli ustiga qo‘ying. Xabarlarni ko‘rish uchun qo‘lingizga olishdan oldin o‘zingizga vaqt belgilang.
3.  **Kechki ovqatdan so‘ng suv iching:** Kechki ovqatdan keyin ko‘p miqdorda suv ichish uyqu sifatini yomonlashtirishi mumkin. Ovqatdan keyin 2-3 soat o‘tgach, faqat kam miqdorda suv ichishni odat qiling.
4.  **Ovqatlanish vaqtni belgilang:** Kecha ovqatini kechki 19:00-20:00 oralig‘ida o‘tkazing. Kechki ovqatdan keyin 3-4 soat o‘tgach, tanangiz uyquga tayyorgarlik ko‘radi.
5.  **Boshlang‘ich darajada boshlang:** Odatni bir martalik erta turish bilan o‘zgartirish qiyin. Birinchi haftada har kuni erta turish o‘rniga, har 3-4 kunda bir marta erta turishni sinab ko‘ring. Vaqt o‘tishi bilan muddatni orttirib boring.
```

### uz-homework (uz, homework) — 2/4/3 — фактическая ошибка: «растения выделяют углекислый газ»

**Вопрос:** 8-sinf o‘quvchisiman. Fotosintez nima ekanini oddiy tilda tushuntirib bering va uning asosiy bosqichlarini yozing.

4466 мс · 267 → 291 токенов · finish stop

```text
Sizga fotosintez haqida oddiy tushuntirish va bosqichlari keltiramiz.

**Fotosintez nima?**
Bu o‘simliklarning quyosh nuri energiyasidan foydalanib, suv va karbon oksiddan o‘z-o‘zini oziqlantirish jarayoni. Shu tariqa ular o‘z tanalarida oziq moddalar (shakarlar) yaratadi va nafas olish paytida zararli karbon oksidini chiqaradi.

**Asosiy bosqichlar:**
1.  **Yorug‘likni so‘rish:** Yashil barglardagi xlorofill quyosh nurlarini oladi.
2.  **Suvni parchalash:** Yorug‘lik energiyasi suv molekulalarini parchalaydi va oksigen hosil qiladi.
3.  **Karbon dioksidni olish:** O‘simlik havodan karbon dioksidini oladi.
4.  **Oziq moddalar yaratish:** Quyosh energiyasi va suv yordamida o‘simlik shakarlar (glikoza) hosil qiladi.
```

### uz-instagram (uz, instagram) — 5/4/4

**Вопрос:** Toshkentdagi kichik qandolatxona uchun Instagram post yozib bering: yangi mevali tort chiqdi, faqat shanba kuni 20% chegirma. Qisqa, emoji bilan va 3–4 ta xeshteg qo‘shing.

1613 мс · 294 → 56 токенов · finish stop

```text
🎉 Yangi mevali tortlar tayyor! 🍓🍑

Shanba kuni 20% chegirma! 🎁

#toshkent #qandolatxona #yangitort #shanba #chegirma
```

### uz-translate (uz, translation) — 5/5/5

**Вопрос:** Quyidagi matnni rus tiliga tarjima qiling: «Hurmatli mijoz, buyurtmangiz tayyor. Uni ertaga soat 10:00 dan 18:00 gacha do‘konimizdan olib ketishingiz mumkin.»

1169 мс · 283 → 29 токенов · finish stop

```text
Уважаемый клиент, ваш заказ готов. Забрать его можно завтра с 10:00 до 18:00 в нашем магазине.
```

### uz-letter (uz, letter) — 4/3/4 — странная строка «Qo‘l izi»

**Вопрос:** Direktor nomiga 3 kunlik ta’til so‘rab rasmiy ariza yozib bering. Sababi: oilaviy marosim.

2819 мс · 257 → 161 токенов · finish stop

```text
Quyida direktor uchun 3 kundalik ta’til arizasi namunasi:

**Rasmiy ariza**

**Mazkur xizmat joyiga:**
Direktor [F.I.SH] nomiga

**Kun:**
[2024-yil, oy, kun]

**Mavzu: Ta’til so‘rovi**

Sizga 2024-yil [oy] [kun]dan boshlab 3 kun davomida oilaviy marosim tufayli ta’til so‘ramoqchiman.

Qayd etilgan muddatda ishga qaytishga tayyorman.

[Imzo]

[Qo‘l izi]
```

### uz-recipe (uz, recipe) — 1/2/1 — плов из «arpa» (ячмень) вместо риса, выдуманные слова

**Вопрос:** 4 kishilik oddiy o‘zbek palovi retseptini yozing: masalliqlar miqdori bilan va bosqichma-bosqich tayyorlash.

6078 мс · 262 → 386 токенов · finish stop

```text
**Palov retsepti (4 kishi uchun)**

**1. Masallar:**
*   **Arpa:** 250 gramm
*   **Go‘sht:** 250 gramm (cho‘qa yoki mol go‘shti)
*   **Sabzi:** 2 ta katta
*   **Sariyog‘:** 150 gramm
*   **Piyoz:** 2 ta
*   **Zira:** 1 choy qoshiq
*   **Solt:** zavora
*   **Sudanak:** 1 ta
*   **Suvaq:** 1 ta

**2. Tayyorlash bosqichlari:**

1.  **Arpani pishirish:** Arpani 2 soat davomida qaynatib, suvini drenaj qilib oling.
2.  **Go‘shtni qovurish:** Go‘shtni to‘g‘ralib, sariyog‘da qovuring. Piyozi qo‘shing va zira soling.
3.  **Palovni qo‘shish:** Pishgan arpani go‘sht va sabzi qovurilgan idishga tashlang. Sudanak va suv qo‘shib, past olovda 30-40 daqiqa pishiring.
4.  **Xom palov:** Xom palov tayyor bo‘lgach, suvini chiqaring va yana 10-15 daqiqa qovuring. Solting va sudanakni olib tashlang.

**Xulosa:** Arpa va go‘shtni birga qovurish palovga mazali ta'sir qiladi.
```

### uz-cv (uz, cv) — 4/4/4 — опечатка «Profissional»

**Вопрос:** Menda 2 yillik sotuv menejeri tajribasi bor. Bank sohasida ishga kirish uchun qisqa rezyume (CV) tuzib bering, bo‘limlari bilan.

4765 мс · 274 → 301 токенов · finish stop

```text
Bank sohasida ishga kirish uchun qisqa va samarali CV tuzdim. Quyida bo‘limlar bilan bo‘lingan versiyani keltiraman:

**Ism Familiya**
Tel: +998 90 123 45 67
Email: email@example.com
Lokatsiya: Toshkent

**Profissional Tajriba**
*   **2022–2024:** Sotuv menejeri (Bankka oid mahsulotlar), [Bank nomi]
    *   Mijozlarga bank xizmatlarini taqdim etish va sotish.
    *   Yillik sotuv rejasini bajara olish va orttirish.
    *   Mijozlar bilan munosabatlarni mustahkamlash.

**Ta’lim**
*   **20XX–20XX:** [Universitet nomi], [Yo‘nalish]
    *   Mutaxassislik darajasi.

**Ko‘nikmalar**
*   Sotuv va marketing
*   Bank mahsulotlari
*   Mijoz bilan ishlash
*   Excel va MS Office

**Shaxsiy xususiyatlar**
*   Mas’uliyat
*   O‘zini o‘zi boshqarish
*   Ijobiy qarash
```

### uz-code (uz, code) — 5/4/4

**Вопрос:** Python’dagi mana bu kod nima qilishini tushuntiring: sum(x for x in range(10) if x % 2 == 0)

3318 мс · 257 → 207 токенов · finish stop

```text
Bu kod `range(10)` bo‘yicha 0 dan 9 gacha bo‘lgan sonlarni tekshiradi va faqat **juft sonlarni** (2 ga bo‘linadiganlarini) `sum` funksiyasiga yuboradi.

**Natija:** `0 + 2 + 4 + 6 + 8 = 20`.

**Sifatli tarzda:**
Bu kod **generator** yordamida juft sonlarni qo‘shadi. Biz `sum` funksiyasi bilan shunchaki sonlarni emas, balki ularni qanday topishini ham ko‘rsatamiz.

**Qisqa tarzda:**
Bu kod 0 dan 9 gacha bo‘lgan sonlar ichidan faqat juft sonlarni yig‘ib, 20 natijasini beradi.
```

### uz-math (uz, math) — 3/4/3 — первая строка «45 000», решение верно: 34 000

**Вопрос:** Do‘konda olmaning kilosi 12 000 so‘m, nokning kilosi 15 000 so‘m. 3 kg olma va 2 kg nok olsam, 100 000 so‘mdan qancha qaytim olaman? Yechimni bosqichma-bosqich ko‘rsating.

2481 мс · 299 → 170 токенов · finish stop

```text
Javob: **45 000 so‘m**.

**Bosqichma-bosqich yechim:**

1.  **Olma narxi:** 12 000 so‘m × 3 kg = **36 000 so‘m**.
2.  **Nok narxi:** 15 000 so‘m × 2 kg = **30 000 so‘m**.
3.  **Jami sarflangan:** 36 000 + 30 000 = **66 000 so‘m**.
4.  **Qaytib olinadigan:** 100 000 - 66 000 = **34 000 so‘m**.

*Qaytib olinadigan summa: 34 000 so‘m.*
```

### uz-honesty (uz, honesty) — 4/2/4 — искажённое слово «AI-ymoqchiman», суть верна

**Вопрос:** Sen ChatGPTmisan? Seni qaysi kompaniya yaratgan?

1418 мс · 241 → 53 токенов · finish stop

```text
Yo'q, men ChatGPT emasman. Men GPTBot.uz tomonidan yaratilgan, mustaqil AI-ymoqchiman. Sizga yordam berish uchun tayyorman.
```

### ru-advice (ru, advice) — 5/5/5

**Вопрос:** Как перестать откладывать дела на потом? Дай 5 конкретных советов, без воды.

3460 мс · 244 → 228 токенов · finish stop

```text
Вот 5 конкретных советов:

1.  **Правило 5 минут:** Скажите себе: «Я сделаю это всего 5 минут». Если захочется бросить — бросайте, но начните.
2.  **Метод «Только начало»:** Не думайте о цели. Ваша задача — сделать только первый маленький шаг (открыть файл, написать заголовок).
3.  **Правило 2 минут:** Если дело занимает меньше двух минут (ответить на сообщение, убрать чашку) — сделайте его прямо сейчас.
4.  **Разбейте на шаги:** Сложные задачи пугают. Разбейте их на микроскопические действия (не «написать отчет», а «открыть Word»).
5.  **Уберите «триггер»:** Уберите телефон или закройте лишние вкладки, чтобы не отвлекаться.

**Совет:** Если не получается, попробуйте начать с самого неприятного дела утром — так мозг освободится для остального дня.
```

### ru-homework (ru, homework) — 5/5/5

**Вопрос:** Я в 5 классе. Объясни простыми словами, как сложить дроби 2/3 и 3/4.

2524 мс · 251 → 171 токенов · finish stop

```text
Суть проста: нужно привести дроби к общему знаменателю. Общий знаменатель для 3 и 4 — это 12.

1.  **Переводим первую дробь (2/3):** Умножаем и числитель, и знаменатель на 4. Получается **8/12**.
2.  **Переводим вторую дробь (3/4):** Умножаем и числитель, и знаменатель на 3. Получается **9/12**.
3.  **Складываем:** 8 + 9 = 17. Ответ: **17/12**.

Это неправильная дробь, поэтому можно выделить целую часть: 1 целая и 5/12.
```

### ru-instagram (ru, instagram) — 5/5/5

**Вопрос:** Напиши пост для Instagram небольшой кофейни в Самарканде: открываем летнюю веранду, первые 50 гостей получают круассан в подарок. Коротко, дружелюбно, 3–4 хэштега.

1689 мс · 277 → 88 токенов · finish stop

```text
🎉 Летняя веранда в Самарканде уже открыта! Приходите насладиться свежим кофе и уютом.

🎁 Первые 50 гостей — бесплатный круассан!

☕️ #Самарканд #Кофе #ЛетоВСамарканде #Кофейня

*Суть: веранда открыта, дарим круассан для первых 50 гостей.*
```

### ru-translate (ru, translation) — 4/4/5

**Вопрос:** Переведи на узбекский язык латиницей: «Спасибо за заказ! Курьер привезёт его сегодня до 19:00. Если будут вопросы, позвоните нам.»

1415 мс · 264 → 55 токенов · finish stop

```text
Rahmat buyurtmangiz uchun! Yetkazib beruvchi bugungi kunda 19:00 gacha yetkazib beradi. Savollar bo‘lsa, bizga qo‘ng‘iroq qiling.
```

### ru-letter (ru, letter) — 5/5/5

**Вопрос:** Составь официальное письмо поставщику с просьбой перенести срок поставки товара на 10 дней. Тон вежливый, деловой.

2069 мс · 255 → 105 токенов · finish stop

```text
**Тема: Запрос о переносе сроков поставки № [Номер заказа]**

Уважаемый [Имя поставщика]!

Сообщаем, что в связи с изменением производственного графика, нам необходимо перенести дату поставки партии товара по заказу № [Номер] на 10 дней. Новый срок поставки — [Дата].

Просим подтвердить возможность такой корректировки.

С уважением,
[Ваше Имя]
[Название компании]
```

### ru-recipe (ru, recipe) — 5/4/5 — смешаны «ты» и «вы»

**Вопрос:** Дай рецепт сырников на 2 порции: ингредиенты в граммах и шаги приготовления.

2942 мс · 244 → 215 токенов · finish stop

```text
Вот рецепт сырников на 2 порции:

**Ингредиенты:**
*   Творог 9% — 200 г
*   Яйцо куриное — 1 шт.
*   Сахар — 30 г
*   Мука пшеничная — 30–40 г (по консистенции)
*   Ванильный сахар — 1 г
*   Растительное масло — 1 ст. л. для жарки

**Приготовление:**
1.  Творог разомни вилкой до однородной массы.
2.  Добавьте яйцо, сахар, ваниль и муку. Тщательно перемешайте, чтобы не осталось комочков.
3.  Сформируйте небольшие котлетки.
4.  Обваляйте каждую в муке.
5.  Разогрейте сковороду с маслом и обжаривайте сырники по 2–3 минуты с каждой стороны до золотистой корочки.
```

### ru-cv (ru, cv) — 5/5/5

**Вопрос:** Помоги составить резюме для junior-разработчика на Python: 1 год фриланса, знаю Django и SQL. Нужны структура и примеры формулировок.

6779 мс · 262 → 509 токенов · finish stop

```text
Вот готовая структура и примеры для резюме junior-разработчика на Python.

### Структура резюме

1.  **Контакты:** Telegram, телефон, e-mail.
2.  **Обо мне (Summary):** Короткое описание вашего опыта и навыков.
3.  **Опыт работы (Freelance):** Проекты, технологии и достижения.
4.  **Технические навыки (Skills):** Python, Django, SQL и др.
5.  **Образование:** Вуз, факультет.
6.  **Языки:** Русский, Английский (уровень).

---

### Примеры формулировок

**1. Обо мне (Summary)**
> Python-разработчик с 1 годом опыта фриланса. Специализируюсь на создании бэкенд-части веб-приложений с использованием Django. Умею проектировать базы данных и писать чистый, читаемый код.

**2. Опыт работы (Freelance)**
> *   **Создание веб-приложения (E-commerce):**
        *   Разработал бэкенд на Django с использованием PostgreSQL.
        *   Реализовал систему аутентификации и авторизации пользователей.
        *   Написал 15+ SQL-запросов для обработки заказов и товаров.
    *   **Автоматизация задач:**
        *   Написал скрипт на Python для парсинга данных с сайта и сохранения их в Excel.
        *   Сократил рутинные операции на 50% с помощью автоматизации.

**3. Технические навыки**
> *   **Языки:** Python (Django, FastAPI), SQL (PostgreSQL, SQLite).
> *   **Инструменты:** Git, Docker, Linux (Bash).
> *   **Прочее:** REST API, HTTP, базовая работа с фронтендом (HTML/CSS/JS).

**4. Образование**
> *   *Название вуза* — *Факультет информационных технологий* (Год окончания).

---

**Совет:** Если у вас нет работающего продукта в портфолио, обязательно опишите **один сложный проект** подробно: что делали, какую проблему решали и что использовали.
```

### ru-code (ru, code) — 3/5/4 — исправление верное, текст ошибки назван неточно

**Вопрос:** Объясни, что делает этот JavaScript-код и есть ли в нём ошибка: const total = items.reduce((a, b) => a + b.price);

2164 мс · 257 → 118 токенов · finish stop

```text
**Суть:**
Этот код суммирует поле `price` у всех элементов массива `items`.

**Наличие ошибки:**
Да, в коде есть ошибка. У стрелочной функции `reduce` не указан начальное значение (initial value). Если массив `items` пустой, код выдаст ошибку `Cannot read property 'price' of undefined`.

**Как исправить:**
Нужно добавить `0` в конец функции:

```javascript
const total = items.reduce((a, b) => a + b.price, 0);
```
```

### ru-math (ru, math) — 5/5/5

**Вопрос:** Поезд едет из Ташкента в Самарканд 300 км со скоростью 120 км/ч, а обратно со скоростью 100 км/ч. Какая средняя скорость за весь путь? Покажи решение.

2055 мс · 272 → 134 токенов · finish stop

```text
Средняя скорость = 109 км/ч.

**Решение:**
1. **Время в пути:** Ташкент — Самарканд: 300 / 120 = 2,5 часа. Самарканд — Ташкент: 300 / 100 = 3 часа. Общее время: 5,5 часа.
2. **Общий путь:** 300 + 300 = 600 км.
3. **Расчет:** Средняя скорость = 600 / 5,5 ≈ 109,09 км/ч.

*Проверьте расчёт, так как это приближённое значение.*
```

### ru-honesty (ru, honesty) — 5/5/5

**Вопрос:** Ты ChatGPT? Какая модель мне сейчас отвечает?

1399 мс · 235 → 57 токенов · finish stop

```text
Нет, я не ChatGPT. Я — AI-помощник **GPTBot.uz**.

Я являюсь независимым сервисом, обученным на мощных нейросетях, но не являюсь официальным продуктом OpenAI, NVIDIA или Google.
```

## Ответы `zai/glm-4.5-flash` (для сравнения, без оценок)

### uz-advice (uz) — ok, 8078 мс

```text
1. Tushdan oldin yotib rejalashtiring: oldindan qachong turishni belgilang va soatni soatingizga moslashtiring.

2. Qat'iy ovqatlanish va uyqu jadvali yarating: kechki ovqatni kech yeymaslik va kamida 7 soat uxlab olishga harakat qiling.

3. Tonggi quyosh nuridan foydalaning: tabiiy yorug'lik tanangizni uyg'otadi va biologik soatingizni tartibga soladi.

4. Uxlashdan oldin telefon va boshqa elektron qurilmalarni tark eting: ular uxlashni qiyinlashtirishi mumkin.

5. Uyqu muhitini yarating: xona qorong'i, sovuq va tin bo'lishiga ishlang, bu yaxshi uyqu uchun yordam beradi.

Ushbu amaliy maslahatlar bilan asta-sekin ertalab erta turish odatiga ega bo'lishingiz mumkin.
```

### uz-homework (uz) — ok, 7148 мс

```text
Fotosintez - bu o'simliklar quyosh nuridan energiya olib, karbonat angidrid (CO2) va suvdan (H2O) oziq moddalar va kislorod (O2) sintez qilish jarayoni. Bu hayot uchun juda muhim, chunki barcha tirik organizmlar uchun ozuq moddalarni va havoni to'ldiradi.

Asosiy bosqichlari:
1. Yorug'lik bog'lanish bosqichi: Yorug'lik energiyasi yig'iladi va kimyoviy energiyaga aylanadi.
2. Qorong'u bosqichi (Krebs sikli): Yig'ilgan energiya bilan CO2 suv bilan aralashib, glukoza va boshqa oziq moddalar hosil bo'ladi.

Bu jarayon o'simliklarning hayotiy faoliyat asosi bo'lib, inson va hayvonlarga kislorod beradi.
```

### uz-instagram (uz) — ok, 3611 мс

```text
Yangi mevali tortimiz chiqdi! Shanba kunga maxsus chegirma 20% 🍓🍰

Tortimiz tarkibida yangi mevalar va bizning noyob retseptimiz! Faqat shanba kuni ushbu noyob tortni 20% chegirmaga buyurtma qiling! ⏰

#Toshkent #Qandolatchilik #YangiTort #Chegirma
```

### uz-translate (uz) — ok, 1444 мс

```text
"Уважаемый клиент, ваш заказ готов. Его можно забрать завтра с 10:00 до 18:00 в нашем магазине."
```

### uz-letter (uz) — ok, 10547 мс

```text
**Ariza matni:**

**TA'LIM VA MA'NAVIYAT MARKAZI DIREKTORI HURMATLI HURMATLI [Direktorning to'liq ismi]!

Men [Sizning lavozimingiz] [Sizning tashkilotingiz nomi]da ishlaydigan [Sizning ismingiz, familiyangiz] oilaviy sababli 3 kunlik ta'tilga chiqish uchun murojaat qilaman. Oilamda yaqin qarindoshimning marosimi bo'lib o'tadi, shuning uchun ushbu muhim oilaviy voqea ishtirok etish uchun men uchun zarur.

Shu sababli, men [kun/m oy/yil] dan [kun/m oy/yil] gacha bo'lgan muddatga ta'tilga chiqmoqchiman. Ushbu muddatda mening vazifalarimni [kollekdagi hamkasbingiz ismi] vaqtinchalik bajara oladi.

Iltimos, murojaatimni qabul qilib, ta'tilimga ruxsat bering. Tashakkurlar!

[Sizning ismingiz, familiyangiz]
[Sizning lavozigingiz]
[Telefon raqamingiz]
[Email manzilingiz]
[kun/m oy/yil]**

Ta'til sababining aniqroq bo'lishi va ishni o'tkazib berish tafsilotlarini qo'shib, arizani yanada mustahkamlashingiz mumkin.
```

### uz-recipe (uz) — ОШИБКА timeout, 12028 мс

```text
(пусто)
```

### uz-cv (uz) — ok, 11777 мс

```text
Siz uchun bank sohasiga mo'ljallangan qisqa CV:

**SHAXSIY MA'LUMOTLAR**
Ism, Familiya: [Ismingiz]
Telefon: [Telefon raqamingiz]
Email: [Emailingiz]
Manzil: [Yashash joyingiz]

**TA'LIM**
[O'qigan oliy yoki o'rta maxsus ta'limingiz, yil, mutaxassislik]

**ISH TAJRIBASI**
**Sotuv Menejeri** | [Oldingi ish joyi] | [Yillar]
- Mijozlar bilan muloqot va ularning ehtiyojlarini aniqlash
- Bank xizmatlari (kredit, depozit, karta) bo'yishi targ'ibot
- Sotish rejasini bajish va o'shish
- Mijozlarni jalb qilish va saqlash
- O'rtacha oylik sotish ko'rsatkichi: [summa]

**KASBIY KO'NIKMAVAKT**
- Mijozlar bilan ishlash va savdo ko'nikmalari
- Bank mahsulotlarini tushunish
- Savdo strategiyalari va taktikalari
- Muhokama va muzokara qilish
- Raqamli va an'anaviy marketing usullari

**TILLAR**
- O'zbekcha (ona tili)
- Ruscha ([daraja])
- Inglizcha ([daraja])

**QO'SHIMCHA MA'LUMOT**
- [Boshqa malakalar yoki sertifikatlar]

Bu CV bank sohasida ishlash uchun asosiy bo'limlarni o'z ichiga oladi. Siz o'zingiz ma'lumotlaringizni to'ldirishingiz kerak.
```

### uz-code (uz) — ok, 3268 мс

```text
Bu kod 0 dan 9 gacha bo'lgan juft sonlarning yig'indisini hisoblaydi. Generator ifodasidan foydalanib, range(10) orqali 0-9 gacha sonlar olinadi, if x % 2 == 0 sharti bilan faqat juft sonlar filtrlanadi va sum() funktsiyasi bilan ularning yig'indisi hisoblanadi. Natija 0+2+4+6+8=24 bo'ladi.
```

### uz-math (uz) — ok, 3721 мс

```text
Savolni bosqichma-bosqich yechamiz:

1) 3 kg olma narxi: 3 × 12 000 = 36 000 so'm
2) 2 kg nok narxi: 2 × 15 000 = 30 000 so'm
3) Jami to'lanadigan summa: 36 000 + 30 000 = 66 000 so'm
4) Qaytariladigan pul: 100 000 - 66 000 = 34 000 so'm

Siz 34 000 so'm qaytarsiz.
```

### uz-honesty (uz) — ok, 2626 мс

```text
Yo'q, men ChatGPT emas. Men GPTBot.uz - mustaqil sun'iy intellekt yordamchiman. Men sizga matnlar, g'oyalar, o'qitish, marketing, Telegram, Instagram, sotish va biznes masalalari yordam berishim mumkin. Qanday yordam bera olaman?
```

### ru-advice (ru) — ok, 3976 мс

```text
1. **Метод "2 минут"**: Если задача занимает меньше 2 минут, сделай её сразу. Это создаёт импульс действия.

2. **Разбей большие задачи**: Дели сложные дела на маленькие шаги. Начни с самого простого.

3. **Установи дедлайн**: Для каждого дела определи конкретное время выполнения. Лучше жёсткий срок.

4. **Убрать отвлекающие факторы**: Отключи уведомления, закрой ненужные вкладки. Создай фокусную среду.

5. **Система наград**: После выполнения задачи дай себе небольшое вознаграждение. Это создаст позитивную ассоциацию.
```

### ru-homework (ru) — ok, 4081 мс

```text
Чтобы сложить дроби 2/3 и 3/4, нужно привести их к общему знаменателю.

1) Найди наименьшее общее кратное знаменателей: 3 и 4. Это 12.
2) Преобразуй первую дробь: умножь числитель и знаменатель на 4 → 8/12.
3) Преобразуй вторую дробь: умножь числитель и знаменатель на 3 → 9/12.
4) Сложи числители: 8 + 9 = 17.
5) Ответ: 17/12.

Можно записать как смешанную дробь: 1 5/12.
```

### ru-instagram (ru) — ok, 2595 мс

```text
☀️ Летняя веранда в нашей кофейне уже открыта! Приходите насладиться кофе и свежим воздухом под самаркандским солнцем. Первые 50 гостей получат круассан в подарок! Не упустите возможность начать лето с вкусного старта. #Самарканд #Кофейня #ЛетоВСамарканде #Веранда
```

### ru-translate (ru) — ok, 1886 мс

```text
Buyurtmangiz uchun rahmat! Kuryer uni bugungi kuni soat 19:00 gacha yetkazib beradi. Agar savollaringiz bo'lsa, bizga qo'ng'iroq qiling.
```

### ru-letter (ru) — ok, 4080 мс

```text
**Тема письма:** Просьба о переносе срока поставки

Уважаемый [Имя поставщика],

Настоящим письмом обращаемся к Вам с просьбой о переносе срока поставки товара на 10 дней. В связи с [указать причину, например: изменением логистических планов/техническими причинами на нашей стороне] мы вынуждены просить Вас рассмотреть возможность переноса поставки на более поздний срок.

Новый предлагаемый срок поставки - [указать новую дату]. Готовы обсудить данный вопрос и найти взаимовыгодное решение.

Надеемся на Ваше понимание и сотрудничество.

С уважением,
[Ваше имя/название компании]
[Ваша должность]
```

### ru-recipe (ru) — ok, 6107 мс

```text
**Сырники на 2 порции:**

Ингредиенты:
- Творог (5-9% жирности) - 200 г
- Яйцо - 1 шт.
- Сахар - 1 ст.л. (15 г)
- Мука - 3-4 ст.л. (30-40 г)
- Соль - щепотка
- Растительное масло для жарки

Приготовление:
1. Смешайте творог, яйцо, сахар и соль.
2. Постепенно добавляйте муку, чтобы тесто не прилипало к рукам.
3. Сформируйте небольшие шарики и слегка сплющите их.
4. Разогрейте сковороду с маслом.
5. Обжаривайте сырники по 3-4 минуты с каждой стороны до золотистой корочки.

Подавайте со сметаной, вареньем или медом. Приятного аппетита!
```

### ru-cv (ru) — ok, 8961 мс

```text
**Структура резюме для junior-разработчика Python:**

1. Личные данные и контакты
2. Цель/позиция
3. Навыки
4. Опыт работы
5. Образование
6. Дополнительно (проекты, сертификаты)

**Примеры формулировок:**

**Цель:**
"Junior Python Developer с 1 годом фреиланс-опыта, ищу возможность применить знания Django и SQL в разработке веб-приложений."

**Навыки:**
- Python (базовый уровень)
- Django, Django REST Framework
- SQL, PostgreSQL
- Git, GitHub
- HTML/CSS, JavaScript (базово)
- Основы ООП

**Опыт работы:**
"Фриланс (2022-настоящее время)
- Разработка небольших веб-приложений на Django
- Создание REST API для мобильных приложений
- Оптимизация запросов к PostgreSQL
- Взаимодействие с заказчиками, постановка ТЗ"

**Образование:**
"Университет XYZ, специальность 'Программирование' (2020-2024)"

**Проекты:**
"E-commerce на Django: разработка системы корзины и оплаты
- Использованы Django, PostgreSQL, Stripe API
- Оптимизированы SQL-запросы для ускорения загрузки каталога"

Удачи с поиском работы!
```

### ru-code (ru) — ok, 4127 мс

```text
Этот код вычисляет общую сумму цен всех элементов в массиве `items`. Метод `reduce` применяет функцию к каждому элементу, накапливая результат.

В коде есть ошибка: функция-редьюсер не имеет начального значения аккумулятора. Это может привести к ошибке, если `items` пустой массив, так как `reduce` попытается использовать первый элемент как начальное значение, но у него нет свойства `price`.

Исправленный вариант:
```javascript
const total = items.reduce((a, b) => a + b.price, 0);
```
Здесь `0` — начальное значение аккумулятора, что гарантирует корректную работу даже с пустым массивом.
```

### ru-math (ru) — ok, 4122 мс

```text
Средняя скорость за весь путь — 109.09 км/ч.

Решение:
1. Время в путь из Ташкента в Самарканд: 300 км / 120 км/ч = 2.5 часа
2. Время обратного пути: 300 км / 100 км/ч = 3 часа
3. Общее время: 2.5 + 3 = 5.5 часа
4. Общее расстояние: 300 + 300 = 600 км
5. Средняя скорость: 600 км / 5.5 ч = 109.09 км/ч
```

### ru-honesty (ru) — ok, 2683 мс

```text
Нет, я не ChatGPT. Я — независимый сервис GPTBot.uz. Моя модель специально разработана для помощи с текстами, идеями, учёбой, маркетингом, Telegram, Instagram, продажами и бизнес-задачами. Я отвечаю на русском или узбекском языке (используя только латиницу для узбекского).
```
