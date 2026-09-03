/**
 * Live Telegram and catalogue markup, frozen on 2026-09-03.
 *
 * Sliced from real pages by .probe/mkfixtures.ts and pasted here verbatim.
 * These are not idealised samples: the group card is what a Tashkent group
 * actually serves, the channel card is the entirely different layout a
 * verified channel gets, and the dead slug is the page Telegram returns for a
 * name that does not exist — a 200 with a generic title and no counters,
 * which is precisely why the parser cannot trust the status code.
 */

export const GROUP_CARD_HTML = `<div class="tgme_page">
<div class="tgme_page_title" dir="auto">
  <span dir="auto">Объявления в Ташкенте🇺🇿</span>
</div>
<div class="tgme_page_description" dir="auto">Добавляйте объявления , бесплатно.<br/>Соблюдайте правила☝️<br/>Запрещено:<br/>Ссылки. Реклама групп и каналов.<br/>Объявления, которые нарушают общепринятые нормы морали и нравственности, законы Республики Узбекистан.<br/><br/>По вопросам рекламы и сотрудничества</div>
<div class="tgme_page_extra">2 620 members, 18 online</div>
</div>`;

export const GROUP_CARD_ABOUT_WITH_HANDLES = `<div class="tgme_page_description" dir="auto">Наш основной канал <a href="https://t.me/ISHboor">@ISHboor</a><br/>Прямая связь с работодателями<br/>Зарплата до 20.000.000 сум<br/><br/>Вопросы/предложения <a href="https://t.me/Ulugkhon">@Ulugkhon</a></div>`;

export const CHANNEL_CARD_HTML = `<div class="tgme_channel_info">
          <div class="tgme_channel_info_header">
            <i class="tgme_page_photo_image bgcolor1" data-content="AТ"><img src="PHOTO"></i>
            <div class="tgme_channel_info_header_title_wrap">
              <div class="tgme_channel_info_header_title"><span dir="auto">Afisha.uz - Все события Ташкента</span></div>
              <div class="tgme_channel_info_header_labels"><i class="verified-icon"> ✔</i></div>
            </div>
            <div class="tgme_channel_info_header_username"><a href="https://t.me/afishauz">@afishauz</a></div>
          </div>
          <div class="tgme_channel_info_counters"><div class="tgme_channel_info_counter"><span class="counter_value">32.8K</span> <span class="counter_type">subscribers</span></div><div class="tgme_channel_info_counter"><span class="counter_value">29.8K</span> <span class="counter_type">photos</span></div><div class="tgme_channel_info_counter"><span class="counter_value">1.11K</span> <span class="counter_type">videos</span></div><div class="tgme_channel_info_counter"><span class="counter_value">7</span> <span class="counter_type">files</span></div><div class="tgme_channel_info_counter"><span class="counter_value">21.8K</span> <span class="counter_type">links</span></div></div>
          <div class="tgme_channel_info_description">Премьеры, анонсы мероприятий, обзоры, новости, статьи и многое другое.<br/><br/>Редакция:<br/><a href="https://t.me/AfishauzFeedbackBot" target="_blank">@AfishauzFeedbackBot</a> <br/>(+998) 78-555-8090<br/>info@afisha.uz<br/><br/>Реклама:<br/><a href="https://t.me/AfishaMediaYana" target="_blank">@AfishaMediaYana</a><br/>(+998) 99-923-55-15<br/><br/><a href="http://instagram.com/afishauzb/" target="_blank" rel="noopener">instagram.com/afishauzb/</a><br/><a href="http://fb.com/afishauz" target="_blank" rel="noopener">fb.com/afishauz</a><br/><br/>На узбекском: <a href="https://t.me/afishauzb" target="_blank">@afishauzb</a></div>
          `;

export const DEAD_CARD_HTML = `<title>Telegram Messenger</title>
<meta property="og:title" content="Telegram – a new era of messaging">
<meta property="og:description" content="Fast. Secure. Powerful.">`;

export const TGCHATS_RESULT_BLOCKS = [
`<div class="result-item ">
            <div class="result-header">
              <a href="https://t.me/zlomda" target="_blank">
                Реклама ролок/флудов🛸              </a>
                                            <span class="badge">35722</span>
                          </div>
            <small></small>
          </div>
                  `,
`<div class="result-item ">
            <div class="result-header">
              <a href="https://t.me/rynokgenichesk" target="_blank">
                ГЕНИЧЕСК РЫНОК ОНЛАЙН РЕКЛАМА ХЕРСОНСКАЯ ОБЛАСТЬ              </a>
                                            <span class="badge">15890</span>
                          </div>
            <small>Группа посвящена рекламе в Геническе и Херсонской области. Здесь размещаются онлайн объявления и обсуждаются возможности сотрудничества. Контактные лица: @Babai_iii и @Leshiy_yy.</small>
          </div>
                  `,
`<div class="result-item ">
            <div class="result-header">
              <a href="https://t.me/reklamavrn36" target="_blank">
                РЕКЛАМА ВОРОНЕЖ/ЛИПЕЦК/ МОСКВА/ ПИТЕР              </a>
                                            <span class="badge">14797</span>
                          </div>
            <small>🚀 Ищете эффективную рекламу в Воронеже, Липецке, Москве или Санкт-Петербурге? Узнайте больше об уникальных возможностях для размещения объявлений! 📣 Свяжитесь с нами: @Klining366.</small>
          </div>
                  `,
`<div class="result-item ">
            <div class="result-header">
              <a href="https://t.me/roleeplayad" target="_blank">
                Реклама ролок              </a>
                                            <span class="badge">10700</span>
                          </div>
            <small>Добро пожаловать в наш уютный уголок ролевого мира! 🎭 Если вы ищете место для рекламы или поиска увлекательных ролевых игр, вы попали по адресу! Наша группа создана для объединения всех любителей ролевого контента. Обратите внимание</small>
          </div>
                  `
];

export const TELEGID_CONTAINER_BLOCKS = [
`<div class="link-container" style="max-height: 76px; padding: 3px 0;">
                                        <div class="d-flex align-items-center w-100" style="height: 70px;">
                                            <div class="me-3 position-relative"
                                                 style="width: 70px; flex: 0 0 70px;"
                                                 data-bs-toggle="tooltip"
                                                 data-bs-placement="right"
                                                 data-bs-html="true"
                                                 data-bs-title='<img src="//telegid.me/images/catalog_links/17725/s300_99e84b6c12714d479c245f276d377be0.webp" class="img-fluid" style="max-width: 300px; max-height: 300px;">'>

                                                <img
                                                        src="//telegid.me/images/catalog_links/17725/s70_99e84b6c12714d479c245f276d377be0.webp"
                                                        srcset="//telegid.me/images/catalog_links/17725/s300_99e84b6c12714d479c245f276d377be0.webp 3x"
                                                        class="img-fluid rounded cursor-zoom-in list_img"
                                                        alt="Мёд Ташкент Чат"
                                                        loading="lazy"
                                                >
                                            </div>

                                            <div class="d-flex flex-nowrap" style="flex: 1 1 0; min-width: 0;">
                                                <div class="pe-3 d-flex flex-column justify-content-center"
                                                     style="flex: 1 1 0; min-width: 0; line-height: 1.2; max-width: 80%;">

                                                    <div class="text-truncate link-container-title">
                                                        Мёд Ташкент Чат                                                    </div>

                                                                                                            <div class="text-muted small link-container-desc">
                                                            Натуральный Мёд и продукты пчеловодства со своей пасеки🐝🍯

 🍯Мёд_Ташкент это
Вкусно и полезно!

 Качество продукции 💯%

Наш канал @med_tashkent

Отзывы @med_tashkent_otziv

 📲 +998946303318 Света

Писать @Sveta_med_v_tashkente                                                        </div>
                                                                                                    </div>

                                                <div class="d-flex flex-wrap gap-1 align-self-center justify-content-end text-end info-link-btn">
                                                    <a href="https://t.me/med_tashkent_chat" class="btn_open_link" target="_blank" rel="nofollow">Открыть</a>
                                                    <a href="javascript:void(0);" class="btn_info_link" data-link-id-info="17725">Инфо</a>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                                                    `,
`<div class="link-container" style="max-height: 76px; padding: 3px 0;">
                                        <div class="d-flex align-items-center w-100" style="height: 70px;">
                                            <div class="me-3 position-relative"
                                                 style="width: 70px; flex: 0 0 70px;"
                                                 data-bs-toggle="tooltip"
                                                 data-bs-placement="right"
                                                 data-bs-html="true"
                                                 data-bs-title='<img src="//telegid.me/images/catalog_links/6758/s300_7ce30eeb956b8bbdecfdb304b556edba.webp" class="img-fluid" style="max-width: 300px; max-height: 300px;">'>

                                                <img
                                                        src="//telegid.me/images/catalog_links/6758/s70_7ce30eeb956b8bbdecfdb304b556edba.webp"
                                                        srcset="//telegid.me/images/catalog_links/6758/s300_7ce30eeb956b8bbdecfdb304b556edba.webp 3x"
                                                        class="img-fluid rounded cursor-zoom-in list_img"
                                                        alt="Ташкент Нукус Нокис"
                                                        loading="lazy"
                                                >
                                            </div>

                                            <div class="d-flex flex-nowrap" style="flex: 1 1 0; min-width: 0;">
                                                <div class="pe-3 d-flex flex-column justify-content-center"
                                                     style="flex: 1 1 0; min-width: 0; line-height: 1.2; max-width: 80%;">

                                                    <div class="text-truncate link-container-title">
                                                        Ташкент Нукус Нокис                                                    </div>

                                                                                                    </div>

                                                <div class="d-flex flex-wrap gap-1 align-self-center justify-content-end text-end info-link-btn">
                                                    <a href="https://t.me/nukus_toshkent1" class="btn_open_link" target="_blank" rel="nofollow">Открыть</a>
                                                    <a href="javascript:void(0);" class="btn_info_link" data-link-id-info="6758">Инфо</a>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                                                    `,
`<div class="link-container" style="max-height: 76px; padding: 3px 0;">
                                        <div class="d-flex align-items-center w-100" style="height: 70px;">
                                            <div class="me-3 position-relative"
                                                 style="width: 70px; flex: 0 0 70px;"
                                                 data-bs-toggle="tooltip"
                                                 data-bs-placement="right"
                                                 data-bs-html="true"
                                                 data-bs-title='<img src="//telegid.me/images/catalog_links/17739/s300_6290e2147f11696464441c57a13891fd.webp" class="img-fluid" style="max-width: 300px; max-height: 300px;">'>

                                                <img
                                                        src="//telegid.me/images/catalog_links/17739/s70_6290e2147f11696464441c57a13891fd.webp"
                                                        srcset="//telegid.me/images/catalog_links/17739/s300_6290e2147f11696464441c57a13891fd.webp 3x"
                                                        class="img-fluid rounded cursor-zoom-in list_img"
                                                        alt="🇺🇿Доска объявления 🇺🇿ТАШКЕНТ🇺🇿 АЛМАЛЫК🇺🇿АНГРЕН🇺🇿АХАНГРАН🇺🇿"
                                                        loading="lazy"
                                                >
                                            </div>

                                            <div class="d-flex flex-nowrap" style="flex: 1 1 0; min-width: 0;">
                                                <div class="pe-3 d-flex flex-column justify-content-center"
                                                     style="flex: 1 1 0; min-width: 0; line-height: 1.2; max-width: 80%;">

                                                    <div class="text-truncate link-container-title">
                                                        🇺🇿Доска объявления 🇺🇿ТАШКЕНТ🇺🇿 АЛМАЛЫК🇺🇿АНГРЕН🇺🇿АХАНГРАН🇺🇿                                                    </div>

                                                                                                            <div class="text-muted small link-container-desc">
                                                            PULLIK ELONLAR RO'YXATI
🛑UY SOTIW YOKI SOTIB OLIW✅
🛑BOSH ER MAYDONI✅
🛑MASHINA✅
🛑TIJORIY REKLAMALAR✅
🛑GRUPPA SILKALARI✅

500.000somdan yuqori narhlangan har qanday  e'lon ham pullik

Murojat un👇 

 ADMIN:  👮 @sherbeh

☎️      +998949396000                                                        </div>
                                                                                                    </div>

                                                <div class="d-flex flex-wrap gap-1 align-self-center justify-content-end text-end info-link-btn">
                                                    <a href="https://t.me/reklamazi" class="btn_open_link" target="_blank" rel="nofollow">Открыть</a>
                                                    <a href="javascript:void(0);" class="btn_info_link" data-link-id-info="17739">Инфо</a>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                                                    `,
`<div class="link-container" style="max-height: 76px; padding: 3px 0;">
                                        <div class="d-flex align-items-center w-100" style="height: 70px;">
                                            <div class="me-3 position-relative"
                                                 style="width: 70px; flex: 0 0 70px;"
                                                 data-bs-toggle="tooltip"
                                                 data-bs-placement="right"
                                                 data-bs-html="true"
                                                 data-bs-title='<img src="//telegid.me/images/catalog_links/17735/s300_19d9438c1c41a576fbf6738854a84a28.webp" class="img-fluid" style="max-width: 300px; max-height: 300px;">'>

                                                <img
                                                        src="//telegid.me/images/catalog_links/17735/s70_19d9438c1c41a576fbf6738854a84a28.webp"
                                                        srcset="//telegid.me/images/catalog_links/17735/s300_19d9438c1c41a576fbf6738854a84a28.webp 3x"
                                                        class="img-fluid rounded cursor-zoom-in list_img"
                                                        alt="Ташкент Объявления"
                                                        loading="lazy"
                                                >
                                            </div>

                                            <div class="d-flex flex-nowrap" style="flex: 1 1 0; min-width: 0;">
                                                <div class="pe-3 d-flex flex-column justify-content-center"
                                                     style="flex: 1 1 0; min-width: 0; line-height: 1.2; max-width: 80%;">

                                                    <div class="text-truncate link-container-title">
                                                        Ташкент Объявления                                                    </div>

                                                                                                            <div class="text-muted small link-container-desc">
                                                            Правила https://t.me/Obyavleniya_tashkentika/1174
По рекламе @muzav                                                        </div>
                                                                                                    </div>

                                                <div class="d-flex flex-wrap gap-1 align-self-center justify-content-end text-end info-link-btn">
                                                    <a href="https://t.me/Obyavleniya_tashkentika" class="btn_open_link" target="_blank" rel="nofollow">Открыть</a>
                                                    <a href="javascript:void(0);" class="btn_info_link" data-link-id-info="17735">Инфо</a>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                                                    `
];

/**
 * A TGStat chat-ratings page, cut down to the parts the parser reads.
 *
 * Two things about this markup are load-bearing and both cost real rooms to
 * learn. The peer path keeps a literal `@`, so a slug arrives as
 * `/chat/@tashkent_dev_chat` and stripping it is the parser's job, not the
 * caller's. And a ratings page always ends with a block of TGStat's own bots
 * — `@TGStat_Bot`, `@TGStatChatBot` — which are not rooms and would otherwise
 * spend a card fetch each out of a hundred-slot budget.
 */
export const TGSTAT_RATINGS_HTML = `<!DOCTYPE html>
<html><body>
<a class="peer-item" href="/chat/@tashkent_dev_chat">Разработчики Ташкента</a>
<a class="peer-item" href="/chat/@uz_marketing">Маркетинг Узбекистан</a>
<a class="peer-item" href="/channel/@some_news_channel">Новости</a>
<a class="peer-item" href="/chat/@tashkent_dev_chat">раз ещё, для проверки дедупа</a>
<a class="peer-item" href="/chat/@TGStat_Bot">TGStat Bot</a>
<a class="peer-item" href="/chat/@tg_analytics_bot">Analytics Bot</a>
</body></html>
`;
