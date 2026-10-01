// Lead capture in the prerendered templates (work package B, 2026-09-29).
//
// Run: node --import tsx --test tests/lead-capture-templates.test.ts
//
// Pins four things the prerenderers now ship:
//   - a studio Telegram link carries a prefilled first message, except on the
//     ten protected pages (scripts/telegram-cta.ts); while no work Telegram is
//     configured (L14) the form falls back to the studio phone;
//   - a first-touch record is written once per browser, sends nothing, and the
//     copy in index.html cannot drift (scripts/attribution-snippet.ts);
//   - the two-field page form posts exactly the /api/gpt/lead contract, and a
//     goal/generate_lead fires only on a literal ok:true (scripts/lead-form.ts);
//   - no form, navigation row or other visible change reaches a protected page
//     or a page on measurement hold. The 2026-09-19 hold was lifted on
//     2026-09-29 (scripts/measurement-hold.ts), so the hold checks guard an
//     empty set and the former hold pages get their cluster's templates. The
//     dist/ checks run only against a build that already contains this
//     template (otherwise they skip).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { STUDIO_TELEGRAM_URL, studioTelegramHref, studioTelegramMessage, telegramServiceLabel, withStudioTelegramPrefill } from '../scripts/telegram-cta';
import { STUDIO_PHONE, STUDIO_PHONE_DISPLAY } from '../src/shared/studio-contact';
import { FIRST_TOUCH_SCRIPT, FIRST_TOUCH_STORAGE_KEY } from '../scripts/attribution-snippet';
import { LEAD_FORM_PAGES, LEAD_FORM_SCRIPT, PRIVACY_PAGE, leadFormFallback, leadFormServiceFor, renderLeadForm } from '../scripts/lead-form';
import { MEASUREMENT_HOLD_PATHS } from '../scripts/measurement-hold';
import { PROTECTED_PATHS } from '../scripts/seo-protection';
import { ANALYTICS_HEAD } from '../scripts/analytics-snippet';
import { METRIKA_HEAD } from '../scripts/analytics-metrika';
import { sanitizeLeadAttribution, validateLead, type LeadInput } from '../functions/lib/gpt-chat/validate';
import { ensureSchema } from '../functions/lib/gpt-chat/schema';
import { onRequestPost as leadPost } from '../functions/api/gpt/lead';
import { SqliteD1 } from './helpers/sqlite-d1';
import type { Page } from '../src/shared/types';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

function listJson(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJson(full);
    return entry.name.endsWith('.json') ? [full] : [];
  });
}
const PAGES = new Map<string, Page>(
  listJson(path.join(ROOT, 'content', 'pages'))
    .map((file) => JSON.parse(fs.readFileSync(file, 'utf8')) as Page)
    .map((page) => [page.url, page]),
);

const scriptBody = (block: string) => block.replace(/^<script[^>]*>\n/, '').replace(/\n<\/script>$/, '');
/** A stand-in work account: what the templates do once one is configured. */
const WORK = 'https://t.me/studio_work';
const CALL = { ru: `Позвонить: ${STUDIO_PHONE_DISPLAY}`, uz: `Qo‘ng‘iroq qilish: ${STUDIO_PHONE_DISPLAY}` } as const;

// ── Telegram prefill ─────────────────────────────────────────────────────────

test('the prefilled message names the brand, the service and the page in both locales', () => {
  assert.equal(
    studioTelegramMessage('ru', 'Стоимость чат-бота', '/ru/stoimost-chat-bota/'),
    'Здравствуйте! Пишу с сайта GPTBot.uz. Интересует: Стоимость чат-бота. Страница: /ru/stoimost-chat-bota/',
  );
  assert.equal(
    studioTelegramMessage('uz', 'Chat-bot narxi', '/uz/chat-bot-narxi/'),
    'Assalomu alaykum! GPTBot.uz saytidan yozyapman. Qiziqtirgan xizmat: Chat-bot narxi. Sahifa: /uz/chat-bot-narxi/',
  );
});

test('no work Telegram is configured, so there is no studio Telegram href (L14)', () => {
  assert.equal(STUDIO_TELEGRAM_URL, null);
  assert.equal(studioTelegramHref('ru', 'Стоимость чат-бота', '/ru/stoimost-chat-bota/'), null);
});

test('the prefilled href is the bare contact plus one encoded text parameter', () => {
  const href = studioTelegramHref('uz', 'O‘zbekiston bo‘ylab chat-bot', '/uz/ozbekiston-boylab-chat-bot/', WORK)!;
  const url = new URL(href);
  assert.equal(`${url.origin}${url.pathname}`, WORK);
  assert.deepEqual([...url.searchParams.keys()], ['text']);
  assert.equal(url.searchParams.get('text'), studioTelegramMessage('uz', 'O‘zbekiston bo‘ylab chat-bot', '/uz/ozbekiston-boylab-chat-bot/'));
  assert.doesNotMatch(href, /["'<>\s&]/, 'the href must be safe inside any attribute');
});

test('the form falls back to the phone, and to the work Telegram once one is configured', () => {
  assert.deepEqual(leadFormFallback('ru', 'SMM-продвижение', '/ru/smm-prodvizhenie-tashkent/'), { href: `tel:${STUDIO_PHONE}`, text: CALL.ru });
  assert.deepEqual(leadFormFallback('uz', 'SMM xizmatlari', '/uz/smm-xizmatlari/'), { href: `tel:${STUDIO_PHONE}`, text: CALL.uz });
  assert.deepEqual(leadFormFallback('uz', 'SMM xizmatlari', '/uz/smm-xizmatlari/', WORK), {
    href: studioTelegramHref('uz', 'SMM xizmatlari', '/uz/smm-xizmatlari/', WORK)!,
    text: 'Telegramda yozish',
  });
});

test('the service label is one trimmed line of at most ~60 characters', () => {
  assert.equal(telegramServiceLabel('  Telegram   Ads. '), 'Telegram Ads');
  const long = telegramServiceLabel('Разработка и создание Telegram-ботов в Ташкенте для малого и среднего бизнеса под ключ');
  assert.ok(long.length <= 61, long);
  assert.ok(long.endsWith('…'));
});

// Once a work account is configured, every bare link to it gets the draft
// naming the page; while none is (L14) there is nothing to rewrite.
test('only bare studio-contact hrefs are rewritten', () => {
  const html = [
    `<a href="${WORK}">a</a>`,
    `<a href="${WORK}/">b</a>`,
    `<a href="${WORK}?text=keep">c</a>`,
    '<a href="https://t.me/gptbotuz_bot?start=site_ru">d</a>',
    `<script type="application/ld+json">{"sameAs":["${WORK}"]}</script>`,
    `<p>Пишите: ${WORK}</p>`,
  ].join('\n');
  const opts = { locale: 'ru' as const, label: 'SMM-продвижение', path: '/ru/smm-prodvizhenie-tashkent/' };
  const out = withStudioTelegramPrefill(html, opts, WORK);
  const prefilled = studioTelegramHref('ru', 'SMM-продвижение', '/ru/smm-prodvizhenie-tashkent/', WORK)!;
  assert.equal(out.split(`href="${prefilled}"`).length - 1, 2);
  assert.ok(out.includes(`href="${WORK}?text=keep"`));
  assert.ok(out.includes('href="https://t.me/gptbotuz_bot?start=site_ru"'));
  assert.ok(out.includes(`{"sameAs":["${WORK}"]}`));
  assert.ok(out.includes(`<p>Пишите: ${WORK}</p>`));
  assert.equal(withStudioTelegramPrefill(html, opts, null), html, 'no work account: nothing to rewrite');
  assert.equal(withStudioTelegramPrefill(html, opts), html, 'none is configured today');
});

test('the ten protected pages keep the bare contact link', () => {
  const html = `<a href="${WORK}">Telegram</a>`;
  for (const pathname of PROTECTED_PATHS) {
    assert.equal(withStudioTelegramPrefill(html, { locale: 'uz', label: 'x', path: pathname }, WORK), html, pathname);
  }
});

test('both prerenderers apply the prefill through the one shared helper', () => {
  for (const file of ['scripts/prerender.ts', 'scripts/prerender-blog.ts']) {
    const source = read(file);
    assert.match(source, /import \{ withStudioTelegramPrefill \} from '\.\/telegram-cta'/, file);
    assert.ok(!source.includes('?text='), `${file} builds its own prefilled link`);
  }
});

// ── first-touch attribution ──────────────────────────────────────────────────

function memoryStorage(seed: Record<string, string> = {}) {
  const data: Record<string, string> = { ...seed };
  return {
    data,
    getItem: (key: string) => (key in data ? data[key] : null),
    setItem: (key: string, value: string) => { data[key] = String(value); },
  };
}

function runFirstTouch(options: {
  pathname?: string; search?: string; referrer?: string; storage?: unknown;
}) {
  const window = {
    location: { pathname: options.pathname ?? '/ru/smm-prodvizhenie-tashkent/', search: options.search ?? '', hostname: 'gptbot.uz' },
    localStorage: options.storage,
  };
  const document = { referrer: options.referrer ?? '' };
  new Function('window', 'document', scriptBody(FIRST_TOUCH_SCRIPT))(window, document);
}

test('the first page view stores one sanitised first-touch record', () => {
  const storage = memoryStorage();
  runFirstTouch({
    storage,
    search: '?utm_source=google&utm_medium=cpc&utm_campaign=smm&gclid=Cj0KCQjw_abc-123.x&yclid=bad%20id&token=secret&phone=998901234567',
    referrer: 'https://www.Google.com/search?q=smm+tashkent',
  });
  const record = JSON.parse(storage.data[FIRST_TOUCH_STORAGE_KEY]) as Record<string, string>;
  assert.equal(record.landing, '/ru/smm-prodvizhenie-tashkent/');
  assert.equal(record.referrerHost, 'www.google.com');
  assert.equal(record.utm_source, 'google');
  assert.equal(record.utm_medium, 'cpc');
  assert.equal(record.utm_campaign, 'smm');
  assert.equal(record.gclid, 'Cj0KCQjw_abc-123.x');
  assert.equal(record.yclid, undefined, 'a malformed click id is dropped');
  assert.ok(!Number.isNaN(Date.parse(record.firstSeenAt)));
  for (const leak of ['token', 'secret', 'phone', '998901234567', 'smm+tashkent', 'search']) {
    assert.ok(!storage.data[FIRST_TOUCH_STORAGE_KEY].includes(leak), `${leak} reached the record`);
  }
  // Exactly what the server keeps: the stored attribution survives sanitising.
  const attribution = sanitizeLeadAttribution(record);
  assert.deepEqual(attribution, {
    landing: record.landing, referrerHost: record.referrerHost, gclid: record.gclid, firstSeenAt: record.firstSeenAt,
  });
});

test('the record is written once: a later view never overwrites the first touch', () => {
  const first = JSON.stringify({ landing: '/uz/chat-bot-narxi/', firstSeenAt: '2026-09-01T00:00:00.000Z' });
  const storage = memoryStorage({ [FIRST_TOUCH_STORAGE_KEY]: first });
  runFirstTouch({ storage, search: '?utm_source=yandex', referrer: 'https://yandex.uz/' });
  assert.equal(storage.data[FIRST_TOUCH_STORAGE_KEY], first);
});

test('an internal referrer, the admin shell and blocked storage leave no record and never throw', () => {
  const internal = memoryStorage();
  runFirstTouch({ storage: internal, referrer: 'https://gptbot.uz/ru/blog/' });
  assert.equal(JSON.parse(internal.data[FIRST_TOUCH_STORAGE_KEY]).referrerHost, undefined);

  for (const pathname of ['/admin-tools/pages', '/admin', '/admin/listings', '/api/gpt/lead']) {
    const storage = memoryStorage();
    runFirstTouch({ storage, pathname });
    assert.deepEqual(storage.data, {}, pathname);
  }

  const throwing = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); } };
  assert.doesNotThrow(() => runFirstTouch({ storage: throwing }));
  assert.doesNotThrow(() => runFirstTouch({ storage: undefined }));
});

test('the first-touch block sends nothing and is not an analytics block', () => {
  for (const sink of ['fetch', 'XMLHttpRequest', 'sendBeacon', 'dataLayer', 'gtag', 'ym(', 'document.cookie', 'data-tag']) {
    assert.ok(!FIRST_TOUCH_SCRIPT.includes(sink), `first-touch block touches ${sink}`);
  }
  // The analytics blocks stay storage-free (tests/seo-analytics-privacy.test.ts).
  assert.ok(!ANALYTICS_HEAD.includes('localStorage'));
  assert.ok(!METRIKA_HEAD.includes('localStorage'));
});

test('every public template carries the first-touch block exactly once per document', () => {
  const html = read('index.html').replace(/\r\n/g, '\n');
  assert.equal(html.split(FIRST_TOUCH_SCRIPT).length - 1, 1, 'index.html and scripts/attribution-snippet.ts have drifted');
  for (const [file, documents] of [['scripts/prerender.ts', 1], ['scripts/prerender-blog.ts', 2]] as const) {
    const source = read(file);
    assert.equal((source.match(/\$\{FIRST_TOUCH_SCRIPT\}/g) ?? []).length, documents, file);
    assert.equal((source.match(/<script data-tag="gtm">/g) ?? []).length, documents, file);
  }
});

// ── the lead form: allowlist ─────────────────────────────────────────────────

test('the allowlist never reaches a protected, measurement-hold, calculator or home page', () => {
  const forbidden = new Set<string>(['/', '/uz/', '/ru/kalkulyator-stoimosti-telegram-bota/', ...PROTECTED_PATHS, ...MEASUREMENT_HOLD_PATHS]);
  for (const url of Object.keys(LEAD_FORM_PAGES)) assert.ok(!forbidden.has(url), `${url} must not carry the form`);
  // The guard holds even if someone adds such a page to the allowlist later.
  for (const url of forbidden) {
    const page = PAGES.get(url);
    if (page) assert.equal(leadFormServiceFor(page), null, url);
  }
});

test('every allowlisted page is a published landing with a valid service slug', () => {
  for (const [url, service] of Object.entries(LEAD_FORM_PAGES)) {
    const page = PAGES.get(url);
    assert.ok(page, `${url} is not a page`);
    assert.equal(page.status, 'published', url);
    assert.notEqual(page.pageType, 'gpt-chat', url);
    assert.notEqual(page.designVariant, 'warm-market-signals', url);
    assert.equal(page.interactiveTool, undefined, url);
    assert.match(service, /^[a-z0-9-]{1,60}$/, url);
    assert.equal(leadFormServiceFor(page), service, url);
  }
  // Both clusters and both locales are covered, plus the agency page.
  for (const url of ['/ru/internet-reklama-tashkent/', '/uz/smm-xizmatlari/', '/ru/razrabotka-telegram-bota-tashkent/', '/uz/telegram-bot-biznes-uchun/', '/boss-digital/', '/uz/boss-digital/']) {
    assert.ok(url in LEAD_FORM_PAGES, url);
  }
});

test('after the hold lift the two Uzbek advertising landings carry the form of their RU twins', () => {
  // The 2026-09-19 measurement hold kept these two out of the allowlist until
  // it was lifted on 2026-09-29 (scripts/measurement-hold.ts).
  for (const [url, service] of [['/uz/internet-reklama-toshkent/', 'internet-reklama'], ['/uz/telegram-reklama/', 'telegram-ads']] as const) {
    assert.ok(!MEASUREMENT_HOLD_PATHS.has(url), `${url} is still on hold`);
    assert.equal(LEAD_FORM_PAGES[url], service, url);
    const page = PAGES.get(url)!;
    assert.equal(leadFormServiceFor(page), service, url);
    const html = renderLeadForm(page);
    assert.match(html, /data-testid="page-lead-form"/, url);
    assert.match(html, /data-locale="uz"/, url);
    assert.match(html, new RegExp(`data-service="${service}"`), url);
    assert.ok(html.includes(`href="${PRIVACY_PAGE.uz}"`), url);
  }
  // Same service slug as the RU twin of each page.
  assert.equal(LEAD_FORM_PAGES['/uz/internet-reklama-toshkent/'], LEAD_FORM_PAGES['/ru/internet-reklama-tashkent/']);
  assert.equal(LEAD_FORM_PAGES['/uz/telegram-reklama/'], LEAD_FORM_PAGES['/ru/telegram-ads-uzbekistan/']);
});

test('the rendered form is labelled, 44 px, and links the privacy policy of its locale', () => {
  for (const [url, locale] of [['/ru/stoimost-chat-bota/', 'ru'], ['/uz/chat-bot-narxi/', 'uz']] as const) {
    const html = renderLeadForm(PAGES.get(url)!);
    assert.ok(PAGES.get(PRIVACY_PAGE[locale])?.status === 'published', `${PRIVACY_PAGE[locale]} is not published`);
    assert.ok(html.includes(`href="${PRIVACY_PAGE[locale]}"`), url);
    assert.equal((html.match(/<form\b/g) ?? []).length, 1);
    assert.equal((html.match(/<input\b/g) ?? []).length, 3, 'name, contact, consent');
    assert.equal((html.match(/<label\b/g) ?? []).length, 3, 'every input sits in a label');
    assert.match(html, /name="contact"[^>]*required/);
    assert.match(html, /name="consent" type="checkbox" required/);
    assert.match(html, /role="status" aria-live="polite"/);
    assert.equal((html.match(/min-h-\[44px\]/g) ?? []).length, 4, 'two fields, the consent row and the button');
    assert.match(html, /ym-disable-keys/);
    assert.match(html, /ym-disable-submit/);
    assert.match(html, new RegExp(`data-locale="${locale}"`));
    assert.ok(html.includes(`data-fallback="tel:${STUDIO_PHONE}"`), url);
    assert.ok(html.includes(`data-fallback-text="${CALL[locale]}"`), url);
    assert.ok(!/contactType/.test(html + LEAD_FORM_SCRIPT), 'the form must let the server detect the contact type');
  }
  assert.equal(renderLeadForm(PAGES.get('/uz/sayt-yaratish/')!), '', 'a page outside the allowlist renders no form');
  assert.equal(renderLeadForm(PAGES.get('/ru/kalkulyator-stoimosti-telegram-bota/')!), '');
});

test('the form cannot submit natively before the script binds, so a contact never reaches a URL', () => {
  // Without the end-of-body script (JS off, a script error, a tap while the page
  // still streams) a native GET would put ?contact=+998… into the page URL and
  // from there into GA4 page_location, Metrika and the edge logs.
  for (const [url, locale] of [['/ru/stoimost-chat-bota/', 'ru'], ['/uz/chat-bot-narxi/', 'uz']] as const) {
    const html = renderLeadForm(PAGES.get(url)!);
    const formTag = html.match(/<form\b[^>]*>/)![0];
    assert.match(formTag, /\bmethod="post"/, url);
    assert.doesNotMatch(formTag, /\baction=/, url);
    assert.equal((html.match(/<button\b/g) ?? []).length, 1, url);
    assert.match(html, /<button type="submit" disabled /, `${url}: the submit button must ship disabled`);
    const noscript = html.match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1] ?? '';
    assert.ok(noscript.includes(`href="tel:${STUDIO_PHONE}"`), `${url}: no phone fallback without JS`);
    assert.ok(noscript.includes(CALL[locale]), url);
    assert.ok(!noscript.includes('target='), `${url}: a tel: link opens in place`);
  }
  // The script enables the button only after the submit handler is bound.
  const bind = LEAD_FORM_SCRIPT.indexOf("form.addEventListener('submit'");
  const enable = LEAD_FORM_SCRIPT.lastIndexOf('button.disabled=false');
  assert.ok(bind > -1 && enable > bind, 'the button is enabled before the handler is bound');
  const h = formHarness();
  assert.equal(h.button.disabled, false, 'the bound form is usable');
});

// ── the lead form: client script ─────────────────────────────────────────────

interface FakeElement {
  value?: string; checked?: boolean; disabled?: boolean; hidden?: boolean; textContent?: string;
  attrs: Record<string, string>; children: unknown[];
  setAttribute(k: string, v: unknown): void; getAttribute(k: string): string | null; removeAttribute(k: string): void;
  focus(): void; appendChild(node: unknown): void;
}

function element(extra: Partial<FakeElement> = {}): FakeElement {
  const el: FakeElement = {
    attrs: {}, children: [],
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    removeAttribute(k) { delete this.attrs[k]; },
    focus() {},
    appendChild(node) { this.children.push(node); },
    ...extra,
  };
  return el;
}

function statusElement() {
  let text = '';
  const el = element();
  Object.defineProperty(el, 'textContent', {
    get: () => text,
    set: (value: string) => { text = value; el.children.length = 0; },
  });
  return el;
}

function formHarness(options: {
  locale?: 'ru' | 'uz';
  response?: unknown;
  rejectFetch?: boolean;
  storage?: unknown;
  search?: string;
  /** The form's fallback as leadFormFallback() builds it for a work Telegram. */
  fallback?: { href: string; text: string };
} = {}) {
  const locale = options.locale ?? 'ru';
  const pathname = locale === 'uz' ? '/uz/chat-bot-narxi/' : '/ru/smm-prodvizhenie-tashkent/';
  const html = renderLeadForm(PAGES.get(pathname)!);
  const attr = (name: string) => html.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? null;
  const formAttrs: Record<string, string | null> = {
    'data-locale': attr('data-locale'),
    'data-service': attr('data-service'),
    'data-label': attr('data-label'),
    'data-fallback': options.fallback?.href ?? (attr('data-fallback') || '').replace(/&amp;/g, '&'),
    'data-fallback-text': options.fallback?.text ?? attr('data-fallback-text'),
  };
  const contact = element({ value: '' });
  const name = element({ value: '' });
  const consent = element({ checked: false });
  const button = element({ disabled: true }); // as rendered: the script enables it
  const status = statusElement();
  const listeners: Record<string, (event: unknown) => void> = {};
  const section = { querySelector: (s: string) => (s === '[data-lead-form-status]' ? status : null) };
  const controls: Record<string, FakeElement> = {
    'button[type=submit]': button, '[name=contact]': contact, '[name=name]': name, '[name=consent]': consent,
  };
  const form = {
    hidden: false,
    style: {} as Record<string, string>,
    parentNode: section,
    getAttribute: (k: string) => formAttrs[k] ?? null,
    addEventListener: (type: string, fn: (event: unknown) => void) => { listeners[type] = fn; },
    querySelector: (s: string) => controls[s] ?? null,
  };
  const requests: Array<{ url: string; init: { method: string; headers: Record<string, string>; body: string } }> = [];
  const ymCalls: unknown[][] = [];
  const window = {
    location: { pathname, search: options.search ?? '', hostname: 'gptbot.uz' },
    localStorage: options.storage ?? memoryStorage(),
    crypto: { randomUUID: () => '123e4567-e89b-12d3-a456-426614174000' },
    dataLayer: [] as Array<Record<string, unknown>>,
    ym: (...args: unknown[]) => { ymCalls.push(args); },
    fetch: (url: string, init: { method: string; headers: Record<string, string>; body: string }) => {
      requests.push({ url, init });
      if (options.rejectFetch) return Promise.reject(new Error('offline'));
      return Promise.resolve({ json: () => Promise.resolve(options.response ?? { ok: true, id: 'lead_1', delivery: 'pending' }) });
    },
  };
  const document = {
    referrer: '',
    querySelector: (s: string) => (s === '[data-lead-form]' ? form : null),
    createElement: () => element(),
    createTextNode: (text: string) => ({ text }),
  };
  new Function('window', 'document', scriptBody(LEAD_FORM_SCRIPT))(window, document);
  const submit = async () => {
    listeners.submit({ preventDefault() {} });
    for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { contact, name, consent, button, status, form, requests, ymCalls, window, submit };
}

const FIRST_TOUCH = {
  landing: '/ru/blog/skolko-stoit-smm/',
  referrerHost: 'www.google.com',
  gclid: 'Cj0KCQjw_abc-123.x',
  firstSeenAt: '2026-09-20T10:00:00.000Z',
  utm_source: 'google',
  utm_medium: 'cpc',
};

test('the page form posts the shared lead contract and the server accepts it as page_form', async () => {
  const h = formHarness({ storage: memoryStorage({ [FIRST_TOUCH_STORAGE_KEY]: JSON.stringify(FIRST_TOUCH) }) });
  h.name.value = ' Ali ';
  h.contact.value = '90 123 45 67';
  h.consent.checked = true;
  await h.submit();

  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].url, '/api/gpt/lead');
  assert.equal(h.requests[0].init.method, 'POST');
  const body = JSON.parse(h.requests[0].init.body) as LeadInput & { locale: string };
  assert.equal(body.consent, true);
  assert.equal(body.source, 'page_form');
  assert.equal(body.service, 'smm');
  assert.equal(body.contactValue, '90 123 45 67');
  assert.equal(body.contactType, undefined);
  assert.equal(body.name, 'Ali');
  assert.equal(body.pageUrl, '/ru/smm-prodvizhenie-tashkent/');
  assert.equal(body.locale, 'ru');
  assert.match(body.requestId!, /^[A-Za-z0-9_-]{16,80}$/);
  assert.deepEqual(body.utm, { utm_source: 'google', utm_medium: 'cpc' });
  assert.deepEqual(body.attribution, {
    landing: FIRST_TOUCH.landing, referrerHost: FIRST_TOUCH.referrerHost, gclid: FIRST_TOUCH.gclid, firstSeenAt: FIRST_TOUCH.firstSeenAt,
  });

  const validated = validateLead(body);
  assert.equal(validated.ok, true, validated.error);
  assert.equal(validated.value!.source, 'page_form');
  assert.equal(validated.value!.service, 'smm');
  assert.equal(validated.value!.contactValue, '+998901234567');
  assert.deepEqual(JSON.parse(validated.value!.utmJson!).attribution, { service: 'smm', ...body.attribution });
});

test('success is a literal ok:true: only then generate_lead and lead_form_success fire', async () => {
  const h = formHarness();
  h.contact.value = '@alisher_uz';
  h.consent.checked = true;
  await h.submit();
  assert.equal(h.form.hidden, true, 'the fields give way to the thank-you');
  assert.equal(h.form.style.display, 'none', 'hidden alone loses to the display:grid utility');
  assert.match(String(h.status.textContent), /Спасибо! Заявка получена/);
  assert.deepEqual(h.window.dataLayer, [{
    event: 'generate_lead', lead_source: 'page_form', service_slug: 'smm', page_path: '/ru/smm-prodvizhenie-tashkent/',
  }]);
  assert.deepEqual(h.ymCalls, [[111312750, 'reachGoal', 'lead_form_success']]);
  assert.ok(!JSON.stringify(h.window.dataLayer).includes('alisher'), 'the contact reached the dataLayer');

  for (const response of [{ ok: 'true' }, { ok: 1 }, {}, { ok: false, code: 'store_failed', message: 'Не удалось сохранить заявку. Попробуйте ещё раз чуть позже.' }]) {
    const rejected = formHarness({ response });
    rejected.contact.value = '+998 90 123 45 67';
    rejected.consent.checked = true;
    await rejected.submit();
    assert.equal(rejected.ymCalls.length, 0, JSON.stringify(response));
    assert.ok(!rejected.window.dataLayer.some((e) => e.event === 'generate_lead'), JSON.stringify(response));
    assert.equal(rejected.form.hidden, false);
    assert.equal(rejected.button.disabled, false, 'the visitor can try again');
  }
});

test('a rejected lead shows the server message and the studio phone', async () => {
  const ru = formHarness({ response: { ok: false, code: 'rate_limited', message: 'Мы уже получили вашу заявку и ответим в рабочее время.' } });
  ru.contact.value = '901234567';
  ru.consent.checked = true;
  await ru.submit();
  assert.match(String(ru.status.textContent), /Мы уже получили вашу заявку/);
  const link = ru.status.children.find((c) => (c as FakeElement).attrs !== undefined) as FakeElement & { href?: string; target?: string; textContent?: string };
  assert.ok(link, 'no contact link after an error');
  assert.equal(link.href, `tel:${STUDIO_PHONE}`);
  assert.equal(link.target, undefined, 'a tel: link opens in place');
  assert.equal(link.getAttribute('data-contact'), null, 'a phone link is not the Telegram contact');
  assert.equal(link.textContent, CALL.ru);
  assert.ok(ru.window.dataLayer.some((e) => e.event === 'lead_form_failed' && e.error_code === 'rate_limited'));

  const uz = formHarness({ locale: 'uz', response: { ok: false, code: 'turnstile_required', message: 'Подтвердите, что вы человек.' } });
  uz.contact.value = '@alisher_uz';
  uz.consent.checked = true;
  await uz.submit();
  assert.match(String(uz.status.textContent), /qo‘shimcha tekshiruv/);
  assert.ok(!String(uz.status.textContent).includes('Подтвердите'), 'an Uzbek page shows Uzbek copy');
  assert.ok(!/Telegram/.test(String(uz.status.textContent)), 'no Telegram is offered while none is configured');

  const offline = formHarness({ rejectFetch: true });
  offline.contact.value = '901234567';
  offline.consent.checked = true;
  await offline.submit();
  assert.match(String(offline.status.textContent), /Не удалось отправить заявку/);
  assert.equal(offline.button.disabled, false);
});

test('with a work Telegram the fallback link is marked as the studio contact', async () => {
  // The head click handlers count contact_click and telegram_cta_studio by
  // this marker, not by a handle (src/shared/studio-contact.ts).
  const fallback = leadFormFallback('ru', 'SMM-продвижение', '/ru/smm-prodvizhenie-tashkent/', WORK);
  const h = formHarness({ response: { ok: false, code: 'store_failed' }, fallback });
  h.contact.value = '901234567';
  h.consent.checked = true;
  await h.submit();
  const link = h.status.children.find((c) => (c as FakeElement).attrs !== undefined) as FakeElement & { href?: string; target?: string };
  assert.equal(link.href, fallback.href);
  assert.equal(link.getAttribute('data-contact'), 'studio');
  assert.equal(link.target, '_blank');
  // Today the fallback is the phone, in the form and in its <noscript> line.
  assert.ok(!renderLeadForm(PAGES.get('/ru/smm-prodvizhenie-tashkent/')!).includes('data-contact'), 'a phone fallback is not marked');
});

test('nothing is sent without a plausible contact and the consent box', async () => {
  const noContact = formHarness();
  noContact.contact.value = 'позвоните 12';
  noContact.consent.checked = true;
  await noContact.submit();
  assert.equal(noContact.requests.length, 0);
  assert.equal(noContact.contact.getAttribute('aria-invalid'), 'true');

  const noConsent = formHarness();
  noConsent.contact.value = '+998901234567';
  await noConsent.submit();
  assert.equal(noConsent.requests.length, 0);
  assert.match(String(noConsent.status.textContent), /согласие/);
});

test('a retry with the same contact reuses the request id; a corrected contact gets a new one', async () => {
  const h = formHarness({ response: { ok: false, code: 'store_failed', message: 'x' } });
  let n = 0;
  (h.window.crypto as { randomUUID: () => string }).randomUUID = () => `00000000-0000-4000-8000-00000000000${n += 1}`;
  h.consent.checked = true;
  h.contact.value = '901234567';
  await h.submit();
  await h.submit();
  h.contact.value = '901234568';
  await h.submit();
  const ids = h.requests.map((r) => (JSON.parse(r.init.body) as { requestId: string }).requestId);
  assert.equal(ids[0], ids[1]);
  assert.notEqual(ids[1], ids[2]);
});

test('without a stored record the current visit is the attribution', async () => {
  const h = formHarness({ storage: { getItem() { throw new Error('blocked'); } }, search: '?utm_source=yandex&yclid=12345&token=x' });
  h.contact.value = '901234567';
  h.consent.checked = true;
  await h.submit();
  const body = JSON.parse(h.requests[0].init.body) as { utm: Record<string, string>; attribution: Record<string, string> };
  assert.deepEqual(body.utm, { utm_source: 'yandex' });
  assert.deepEqual(body.attribution, { landing: '/ru/smm-prodvizhenie-tashkent/', yclid: '12345' });
});

test('the page-form payload is stored as page_form and alerts the owner as a site lead', async () => {
  const h = formHarness({ storage: memoryStorage({ [FIRST_TOUCH_STORAGE_KEY]: JSON.stringify(FIRST_TOUCH) }) });
  h.contact.value = '@alisher_uz';
  h.consent.checked = true;
  await h.submit();
  const body = JSON.parse(h.requests[0].init.body) as Record<string, unknown>;

  const db = new SqliteD1();
  await ensureSchema(db.asD1());
  const previous = globalThis.fetch;
  const texts: string[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    assert.ok(String(url).startsWith('https://api.telegram.org/'), String(url));
    texts.push(String((JSON.parse(String(init?.body || '{}')) as { text?: string }).text ?? ''));
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    const pending: Promise<unknown>[] = [];
    const res = await leadPost({
      request: new Request('https://gptbot.uz/api/gpt/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.10' },
        body: JSON.stringify(body),
      }),
      env: { GPT_NOTIFY_BOT_TOKEN: 'test-bot-token-never-logged', GPT_NOTIFY_CHAT_ID: '4242', GPT_HASH_SALT: 'salt', GPTBOT_DRAFTS_DB: db.asD1() },
      waitUntil: (p: Promise<unknown>) => { pending.push(p); },
    } as never);
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { ok: boolean }).ok, true);
    await Promise.all(pending);
    const rows = db.rows<{ source: string; contact_value: string; page_url: string; utm_json: string }>(
      'SELECT source, contact_value, page_url, utm_json FROM gpt_leads',
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].source, 'page_form');
    assert.equal(rows[0].contact_value, '@alisher_uz');
    assert.equal(rows[0].page_url, '/ru/smm-prodvizhenie-tashkent/');
    assert.equal((JSON.parse(rows[0].utm_json) as { attribution: { service: string } }).attribution.service, 'smm');
    assert.equal(texts.length, 1);
    assert.match(texts[0], /Заявка с сайта/);
    assert.ok(texts[0].includes('форма на странице · услуга smm · /ru/smm-prodvizhenie-tashkent/'), texts[0]);
  } finally {
    globalThis.fetch = previous;
  }
});

// ── templates: nav, sticky bar, hold pages ───────────────────────────────────

test('the landing header keeps the previous markup on measurement-hold pages and the Uzbek homepage', () => {
  const source = read('scripts/prerender.ts');
  const fn = source.slice(source.indexOf('function renderLandingHeader'), source.indexOf('function renderPage'));
  assert.ok(fn.indexOf('isMeasurementHoldPath(page.url)') > -1 && fn.indexOf('isMeasurementHoldPath(page.url)') < fn.indexOf('data-testid="site-nav"'));
  assert.ok(fn.indexOf('LEGACY_HEADER_PATHS.has(page.url)') > -1 && fn.indexOf('LEGACY_HEADER_PATHS.has(page.url)') < fn.indexOf('data-testid="site-nav"'));
  assert.match(source, /const LEGACY_HEADER_PATHS: ReadonlySet<string> = new Set\(\['\/uz\/'\]\);/);
  assert.match(source, /STICKY_BAR_EXTRA_URLS: ReadonlySet<string> = new Set\(\['\/boss-digital\/', '\/uz\/boss-digital\/'\]\)/);
});

// dist/ checks. They describe the build this template produces, so they only
// run against a dist/ that already contains it.
const DIST = path.join(ROOT, 'dist');
const distHtml = (url: string): string | null => {
  const file = path.join(DIST, url.replace(/^\//, ''), 'index.html');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
};
const built = (distHtml('/ru/stoimost-chat-bota/') || '').includes('id="gptbot-first-touch"');
const skip = !built && 'dist/ is missing or predates this template; run npm run build:fast';

test('built pages: the form sits on the allowlist only, before the FAQ', { skip }, () => {
  for (const url of Object.keys(LEAD_FORM_PAGES)) {
    const html = distHtml(url)!;
    assert.equal((html.match(/data-lead-form /g) ?? []).length, 1, url);
    assert.equal((html.match(/data-lead-form-script/g) ?? []).length, 1, url);
    assert.match(html, /<form data-lead-form method="post" /, `${url}: the form may fall back to GET`);
    assert.match(html, /<button type="submit" disabled /, `${url}: the button is live before the script binds`);
    assert.ok(html.indexOf('data-testid="page-lead-form"') < html.indexOf('data-lead-form-script'), `${url}: script before the form`);
    const faq = html.indexOf('data-testid="page-faq"');
    if (faq > -1) assert.ok(html.indexOf('data-testid="page-lead-form"') < faq, `${url}: form after the FAQ`);
  }
  for (const url of [...PROTECTED_PATHS, ...MEASUREMENT_HOLD_PATHS, '/ru/kalkulyator-stoimosti-telegram-bota/', '/ru/sotuvchi/']) {
    const html = distHtml(url);
    if (html) assert.ok(!html.includes('data-lead-form'), `${url} carries the form`);
  }
});

test('built pages: section nav everywhere except hold pages and /uz/; boss-digital has the sticky bar', { skip }, () => {
  const ru = distHtml('/ru/razrabotka-telegram-bota-tashkent/')!;
  assert.equal((ru.match(/data-testid="site-nav"/g) ?? []).length, 1);
  for (const href of ['/ru/ai-bot-dlya-biznesa/', '/ru/stoimost-chat-bota/', '/ru/internet-reklama-tashkent/', '/ru/blog/']) {
    assert.ok(ru.includes(`href="${href}"`), href);
  }
  assert.match(distHtml('/ru/stoimost-chat-bota/')!, /href="\/ru\/stoimost-chat-bota\/" aria-current="page"/);
  const uz = distHtml('/uz/telegram-bot-biznes-uchun/')!;
  assert.match(uz, /hreflang="uz" aria-current="page"/);
  assert.match(uz, /min-w-\[44px\]/);
  for (const url of [...MEASUREMENT_HOLD_PATHS, '/uz/']) {
    const html = distHtml(url);
    if (!html) continue;
    assert.ok(!html.includes('data-testid="site-nav"'), `${url} gained the nav row`);
    assert.ok(!html.includes('data-testid="language-switch"'), url);
  }
  // The five landings of the lifted 2026-09-19 hold now get the cluster header.
  for (const url of ['/uz/internet-reklama-toshkent/', '/uz/telegram-reklama/', '/uz/ai-sotuvchi/', '/uz/gpt-bot-biznes-uchun/', '/uz/sayt-yaratish/']) {
    const html = distHtml(url)!;
    assert.equal((html.match(/data-testid="site-nav"/g) ?? []).length, 1, url);
  }
  for (const url of ['/boss-digital/', '/uz/boss-digital/']) {
    assert.ok(distHtml(url)!.includes('data-testid="sticky-call-cta"'), url);
  }
});

test('built pages: protected pages carry no Telegram draft; no page names the personal account', { skip }, () => {
  for (const url of PROTECTED_PATHS) {
    const html = distHtml(url);
    if (!html) continue;
    assert.doesNotMatch(html, /t\.me\/[A-Za-z0-9_]+\?text=/, `${url} was prefilled`);
  }
  for (const page of PAGES.values()) {
    if (page.status !== 'published' || page.designVariant === 'warm-market-signals') continue;
    const html = distHtml(page.url);
    if (!html) continue;
    // The whole document since the protected revision (WP-12): visible markup,
    // the click handlers in <head> and JSON-LD sameAs alike.
    assert.ok(!html.includes('XGame_changerx'), `${page.url} names the personal account`);
  }
  const html = distHtml('/ru/stoimost-chat-bota/')!;
  assert.ok(html.includes(`href="tel:${STUDIO_PHONE}"`));
  assert.ok(html.includes('data-testid="sticky-form-cta" href="#lead-form"'), 'the call bar offers the form');
});
