// Yandex Metrika counter 111312750.
//
// The tag is an inline block, so the only way to prove it behaves is to run it.
// These tests execute METRIKA_HEAD against a hand-built window/document and
// assert what actually leaves the page: how many times the tag boots, how many
// hits it sends, and what survives URL sanitisation. The rest of the file pins
// the installation contract — one copy per public template, none on the admin
// surfaces, the CSP origins, and the Webvisor masking classes.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  METRIKA_HEAD,
  METRIKA_NOSCRIPT,
  YANDEX_METRIKA_COUNTER_ID,
  YANDEX_METRIKA_GOALS,
} from '../scripts/analytics-metrika';

const ROOT = path.resolve(import.meta.dirname, '..');
const source = (relative: string) => readFile(path.join(ROOT, relative), 'utf8');

const COUNTER = 111312750;

// ── harness ──────────────────────────────────────────────────────────────────

type YmCall = [number, string, ...unknown[]];

interface Harness {
  window: Record<string, unknown>;
  document: Record<string, unknown>;
  calls: YmCall[];
  inserted: { src?: string }[];
  fire: (type: string, event?: unknown) => void;
  run: () => void;
}

const SNIPPET = METRIKA_HEAD.replace(/^<script data-tag="ym">\n/, '').replace(/\n<\/script>$/, '');

function harness(options: {
  hostname?: string;
  pathname?: string;
  search?: string;
  title?: string;
  referrer?: string;
  scripts?: { src?: string }[];
  dataLayer?: unknown[];
  /** Leave undefined to exercise the tag's own queue stub. */
  recordYm?: boolean;
} = {}): Harness {
  const hostname = options.hostname ?? 'gptbot.uz';
  const calls: YmCall[] = [];
  const inserted: { src?: string }[] = [];
  const listeners: Record<string, ((event?: unknown) => void)[]> = {};
  const origin = `https://${hostname}`;

  const location = {
    hostname,
    origin,
    pathname: options.pathname ?? '/ru/tarify-ai-chat/',
    get href() {
      return origin + this.pathname + (this.search || '');
    },
    search: options.search ?? '',
  };

  const listen = (type: string, handler: (event?: unknown) => void) => {
    (listeners[type] ||= []).push(handler);
  };

  const document: Record<string, unknown> = {
    title: options.title ?? 'Тарифы',
    referrer: options.referrer ?? '',
    scripts: options.scripts ?? [],
    addEventListener: listen,
    createElement: () => ({}) as Record<string, unknown>,
    getElementsByTagName: () => [
      { parentNode: { insertBefore: (node: { src?: string }) => inserted.push(node) } },
    ],
  };

  const window: Record<string, unknown> = {
    location,
    history: { pushState() {}, replaceState() {} },
    addEventListener: listen,
  };
  if (options.dataLayer) window.dataLayer = options.dataLayer;
  if (options.recordYm !== false) {
    window.ym = (...args: unknown[]) => { calls.push(args as YmCall); };
  }

  const run = () => {
    new Function('window', 'document', SNIPPET)(window, document);
  };

  return {
    window,
    document,
    calls,
    inserted,
    fire: (type, event) => (listeners[type] || []).forEach((h) => h(event)),
    run,
  };
}

const hits = (calls: YmCall[]) => calls.filter((c) => c[1] === 'hit');
const inits = (calls: YmCall[]) => calls.filter((c) => c[1] === 'init');
const goals = (calls: YmCall[]) => calls.filter((c) => c[1] === 'reachGoal');
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ── identity and init ────────────────────────────────────────────────────────

test('metrika: the counter is 111312750 and it appears exactly once in the tag', () => {
  assert.equal(YANDEX_METRIKA_COUNTER_ID, COUNTER);
  assert.equal((METRIKA_HEAD.match(/111312750/g) ?? []).length, 1);
  assert.match(METRIKA_HEAD, /mc\.yandex\.ru\/metrika\/tag\.js/);
});

test('metrika: one boot inserts one tag.js and calls init once, with defer', () => {
  const h = harness();
  h.run();
  assert.equal(h.inserted.length, 1, 'tag.js must be inserted exactly once');
  assert.equal(h.inserted[0]?.src, `https://mc.yandex.ru/metrika/tag.js?id=${COUNTER}`);
  const init = inits(h.calls);
  assert.equal(init.length, 1);
  assert.equal(init[0][0], COUNTER);
  const settings = init[0][2] as Record<string, unknown>;
  assert.equal(settings.defer, true, 'defer:true is what makes the manual hits authoritative');
  assert.equal(settings.webvisor, true);
  assert.equal(settings.clickmap, true);
  assert.equal(settings.trackLinks, true);
  assert.equal(settings.accurateTrackBounce, true);
  assert.equal(settings.ssr, true);
  assert.equal(settings.ecommerce, 'dataLayer');
});

test('metrika: a second execution in the same document does not boot twice', () => {
  const h = harness();
  h.run();
  h.run();
  assert.equal(h.inserted.length, 1);
  assert.equal(inits(h.calls).length, 1);
  assert.equal(hits(h.calls).length, 1);
});

test('metrika: an already-present tag.js is not inserted again', () => {
  const h = harness({ scripts: [{ src: `https://mc.yandex.ru/metrika/tag.js?id=${COUNTER}` }] });
  h.run();
  assert.equal(h.inserted.length, 0);
  assert.equal(inits(h.calls).length, 1);
});

test('metrika: an existing dataLayer is preserved, never replaced', () => {
  const seeded = [{ event: 'gtm.js' }];
  const h = harness({ dataLayer: seeded });
  h.run();
  assert.equal(h.window.dataLayer, seeded);
  assert.deepEqual(h.window.dataLayer, [{ event: 'gtm.js' }]);
});

test('metrika: without the network script the queue stub absorbs every call', () => {
  const h = harness({ recordYm: false });
  h.run();
  const ym = h.window.ym as ((...a: unknown[]) => void) & { a?: unknown[][] };
  assert.equal(typeof ym, 'function');
  // init + first hit are queued for tag.js. An ad blocker leaves them queued
  // forever, which is exactly the harmless outcome we want.
  assert.ok((ym.a ?? []).length >= 2);
  assert.doesNotThrow(() => ym(COUNTER, 'reachGoal', 'telegram_cta_click'));
});

// ── where the counter must not run ───────────────────────────────────────────

for (const host of ['localhost', '127.0.0.1', 'gptbot-uz.pages.dev', 'bormi-mini-app.pages.dev']) {
  test(`metrika: nothing is measured on ${host}`, () => {
    const h = harness({ hostname: host });
    h.run();
    assert.equal(h.inserted.length, 0);
    assert.equal(h.calls.length, 0);
    assert.equal(h.window.__ymBooted, undefined);
  });
}

for (const pathname of [
  '/admin',
  '/admin/',
  '/admin/listings',
  '/admin-tools/',
  '/admin-tools/pages',
  '/api/gpt/chat',
  '/auth/callback',
  '/oauth/telegram',
  '/callback/payment',
  '/cabinet/orders',
  '/account/',
  '/reset-password/',
]) {
  test(`metrika: nothing is measured on ${pathname}`, () => {
    const h = harness({ pathname });
    h.run();
    assert.equal(h.inserted.length, 0, `${pathname} must not load the counter`);
    assert.equal(h.calls.length, 0);
  });
}

test('metrika: a public path that merely starts with the same letters is still tracked', () => {
  // /admin is denied; /administrirovanie-bota/ is a legitimate money page shape.
  const h = harness({ pathname: '/ru/administrirovanie-bota/' });
  h.run();
  assert.equal(hits(h.calls).length, 1);
});

for (const pathname of ['/', '/ru/gpt-dlya-biznesa/', '/uz/biznes-uchun-ai-bot/', '/ru/blog/kak-vnedrit-ai/', '/ru/gpt-chat/']) {
  test(`metrika: the public route ${pathname} sends its pageview`, () => {
    const h = harness({ pathname });
    h.run();
    assert.equal(hits(h.calls).length, 1);
    assert.equal(hits(h.calls)[0][2], `https://gptbot.uz${pathname}`);
  });
}

// ── hits ─────────────────────────────────────────────────────────────────────

test('metrika: the first allowed page sends exactly one hit, with its title', () => {
  const h = harness({ title: 'Тарифы на AI-чат' });
  h.run();
  const sent = hits(h.calls);
  assert.equal(sent.length, 1);
  assert.equal(sent[0][2], 'https://gptbot.uz/ru/tarify-ai-chat/');
  assert.deepEqual(sent[0][3], { title: 'Тарифы на AI-чат' });
});

test('metrika: a route change sends one more hit and a repeat of it sends none', async () => {
  const h = harness();
  h.run();
  (h.window.location as { pathname: string }).pathname = '/ru/gpt-chat/';
  (h.window.history as { pushState: () => void }).pushState();
  await wait(220);
  assert.equal(hits(h.calls).length, 2);
  assert.equal(hits(h.calls)[1][2], 'https://gptbot.uz/ru/gpt-chat/');
  // The previous page becomes the referer of the next one.
  assert.deepEqual(hits(h.calls)[1][3], {
    title: 'Тарифы',
    referer: 'https://gptbot.uz/ru/tarify-ai-chat/',
  });

  // Same URL again — a rerender, a modal, a local state change. Not a pageview.
  (h.window.history as { pushState: () => void }).pushState();
  (h.window.history as { replaceState: () => void }).replaceState();
  await wait(220);
  assert.equal(hits(h.calls).length, 2, 'an unchanged route must not report again');
});

test('metrika: Back and Forward report a pageview', async () => {
  const h = harness();
  h.run();
  (h.window.location as { pathname: string }).pathname = '/ru/blog/';
  h.fire('popstate');
  await wait(220);
  assert.equal(hits(h.calls).length, 2);
  (h.window.location as { pathname: string }).pathname = '/ru/tarify-ai-chat/';
  h.fire('popstate');
  await wait(220);
  assert.equal(hits(h.calls).length, 3);
});

test('metrika: an SPA navigation into a denied route reports nothing', async () => {
  const h = harness();
  h.run();
  (h.window.location as { pathname: string }).pathname = '/admin-tools/pages';
  (h.window.history as { pushState: () => void }).pushState();
  await wait(220);
  assert.equal(hits(h.calls).length, 1, 'only the public page it started on');
});

// ── URL sanitisation ─────────────────────────────────────────────────────────

test('metrika: marketing parameters survive and everything else is stripped', () => {
  const h = harness({
    search:
      '?utm_source=yandex&utm_medium=cpc&utm_campaign=uz&utm_content=a&utm_term=bot&yclid=1&gclid=2' +
      '&token=eyJhbGciOi&access_token=abc&code=9911&challenge=zz&initData=user%3D1&session=s1&jwt=j' +
      '&email=a%40b.uz&phone=%2B998901234567&name=Bobur&user=42&user_id=42&telegram_id=777' +
      '&prompt=my+secret+prompt&message=hi&transcript=t&text=t&query=q&q=q&search=q',
  });
  h.run();
  const url = String(hits(h.calls)[0][2]);
  assert.equal(
    url,
    'https://gptbot.uz/ru/tarify-ai-chat/?utm_source=yandex&utm_medium=cpc&utm_campaign=uz&utm_content=a&utm_term=bot&yclid=1&gclid=2',
  );
  for (const leak of [
    'token', 'access_token', 'code', 'challenge', 'initData', 'session', 'jwt',
    'email', 'phone', 'name', 'user', 'user_id', 'telegram_id',
    'prompt', 'message', 'transcript', 'text', 'query', 'search',
    'eyJhbGciOi', '998901234567', 'Bobur', 'secret',
  ]) {
    assert.ok(!url.includes(leak), `"${leak}" reached the analytics URL`);
  }
});

test('metrika: the fragment never reaches the hit', () => {
  const h = harness({ search: '#token=abc' });
  h.run();
  assert.equal(hits(h.calls)[0][2], 'https://gptbot.uz/ru/tarify-ai-chat/');
});

test('metrika: the referer is sanitised with the same policy', () => {
  const h = harness({ referrer: 'https://yandex.uz/search/?text=gptbot&utm_source=ya&token=abc' });
  h.run();
  const params = hits(h.calls)[0][3] as { referer?: string };
  assert.equal(params.referer, 'https://yandex.uz/search/?utm_source=ya');
});

test('metrika: an unparseable referer is simply omitted', () => {
  const h = harness({ referrer: 'not a url' });
  h.run();
  assert.deepEqual(hits(h.calls)[0][3], { title: 'Тарифы' });
});

// ── goals ────────────────────────────────────────────────────────────────────

function click(h: Harness, href: string) {
  h.fire('click', { target: { closest: () => ({ getAttribute: () => href }) } });
}

test('metrika: the goal catalogue is closed and every goal is fired somewhere', () => {
  assert.deepEqual([...YANDEX_METRIKA_GOALS], [
    'telegram_cta_click',
    'gpt_chat_open',
    'pricing_cta_click',
    'lead_form_submit_success',
  ]);
});

test('metrika: CTA clicks report their goal and nothing else', () => {
  const h = harness();
  h.run();
  click(h, 'https://t.me/XGame_changerx');
  click(h, '/ru/gpt-chat/');
  click(h, '/ru/tarify-ai-chat/');
  click(h, '/ru/blog/');
  const reported = goals(h.calls);
  assert.deepEqual(reported.map((c) => c[2]), [
    'telegram_cta_click',
    'gpt_chat_open',
    'pricing_cta_click',
  ]);
  // A goal is a name. There is no fourth argument that could carry user data.
  for (const call of reported) assert.equal(call.length, 3);
});

test('metrika: the React goal wrapper accepts no parameters and survives a missing tag', async () => {
  const wrapper = await source('src/lib/analytics/yandexMetrika.ts');
  assert.match(wrapper, /export function reachYandexGoal\(goal: YandexGoal\): void/);
  assert.match(wrapper, /typeof window\.ym !== 'function'/);
  // Three arguments to ym(), never a fourth: there is no slot for user data.
  assert.match(wrapper, /window\.ym\(YANDEX_METRIKA_COUNTER_ID, 'reachGoal', goal\);/);
  assert.equal((wrapper.match(/window\.ym\(/g) ?? []).length, 1, 'reachGoal is the only method used');
  for (const forbidden of ['setUserID', 'userParams', 'firstPartyParams', 'JSON.stringify']) {
    assert.ok(!wrapper.includes(forbidden), `the wrapper uses ${forbidden}`);
  }
});

test('metrika: the lead goal fires only after the server accepted the lead', async () => {
  const calculator = await source('src/calculator/CalculatorApp.tsx');
  const from = calculator.indexOf('const submitLead');
  const submit = calculator.slice(from, calculator.indexOf('\n  };', from));
  const rejected = submit.indexOf("throw new Error('lead rejected')");
  const goal = submit.indexOf('reachYandexGoal(YANDEX_GOALS.leadFormSubmitSuccess)');
  assert.ok(rejected > -1 && goal > rejected, 'the goal must sit behind the server ok check');
});

// ── no personal data can be read at all ──────────────────────────────────────

test('metrika: the tag never reads a value a visitor could have typed', () => {
  for (const forbidden of [
    '.value', 'FormData', 'localStorage', 'sessionStorage', 'document.cookie', 'innerText', 'textContent',
  ]) {
    assert.ok(!METRIKA_HEAD.includes(forbidden), `the tag reads "${forbidden}"`);
  }
});

test('metrika: no identity API is called', () => {
  for (const forbidden of ['setUserID', 'getClientID', 'userParams', 'firstPartyParams', 'firstPartyParamsHashed', 'params(']) {
    assert.ok(!METRIKA_HEAD.includes(forbidden), `the tag calls "${forbidden}" — that needs an owner decision`);
  }
});

test('metrika: nothing token-shaped is embedded in the tag', () => {
  assert.doesNotMatch(METRIKA_HEAD, /(api[_-]?key|secret|bearer)\s*[:=]\s*['"][^'"]{12,}/i);
});

// ── installation: exactly one tag per public document ────────────────────────

test('metrika: index.html carries the tag byte-for-byte and only once', async () => {
  // index.html is checked out with CRLF on Windows; only the line endings may differ.
  const html = (await source('index.html')).replace(/\r\n/g, '\n');
  assert.equal(html.split(METRIKA_HEAD).length - 1, 1, 'index.html and the shared block have drifted');
  assert.equal(html.split(METRIKA_NOSCRIPT).length - 1, 1);
  assert.equal((html.match(/data-tag="ym"/g) ?? []).length, 2, 'one script tag and one noscript tag');
  assert.equal((html.match(/mc\.yandex\.ru\/watch\/111312750/g) ?? []).length, 1, 'duplicate noscript pixel');
});

test('metrika: every prerendered template emits the tag and the noscript pixel', async () => {
  for (const file of ['scripts/prerender.ts', 'scripts/prerender-blog.ts']) {
    const script = await source(file);
    assert.match(script, /import \{ METRIKA_HEAD, METRIKA_NOSCRIPT \} from '\.\/analytics-metrika'/, file);
    const heads = (script.match(/\$\{METRIKA_HEAD\}/g) ?? []).length;
    const noscripts = (script.match(/\$\{METRIKA_NOSCRIPT\}/g) ?? []).length;
    assert.ok(heads > 0, `${file} never emits the tag`);
    assert.equal(heads, noscripts, `${file} emits ${heads} tags and ${noscripts} noscript pixels`);
    // One per HTML template, so the counts must match the GTM block's.
    assert.equal(heads, (script.match(/<script data-tag="gtm">/g) ?? []).length, file);
  }
});

test('metrika: the admin shell has the tag removed at the edge', async () => {
  const fn = await source('functions/admin-tools/[[path]].ts');
  assert.match(fn, /\.on\('script\[data-tag="ym"\]', \{ element\(el\) \{ el\.remove\(\); \} \}\)/);
  assert.match(fn, /\.on\('noscript\[data-tag="ym"\]', \{ element\(el\) \{ el\.remove\(\); \} \}\)/);
});

test('metrika: the Bormi console and the Mini App never receive the tag', async () => {
  for (const file of ['apps/bormi-admin/index.html', 'apps/market-mini-app/index.html']) {
    const html = await source(file);
    assert.ok(!html.includes('mc.yandex.ru'), `${file} must stay outside the counter`);
    assert.ok(!html.includes('111312750'), file);
  }
});

test('metrika: 404.html stays analytics-free, the same as GTM and the Pixel', async () => {
  // A deliberate gap, recorded in docs/analytics/yandex-metrika-111312750/.
  // The static 404 page carries no analytics at all; adding Metrika there is a
  // separate decision, and this test is what makes it a decision.
  const html = await source('public/404.html');
  for (const tag of ['mc.yandex.ru', '111312750', 'data-tag=']) {
    assert.ok(!html.includes(tag), `public/404.html gained ${tag} without updating the doc`);
  }
});

// ── CSP ──────────────────────────────────────────────────────────────────────

for (const file of ['public/_headers', 'scripts/generate-robots.ts']) {
  test(`metrika: ${file} allows mc.yandex.ru and nothing broader`, async () => {
    const text = await source(file);
    const csp = text.slice(text.indexOf('Content-Security-Policy:'));
    const policy = csp.slice(0, csp.indexOf('upgrade-insecure-requests'));
    for (const directive of ['script-src', 'connect-src', 'frame-src']) {
      const start = policy.indexOf(directive);
      assert.ok(start > -1, `${directive} missing in ${file}`);
      const block = policy.slice(start, policy.indexOf(';', start));
      assert.ok(block.includes('https://mc.yandex.ru'), `${directive} does not allow mc.yandex.ru`);
    }
    assert.ok(!policy.includes('yandex.*'), 'no wildcard yandex origin');
    assert.ok(!policy.includes('*.yandex'), 'no wildcard yandex origin');
    // The inline block relies on the 'unsafe-inline' that was already there for
    // GTM; Metrika must not have widened anything else.
    assert.ok(!policy.includes("default-src 'self' https:"), 'default-src was loosened');
  });
}

// ── Webvisor masking ─────────────────────────────────────────────────────────

const MASKED: [string, string][] = [
  ['scripts/prerender.ts', 'ym-hide-content'],
  ['src/gpt-chat/components/AiChatConsole.tsx', 'ym-hide-content'],
  ['src/gpt-chat/components/AiChatMessageList.tsx', 'ym-hide-content'],
  ['src/gpt-chat/components/AiChatInput.tsx', 'ym-disable-keys'],
  ['src/gpt-chat/components/ImagePromptTool.tsx', 'ym-disable-keys'],
  ['src/gpt-chat/components/ImagePromptTool.tsx', 'ym-disable-submit'],
  ['src/calculator/CalculatorApp.tsx', 'ym-disable-keys'],
  ['src/calculator/CalculatorApp.tsx', 'ym-disable-submit'],
];

for (const [file, cls] of MASKED) {
  test(`metrika: ${file} carries ${cls}`, async () => {
    assert.ok((await source(file)).includes(cls), `${file} is missing ${cls}`);
  });
}

test('metrika: the chat mount point is masked, so React cannot unmask it', async () => {
  const prerender = await source('scripts/prerender.ts');
  assert.match(prerender, /id="gpt-chat-root"[^>]*class="h-full ym-hide-content"/);
});

test('metrika: the chat textarea and both contact fields disable key recording', async () => {
  const input = await source('src/gpt-chat/components/AiChatInput.tsx');
  assert.match(input, /<textarea[\s\S]*?ym-disable-keys[\s\S]*?\/>/);
  const calculator = await source('src/calculator/CalculatorApp.tsx');
  // Counted inside className only — the file also names the class in comments.
  assert.equal(
    (calculator.match(/className="[^"]*ym-disable-keys[^"]*"/g) ?? []).length,
    2,
    'the name and contact fields',
  );
});

test('metrika: no user-facing field opts into key recording', async () => {
  for (const [file] of MASKED) {
    assert.ok(!(await source(file)).includes('ym-record-keys'), `${file} opts into key recording`);
  }
});
