// First-touch attribution, written once per browser.
//
// A lead form only knows the page it sits on. Which page the visitor first
// landed on, from which site, and with which campaign tags is gone by then —
// unless the first page view wrote it down. This block does exactly that and
// nothing more: on the first page view of a browser it stores one record under
// localStorage 'gptbot_ft_v1'; every later view sees the key and returns.
//
// Record (all optional except landing/firstSeenAt):
//   landing       pathname of the first page, no query string
//   referrerHost  hostname of an external referrer, nothing else of the URL
//   utm_source / utm_medium / utm_campaign / utm_term / utm_content (≤100 chars)
//   gclid / yclid / fbclid  only when they match [A-Za-z0-9._-]{1,200}
//   firstSeenAt   ISO timestamp
//
// The record never leaves the browser on its own. The page lead form and the
// calculator read it and send it with a lead the visitor chose to submit;
// functions/lib/gpt-chat/validate.ts sanitises it again on the server.
//
// Deliberately NOT part of scripts/analytics-snippet.ts: that block is held to
// "reads no storage" by tests/seo-analytics-privacy.test.ts, and this one sends
// nothing anywhere. No data-tag attribute either — data-tag marks analytics
// blocks the admin shell strips and the loopback-guard test inspects.
//
// Injected into the <head> of every landing (scripts/prerender.ts), article and
// blog index (scripts/prerender-blog.ts). index.html carries a byte-identical
// inline copy (tests/lead-capture-templates.test.ts compares them), because it
// is also the shell of the React homepage and of the admin SPA — hence the
// admin/api guard. Dependency-free, every access inside try/catch: private
// mode, blocked storage or an old browser simply means no record.
export const FIRST_TOUCH_STORAGE_KEY = 'gptbot_ft_v1';

export const FIRST_TOUCH_SCRIPT = `<script id="gptbot-first-touch">
(function(){try{
var K='gptbot_ft_v1',l=window.location,p=l.pathname||'/';
if(p==='/admin'||p.indexOf('/admin/')===0||p.indexOf('/admin-tools')===0||p.indexOf('/api/')===0)return;
var s=window.localStorage;if(!s||s.getItem(K))return;
var q=new URLSearchParams(l.search||''),r={landing:p.slice(0,200),firstSeenAt:new Date().toISOString()};
try{var h=document.referrer?new URL(document.referrer).hostname.toLowerCase():'';if(h&&h!==l.hostname&&/^[a-z0-9.-]{1,100}$/.test(h))r.referrerHost=h;}catch(e){}
['utm_source','utm_medium','utm_campaign','utm_term','utm_content'].forEach(function(k){var v=q.get(k);if(v)r[k]=v.slice(0,100);});
['gclid','yclid','fbclid'].forEach(function(k){var v=q.get(k);if(v&&/^[A-Za-z0-9._-]{1,200}$/.test(v))r[k]=v;});
s.setItem(K,JSON.stringify(r));
}catch(e){}})();
</script>`;
