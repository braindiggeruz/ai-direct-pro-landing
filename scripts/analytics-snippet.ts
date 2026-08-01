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
//
// Privacy: every event carries page path, page title, a truncated CTA label and
// the outgoing URL. No form values, no phone or email, no Telegram username, no
// message text — nothing a visitor typed ever reaches the dataLayer.
//
// Keep this file dependency-free; both prerender.ts and prerender-blog.ts
// import it.
export const ANALYTICS_HEAD = `<script data-tag="ga">
(function(){
  var p = location.pathname;
  if (p.indexOf('/admin-tools/')===0 || p.indexOf('/api/')===0) return;
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
  if(document.readyState==='complete'){setTimeout(idleLoad,32000);}else{window.addEventListener('load',function(){setTimeout(idleLoad,32000)});}
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
  if (seoLocale!=='root') {
    gtag('event','seo_landing_view',{
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
    if (isTg) {
      gtag('event','telegram_open_attempt',{
        page_path: location.pathname,
        cta_text: label,
        target_url: href
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
