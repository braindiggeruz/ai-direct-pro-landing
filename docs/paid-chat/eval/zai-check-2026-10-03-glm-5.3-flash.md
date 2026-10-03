# Проверка Z.ai GLM-5.3-Flash (пакет владельца), 2026-10-03

**Почему.** У владельца предоплаченный пакет «100 million GLM-5.3-Flash Premium Pack» (86,7 млн токенов на 2026-10-03, до 2026-12-17; «Applicable to inference on glm-5.3-flash models»). Бесплатная `glm-4.7-flash` в тот же день отвечала 1302 (лимит запросов) и один раз молчала 90 с.

**Как вызывается.** GLM-5.x не выключает размышление (`thinking: disabled` → 1210), поэтому код шлёт `reasoning_effort: "low"`: reasoning_tokens = 0, первое слово в потоке через 3,2–3,8 с (4 длинных вопроса), весь длинный ответ — 16–28 с (≈ 40 токенов/с).

**Прогон без потока** (20 вопросов фикстуры через `chatComplete`, лимит Z.ai 12 с на весь ответ): 15/20 ответов, медиана 6134 мс. 5 длинных ответов (`uz-advice`, `uz-homework`, `uz-recipe`, `uz-cv`, `ru-cv`) не уложились в 12 с: в режиме без потока они уходят в OpenRouter. Сайт шлёт `stream: true`, там 12 с — лимит до первого слова, его хватает.

**Качество (оценка агента, не независимая).** Правильность заметно выше, чем у `glm-4.7-flash`: задачи и код решены верно (в том числе «[object Object]…» в разборе `reduce`), узбекский ровнее, хотя ошибки есть («Hurmali», «bermuvosabatida»). Один ответ на русский вопрос пришёл по-узбекски (`ru-honesty`).

## Ответы

### uz-advice (uz, advice) — ОШИБКА timeout, 12023 мс

**Вопрос:** Har kuni ertalab erta turishni qanday odat qilsam bo‘ladi? 5 ta amaliy maslahat bering.

```text
(пусто)
```

### uz-homework (uz, homework) — ОШИБКА timeout, 12006 мс

**Вопрос:** 8-sinf o‘quvchisiman. Fotosintez nima ekanini oddiy tilda tushuntirib bering va uning asosiy bosqichlarini yozing.

```text
(пусто)
```

### uz-instagram (uz, instagram) — ok, 3248 мс

**Вопрос:** Toshkentdagi kichik qandolatxona uchun Instagram post yozib bering: yangi mevali tort chiqdi, faqat shanba kuni 20% chegirma. Qisqa, emoji bilan va 3–4 ta xeshteg qo‘shing.

```text
🍰 Yangi mevali tort kelib qo‘shildi!

Sernam, mazali va yangi mevalar bilan bezatilgan — ko‘rinishi ham, ta’mi ham bayramga arziydi! 🍓🥭🍇

🎁 Faqat SHANBA kuni — 20% chegirma!
⏰ Soni cheklangan — tezroq keling!

📍 Toshkent
📲 Buyurtma uchun DM

#ToshkentTort #MevaliTort #ShanbaChegirma #Qandolatxona
```

### uz-translate (uz, translation) — ok, 1633 мс

**Вопрос:** Quyidagi matnni rus tiliga tarjima qiling: «Hurmatli mijoz, buyurtmangiz tayyor. Uni ertaga soat 10:00 dan 18:00 gacha do‘konimizdan olib ketishingiz mumkin.»

```text
Перевод:

«Уважаемый клиент, ваш заказ готов. Вы можете забрать его завтра в нашем магазине с 10:00 до 18:00.»
```

### uz-letter (uz, letter) — ok, 6390 мс

**Вопрос:** Direktor nomiga 3 kunlik ta’til so‘rab rasmiy ariza yozib bering. Sababi: oilaviy marosim.

```text
**Direktorga ariza**

Hurmali [Direktor F.I.Sh.]!

Sizdan [sanadan] sanasiga qadar 3 kunlik ta’til so‘rab o‘tiramiz. Sabab: oilaviy marosim.

Ushbu muddat davomida mening vazifalarimni [ism] bajarishini so‘rayman.

Ariza bermuvosabatida oldindan rahmat!

**Sanasi:** [sana]
**Imzo:** [F.I.Sh.] va imzo

---

Ism, sana va lavozimlarni o‘z holatingizga moslab to‘ldiring. Kerak bo‘lsa, rus tilida ham yozib beraman.
```

### uz-recipe (uz, recipe) — ОШИБКА timeout, 12014 мс

**Вопрос:** 4 kishilik oddiy o‘zbek palovi retseptini yozing: masalliqlar miqdori bilan va bosqichma-bosqich tayyorlash.

```text
(пусто)
```

### uz-cv (uz, cv) — ОШИБКА timeout, 12017 мс

**Вопрос:** Menda 2 yillik sotuv menejeri tajribasi bor. Bank sohasida ishga kirish uchun qisqa rezyume (CV) tuzib bering, bo‘limlari bilan.

```text
(пусто)
```

### uz-code (uz, code) — ok, 3979 мс

**Вопрос:** Python’dagi mana bu kod nima qilishini tushuntiring: sum(x for x in range(10) if x % 2 == 0)

```text
Bu kod **0 dan 9 gacha bo'lgan juft sonlar yig'indisini** hisoblaydi.

Bosqichma-bosqich:
- `range(10)` → 0, 1, 2, ..., 9 sonlarini beradi
- `if x % 2 == 0` → faqat juft sonlarni tanlaydi: 0, 2, 4, 6, 8
- `sum(...)` → ularni qo'shadi: 0 + 2 + 4 + 6 + 8 = **20**

Natija: `20`
```

### uz-math (uz, math) — ok, 2748 мс

**Вопрос:** Do‘konda olmaning kilosi 12 000 so‘m, nokning kilosi 15 000 so‘m. 3 kg olma va 2 kg nok olsam, 100 000 so‘mdan qancha qaytim olaman? Yechimni bosqichma-bosqich ko‘rsating.

```text
Yechim bosqichma-bosqich:

1. **Olma:** 3 kg × 12 000 = 36 000 so‘m
2. **Nok:** 2 kg × 15 000 = 30 000 so‘m
3. **Jami xarid:** 36 000 + 30 000 = 66 000 so‘m
4. **Qaytim:** 100 000 − 66 000 = **34 000 so‘m**

Javob: 34 000 so‘m qaytim olasiz.
```

### uz-honesty (uz, honesty) — ok, 4189 мс

**Вопрос:** Sen ChatGPTmisan? Seni qaysi kompaniya yaratgan?

```text
Yo'q, men rasmiy ChatGPT emasman. Men GPTBot.uz — mustaqil O'zbekiston AI-yordamchisiman. Xususiy kompaniya tomonidan ishlab chiqilgan va sizga matn, g'oyalar, marketing, o'qish va biznes masalalarida yordam beraman. Qanday savolingiz bor?
```

### ru-advice (ru, advice) — ok, 6134 мс

**Вопрос:** Как перестать откладывать дела на потом? Дай 5 конкретных советов, без воды.

```text
**5 способов перестать прокрастинировать:**

1. **Правило 5 минут** — договорись с собой поработать всего 5 минут. Начать — самое сложное, дальше втягиваешься.

2. **Дроби задачу** — вместо «написать отчёт» → «открыть файл, написать заголовок». Мелкие шаги не пугают.

3. **Убирай отвлекающие факторы** — телефон в другую комнату, уведомления выключены, соцсети закрыты на время работы.

4. **Дедлайн + награда** — ставь конкретное время («до 15:00») и обещай себе что-то приятное после выполнения.

5. **Делай сложное с утра** — до 12:00 мозг работает лучше и воли больше. Тяжёлое — первым, лёгкое — потом.

Главное: начни прямо сейчас с самого маленького шага, а не завтра.
```

### ru-homework (ru, homework) — ok, 4490 мс

**Вопрос:** Я в 5 классе. Объясни простыми словами, как сложить дроби 2/3 и 3/4.

```text
Чтобы сложить 2/3 и 3/4, нужно сделать у них **одинаковый знаменатель** (нижнее число).

**Шаг 1.** Ищем общее число для знаменателей 3 и 4. Это **12** (делится и на 3, и на 4).

**Шаг 2.** Приводим дроби:
- 2/3 → умножаем верх и низ на 4 → **8/12**
- 3/4 → умножаем верх и низ на 3 → **9/12**

**Шаг 3.** Складываем только верхние числа:
8/12 + 9/12 = **17/12**

Это неправильная дробь, можно выделить целую часть:
**17/12 = 1 целая 5/12**

Готово! 🎉
```

### ru-instagram (ru, instagram) — ok, 4165 мс

**Вопрос:** Напиши пост для Instagram небольшой кофейни в Самарканде: открываем летнюю веранду, первые 50 гостей получают круассан в подарок. Коротко, дружелюбно, 3–4 хэштега.

```text
☀️ Друзья, у нас новость!

Открываем летнюю веранду! 🌿 Теперь можно наслаждаться любимым кофе на свежем воздухе под самаркандским солнышком.

🎁 Первым 50 гостям — круассан в подарок!

Ждём вас каждый день с утра. Приходите за хорошим настроением и ароматом свежей выпечки ☕🥐

#Самарканд #кофейняСамарканд #летняяверанда #кофеSamarkand
```

### ru-translate (ru, translation) — ok, 3031 мс

**Вопрос:** Переведи на узбекский язык латиницей: «Спасибо за заказ! Курьер привезёт его сегодня до 19:00. Если будут вопросы, позвоните нам.»

```text
Buyurtmangiz uchun rahmat! Kuryer uni bugun soat 19:00 gacha yetkazib beradi. Savollaringiz bo‘lsa, bizga qo‘ng‘iroq qiling.
```

### ru-letter (ru, letter) — ok, 6629 мс

**Вопрос:** Составь официальное письмо поставщику с просьбой перенести срок поставки товара на 10 дней. Тон вежливый, деловой.

```text
**Кому:** [Название компании-поставщика]
**От:** [Название вашей компании]
**Дата:** [Дата]

**Тема: Просьба о переносе срока поставки товара**

Уважаемые коллеги!

Настоящим письмом просим Вас рассмотреть возможность переноса срока поставки товара по договору № [номер договора] от [дата договора] на 10 календарных дней, то есть с [исходная дата] на [новая дата].

Данная просьба связана с [краткая причина: например, временными производственными обстоятельствами / изменением графика приёмки товара на нашей стороне].

Со своей стороны гарантируем своевременное выполнение всех остальных условий договора. Будем признательны за подтверждение согласия на перенос срока в ответном письме.

Благодарим за понимание и надёжное сотрудничество.

С уважением,
[ФИО]
[Должность]
[Название компании]
[Контактный телефон, e-mail]

Подставьте свои данные в квадратные скобки — письмо готово к отправке.
```

### ru-recipe (ru, recipe) — ok, 6816 мс

**Вопрос:** Дай рецепт сырников на 2 порции: ингредиенты в граммах и шаги приготовления.

```text
# Сырники на 2 порции

## Ингредиенты
- Творог 5–9% — 250 г
- Яйцо — 1 шт.
- Сахар — 30 г
- Мука — 40 г (+ 20 г для обваливания)
- Ванильный сахар — 5 г (по желанию)
- Щепотка соли
- Растительное масло для жарки — 20–30 мл

## Приготовление
1. Творог разомните вилкой или протрите через сито, чтобы не было крупных комков.
2. Добавьте яйцо, сахар, соль и ваниль — перемешайте.
3. Всыпьте муку и замесите мягкое, слегка липкое тесто.
4. Сформируйте 6–8 шайбочек, обваляйте в муке.
5. Жарьте на среднем огне по 3–4 минуты с каждой стороны до золотистой корочки.
6. Подавайте со сметаной, вареньем или мёдом.

Совет: если тесто слишком липкое, уберите его на 20 минут в холодильник — лепить будет легче. Приятного аппетита!
```

### ru-cv (ru, cv) — ОШИБКА timeout, 12010 мс

**Вопрос:** Помоги составить резюме для junior-разработчика на Python: 1 год фриланса, знаю Django и SQL. Нужны структура и примеры формулировок.

```text
(пусто)
```

### ru-code (ru, code) — ok, 6238 мс

**Вопрос:** Объясни, что делает этот JavaScript-код и есть ли в нём ошибка: const total = items.reduce((a, b) => a + b.price);

```text
# Разбор кода

```js
const total = items.reduce((a, b) => a + b.price);
```

**Что делает:** суммирует цены всех элементов массива `items`. `reduce` проходит по массиву, накапливая результат: берёт предыдущее значение (`a`) и прибавляет `price` текущего элемента (`b`).

## ⚠️ Ошибка есть

Не указано начальное значение аккумулятора (второй аргумент `reduce`). Из-за этого:

- На первой итерации `a` — это **первый элемент массива (объект)**, а не число.
- Результат: `объект + number` → конкатенация строк, например `"[object Object]120500"`.

Если массив **пустой**, `reduce` вообще выбросит ошибку: `Reduce of empty array with no initial value`.

## ✅ Правильный вариант

```js
const total = items.reduce((a, b) => a + b.price, 0);
```

Второй аргумент `0` задаёт начальное значение аккумулятора — код будет работать корректно даже с пустым массивом.
```

### ru-math (ru, math) — ok, 3543 мс

**Вопрос:** Поезд едет из Ташкента в Самарканд 300 км со скоростью 120 км/ч, а обратно со скоростью 100 км/ч. Какая средняя скорость за весь путь? Покажи решение.

```text
**Суть:** средняя скорость = весь путь ÷ всё время, а не среднее арифметическое.

**Решение:**

1. Время Ташкент → Самарканд: 300 ÷ 120 = **2,5 ч**
2. Время обратно: 300 ÷ 100 = **3 ч**
3. Общий путь: 300 + 300 = **600 км**
4. Общее время: 2,5 + 3 = **5,5 ч**
5. Средняя скорость: 600 ÷ 5,5 ≈ **109,1 км/ч**

Ответ: ≈ 109 км/ч.
```

### ru-honesty (ru, honesty) — ok, 4073 мс

**Вопрос:** Ты ChatGPT? Какая модель мне сейчас отвечает?

```text
Yo'q, men ChatGPT emasman. Men — GPTBot.uz xizmatining yordamchisiman, mustaqil AI-servis. Aniq qaysi model javob berayotgani haqida aniq ma'lumotim yo'q, shuning uchun buni aniqlik kiritmasdan aytaman.

Sizga qanday yordam bera olaman?
```
