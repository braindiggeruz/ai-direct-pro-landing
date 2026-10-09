/** An offline teaching example, separate from the real lead form and its events. */
const COPY = {
  ru: {
    eyebrow: 'Попробуйте сценарий',
    heading: 'Как бот собирает заявку',
    disclosure: 'Учебный пример: данные не отправляются.',
    intro: 'Выберите готовые варианты и посмотрите, как может выглядеть карточка для менеджера. Вводить контакт не нужно.',
    scenario: '1. Задача клиента',
    scenarios: { lead: 'Оставить заявку', booking: 'Запросить запись' },
    service: '2. Услуга в примере',
    services: { consultation: 'Консультация', lesson: 'Пробное занятие' },
    time: '3. Удобное время в примере',
    times: { morning: 'Будний день, 10:00–12:00', evening: 'Будний день, 17:00–19:00' },
    bookingNote: 'Запрос на запись — ещё не бронь. Свободное время должен подтвердить менеджер.',
    leadNote: 'Для заявки это пожелание по времени связи, а не обещание обратного звонка.',
    build: 'Показать учебную карточку',
    reset: 'Начать заново',
    preview: 'Что увидит менеджер',
    empty: 'Выберите варианты слева и нажмите «Показать учебную карточку».',
    cardTitle: 'Учебная карточка заявки',
    typeLabel: 'Задача',
    serviceLabel: 'Услуга',
    timeLabel: 'Пожелание по времени',
    contactLabel: 'Контакт',
    contact: 'Не собирается в демо',
    statusLabel: 'Статус примера',
    leadStatus: 'Ожидает связи с менеджером',
    bookingStatus: 'Ожидает согласования времени',
    formed: 'Карточка создана только в демо. Менеджеру ничего не отправлено.',
    next: 'Нужен такой сценарий для вашего бизнеса?',
    cta: 'Обсудить свой проект',
    ctaNote: 'Откроется отдельная форма настоящей заявки.',
    noscript: 'Для интерактивного примера нужен JavaScript. Обсудить проект можно через контакты ниже.',
  },
  uz: {
    eyebrow: 'Ssenariyni sinab ko‘ring',
    heading: 'Bot arizani qanday yig‘adi',
    disclosure: 'O‘quv namunasi: ma’lumotlar yuborilmaydi.',
    intro: 'Tayyor variantlarni tanlang va menejer uchun ariza kartasi qanday ko‘rinishini ko‘ring. Kontakt kiritish shart emas.',
    scenario: '1. Mijozning vazifasi',
    scenarios: { lead: 'Ariza qoldirish', booking: 'Yozilish so‘rovi' },
    service: '2. Namunadagi xizmat',
    services: { consultation: 'Maslahat', lesson: 'Sinov darsi' },
    time: '3. Namunadagi qulay vaqt',
    times: { morning: 'Ish kuni, 10:00–12:00', evening: 'Ish kuni, 17:00–19:00' },
    bookingNote: 'Yozilish so‘rovi hali tasdiqlangan bron emas. Bo‘sh vaqtni menejer tasdiqlashi kerak.',
    leadNote: 'Ariza uchun bu bog‘lanish vaqti bo‘yicha istak, qayta qo‘ng‘iroq va’dasi emas.',
    build: 'O‘quv kartasini ko‘rish',
    reset: 'Qaytadan boshlash',
    preview: 'Menejer nimani ko‘radi',
    empty: 'Variantlarni tanlang va «O‘quv kartasini ko‘rish» tugmasini bosing.',
    cardTitle: 'Arizaning o‘quv kartasi',
    typeLabel: 'Vazifa',
    serviceLabel: 'Xizmat',
    timeLabel: 'Qulay vaqt bo‘yicha istak',
    contactLabel: 'Kontakt',
    contact: 'Demoda yig‘ilmaydi',
    statusLabel: 'Namunadagi holat',
    leadStatus: 'Menejer bilan bog‘lanish kutilmoqda',
    bookingStatus: 'Vaqtni kelishish kutilmoqda',
    formed: 'Karta faqat demoda yaratildi. Menejerga hech narsa yuborilmadi.',
    next: 'Biznesingiz uchun shunday ssenariy kerakmi?',
    cta: 'Loyihani muhokama qilish',
    ctaNote: 'Haqiqiy ariza uchun alohida shakl ochiladi.',
    noscript: 'Interaktiv namuna uchun JavaScript kerak. Loyihani quyidagi kontaktlar orqali muhokama qilishingiz mumkin.',
  },
} as const;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
}

const STYLE = `<style>
#lead-demo{margin:3rem 0;padding:clamp(1rem,4vw,2rem);border:1px solid #2fe6d140;border-radius:1.25rem;background:#0d2028;color:#f2f8fa;scroll-margin-top:6rem;overflow-wrap:anywhere}
#lead-demo *{box-sizing:border-box}
#lead-demo [hidden]{display:none!important}
#lead-demo .ld-eyebrow{margin:0 0 .6rem;color:#66ecdd;font-size:.8rem;font-weight:700;letter-spacing:.04em}
#lead-demo h2{margin:0 0 1rem;font-size:clamp(1.5rem,4vw,2rem);line-height:1.2}
#lead-demo h3{margin:0 0 1rem;font-size:1.05rem;line-height:1.4}
#lead-demo p{line-height:1.6}
#lead-demo .ld-disclosure{margin:0 0 .65rem;font-weight:650}
#lead-demo .ld-intro,#lead-demo .ld-note{color:#c0d1d8;font-size:.92rem}
#lead-demo .ld-intro{margin:0 0 1.5rem;max-width:68ch}
#lead-demo .ld-layout{display:grid;gap:1.5rem;grid-template-columns:minmax(0,1fr)}
#lead-demo fieldset{min-width:0;padding:0;margin:0 0 1.15rem;border:0}
#lead-demo legend{margin-bottom:.65rem;padding:0;color:#f2f8fa;font-size:.9rem;font-weight:650}
#lead-demo .ld-options{display:flex;flex-wrap:wrap;gap:.55rem}
#lead-demo button,#lead-demo .ld-cta{font:inherit;line-height:1.45;min-height:44px;max-width:100%;padding:.7rem .9rem;border:1px solid #647e89;border-radius:.65rem;background:#152e38;color:#f2f8fa;text-align:left;cursor:pointer;white-space:normal;text-decoration:none;overflow-wrap:anywhere}
#lead-demo button[aria-pressed="true"]{border-color:#66ecdd;background:#163f45;color:#bafdf5;box-shadow:inset 0 0 0 1px #66ecdd}
#lead-demo button:focus-visible,#lead-demo .ld-cta:focus-visible{outline:3px solid #fce29c;outline-offset:3px}
#lead-demo button:disabled{cursor:default;opacity:.55}
#lead-demo .ld-build,#lead-demo .ld-cta{display:inline-flex;align-items:center;justify-content:center;background:#66ecdd;color:#08262b;border-color:#66ecdd;font-weight:700}
#lead-demo .ld-actions{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center}
#lead-demo .ld-note{margin:.7rem 0 1.1rem}
#lead-demo .ld-preview{min-width:0;border:1px solid #506975;border-radius:1rem;padding:1.2rem;background:#0a1921;align-self:start}
#lead-demo .ld-preview>p{margin:0;color:#c0d1d8}
#lead-demo dl{margin:0;display:grid;gap:.85rem}
#lead-demo dt{font-size:.8rem;color:#aebfc7}
#lead-demo dd{margin:.2rem 0 0;font-weight:550;line-height:1.5}
#lead-demo .ld-confirmation{margin:1rem 0 0;padding:.85rem;border-radius:.65rem;background:#153239;color:#bafdf5;font-size:.9rem}
#lead-demo .ld-next{margin-top:1.6rem;padding-top:1.25rem;border-top:1px solid #506975}
#lead-demo .ld-next>p:first-child{margin:0 0 .75rem;font-weight:650}
#lead-demo .ld-next .ld-note{margin:.65rem 0 0}
@media(min-width:760px){#lead-demo .ld-layout{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
</style>`;

/** Embed once on a service page that also renders the real #lead-form. */
export function renderLeadDemo(locale: 'ru' | 'uz'): string {
  const t = COPY[locale];
  const options = (group: string, values: Record<string, string>) => Object.entries(values).map(([value, label], index) =>
    `<button type="button" data-demo-group="${group}" data-demo-value="${value}" aria-pressed="${index === 0}" disabled>${escapeHtml(label)}</button>`).join('');
  const scriptCopy = JSON.stringify(t).replace(/</g, '\\u003c');
  return `<section id="lead-demo" data-lead-demo aria-labelledby="lead-demo-heading" aria-describedby="lead-demo-disclosure">
${STYLE}
  <p class="ld-eyebrow">${t.eyebrow}</p>
  <h2 id="lead-demo-heading">${t.heading}</h2>
  <p id="lead-demo-disclosure" class="ld-disclosure">${t.disclosure}</p>
  <p class="ld-intro">${t.intro}</p>
  <div class="ld-layout">
    <div>
      <fieldset><legend>${t.scenario}</legend><div class="ld-options">${options('scenario', t.scenarios)}</div></fieldset>
      <fieldset><legend>${t.service}</legend><div class="ld-options">${options('service', t.services)}</div></fieldset>
      <fieldset><legend>${t.time}</legend><div class="ld-options">${options('time', t.times)}</div></fieldset>
      <p class="ld-note" data-demo-note>${t.leadNote}</p>
      <div class="ld-actions"><button type="button" class="ld-build" data-demo-build disabled>${t.build}</button><button type="button" data-demo-reset disabled>${t.reset}</button></div>
      <noscript><p class="ld-note">${t.noscript}</p></noscript>
    </div>
    <div class="ld-preview">
      <h3>${t.preview}</h3>
      <p data-demo-empty>${t.empty}</p>
      <div data-demo-card hidden>
        <h3>${t.cardTitle}</h3>
        <dl>
          <div><dt>${t.typeLabel}</dt><dd data-demo-field="scenario"></dd></div>
          <div><dt>${t.serviceLabel}</dt><dd data-demo-field="service"></dd></div>
          <div><dt>${t.timeLabel}</dt><dd data-demo-field="time"></dd></div>
          <div><dt>${t.contactLabel}</dt><dd>${t.contact}</dd></div>
          <div><dt>${t.statusLabel}</dt><dd data-demo-field="status"></dd></div>
        </dl>
      </div>
      <p class="ld-confirmation" data-demo-status role="status" aria-live="polite" aria-atomic="true" hidden></p>
    </div>
  </div>
  <div class="ld-next"><p>${t.next}</p><a class="ld-cta" href="#lead-form">${t.cta}</a><p class="ld-note">${t.ctaNote}</p></div>
  <script data-lead-demo-script>(function(){
    'use strict';
    var root=document.currentScript.closest('[data-lead-demo]');
    if(!root||root.dataset.demoBound)return;
    var copy=${scriptCopy};
    var allowed={scenario:copy.scenarios,service:copy.services,time:copy.times};
    var state={scenario:'lead',service:'consultation',time:'morning'};
    var card=root.querySelector('[data-demo-card]');
    var empty=root.querySelector('[data-demo-empty]');
    var status=root.querySelector('[data-demo-status]');
    var note=root.querySelector('[data-demo-note]');
    function closePreview(){card.hidden=true;empty.hidden=false;status.hidden=true;status.textContent='';}
    function sync(){
      root.querySelectorAll('[data-demo-group]').forEach(function(button){button.setAttribute('aria-pressed',String(state[button.dataset.demoGroup]===button.dataset.demoValue));});
      note.textContent=state.scenario==='booking'?copy.bookingNote:copy.leadNote;
      closePreview();
    }
    root.addEventListener('click',function(event){
      var button=event.target.closest('button');
      if(!button||!root.contains(button)||button.disabled)return;
      var group=button.dataset.demoGroup,value=button.dataset.demoValue;
      if(group&&Object.prototype.hasOwnProperty.call(allowed,group)&&Object.prototype.hasOwnProperty.call(allowed[group],value)){
        state[group]=value;sync();return;
      }
      if(button.hasAttribute('data-demo-build')){
        ['scenario','service','time'].forEach(function(key){root.querySelector('[data-demo-field="'+key+'"]').textContent=allowed[key][state[key]];});
        root.querySelector('[data-demo-field="status"]').textContent=state.scenario==='booking'?copy.bookingStatus:copy.leadStatus;
        card.hidden=false;empty.hidden=true;status.hidden=false;status.textContent=copy.formed;
      }
      if(button.hasAttribute('data-demo-reset')){
        state={scenario:'lead',service:'consultation',time:'morning'};sync();
        root.querySelector('[data-demo-group="scenario"]').focus({preventScroll:true});
      }
    });
    root.dataset.demoBound='true';
    root.querySelectorAll('button').forEach(function(button){button.disabled=false;});
  })();</script>
</section>`;
}
