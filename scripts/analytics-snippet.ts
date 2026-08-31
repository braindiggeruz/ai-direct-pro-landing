// Shared inline analytics block emitted in every prerendered <head>.
//
// Mirrors the snippet in index.html so SPA navigations and static page
// loads behave identically. Self-guards against firing on /admin-tools/*
// or /api/* (the admin SPA is served from the same Pages catch-all).
// Adds:
//   - gtag.js dynamic loader (G-V87YFL96C7)
//   - SPA route-change page_view (pushState/replaceState/popstate)
//   - global click listener for Telegram demo CTAs ->
//     gtag('event','telegram_demo_click', {page_path,page_title,cta_text,target_url})
//   - SEO funnel events on prerendered landings: seo_landing_view,
//     service_cta_click, telegram_open_attempt, language_switch
//   - contact_click when a visitor activates the studio's Telegram contact
//
// Contact semantics. A Telegram link click is observable; a sent message, a
// received request and a qualified lead are not. Google defines generate_lead
// for a lead that has actually been generated (for example, through a form),
// so the browser must not emit it at click time. contact_click remains a custom
// diagnostic event. generate_lead, working_lead, qualify_lead and
// close_convert_lead belong to a future acknowledged form, bridge or CRM signal.
//
// Privacy: every event carries page path, page title, a truncated CTA label and
// the public destination URL. No form values, phone, email, message text or
// visitor-supplied identifier reaches the dataLayer.
//
// Keep this file dependency-free; both prerender.ts and prerender-blog.ts
// import it.
export const ANALYTICS_HEAD = `<script data-tag="ga">
(function(){
  var p = location.pathname;
  if (p.indexOf('/admin-tools/')===0 || p.indexOf('/api/')===0) return;
  var h = location.hostname || '';
  if (h==='localhost' || h==='127.0.0.1' || h==='::1' || h==='[::1]' || h==='0.0.0.0' || h.slice(-6)==='.local') return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function(){ dataLayer.push(arguments); };
  gtag('js', new Date());
  gtag('config', 'G-V87YFL96C7');
  var loaded=false;
  function loadGtag(){
    if(loaded)return;loaded=true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=G-V87YFL96C7';
    document.head.appendChild(s);
  }
  function idleLoad(){
    if('requestIdleCallback' in window){window.requestIdleCallback(loadGtag,{timeout:3000});}
    else{setTimeout(loadGtag,200);}
  }
  var evs=['scroll','pointerdown','keydown','touchstart','mousemove'];
  function onInt(){evs.forEach(function(e){window.removeEventListener(e,onInt)});setTimeout(idleLoad,600);}
  evs.forEach(function(e){window.addEventListener(e,onInt,{passive:true,once:true})});
  // A visitor who never scrolls, taps or moves the mouse is still a visitor.
  // This fallback used to arm 32 s after the LOAD EVENT, which measured on
  // production 2026-08-26 put the first GA4 hit at 36 114 ms on / and 62 019 ms
  // on a cold landing, while Yandex Metrika on the same pages fired at
  // 1 533-5 288 ms. Every visit shorter than that was recorded by Metrika and
  // by Search Console and was invisible in GA4 - which is what the owner saw as
  // "traffic dropped to zero". Two bounds now, whichever lands first: a short
  // one after load, and a ceiling counted from this snippet, so a slow load
  // event cannot carry the measurement away with it. loadGtag is idempotent,
  // so both of them firing costs nothing.
  if(document.readyState==='complete'){setTimeout(idleLoad,2500);}else{window.addEventListener('load',function(){setTimeout(idleLoad,2500)});}
  setTimeout(idleLoad,8000);
  var last = location.pathname;
  function fire(){ if(window.gtag){ gtag('event','page_view',{page_path:location.pathname,page_title:document.title}); } }
  ['pushState','replaceState'].forEach(function(m){
    var o = history[m];
    history[m] = function(){ var r = o.apply(this, arguments); if(location.pathname!==last){ last = location.pathname; setTimeout(fire,0); } return r; };
  });
  window.addEventListener('popstate', function(){ if(location.pathname!==last){ last=location.pathname; fire(); } });
  // Landing view. Fires once per prerendered SEO page so commercial pages can be
  // segmented from the SPA homepage in GA4.
  var seoLocale = p.indexOf('/uz/')===0 ? 'uz' : (p.indexOf('/ru/')===0 ? 'ru' : 'root');
  var isArticle = p.indexOf('/blog/')>-1;
  // Which service page the enquiry came from, taken from the URL alone.
  var seg = p.split('/').filter(Boolean);
  var serviceSlug = seg.length ? seg[seg.length-1] : 'home';
  // Above-the-fold CTAs convert differently from the ones after the pricing
  // block, and that is worth knowing without measuring anything about a person.
  function ctaZone(node){
    try { return (node.getBoundingClientRect().top + (window.pageYOffset||0)) < 900 ? 'hero' : 'body'; }
    catch (err) { return 'body'; }
  }
  if (seoLocale!=='root') {
    gtag('event', isArticle ? 'seo_article_view' : 'seo_landing_view', {
      page_path: p,
      page_title: document.title,
      locale: seoLocale,
      page_kind: isArticle ? 'article' : 'landing'
    });
  }
  document.addEventListener('click', function(e){
    var el = e.target && e.target.closest ? e.target.closest('a,button') : null;
    if(!el || !window.gtag) return;
    var text = ((el.innerText || el.textContent || '') + '').trim();
    var href = (el.getAttribute && el.getAttribute('href')) || '';
    var label = text.substring(0,80);
    var isTg = /t\\.me\\//i.test(href) || /^tg:/i.test(href);
    var isDemo = /дем[оа]|demo|telegram|телегра/i.test(text);
    if (isTg || (isDemo && text.length < 60)) {
      gtag('event','telegram_demo_click',{
        page_path: location.pathname,
        page_title: document.title,
        cta_text: label,
        target_url: href
      });
    }
    // The studio's own contact handles, mirroring content/global/site.json.
    // Everything else on t.me is one of our product bots.
    var isContactTg = isTg && /t\\.me\\/(XGame_changerx|GPTBot_support)(\\b|\\/|$)/i.test(href);
    if (isTg) {
      gtag('event','telegram_open_attempt',{
        page_path: location.pathname,
        locale: seoLocale,
        page_kind: isArticle ? 'article' : 'landing',
        service_slug: serviceSlug,
        cta_text: label,
        cta_zone: ctaZone(el),
        target_url: href,
        contact_kind: isContactTg ? 'contact' : 'product_bot'
      });
    }
    // A browser click only proves that the official contact link was activated.
    // It does not prove Telegram opened, a message was sent, or a request was
    // received. Keep this as a custom contact_click event; generate_lead is
    // reserved for a future server, form or CRM acknowledgement.
    if (isContactTg) {
      gtag('event','contact_click',{
        page_path: location.pathname,
        locale: seoLocale,
        page_kind: isArticle ? 'article' : 'landing',
        service_slug: serviceSlug,
        cta_text: label,
        cta_zone: ctaZone(el),
        target_url: href,
        contact_kind: 'contact',
        contact_method: 'telegram'
      });
    }
    // Any CTA on a service landing that leads off-page or to another service.
    if (!isTg && href && href.charAt(0)==='/' && el.tagName==='A' &&
        (el.className||'').toString().indexOf('bg-grad-cta')>-1) {
      gtag('event','service_cta_click',{
        page_path: location.pathname,
        cta_text: label,
        target_url: href
      });
    }
    // Article -> commercial page. The hub of each cluster is a locale-root
    // service path, so a same-locale link out of an article that is not itself
    // an article is the money-page hop we want to measure.
    if (isArticle && href && href.charAt(0)==='/' && href.indexOf('/blog/')===-1 &&
        href.indexOf('/'+seoLocale+'/')===0 && href.length > 5) {
      gtag('event','seo_money_page_click',{
        page_path: location.pathname,
        cta_text: label,
        target_url: href
      });
    }
    // Locale switch links carry an explicit hreflang attribute.
    var hl = el.getAttribute && el.getAttribute('hreflang');
    if (hl) {
      gtag('event','language_switch',{
        page_path: location.pathname,
        from_locale: seoLocale,
        to_locale: hl
      });
    }
  }, true);
})();
</script>`;
