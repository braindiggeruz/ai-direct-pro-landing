import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import type { Page } from '../src/shared/types';
import { renderLeadForm, renderLeadFormScript } from '../scripts/lead-form';
import { isTargetLanding, renderTargetLanding, renderTargetSticky } from '../scripts/target-landing';

const root = path.resolve(import.meta.dirname, '..');
const targetPath = '/uz/instagram-target-yoqish/';
const page = JSON.parse(fs.readFileSync(path.join(root, 'content/pages/uz/instagram-target-yoqish.json'), 'utf8')) as Page;
const occurrences = (html: string, pattern: RegExp) => [...html.matchAll(pattern)].length;

type ClientEvent = { target?: ClientNode; preventDefault?: () => void };
class ClientNode {
  attrs: Record<string, string> = {};
  handlers: Record<string, Array<(event: ClientEvent) => unknown>> = {};
  children: ClientNode[] = [];
  fields: Record<string, ClientNode> = {};
  parentNode: ClientNode | null = null;
  href = ''; value = ''; textContent = ''; checked = false; hidden = false; disabled = false;
  style: Record<string, string> = {};
  fallback = false;
  getAttribute(key: string) { return this.attrs[key] ?? null; }
  setAttribute(key: string, value: string) { this.attrs[key] = value; }
  removeAttribute(key: string) { delete this.attrs[key]; }
  addEventListener(type: string, fn: (event: ClientEvent) => unknown) { (this.handlers[type] ||= []).push(fn); }
  removeEventListener(type: string, fn: (event: ClientEvent) => unknown) { this.handlers[type] = (this.handlers[type] || []).filter(item => item !== fn); }
  querySelector(selector: string) { return this.fields[selector] || null; }
  appendChild(node: ClientNode) { this.children.push(node); return node; }
  closest(selector: string) { return selector === 'a' || (selector === '[data-lead-form-status]' && this.fallback) ? this : null; }
  focus() { /* No real browser interaction. */ }
  fire(type: string, event: ClientEvent = {}) { for (const fn of this.handlers[type] || []) fn(event); }
}
function targetClient(options: { url?: string; privacy?: Record<string, unknown>; response?: object; hidden?: boolean; storage?: Map<string, string> } = {}) {
  const form = new ClientNode(), section = new ClientNode(), status = new ClientNode(), telegram = new ClientNode();
  form.attrs = { 'data-locale':'uz', 'data-service':'target', 'data-label':'Target', 'data-fallback':'https://t.me/fixture_studio?text=Estimate', 'data-fallback-text':'Telegram' };
  telegram.attrs = { 'data-contact':'studio', 'data-cta-zone':'hero' }; telegram.href = form.attrs['data-fallback'];
  form.parentNode = section; section.fields['[data-lead-form-status]'] = status;
  for (const field of ['contact', 'name', 'task', 'budget', 'consent']) form.fields[`[name=${field}]`] = new ClientNode();
  form.fields['button[type=submit]'] = new ClientNode();
  form.fields['[name=contact]'].value = '@private_fixture'; form.fields['[name=consent]'].checked = true;
  const document = Object.assign(new ClientNode(), {
    visibilityState: options.hidden ? 'hidden' : 'visible', referrer:'', head:new ClientNode(),
    querySelectorAll: () => [telegram], createElement: () => new ClientNode(), createTextNode: () => new ClientNode(),
  });
  document.fields['[data-lead-form]'] = form;
  const pixel: unknown[][] = [], analytics: unknown[][] = [], requests: object[] = [], observers: Array<(entries: Array<{ isIntersecting: boolean }>) => void> = [];
  const saved = options.storage || new Map<string, string>();
  const localStorage = { getItem:(key: string) => saved.get(key) ?? null, setItem:(key: string, value: string) => { saved.set(key, value); } };
  const window = {
    location:new URL(options.url || `https://gptbot.uz${targetPath}?ad_id=120254633673790181`), localStorage,
    fbq:(...args: unknown[]) => pixel.push(args), gtag:(...args: unknown[]) => analytics.push(args),
    fetch:async (_url: string, request: {body: string}) => { requests.push(JSON.parse(request.body)); return {json:async () => options.response || {ok:true,id:'fixture_saved_receipt'}}; },
  };
  const context = vm.createContext({ window, document, navigator:options.privacy || {}, URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
    IntersectionObserver:class { constructor(callback: (entries: Array<{isIntersecting: boolean}>) => void) { observers.push(callback); } observe() {} disconnect() {} },
  });
  const script = renderLeadFormScript(page).replace(/^<script[^>]*>\s*/, '').replace(/<\/script>\s*$/, '');
  const run = () => vm.runInContext(script, context);
  run();
  return { pixel, analytics, requests, telegram, status, saved, form, document, window, run,
    view:() => observers.forEach(callback => callback([{isIntersecting:true}])),
    click:(anchor: ClientNode) => document.fire('click', {target:anchor}),
    submit:async () => { form.fire('submit', {preventDefault() {}}); await new Promise(resolve => setTimeout(resolve, 0)); },
  };
}

test('CRO applies only to the existing Uzbek advertising service URL', () => {
  assert.equal(isTargetLanding(page), true);
  for (const url of ['/uz/', '/ru/targetirovannaya-reklama-tashkent/', '/uz/instagram-target-yoqish-extra/', '/uz/instagram-target-yoqish/?variant=1']) {
    assert.equal(isTargetLanding({ ...page, url }), false, url);
  }
  assert.equal(page.title, 'Instagram target yoqish Toshkentda — 1 990 000 so‘mdan | GPTBot.uz');
  assert.equal(page.h1, 'Toshkentda Instagram target yoqish xizmati');
  assert.equal(page.canonical, `https://gptbot.uz${targetPath}`);
  assert.equal(page.hreflangRu, '/ru/targetirovannaya-reklama-tashkent/');
  assert.equal(page.hreflangUz, targetPath);
  assert.equal(page.robotsIndex, true);
  assert.equal(page.robotsFollow, true);
});

test('commercial path uses one existing lead form and retains the full educational body after it', () => {
  const articleHtml = '<section id="qabul-mezonlari"><h2>Original SEO content</h2></section><section id="narx">Original tariff table</section>';
  const html = renderTargetLanding(page, {
    leadFormHtml: renderLeadForm(page), articleHtml, faqHtml: '<section id="faq">Original FAQ</section>',
    sourcesHtml: '<aside>Original sources</aside>', relatedHtml: '<nav>Original related links</nav>', bylineHtml: '<p>Original author</p>',
  });
  assert.equal(occurrences(html, /<main\b/g), 1);
  assert.equal(occurrences(html, /<h1\b/g), 1);
  assert.equal(occurrences(html, /id="lead-form"/g), 1);
  assert.equal(occurrences(html, /<form\b[^>]*\bdata-lead-form(?:\s|>)/g), 1);
  assert.equal(occurrences(html, /id="narx"/g), 1);
  assert.ok(html.includes(articleHtml), 'all original content is passed through, not replaced with a summary');
  assert.ok(html.indexOf('id="lead-form"') < html.indexOf('Original SEO content'), 'lead form precedes long reference content');
  assert.ok(html.includes('Original FAQ') && html.includes('Original sources') && html.includes('Original related links'));
  assert.match(html, /<form\b[^>]*data-service="target"[^>]*data-locale="uz"/);
});

test('mobile primary action remains the form and contact is a separate optional channel', () => {
  const html = renderTargetSticky('https://t.me/example_contact?text=example');
  const anchors = [...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(match => match[1]);
  assert.equal(anchors[0], '#lead-form');
  assert.ok(anchors.some(href => href.startsWith('https://t.me/')));
  assert.doesNotMatch(html, /href="(?:javascript|data):/);
});

test('estimate form preserves the server acknowledgement contract and private input field names', () => {
  const html = renderLeadForm(page);
  for (const name of ['name', 'contact', 'task', 'budget', 'consent']) assert.ok(html.includes(`name="${name}"`), name);
  assert.match(html, /name="contact"[^>]*required/);
  assert.match(html, /name="consent"[^>]*required/);
  for (const name of ['name', 'task', 'budget']) {
    assert.doesNotMatch(html, new RegExp(`(?:input|select|textarea)[^>]*name="${name}"[^>]*\\brequired\\b`), name);
  }
  assert.match(html, /<form\b[^>]*method="post"/);
  assert.match(html, /<button\b[^>]*type="submit"[^>]*disabled/);
  assert.match(html, /<\/form>\s*<p data-lead-form-status/);
  const script = renderLeadFormScript(page);
  assert.ok(script.includes('/api/gpt/lead'));
  assert.ok(script.includes('1445931954174897'));
  assert.ok(script.includes('shouldTrackLead(result,attempt.requestId,window)'));
  assert.ok(script.includes("trackMetaTargetEvent('Lead')"));
  assert.ok(script.includes('result.duplicate===true&&result.idempotent!==true'));
});

test('fresh build retains the canonical metadata, source heading and primary CTA route', () => {
  const html = fs.readFileSync(path.join(root, 'dist/uz/instagram-target-yoqish/index.html'), 'utf8');
  assert.ok(html.includes('<title>' + page.title + '</title>'));
  assert.ok(html.includes(`rel="canonical" href="https://gptbot.uz${targetPath}"`));
  assert.ok(html.includes('hreflang="ru" href="https://gptbot.uz/ru/targetirovannaya-reklama-tashkent/"'));
  assert.ok(html.includes('hreflang="uz" href="https://gptbot.uz/uz/instagram-target-yoqish/"'));
  assert.match(html, /<meta name="robots" content="index,\s*follow(?:,|"|\s)/);
  assert.ok(html.includes(page.h1));
  assert.equal(occurrences(html, /<h1\b/g), 1);
  assert.equal(occurrences(html, /id="lead-form"/g), 1);
  const primary = html.match(/<a\b[^>]*data-testid="page-cta-primary"[^>]*>/)?.[0];
  assert.ok(primary && primary.includes('href="#lead-form"'));
  assert.ok(html.includes('target-cro'), 'must test the rebuilt candidate, never stale baseline HTML');
});

test('scoped Pixel records the funnel once without turning clicks or form diagnostics into leads', () => {
  const h = targetClient();
  h.run(); h.view(); h.view(); h.form.fire('input'); h.form.fire('input');
  const cta = new ClientNode(); cta.attrs = {href:'#lead-form', 'data-cta-zone':'hero'};
  h.click(cta); h.click(cta); h.click(h.telegram); h.click(h.telegram);
  const events = h.pixel.filter(args => String(args[0]).startsWith('trackSingle'));
  assert.deepEqual(events.map(args => args[2]), ['PageView', 'ViewContent', 'LeadFormView', 'LeadFormStart', 'LeadCTAClick', 'TelegramContactClick']);
  assert.equal(h.pixel.filter(args => args[0] === 'init').length, 1);
  assert.equal(Reflect.get(h.window.fbq, 'disablePushState'), true, 'same-document anchors must not create automatic page views');
  assert.ok(h.pixel.some(args => args[0] === 'set' && args[1] === 'autoConfig' && args[2] === false));
  assert.ok(events.slice(2).every(args => args[0] === 'trackSingleCustom'));
  assert.doesNotMatch(JSON.stringify([...h.pixel, ...h.analytics]), /private_fixture|ad_id|120254633673790181|fixture_studio/);
  cta.attrs['data-cta-zone'] = '@private_zone'; h.click(cta);
  assert.equal((h.pixel.at(-1)?.[3] as {cta_zone: string}).cta_zone, 'page');
  assert.doesNotMatch(JSON.stringify(h.pixel), /private_zone/);
});

test('Pixel scope and privacy gates prevent events; ViewContent waits for a visible page', () => {
  for (const options of [{url:'https://preview.example/uz/instagram-target-yoqish/'}, {url:'https://gptbot.uz/uz/other/'}, {privacy:{globalPrivacyControl:true}}, {privacy:{doNotTrack:'1'}}]) {
    const h = targetClient(options); h.view(); h.form.fire('input'); h.click(h.telegram);
    assert.deepEqual(h.pixel, [], JSON.stringify(options));
  }
  const h = targetClient({hidden:true});
  assert.deepEqual(h.pixel.filter(args => args[0] === 'trackSingle').map(args => args[2]), ['PageView']);
  h.document.visibilityState = 'visible'; h.document.fire('visibilitychange'); h.document.fire('visibilitychange');
  assert.equal(h.pixel.filter(args => args[2] === 'ViewContent').length, 1);
});

test('dynamic Telegram fallback retains numeric attribution, while error and duplicate cannot emit Lead', async () => {
  for (const response of [{ok:false,code:'store_unavailable'}, {ok:true,id:'fixture_duplicate',duplicate:true}]) {
    const h = targetClient({response}); await h.submit();
    const fallback = h.status.children.find(child => child.href);
    assert.ok(fallback);
    assert.equal(new URL(fallback.href).searchParams.get('text'), 'Estimate\nManba: target_cro_20261113 / Meta 120254633673790181');
    fallback.fallback = true; h.click(fallback);
    assert.equal(h.pixel.filter(args => args[2] === 'Lead' || args[2] === 'Contact').length, 0);
    assert.equal(h.pixel.filter(args => args[0] === 'trackSingleCustom' && args[2] === 'TelegramContactClick').length, 1);
    assert.doesNotMatch(JSON.stringify(h.pixel), /private_fixture/);
  }
  const unsafe = targetClient({url:`https://gptbot.uz${targetPath}?ad_id=%40private_fixture`,response:{ok:false,code:'store_unavailable'}});
  await unsafe.submit();
  assert.equal(new URL(unsafe.status.children.find(child => child.href)!.href).searchParams.get('text'), 'Estimate');
});

test('only acknowledged new lead counts once and the same receipt after reload stays deduplicated', async () => {
  const h = targetClient(); await h.submit();
  assert.equal(h.requests.length, 1);
  assert.equal(h.pixel.filter(args => args[0] === 'trackSingle' && args[2] === 'Lead').length, 1);
  const reload = targetClient({storage:h.saved}); await reload.submit();
  assert.equal(reload.pixel.filter(args => args[2] === 'Lead').length, 0);
});
