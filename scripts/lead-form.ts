// Two-field lead form for the commercial landings of two clusters.
//
// Until now a visitor on a service page had exactly two ways to enquire: call,
// or leave the site for Telegram. Both work for someone ready to talk; neither
// catches the visitor who would leave a number and wait. This form does: name
// (optional), phone or Telegram (required), consent. It posts to the same
// /api/gpt/lead endpoint as the AI chat and the calculator, with
// source:'page_form', the page's service slug and the first-touch record the
// head snippet stored (scripts/attribution-snippet.ts). The endpoint validates
// everything again (functions/lib/gpt-chat/validate.ts) and alerts the owner.
//
// Rendered by scripts/prerender.ts ONLY on the pages in LEAD_FORM_PAGES, near
// the end of <main>, before the FAQ.
import { MEASUREMENT_HOLD_PATHS } from './measurement-hold';
import { PROTECTED_PATHS } from './seo-protection';
import { studioTelegramHref, telegramServiceLabel } from './telegram-cta';

/**
 * Explicit allowlist: page URL → service slug sent with the lead
 * (/^[a-z0-9-]{1,60}$/, see normalizeLeadService).
 *
 * Deliberately NOT listed, and asserted in tests/lead-capture-templates.test.ts:
 *   - the homepage and the ten protected pages (scripts/seo-protection.ts);
 *   - the nine measurement-hold pages until 2026-10-03
 *     (scripts/measurement-hold.ts) — which is why /uz/internet-reklama-toshkent/
 *     and /uz/telegram-reklama/ are missing from the Uzbek advertising cluster;
 *   - /ru/kalkulyator-stoimosti-telegram-bota/, which has its own form;
 *   - the GPTBot Market pages and the AI-chat pages.
 */
export const LEAD_FORM_PAGES: Readonly<Record<string, string>> = {
  // Advertising and marketing services — RU
  '/ru/internet-reklama-tashkent/': 'internet-reklama',
  '/ru/kontekstnaya-reklama-tashkent/': 'kontekstnaya-reklama',
  '/ru/targetirovannaya-reklama-tashkent/': 'target',
  '/ru/telegram-ads-uzbekistan/': 'telegram-ads',
  '/ru/smm-prodvizhenie-tashkent/': 'smm',
  '/ru/performance-marketing-tashkent/': 'performance-marketing',
  '/ru/digital-marketing-tashkent/': 'digital-marketing',
  '/ru/digital-strategiya-dlya-biznesa/': 'digital-strategiya',
  '/ru/marketingovyi-audit-tashkent/': 'marketing-audit',
  // Advertising and marketing services — UZ
  '/uz/smm-xizmatlari/': 'smm',
  // Telegram bots and chat bots — RU
  '/ru/razrabotka-telegram-bota-tashkent/': 'telegram-bot',
  '/ru/telegram-bot-dlya-biznesa/': 'telegram-bot',
  '/ru/chat-bot-dlya-biznesa/': 'chat-bot',
  '/ru/stoimost-chat-bota/': 'chat-bot',
  '/ru/razrabotka-telegram-mini-app-tashkent/': 'telegram-mini-app',
  '/ru/chat-bot-po-uzbekistanu/': 'chat-bot',
  '/ru/chat-bot-v-samarkande/': 'chat-bot',
  // Telegram bots and chat bots — UZ
  '/uz/telegram-bot-biznes-uchun/': 'telegram-bot',
  '/uz/chat-bot-biznes-uchun/': 'chat-bot',
  '/uz/chat-bot-narxi/': 'chat-bot',
  '/uz/ozbekiston-boylab-chat-bot/': 'chat-bot',
  '/uz/samarqandda-chat-bot/': 'chat-bot',
  // The agency page, both locales
  '/boss-digital/': 'boss-digital',
  '/uz/boss-digital/': 'boss-digital',
};

/** Pages that must never carry the form, whatever the allowlist says. */
const EXCLUDED: ReadonlySet<string> = new Set<string>([
  '/', '/uz/', '/ru/kalkulyator-stoimosti-telegram-bota/',
  ...PROTECTED_PATHS,
  ...MEASUREMENT_HOLD_PATHS,
]);

export const PRIVACY_PAGE = { ru: '/ru/politika-konfidentsialnosti/', uz: '/uz/maxfiylik-siyosati/' } as const;

interface LeadFormPage {
  url: string;
  locale: string;
  h1: string;
  breadcrumbLabel?: string;
  pageType?: string;
  designVariant?: string;
  interactiveTool?: string;
}

/** The service slug when this page gets the form, otherwise null. */
export function leadFormServiceFor(page: LeadFormPage): string | null {
  const service = LEAD_FORM_PAGES[page.url];
  if (!service || EXCLUDED.has(page.url)) return null;
  if (page.pageType === 'gpt-chat' || page.designVariant === 'warm-market-signals' || page.interactiveTool) return null;
  return service;
}

// Visible copy. Hours are the ones the site already publishes (footer, the
// Organization schema): Mon–Sat 10:00–19:00. No response-time promise beyond it.
const COPY = {
  ru: {
    eyebrow: 'Заявка',
    heading: 'Обсудить задачу',
    intro: 'Оставьте телефон или Telegram — ответим в рабочее время, Пн–Сб 10:00–19:00. Имя можно не указывать.',
    name: 'Имя',
    optional: '(необязательно)',
    contact: 'Телефон или Telegram',
    placeholder: '+998 90 123 45 67 или @username',
    consentBefore: 'Согласен на обработку контакта для ответа на заявку по ',
    consentLink: 'политике конфиденциальности',
    consentAfter: '.',
    submit: 'Отправить заявку',
  },
  uz: {
    eyebrow: 'Ariza',
    heading: 'Vazifani muhokama qilish',
    intro: 'Telefon raqamingiz yoki Telegram manzilingizni qoldiring — ish vaqtida javob beramiz: Du–Sha 10:00–19:00. Ismni ko‘rsatish shart emas.',
    name: 'Ism',
    optional: '(ixtiyoriy)',
    contact: 'Telefon yoki Telegram',
    placeholder: '+998 90 123 45 67 yoki @username',
    consentBefore: 'Arizaga javob berish uchun kontaktimni ',
    consentLink: 'maxfiylik siyosati',
    consentAfter: ' asosida qayta ishlashga roziman.',
    submit: 'Ariza yuborish',
  },
} as const;

/** Status lines the client script shows. Server codes map onto these. */
const CLIENT_COPY = {
  ru: {
    contact: 'Укажите телефон (например, +998 90 123 45 67) или Telegram (@username).',
    consent: 'Отметьте согласие — без него мы не можем ответить на заявку.',
    sending: 'Отправляем…',
    success: 'Спасибо! Заявка получена. Ответим в рабочее время, Пн–Сб 10:00–19:00.',
    turnstile: 'Форма просит дополнительную проверку. Напишите нам в Telegram:',
    failed: 'Не удалось отправить заявку. Напишите нам в Telegram:',
    telegram: 'Написать в Telegram',
  },
  uz: {
    contact: 'Telefon raqami (masalan, +998 90 123 45 67) yoki Telegram (@username) kiriting.',
    consent: 'Roziligingizni belgilang — busiz arizaga javob bera olmaymiz.',
    sending: 'Yuborilmoqda…',
    success: 'Rahmat! Ariza qabul qilindi. Ish vaqtida javob beramiz: Du–Sha 10:00–19:00.',
    turnstile: 'Bu yerda qo‘shimcha tekshiruv talab qilinmoqda. Telegramda yozing:',
    rateLimited: 'Arizangiz allaqachon qabul qilingan. Shoshilinch bo‘lsa, Telegramda yozing:',
    failed: 'Arizani yuborib bo‘lmadi. Telegramda yozing:',
    telegram: 'Telegramda yozish',
  },
} as const;

function escapeAttr(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function escapeText(s: string): string {
  return s.replace(/[&<]/g, (c) => ({ '&': '&amp;', '<': '&lt;' }[c]!));
}

const INPUT_CLASS =
  'min-h-[44px] w-full rounded-xl border border-white/15 bg-bg-base/70 px-4 py-2.5 text-base text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-brand-cyan/60 aria-[invalid=true]:border-amber-300/70 ym-disable-keys';

/**
 * The form section, or '' when the page is not on the allowlist.
 *
 * The form must never submit natively. Its only handler is LEAD_FORM_SCRIPT at
 * the end of <body>; without it (JS off, the script failing before it binds, or
 * a tap while a slow connection is still streaming the page) a native GET would
 * put ?contact=+998… into the page URL, where the analytics tags and edge logs
 * record it. So the submit button ships `disabled` and only the script enables
 * it, after binding; `method="post"` keeps any other fallback out of the query
 * string; and a <noscript> line offers Telegram instead of a dead form.
 */
export function renderLeadForm(page: LeadFormPage): string {
  const service = leadFormServiceFor(page);
  if (!service) return '';
  const locale = page.locale === 'uz' ? 'uz' : 'ru';
  const t = COPY[locale];
  const label = telegramServiceLabel(page.breadcrumbLabel || page.h1);
  const telegram = studioTelegramHref(locale, label, page.url);
  return `<section id="lead-form" data-testid="page-lead-form" aria-labelledby="lead-form-heading" class="mt-16 scroll-mt-24 rounded-2xl border border-brand-cyan/20 bg-brand-cyan/[0.04] p-5 sm:p-8">
      <div class="eyebrow mb-3">${escapeText(t.eyebrow)}</div>
      <h2 id="lead-form-heading" class="font-display text-2xl sm:text-3xl text-white mb-3">${escapeText(t.heading)}</h2>
      <p class="text-sm sm:text-base text-white/70 leading-relaxed mb-6">${escapeText(t.intro)}</p>
      <form data-lead-form method="post" data-service="${escapeAttr(service)}" data-locale="${locale}" data-label="${escapeAttr(label)}" data-telegram="${escapeAttr(telegram)}" class="grid gap-4 ym-disable-submit" novalidate>
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="grid gap-2 text-sm text-white/80">
            <span>${escapeText(t.name)} <span class="text-white/45">${escapeText(t.optional)}</span></span>
            <input name="name" type="text" autocomplete="name" maxlength="80" class="${INPUT_CLASS}" />
          </label>
          <label class="grid gap-2 text-sm text-white/80">
            <span>${escapeText(t.contact)}</span>
            <input name="contact" type="text" autocomplete="tel" required aria-required="true" maxlength="100" placeholder="${escapeAttr(t.placeholder)}" class="${INPUT_CLASS}" />
          </label>
        </div>
        <label class="flex min-h-[44px] cursor-pointer items-start gap-3 text-sm leading-relaxed text-white/70">
          <input name="consent" type="checkbox" required aria-required="true" class="mt-0.5 h-5 w-5 shrink-0 accent-[#2FE6D1]" />
          <span>${escapeText(t.consentBefore)}<a href="${PRIVACY_PAGE[locale]}" class="text-brand-cyan underline underline-offset-2 hover:no-underline">${escapeText(t.consentLink)}</a>${escapeText(t.consentAfter)}</span>
        </label>
        <div>
          <button type="submit" disabled class="btn-primary min-h-[44px] w-full sm:w-auto disabled:cursor-not-allowed disabled:opacity-60">${escapeText(t.submit)}</button>
        </div>
      </form>
      <p data-lead-form-status role="status" aria-live="polite" tabindex="-1" class="mt-4 text-sm leading-relaxed text-white/80 focus:outline-none"></p>
      <noscript><p class="mt-4 text-sm"><a href="${escapeAttr(telegram)}" target="_blank" rel="nofollow noopener noreferrer" class="inline-block py-3 font-semibold text-brand-cyan underline underline-offset-2 hover:no-underline">${escapeText(CLIENT_COPY[locale].telegram)}</a></p></noscript>
    </section>`;
}

// The client half. Plain ES5 in a String.raw template (regexes stay readable),
// no dependencies, one form per page. It reads storage and input values —
// which is why it is its own block and never part of the analytics snippets.
// Success is only a literal { ok: true } from the endpoint; only then do
// generate_lead (dataLayer) and the Metrika goal lead_form_success fire.
export const LEAD_FORM_SCRIPT = String.raw`<script data-lead-form-script>
(function(){
  var form=document.querySelector('[data-lead-form]');if(!form||!form.addEventListener)return;
  var COPY=${JSON.stringify(CLIENT_COPY)};
  var uz=form.getAttribute('data-locale')==='uz',T=uz?COPY.uz:COPY.ru;
  var service=form.getAttribute('data-service')||'',label=form.getAttribute('data-label')||'';
  var tgHref=form.getAttribute('data-telegram')||'https://t.me/XGame_changerx';
  var section=form.parentNode,status=section&&section.querySelector('[data-lead-form-status]');
  var button=form.querySelector('button[type=submit]'),contactEl=form.querySelector('[name=contact]'),nameEl=form.querySelector('[name=name]'),consentEl=form.querySelector('[name=consent]');
  var UTM=['utm_source','utm_medium','utm_campaign','utm_term','utm_content'],CLICK=['gclid','yclid','fbclid'];
  var busy=false,rid='',ridFor='';
  function newId(){
    try{if(window.crypto&&typeof window.crypto.randomUUID==='function')return 'pf_'+window.crypto.randomUUID().replace(/-/g,'');}catch(e){}
    var r='';while(r.length<24)r+=Math.random().toString(36).slice(2);
    return ('pf_'+Date.now().toString(36)+r).replace(/[^A-Za-z0-9_]/g,'').slice(0,60);
  }
  function readFt(){
    try{var raw=window.localStorage.getItem('gptbot_ft_v1');var o=raw?JSON.parse(raw):null;return o&&typeof o==='object'&&!(o instanceof Array)?o:{};}catch(e){return {};}
  }
  function str(v){return typeof v==='string'&&v?v.slice(0,200):'';}
  function utm(ft){
    var cur={},any=false,out={};
    try{var q=new URLSearchParams(window.location.search||'');for(var i=0;i<UTM.length;i++){var v=q.get(UTM[i]);if(v){cur[UTM[i]]=v.slice(0,100);any=true;}}}catch(e){}
    if(any)return cur;
    for(var j=0;j<UTM.length;j++){var w=str(ft[UTM[j]]);if(w)out[UTM[j]]=w.slice(0,100);}
    return out;
  }
  function attribution(ft){
    var a={},keys=['landing','referrerHost','gclid','yclid','fbclid','firstSeenAt'];
    if(str(ft.landing)){for(var i=0;i<keys.length;i++){var v=str(ft[keys[i]]);if(v)a[keys[i]]=v;}return a;}
    a.landing=window.location.pathname;
    try{
      var q=new URLSearchParams(window.location.search||'');
      for(var j=0;j<CLICK.length;j++){var c=q.get(CLICK[j]);if(c&&/^[A-Za-z0-9._-]{1,200}$/.test(c))a[CLICK[j]]=c;}
      var h=document.referrer?new URL(document.referrer).hostname.toLowerCase():'';
      if(h&&h!==window.location.hostname)a.referrerHost=h;
    }catch(e){}
    return a;
  }
  function looksLikeContact(v){
    var digits=v.replace(/\D/g,'');
    if(/^\+?[\d\s()-]+$/.test(v)&&digits.length>=9&&digits.length<=15)return true;
    if(/^(?:@|(?:https?:\/\/)?t\.me\/)?[A-Za-z][A-Za-z0-9_]{4,31}$/.test(v))return true;
    return /^[^\s@]{1,64}@[^\s@.]{1,190}\.[^\s@]{2,63}$/.test(v);
  }
  function say(text,withTelegram){
    if(!status)return;
    status.textContent=text;
    if(withTelegram){
      var a=document.createElement('a');
      a.href=tgHref;a.target='_blank';a.rel='nofollow noopener noreferrer';
      a.className='ml-1 inline-flex min-h-[44px] items-center font-semibold text-brand-cyan underline underline-offset-2 hover:no-underline';
      a.textContent=T.telegram;
      status.appendChild(document.createTextNode(' '));status.appendChild(a);
    }
  }
  function track(obj){try{window.dataLayer=window.dataLayer||[];window.dataLayer.push(obj);}catch(e){}}
  function done(){
    busy=false;
    if(button){button.disabled=false;button.removeAttribute('aria-busy');}
  }
  function success(){
    // hidden alone loses to the form's display:grid utility class.
    busy=false;form.hidden=true;try{form.style.display='none';}catch(e){}
    say(T.success,false);
    try{if(status)status.focus();}catch(e){}
    track({event:'generate_lead',lead_source:'page_form',service_slug:service,page_path:window.location.pathname});
    try{if(typeof window.ym==='function')window.ym(111312750,'reachGoal','lead_form_success');}catch(e){}
  }
  // Russian server messages that read well to a visitor. Anything else (a
  // validation detail, an English protocol error) gets the local line instead.
  var SERVER_TEXT={rate_limited:1,store_unavailable:1,store_failed:1,rate_limit_unavailable:1,turnstile_unavailable:1};
  function fail(code,message){
    done();
    var text;
    if(code==='invalid_lead'){text=T.contact;if(contactEl)contactEl.setAttribute('aria-invalid','true');}
    else if(code==='turnstile_required'||code==='turnstile_failed')text=T.turnstile;
    else if(uz)text=code==='rate_limited'?T.rateLimited:T.failed;
    else text=SERVER_TEXT[code]===1&&message?message:T.failed;
    say(text,code!=='invalid_lead');
    track({event:'lead_form_failed',lead_source:'page_form',service_slug:service,error_code:String(code).slice(0,40)});
  }
  form.addEventListener('submit',function(e){
    if(e&&e.preventDefault)e.preventDefault();
    if(busy)return;
    var contact=((contactEl&&contactEl.value)||'').trim(),name=((nameEl&&nameEl.value)||'').trim();
    if(!looksLikeContact(contact)){
      if(contactEl){contactEl.setAttribute('aria-invalid','true');try{contactEl.focus();}catch(err){}}
      say(T.contact,false);return;
    }
    if(contactEl)contactEl.removeAttribute('aria-invalid');
    if(!consentEl||!consentEl.checked){say(T.consent,false);try{consentEl.focus();}catch(err){}return;}
    if(ridFor!==contact){rid=newId();ridFor=contact;}
    busy=true;
    if(button){button.disabled=true;button.setAttribute('aria-busy','true');}
    say(T.sending,false);
    var ft=readFt();
    var body={consent:true,contactValue:contact,source:'page_form',service:service,intent:label,pageUrl:window.location.pathname,locale:uz?'uz':'ru',requestId:rid,utm:utm(ft),attribution:attribution(ft)};
    if(name)body.name=name.slice(0,80);
    var request;
    try{request=window.fetch('/api/gpt/lead',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(body)});}
    catch(err){fail('network','');return;}
    request.then(function(r){return r.json().then(null,function(){return {};});})
      .then(function(d){
        if(d&&d.ok===true){success();return;}
        fail(d&&typeof d.code==='string'?d.code:'rejected',d&&typeof d.message==='string'?d.message:'');
      },function(){fail('network','');});
  });
  // The button ships disabled so the form can never submit natively; it goes
  // live only now that the handler above is bound.
  if(button)button.disabled=false;
})();
</script>`;
