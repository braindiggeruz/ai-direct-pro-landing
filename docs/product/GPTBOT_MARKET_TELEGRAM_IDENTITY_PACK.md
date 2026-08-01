# GPTBot Market Telegram public identity pack

Status: repository copy and assets ready. BotFather production mutation is not
performed by this package.

## Identity

- Public buyer identity: **GPTBot Market**.
- Seller program/mode: **Sotuvchi by GPTBot**.
- Avatar: `public/assets/market/gptbot-market-avatar.png`.
- Editable avatar: `public/assets/market/gptbot-market-avatar.svg`.
- Buyer preview: `telegram-buyer-preview-ru.svg/png`.
- Seller preview: `telegram-seller-preview-ru.svg/png`.
- Prompt card: `telegram-example-prompt-ru.svg/png`.

## Approved metadata source

The exact bounded RU/UZ metadata and command list live in
`functions/channels/telegram/metadata.ts`. Prepared public copy:

| Field | RU | Uzbek Latin draft |
| --- | --- | --- |
| Short | GPTBot Market: поиск товаров в подключённых каталогах. | GPTBot Market: ulangan kataloglardan mahsulot qidirish. |
| Long | GPTBot Market помогает найти и сравнить товары по подтверждённым данным подключённых каталогов. Сейчас доступен только синтетический демо-каталог. GPTBot не принимает оплату и не обещает доставку. | GPTBot Market ulangan kataloglardagi tasdiqlangan ma’lumot asosida mahsulot topish va solishtirishga yordam beradi. Hozir faqat sintetik demo-katalog mavjud. GPTBot to‘lov qabul qilmaydi va yetkazishni va’da qilmaydi. |

Native Uzbek review is pending.

## Commands and menu

- `/start` — main menu / bosh menyu.
- `/catalog` — catalog / katalogni ochish.
- `/orders` — buyer requests/orders / buyurtmalarim.
- `/help` — help / yordam.
- `/language` — language / tilni tanlash.

The seller mode remains behind trusted server-side membership; a menu choice
never grants authorization.

## Pinned demo post

RU:

> Напишите, что Вам нужно, — GPTBot найдёт подходящие товары в каталогах
> подключённых магазинов. Сейчас открыт синтетический демо-каталог: это не
> реальный магазин. Цена и наличие приходят из каталога. Оформление отправляет
> заявку продавцу и не является оплатой.

Uzbek Latin draft:

> Sizga nima kerakligini yozing — GPTBot ulangan do‘konlar katalogidan mos
> mahsulotlarni topadi. Hozir sintetik demo-katalog ochiq: bu haqiqiy do‘kon
> emas. Narx va qoldiq katalogdan olinadi. Rasmiylashtirish sotuvchiga ariza
> yuboradi va to‘lov hisoblanmaydi.

## Screenshot annotation standard

Crop out the Telegram account header when it exposes personal state. Never
show chat ID, user ID, phone, username, token, private delivery address or a
real conversation. Add visible `СИНТЕТИЧЕСКОЕ ДЕМО` / `SINTETIK DEMO` and point
to catalog source, updated date and request-not-payment text. Do not draw fake
notification badges or response-time claims.

