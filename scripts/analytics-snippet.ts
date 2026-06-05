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
//
// Keep this file dependency-free; both prerender.ts and prerender-blog.ts
// import it.
export const ANALYTICS_HEAD = `<script data-tag="ga">
(function(){
  var p = location.pathname;
  if (p.indexOf('/admin-tools/')===0 || p.indexOf('/api/')===0) return;
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=G-V87YFL96C7';
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function(){ dataLayer.push(arguments); };
  gtag('js', new Date());
  gtag('config', 'G-V87YFL96C7');
  var last = location.pathname;
  function fire(){ if(window.gtag){ gtag('event','page_view',{page_path:location.pathname,page_title:document.title}); } }
  ['pushState','replaceState'].forEach(function(m){
    var o = history[m];
    history[m] = function(){ var r = o.apply(this, arguments); if(location.pathname!==last){ last = location.pathname; setTimeout(fire,0); } return r; };
  });
  window.addEventListener('popstate', function(){ if(location.pathname!==last){ last=location.pathname; fire(); } });
  document.addEventListener('click', function(e){
    var el = e.target && e.target.closest ? e.target.closest('a,button') : null;
    if(!el || !window.gtag) return;
    var text = ((el.innerText || el.textContent || '') + '').trim();
    var href = (el.getAttribute && el.getAttribute('href')) || '';
    var isTg = /t\\.me\\//i.test(href) || /^tg:/i.test(href);
    var isDemo = /дем[оа]|demo|telegram|телегра/i.test(text);
    if (isTg || (isDemo && text.length < 60)) {
      gtag('event','telegram_demo_click',{
        page_path: location.pathname,
        page_title: document.title,
        cta_text: text.substring(0,80),
        target_url: href
      });
    }
  }, true);
})();
</script>
<script src="https://analytics.ahrefs.com/analytics.js" data-key="Nnyl6F9bFd2XBzhizTHSVg" async data-tag="ahrefs"></script>`;
