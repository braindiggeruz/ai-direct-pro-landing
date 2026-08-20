import type { BodyBlock, FaqItem, GlobalSEO, Page } from '../src/shared/types';

function e(value: string): string {
  return (value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]!));
}

function marketPath(locale: Page['locale']): string {
  return locale === 'uz' ? '/uz/sotuvchi/' : '/ru/sotuvchi/';
}

function trustPath(locale: Page['locale']): string {
  return locale === 'uz' ? '/uz/market-ishonch/' : '/ru/market-doverie/';
}

export function renderMarketHeader(
  page: Page,
  hrefRu: string,
  hrefUz: string,
): string {
  const uz = page.locale === 'uz';
  const cta = page.slug === 'sotuvchi'
    ? page.ctaPrimaryHref || '#'
    : `https://t.me/BormiMarketBot?start=buyer_trust_${uz ? 'uz' : 'ru'}`;
  return `<header class="market-header">
  <div class="market-shell market-header-row">
    <a class="market-brand" href="${marketPath(page.locale)}" aria-label="GPTBot Market">
      <img src="/assets/market/gptbot-market-wordmark-dark.svg" width="340" height="64" alt="GPTBot Market" />
    </a>
    <nav class="market-nav" aria-label="${uz ? 'Asosiy bo‘limlar' : 'Основные разделы'}">
      <a href="${marketPath(page.locale)}#buyer">${uz ? 'Xaridor uchun' : 'Покупателю'}</a>
      <a href="${marketPath(page.locale)}#seller">${uz ? 'Sotuvchi uchun' : 'Продавцу'}</a>
      <a href="${trustPath(page.locale)}">${uz ? 'Ishonch' : 'Доверие'}</a>
      <a href="${marketPath(page.locale)}#faq">FAQ</a>
    </nav>
    <div class="market-header-actions">
      <div class="market-locale" role="group" aria-label="${uz ? 'Til' : 'Язык'}">
        ${hrefRu ? `<a href="${e(hrefRu)}" lang="ru" hreflang="ru">RU</a>` : ''}
        ${hrefUz ? `<a href="${e(hrefUz)}" lang="uz" hreflang="uz">UZ</a>` : ''}
      </div>
      <a class="market-btn market-btn-primary" href="${e(cta)}" rel="nofollow noopener noreferrer" target="_blank">${uz ? 'Demoni ochish' : 'Открыть демо'}</a>
    </div>
  </div>
</header>`;
}

function renderFaq(faq: FaqItem[], locale: Page['locale']): string {
  const items = faq.map((item, index) => {
    const buttonId = `market-faq-button-${index + 1}`;
    const panelId = `market-faq-panel-${index + 1}`;
    return `<div class="market-faq-item">
      <h3>
        <button id="${buttonId}" class="market-faq-button" type="button" aria-expanded="false" aria-controls="${panelId}">
          <span>${e(item.q)}</span><span class="market-faq-icon" aria-hidden="true">+</span>
        </button>
      </h3>
      <div id="${panelId}" class="market-faq-panel" role="region" aria-labelledby="${buttonId}">${e(item.a)}</div>
    </div>`;
  }).join('');
  return `<section id="faq" class="market-section market-section-sand" aria-labelledby="market-faq-title">
    <div class="market-shell">
      <div class="market-section-head">
        <div><p class="market-eyebrow">FAQ</p><h2 id="market-faq-title">${locale === 'uz' ? 'Oldindan aniq javoblar' : 'Прямые ответы заранее'}</h2></div>
        <p>${locale === 'uz' ? 'Mahsulot, do‘kon va GPTBot chegaralarini yashirmaymiz.' : 'Не прячем границы продукта, магазина и GPTBot.'}</p>
      </div>
      <div class="market-faq-list">${items}</div>
    </div>
  </section>`;
}

function landingCopy(locale: Page['locale']) {
  if (locale === 'uz') {
    return {
      eyebrow: 'GPTBot Market · xaridor uchun demo',
      demoLabel: 'Sintetik demo · real do‘kon emas',
      query: 'Uyga issiq yorug‘likli stol chirog‘i kerak, byudjet 400 000 so‘mgacha.',
      demoNote: 'GPTBot cheklovlarni qayd etdi: kategoriya — chiroq; yorug‘lik — issiq; maksimal byudjet — 400 000 so‘m.',
      productOne: 'Stol chirog‘i M-14',
      productTwo: 'Stol chirog‘i S-08',
      priceOne: '349 000 so‘m',
      priceTwo: '289 000 so‘m',
      stockOne: 'Mavjud · demo qoldiq',
      stockTwo: 'Mavjud · demo qoldiq',
      store: 'Sintetik do‘kon A',
      reasonOne: 'Mos keladi: issiq yorug‘lik, byudjet ichida',
      reasonTwo: 'Mos keladi: byudjet ichida; yorug‘lik harorati ko‘rsatilmagan',
      details: 'Tasdiqlangan ma’lumot',
      buyerTitle: 'So‘rovingizni takrorlashga majbur qilmaydigan qidiruv',
      buyerIntro: 'Talablar bir marta qayd etiladi va qidiruv, taqqoslash, batafsil ma’lumot hamda xavfsiz tiklanish yo‘lida saqlanadi.',
      buyerCards: [
        ['01', 'Oddiy yozing', 'Kategoriya, byudjet va muhim parametrlarni bitta xabarda yozish mumkin.'],
        ['02', 'Tasdiqlangan faktlar', 'Narx, mavjudlik, do‘kon va xususiyatlar faqat ulangan katalogdan olinadi.'],
        ['03', 'Halol tiklanish', 'Natija bo‘lmasa, bot so‘rovni o‘zgartirish, kategoriyani ochish yoki odamni chaqirishni taklif qiladi.'],
      ],
      compareTitle: 'Taqqoslash faqat mavjud faktlarni yonma-yon qo‘yadi',
      compareIntro: 'Yashirin reyting, sun’iy sharh va «eng yaxshi» da’vosi yo‘q.',
      compareHeaders: ['Parametr', 'M-14 · demo', 'S-08 · demo'],
      compareRows: [['Narx', '349 000 so‘m', '289 000 so‘m'], ['Mavjudlik', 'Mavjud', 'Mavjud'], ['Yorug‘lik', 'Issiq · katalogda bor', 'Ma’lumot yo‘q'], ['So‘rovga moslik', '2 ta talab tasdiqlandi', '1 ta talab tasdiqlandi']],
      requestTitle: 'So‘rov nimani anglatadi — va nimani anglatmaydi',
      requestIntro: 'Bu to‘lov emas. Tasdiqlashdan keyin aniq do‘kon keyingi qadam uchun Siz bilan bog‘lanadi.',
      timeline: [['1', 'Kartani tekshirish', 'Narx, mavjudlik, do‘kon va ma’lumot manbasini ko‘rasiz.'], ['2', 'Ma’lumot kiritish', 'Miqdor va aloqa ma’lumoti faqat so‘rov uchun kiritiladi.'], ['3', 'Tekshirish va tuzatish', 'Yuborishdan oldin orqaga qaytish yoki bekor qilish mumkin.'], ['4', 'Do‘kon javobi', 'Do‘kon bajarish, to‘lov va yetkazish shartlarini o‘zi bildiradi.']],
      sellerTitle: 'Sotuvchi by GPTBot — tekshirilgan katalog va kundalik ish markazi',
      sellerIntro: 'Sotuvchi huquqi tugma orqali berilmaydi. GPTBot jamoasi egani tekshiradi, katalogni ko‘radi va do‘konni serverda aniq tashkilotga bog‘laydi.',
      cockpitLabel: 'Sintetik maket · production ma’lumoti emas',
      alerts: [['Eskirgan qoldiq', '2 ta demo pozitsiya tekshirishni kutmoqda', 'Bugun'], ['Ochiq savol', 'Xaridor odam javobini kutmoqda', '1'], ['Bildirishnoma xatosi', 'Qayta yuborish mumkin; so‘rov saqlangan', '1'], ['Yangi so‘rovlar', 'Keyingi amal: ko‘rib chiqish va tasdiqlash', '3']],
      sellerCta: 'Sotuvchi piloti haqida bilish',
      factsTitle: 'Ko‘rsatish mumkin bo‘lgan isbotlar',
      factsIntro: 'Real mijozlar, tushum yoki pilot natijasi yo‘q. Shuning uchun isbot sifatida faqat tekshiriladigan arxitektura va test dalillarini ko‘rsatamiz.',
      facts: [['Katalog — manba', 'Narx va mavjudlik javob matnidan emas, bazadan olinadi.'], ['AI tanlash o‘chiq', 'Joriy amal tanlash deterministik va yopiq ro‘yxatli.'], ['Do‘konlar ajratilgan', 'Sotuvchi huquqi server a’zoligi va do‘kon holatiga bog‘langan.'], ['To‘lov yo‘q', 'GPTBot pul va to‘lov rekvizitlarini qabul qilmaydi.']],
      finalTitle: 'Xaridor sifatida demoni ko‘ring yoki sotuvchi pilotini o‘rganing.',
      trustLink: 'Ishonch markazini o‘qish',
    };
  }
  return {
    eyebrow: 'GPTBot Market · демо для покупателя',
    demoLabel: 'Синтетическое демо · не реальный магазин',
    query: 'Нужна настольная лампа с тёплым светом для дома, бюджет до 400 000 сум.',
    demoNote: 'GPTBot зафиксировал ограничения: категория — лампа; свет — тёплый; максимальный бюджет — 400 000 сум.',
    productOne: 'Настольная лампа M-14',
    productTwo: 'Настольная лампа S-08',
    priceOne: '349 000 сум',
    priceTwo: '289 000 сум',
    stockOne: 'В наличии · демо-остаток',
    stockTwo: 'В наличии · демо-остаток',
    store: 'Синтетический магазин A',
    reasonOne: 'Подходит: тёплый свет, в пределах бюджета',
    reasonTwo: 'Подходит по бюджету; температура света не указана',
    details: 'Подтверждённые данные',
    buyerTitle: 'Поиск, который не заставляет повторять запрос',
    buyerIntro: 'Ограничения фиксируются один раз и сохраняются в поиске, сравнении, деталях и безопасном восстановлении.',
    buyerCards: [
      ['01', 'Пишите естественно', 'Категорию, бюджет и важные параметры можно указать одним сообщением.'],
      ['02', 'Получайте факты', 'Цена, наличие, магазин и характеристики приходят только из подключённого каталога.'],
      ['03', 'Восстанавливайтесь честно', 'Если результата нет, бот предлагает изменить запрос, открыть категории или позвать человека.'],
    ],
    compareTitle: 'Сравнение ставит рядом только доступные факты',
    compareIntro: 'Без скрытого рейтинга, искусственных отзывов и заявления «лучший».',
    compareHeaders: ['Параметр', 'M-14 · демо', 'S-08 · демо'],
    compareRows: [['Цена', '349 000 сум', '289 000 сум'], ['Наличие', 'В наличии', 'В наличии'], ['Свет', 'Тёплый · есть в каталоге', 'Нет данных'], ['Совпадение с запросом', '2 требования подтверждены', '1 требование подтверждено']],
    requestTitle: 'Что означает заявка — и чего она не означает',
    requestIntro: 'Это не платёж. После подтверждения конкретный магазин связывается с Вами по следующему шагу.',
    timeline: [['1', 'Проверить карточку', 'Вы видите цену, наличие, магазин и источник данных.'], ['2', 'Ввести данные', 'Количество и контакт нужны только для этой заявки.'], ['3', 'Проверить и исправить', 'До отправки можно вернуться назад или отменить.'], ['4', 'Получить ответ магазина', 'Магазин сам сообщает условия выполнения, оплаты и доставки.']],
    sellerTitle: 'Sotuvchi by GPTBot — проверенный каталог и ежедневный рабочий центр',
    sellerIntro: 'Права продавца не выдаются кнопкой. Команда GPTBot проверяет владельца, просматривает каталог и серверно связывает магазин с конкретной организацией.',
    cockpitLabel: 'Синтетический макет · не production-данные',
    alerts: [['Устаревший остаток', '2 демо-позиции ждут проверки', 'Сегодня'], ['Открытый вопрос', 'Покупатель ждёт ответа человека', '1'], ['Ошибка уведомления', 'Можно повторить; заявка сохранена', '1'], ['Новые заявки', 'Следующий шаг: проверить и подтвердить', '3']],
    sellerCta: 'Узнать о пилоте продавца',
    factsTitle: 'Доказательства, которые можно показывать',
    factsIntro: 'Реальных клиентов, выручки и результата пилота пока нет. Поэтому доказательством служат только проверяемая архитектура и тестовые свидетельства.',
    facts: [['Каталог — источник', 'Цена и наличие приходят из базы, а не из свободного текста ответа.'], ['AI-selection отключён', 'Текущий выбор действия детерминирован и ограничен закрытым списком.'], ['Магазины разделены', 'Доступ продавца зависит от серверного членства и состояния магазина.'], ['Платежей нет', 'GPTBot не принимает деньги и платёжные реквизиты.']],
    finalTitle: 'Посмотрите демо как покупатель или изучите проверяемый пилот продавца.',
    trustLink: 'Прочитать центр доверия',
  };
}

function productCard(copy: ReturnType<typeof landingCopy>, second = false): string {
  const title = second ? copy.productTwo : copy.productOne;
  const price = second ? copy.priceTwo : copy.priceOne;
  const stock = second ? copy.stockTwo : copy.stockOne;
  const reason = second ? copy.reasonTwo : copy.reasonOne;
  return `<article class="market-product-card">
    <img src="/assets/market/market-synthetic-fallback.webp" width="1440" height="1080" alt="" aria-hidden="true" loading="eager" decoding="async" />
    <div class="market-product-body">
      <p class="market-product-kicker">${e(copy.demoLabel)}</p>
      <strong class="market-product-title">${e(title)}</strong>
      <p class="market-price">${e(price)}</p>
      <div class="market-product-meta"><span>${e(stock)}</span><span>${e(copy.store)}</span><span>${e(reason)}</span></div>
      <span class="market-product-action">${e(copy.details)}</span>
    </div>
  </article>`;
}

export function renderMarketLanding(page: Page): string {
  const copy = landingCopy(page.locale);
  const uz = page.locale === 'uz';
  const chips = (page.heroTrust || []).map((chip) => `<li>${e(chip)}</li>`).join('');
  const buyerCards = copy.buyerCards.map(([index, title, text]) => `<article class="market-value-card"><span class="market-index">${e(index)}</span><strong>${e(title)}</strong><p>${e(text)}</p></article>`).join('');
  const compareHeader = copy.compareHeaders.map((cell) => `<th scope="col">${e(cell)}</th>`).join('');
  const compareRows = copy.compareRows.map((row) => `<tr>${row.map((cell, index) => index === 0 ? `<th scope="row">${e(cell)}</th>` : `<td>${e(cell)}</td>`).join('')}</tr>`).join('');
  const timeline = copy.timeline.map(([index, title, text]) => `<li><strong>${e(index)} · ${e(title)}</strong><span>${e(text)}</span></li>`).join('');
  const alerts = copy.alerts.map(([title, text, value]) => `<div class="market-alert"><span class="market-alert-dot" aria-hidden="true"></span><div><strong>${e(title)}</strong><small>${e(text)}</small></div><b>${e(value)}</b></div>`).join('');
  const facts = copy.facts.map(([title, text]) => `<div class="market-fact"><strong>${e(title)}</strong><span>${e(text)}</span></div>`).join('');
  return `<main id="main">
  <section class="market-shell market-hero" aria-labelledby="market-hero-title">
    <div>
      <p class="market-eyebrow">${e(copy.eyebrow)}</p>
      <h1 id="market-hero-title">${e(page.h1)}</h1>
      <p class="market-hero-copy">${e(page.heroSubtitle || '')}</p>
      <div class="market-actions">
        <a class="market-btn market-btn-primary" href="${e(page.ctaPrimaryHref || '#')}" rel="nofollow noopener noreferrer" target="_blank">${e(page.ctaPrimaryLabel || '')}</a>
        <a class="market-btn market-btn-secondary" href="#seller">${e(page.ctaSecondaryLabel || '')}</a>
      </div>
      <ul class="market-chips" aria-label="${uz ? 'Mahsulot chegaralari' : 'Границы продукта'}">${chips}</ul>
    </div>
    <div class="market-demo" role="group" aria-label="${e(copy.demoLabel)}">
      <div class="market-demo-head"><strong>GPTBot Market</strong><span>${e(copy.demoLabel)}</span></div>
      <div class="market-demo-query">${e(copy.query)}</div>
      <p class="market-demo-note">${e(copy.demoNote)}</p>
      <div class="market-products">${productCard(copy)}${productCard(copy, true)}</div>
    </div>
  </section>

  <section id="buyer" class="market-section market-section-sand" aria-labelledby="buyer-title">
    <div class="market-shell">
      <div class="market-section-head"><div><p class="market-eyebrow">${uz ? 'Xaridor yo‘li' : 'Путь покупателя'}</p><h2 id="buyer-title">${e(copy.buyerTitle)}</h2></div><p>${e(copy.buyerIntro)}</p></div>
      <div class="market-card-grid">${buyerCards}</div>
    </div>
  </section>

  <section class="market-section" aria-labelledby="compare-title">
    <div class="market-shell">
      <div class="market-section-head"><div><p class="market-eyebrow">${uz ? 'Taqqoslash' : 'Сравнение'}</p><h2 id="compare-title">${e(copy.compareTitle)}</h2></div><p>${e(copy.compareIntro)}</p></div>
      <div class="market-compare" role="region" tabindex="0" aria-label="${uz ? 'Mahsulotlarni taqqoslash jadvali' : 'Таблица сравнения товаров'}"><table><thead><tr>${compareHeader}</tr></thead><tbody>${compareRows}</tbody></table></div>
    </div>
  </section>

  <section id="request" class="market-section market-section-ink" aria-labelledby="request-title">
    <div class="market-shell">
      <div class="market-section-head"><div><p class="market-eyebrow">${uz ? 'So‘rov ≠ to‘lov' : 'Заявка ≠ платёж'}</p><h2 id="request-title">${e(copy.requestTitle)}</h2></div><p>${e(copy.requestIntro)}</p></div>
      <ol class="market-timeline">${timeline}</ol>
    </div>
  </section>

  <section id="seller" class="market-section" aria-labelledby="seller-title">
    <div class="market-shell market-seller-panel">
      <div>
        <p class="market-eyebrow">Sotuvchi by GPTBot</p>
        <h2 id="seller-title">${e(copy.sellerTitle)}</h2>
        <p class="market-hero-copy">${e(copy.sellerIntro)}</p>
        <div class="market-actions"><a class="market-btn market-btn-coral" href="https://t.me/BormiMarketBot?start=agent_seller_site_${uz ? 'uz' : 'ru'}" rel="nofollow noopener noreferrer" target="_blank">${e(copy.sellerCta)}</a><a class="market-btn market-btn-secondary" href="${trustPath(page.locale)}">${e(copy.trustLink)}</a></div>
      </div>
      <div class="market-cockpit" role="group" aria-label="${e(copy.cockpitLabel)}">
        <span class="market-status">${e(copy.cockpitLabel)}</span>${alerts}
      </div>
    </div>
  </section>

  <section class="market-section market-section-ink" aria-labelledby="facts-title">
    <div class="market-shell">
      <div class="market-section-head"><div><p class="market-eyebrow">${uz ? 'Ishonchli dalil' : 'Честное доказательство'}</p><h2 id="facts-title">${e(copy.factsTitle)}</h2></div><p>${e(copy.factsIntro)}</p></div>
      <div class="market-facts">${facts}</div>
    </div>
  </section>

  ${renderFaq(page.faq || [], page.locale)}

  <section class="market-section" aria-labelledby="market-final-title"><div class="market-shell market-final"><h2 id="market-final-title">${e(copy.finalTitle)}</h2><div class="market-actions"><a class="market-btn market-btn-primary" href="${e(page.ctaPrimaryHref || '#')}" rel="nofollow noopener noreferrer" target="_blank">${e(page.ctaPrimaryLabel || '')}</a><a class="market-btn market-btn-secondary" href="${trustPath(page.locale)}">${e(copy.trustLink)}</a></div></div></section>
</main>`;
}

function renderTrustBlock(block: BodyBlock): string {
  switch (block.type) {
    case 'h2': return `<h2${block.id ? ` id="${e(block.id)}"` : ''}>${e(block.text || '')}</h2>`;
    case 'h3': return `<h3>${e(block.text || '')}</h3>`;
    case 'p': return `<p>${e(block.text || '')}</p>`;
    case 'list': return `<ul>${(block.items || []).map((item) => `<li>${e(item)}</li>`).join('')}</ul>`;
    case 'table': return `<div class="market-table-wrap" role="region" tabindex="0" aria-label="Trust Center table"><table><thead><tr>${(block.headers || []).map((item) => `<th scope="col">${e(item)}</th>`).join('')}</tr></thead><tbody>${(block.rows || []).map((row) => `<tr>${row.map((item, index) => index === 0 ? `<th scope="row">${e(item)}</th>` : `<td>${e(item)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    default: return '';
  }
}

export function renderMarketTrust(page: Page): string {
  const uz = page.locale === 'uz';
  return `<main id="main">
    <section class="market-shell market-trust-hero">
      <p class="market-eyebrow">GPTBot Market · Trust</p>
      <h1>${e(page.h1)}</h1>
      <p class="market-hero-copy">${e(page.heroSubtitle || '')}</p>
      <p class="market-legal-note">${uz ? 'Muhim: yuridik ekspertiza o‘tkazilmagan.' : 'Важно: юридическая экспертиза не проводилась.'}</p>
      <div class="market-actions"><a class="market-btn market-btn-primary" href="${e(page.ctaPrimaryHref || '#')}" rel="nofollow noopener noreferrer" target="_blank">${e(page.ctaPrimaryLabel || '')}</a><a class="market-btn market-btn-secondary" href="${marketPath(page.locale)}">${e(page.ctaSecondaryLabel || '')}</a></div>
    </section>
    <article class="market-trust-body">${(page.bodyBlocks || []).map(renderTrustBlock).join('')}</article>
    ${renderFaq(page.faq || [], page.locale)}
  </main>`;
}

export function renderMarketFooter(page: Page, global: GlobalSEO): string {
  const uz = page.locale === 'uz';
  return `<footer class="market-footer"><div class="market-shell market-footer-row"><div><img src="/assets/market/gptbot-market-wordmark-dark.svg" width="255" height="48" alt="GPTBot Market" /><p>${uz ? 'GPTBot.uz mahsuloti. Ulangan do‘kon kataloglarida mahsulot topishga yordam beradi. Telegram, OpenAI yoki do‘konlar nomidan chiqmaydi.' : 'Продукт GPTBot.uz. Помогает находить товары в каталогах подключённых магазинов. Не выступает от имени Telegram, OpenAI или магазинов.'}</p></div><nav class="market-footer-links" aria-label="${uz ? 'Yordamchi havolalar' : 'Служебные ссылки'}"><a href="${trustPath(page.locale)}">${uz ? 'Ishonch markazi' : 'Центр доверия'}</a><a href="${uz ? '/uz/maxfiylik-siyosati/' : '/ru/politika-konfidentsialnosti/'}">${uz ? 'Maxfiylik' : 'Конфиденциальность'}</a><a href="${e(global.telegram || 'https://t.me/XGame_changerx')}" rel="nofollow noopener noreferrer" target="_blank">${uz ? 'Qo‘llab-quvvatlash' : 'Поддержка'}</a></nav></div></footer>`;
}

export const MARKET_FAQ_SCRIPT = `<script>
(function(){
  document.documentElement.classList.add('market-enhanced');
  document.querySelectorAll('.market-faq-button').forEach(function(button){
    var panel=document.getElementById(button.getAttribute('aria-controls'));
    if(!panel)return;
    panel.hidden=true;
    button.addEventListener('click',function(){
      var open=button.getAttribute('aria-expanded')==='true';
      button.setAttribute('aria-expanded',String(!open));
      panel.hidden=open;
    });
  });
})();
</script>`;
