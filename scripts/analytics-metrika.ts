// Yandex Metrika counter 111312750 — the single source of truth for the tag.
//
// WHY A STRING AND NOT A REACT MODULE:
//   Only the homepage and /admin-tools/* are React documents. Every other
//   public URL (25 money pages, the blog index, every article, the AI-chat
//   landing) is a standalone prerendered HTML file emitted by
//   scripts/prerender.ts and scripts/prerender-blog.ts — none of them loads
//   src/main.tsx. A tag that lived in the React tree would therefore miss the
//   entire indexed surface. The site already installs GTM, gtag and the Meta
//   Pixel as inline `data-tag="…"` blocks for exactly this reason, and the
//   catch-all Pages Function strips them from the admin shell by that
//   attribute. Metrika follows the same contract with data-tag="ym".
//
// PRIVACY CONTRACT (see docs/analytics/yandex-metrika-111312750/):
//   - The counter only boots on the production public hostnames.
//   - Private, technical and authenticated path prefixes never boot it.
//   - Hit URLs are rebuilt from pathname + a marketing query allowlist, so no
//     token, code, contact, prompt or search string can reach Metrika.
//   - Goals carry a name and nothing else — no params, therefore no PII.
//   - setUserID / userParams / firstPartyParams are never called.
//   - Webvisor is on in the counter settings, so user-content surfaces carry
//     ym-hide-content / ym-disable-keys / ym-disable-submit in the markup.

/** Public counter number. Not a secret — it ships in the page. */
export const YANDEX_METRIKA_COUNTER_ID = 111312750;

/** The production hostnames that are allowed to report. */
export const YANDEX_METRIKA_HOSTS = ['gptbot.uz', 'www.gptbot.uz'] as const;

/**
 * Path prefixes that must never be measured: the two admin consoles, the API,
 * and every auth / private-cabinet shape the site could grow.
 */
export const YANDEX_METRIKA_DENY_PREFIXES = [
  '/admin',
  '/admin-tools',
  '/api',
  '/auth',
  '/oauth',
  '/callback',
  '/cabinet',
  '/account',
  '/reset-password',
] as const;

/** Query parameters kept in an analytics URL. Everything else is dropped. */
export const YANDEX_METRIKA_QUERY_ALLOWLIST = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'yclid',
  'gclid',
] as const;

/**
 * The closed goal catalogue. Each name maps to an action that already exists
 * on the site; nothing here carries a parameter.
 */
export const YANDEX_METRIKA_GOALS = [
  'telegram_cta_click',
  'gpt_chat_open',
  'pricing_cta_click',
  'lead_form_submit_success',
] as const;

// Kept as literal text rather than interpolated so the block is greppable and
// so the copy in index.html can be compared against this one byte for byte.
export const METRIKA_HEAD = `<script data-tag="ym">
(function(w,d,c){
  var loc = w.location;
  var host = loc.hostname || '';
  // Production public site only. localhost, *.pages.dev previews and the
  // Telegram Mini App host never load the counter.
  if (host !== 'gptbot.uz' && host !== 'www.gptbot.uz') return;
  // Private, technical and authenticated surfaces are never measured. The two
  // admin consoles also strip this block server-side; this is the client guard.
  var DENY = ['/admin','/admin-tools','/api','/auth','/oauth','/callback','/cabinet','/account','/reset-password'];
  function allowed(path){
    for (var i = 0; i < DENY.length; i++){
      if (path === DENY[i] || path.indexOf(DENY[i] + '/') === 0) return false;
    }
    return true;
  }
  if (!allowed(loc.pathname || '/')) return;
  // One boot per document, whatever else on the page also inserted the tag.
  if (w.__ymBooted) return;
  w.__ymBooted = 1;

  // An analytics URL is rebuilt, never forwarded. Only marketing attribution
  // survives; tokens, codes, contacts, prompts and search text are dropped.
  // The referer is sanitized without a base, so anything that is not already an
  // absolute URL is dropped instead of being resolved against this origin.
  var KEEP = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','yclid','gclid'];
  function sanitize(href, base){
    if (!href) return '';
    try {
      var u = new URL(href, base);
      var kept = [];
      for (var i = 0; i < KEEP.length; i++){
        var v = u.searchParams.get(KEEP[i]);
        if (v) kept.push(encodeURIComponent(KEEP[i]) + '=' + encodeURIComponent(v));
      }
      return u.origin + u.pathname + (kept.length ? '?' + kept.join('&') : '');
    } catch (e) { return ''; }
  }

  // GTM owns dataLayer; keep whatever is already there.
  w.dataLayer = w.dataLayer || [];
  w.ym = w.ym || function(){ (w.ym.a = w.ym.a || []).push(arguments); };
  w.ym.l = 1 * new Date();
  var src = 'https://mc.yandex.ru/metrika/tag.js?id=' + c;
  var already = false;
  for (var j = 0; j < d.scripts.length; j++){ if (d.scripts[j].src === src) { already = true; break; } }
  if (!already) {
    var k = d.createElement('script'), a = d.getElementsByTagName('script')[0];
    k.async = 1; k.src = src;
    a.parentNode.insertBefore(k, a);
  }
  // defer:true suppresses Metrika's automatic first pageview, so every hit is
  // sent explicitly below from a sanitized URL.
  w.ym(c, 'init', {defer:true, clickmap:true, trackLinks:true, accurateTrackBounce:true, webvisor:true, ecommerce:'dataLayer', ssr:true});

  var last = '';
  function hit(){
    if (!allowed(loc.pathname || '/')) return;
    var url = sanitize(loc.href, loc.origin);
    // Identical normalized URL twice in a row is a rerender, not a pageview.
    if (!url || url === last) return;
    var referer = last || sanitize(d.referrer);
    last = url;
    var params = {title: d.title};
    if (referer) params.referer = referer;
    try { w.ym(c, 'hit', url, params); } catch (e) {}
  }
  hit();

  // SPA navigation. The delay lets the route commit its document.title first.
  function later(){ setTimeout(hit, 150); }
  var wrapped = ['pushState','replaceState'];
  for (var m = 0; m < wrapped.length; m++){
    (function(name){
      var original = w.history[name];
      w.history[name] = function(){ var r = original.apply(this, arguments); later(); return r; };
    })(wrapped[m]);
  }
  w.addEventListener('popstate', later);

  // Goals carry a name and nothing else.
  function goal(name){ try { w.ym(c, 'reachGoal', name); } catch (e) {} }
  d.addEventListener('click', function(e){
    var el = e.target && e.target.closest ? e.target.closest('a,button') : null;
    if (!el) return;
    var href = (el.getAttribute && el.getAttribute('href')) || '';
    if (href.indexOf('t.me/') > -1 || href.indexOf('tg:') === 0) { goal('telegram_cta_click'); return; }
    if (href.charAt(0) !== '/') return;
    var target = href.split('?')[0].split('#')[0];
    if (target.indexOf('/gpt-chat/') > -1 || target.indexOf('/gpt-uzbek-tilida/') > -1) goal('gpt_chat_open');
    else if (target.indexOf('tarify') > -1 || target.indexOf('narx') > -1) goal('pricing_cta_click');
  }, true);
})(window,document,111312750);
</script>`;

/**
 * JavaScript-off fallback. Same data-tag contract as the script block, so the
 * admin catch-all Function removes it with one more HTMLRewriter selector.
 */
export const METRIKA_NOSCRIPT =
  '<noscript data-tag="ym"><div><img src="https://mc.yandex.ru/watch/111312750" style="position:absolute; left:-9999px;" alt="" /></div></noscript>';
