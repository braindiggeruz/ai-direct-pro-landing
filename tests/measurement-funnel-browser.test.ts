// Built UI integration: all AI, lead, payment and analytics traffic is intercepted.
// This validates event semantics, not acceptance by GA4/Meta or real revenue.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { chromium, type BrowserContext } from 'playwright-core';

const root = path.resolve(import.meta.dirname, '..');
const dist = process.env.GPTBOT_TEST_DIST || path.join(root, 'dist');
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
type Captured = { vendor: string; args: unknown[]; route: string };
const ORDER = `pay_${'b'.repeat(32)}`;
const QUERY = '?utm_source=qa-fixture&utm_medium=test&utm_campaign=funnel';
const PRIVATE_TEXT = 'Private fixture question never sent to analytics';
const PRIVATE_CONTACT = '+998901234567';

async function capture(context: BrowserContext, events: Captured[]) {
  await context.exposeBinding('__captureMeasurement', (_source, event: Captured) => events.push(event));
  await context.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    for (const vendor of ['gtag', 'fbq', 'ym']) {
      w[vendor] = (...args: unknown[]) => {
        const emit = w.__captureMeasurement as (event: Captured) => Promise<void>;
        void emit({ vendor, args, route: location.pathname });
      };
    }
  });
}

test('measurement funnel: real answer, pending/paid checkout and acknowledged lead are distinct and private', {
  skip: !executablePath || !fs.existsSync(path.join(dist, 'ru/gpt-chat/index.html')),
  timeout: 90000,
}, async () => {
  const server = createServer((req, res) => {
    const file = path.resolve(dist, '.' + decodeURIComponent(new URL(req.url!, 'http://localhost').pathname));
    if (!file.startsWith(path.resolve(dist) + path.sep)) { res.writeHead(403).end(); return; }
    const target = fs.existsSync(file) && fs.statSync(file).isDirectory() ? path.join(file, 'index.html') : file;
    if (!fs.existsSync(target)) { res.writeHead(404).end(); return; }
    res.setHeader('content-type', target.endsWith('.html') ? 'text/html' : target.endsWith('.js') ? 'text/javascript' : target.endsWith('.css') ? 'text/css' : 'application/octet-stream');
    res.end(fs.readFileSync(target));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-gpu'] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const events: Captured[] = [], errors: string[] = [], leadRequests: Record<string, unknown>[] = [];
    await capture(context, events);
    const ga = (name: string) => events.filter(e => e.vendor === 'gtag' && e.args[0] === 'event' && e.args[1] === name);
    const meta = (name: string) => events.filter(e => e.vendor === 'fbq' && e.args[1] === name);
    let used = 0, failAnswer = true, payment: 'pending' | 'paid' | null = null;
    let leadOutcome: 'hold' | 'failure' | 'success' | 'duplicate' = 'hold';
    let releaseLead: (() => void) | undefined;
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      // The provider URL is an in-memory document: no provider request is made.
      if (url.hostname === 'my.click.uz') return route.fulfill({ contentType: 'text/html', body: '<p>Offline payment provider fixture</p>' });
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (url.pathname === '/api/auth/config') return json({ turnstileRequired: false });
      if (url.pathname === '/api/gpt/account') return json({ ok: true, mode: 'live', loginAvailable: false, guestCheckout: true, providers: ['click', 'payme'],
        user: payment ? { signedIn: true, guest: true, storageKey: 'a'.repeat(64) } : null,
        freeLimits: { daily: 15, hourly: 5, lifetime: 3 }, trial: { limit: 3, used, remaining: 3 - used, available: 3 - used, resets: 'never' }, remaining: payment === 'paid' ? 300 : 3 - used,
        terms: { ru: '/ru/oferta/', uz: '/uz/oferta/' }, termsVersion: 'measurement-fixture',
        pack: { priceUzs: 20000, messageLimit: 300, dailyLimit: 50, months: 1 },
        payment: payment ? { id: ORDER, state: payment, provider: 'click' } : null,
        access: payment === 'paid' ? { order_id: ORDER, ends_at: Date.now() + 86400000, remaining: 300, message_limit: 300, dayRemaining: 50 } : null });
      if (url.pathname === '/api/gpt/session') return json({ ok: true, sessionId: 'measurement-fixture' });
      if (url.pathname === '/api/gpt/event') return json({ ok: true });
      if (url.pathname === '/api/gpt/chat') {
        if (failAnswer) { failAnswer = false; return json({ ok: false, error: 'unavailable' }, 503); }
        used++;
        return json({ ok: true, answer: `Useful fixture answer ${used}`, charged: true, remaining: 3 - used, hourRemaining: null, sessionId: 'measurement-fixture' });
      }
      if (url.pathname === '/api/gpt/subscribe') {
        payment = 'pending';
        return json({ ok: true, mode: 'checkout', attemptId: ORDER, checkoutUrl: 'https://my.click.uz/services/pay?fixture=measurement' });
      }
      if (url.pathname === '/api/gpt/lead') {
        leadRequests.push(route.request().postDataJSON());
        if (leadOutcome === 'hold') await new Promise<void>(resolve => { releaseLead = resolve; });
        if (leadOutcome === 'failure') return json({ ok: false, code: 'store_unavailable' }, 503);
        return json({ ok: true, id: 'lead_measurement_fixture', duplicate: leadOutcome === 'duplicate' });
      }
      return json({ ok: false }, 404);
    });
    const waitFor = async (check: () => boolean, label: string) => {
      for (let i = 0; i < 150 && !check(); i++) await page.waitForTimeout(25);
      assert.ok(check(), label);
    };
    await page.goto(origin + '/ru/gpt-chat/' + QUERY);
    const input = page.locator('.gpt-input-surface textarea'), send = page.locator('.gpt-send-button');
    await page.waitForFunction(() => !!document.querySelector<HTMLButtonElement>('.gpt-send-button:not(:disabled)'));
    assert.equal(ga('purchase').length, 0); assert.equal(meta('Purchase').length, 0);
    await input.fill(PRIVATE_TEXT); await send.click();
    await waitFor(() => ga('ai_response_error').length === 1, 'failed answer is an error');
    assert.equal(ga('ai_response_success').length, 0); assert.equal(meta('ChatEngaged').length, 0);
    for (let n = 1; n <= 3; n++) {
      await input.fill(`${PRIVATE_TEXT} ${n}`); await send.click();
      await page.getByText(`Useful fixture answer ${n}`, { exact: true }).waitFor();
    }
    await waitFor(() => ga('ai_response_success').length === 3, 'one success per useful answer');
    assert.equal(meta('ChatEngaged').length, 1, 'session engagement is counted once');
    assert.equal(ga('message_sent').length, 4);
    const messagePayload = ga('message_sent')[0].args[2] as Record<string, unknown>;
    assert.equal(messagePayload.ui_source, 'composer'); assert.equal(messagePayload.source, undefined);
    await page.locator('.gpt-trial-dialog').waitFor();
    assert.equal(ga('checkout_started').length, 0, 'paywall opening is not a checkout');
    assert.equal(meta('InitiateCheckout').length, 0);
    assert.equal(ga('purchase').length, 0);
    await page.locator('.gpt-trial-dialog [data-provider="click"]').click();
    await page.waitForURL('https://my.click.uz/**');
    await waitFor(() => ga('checkout_started').length === 1, 'issued invoice starts checkout');
    assert.equal(meta('InitiateCheckout').length, 1);
    assert.equal(ga('purchase').length, 0, 'provider redirect does not prove payment');
    await page.goto(origin + '/ru/gpt-chat/?pay=return');
    await page.locator('.gpt-input-surface textarea').waitFor();
    await page.waitForTimeout(350);
    assert.equal(ga('purchase').length, 0, 'pending server order is not a purchase');
    assert.equal(meta('Purchase').length, 0);
    payment = 'paid';
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await waitFor(() => ga('purchase').length === 1, 'server-confirmed live order becomes purchase');
    assert.equal(meta('Purchase').length, 1);
    const purchase = ga('purchase')[0].args[2] as Record<string, unknown>;
    assert.equal(purchase.transaction_id, ORDER); assert.equal(purchase.currency, 'UZS'); assert.equal(purchase.value, 20000);
    assert.equal((meta('Purchase')[0].args[3] as Record<string, unknown>).eventID, ORDER);
    // Even a repeated return carrying the same watched order cannot count again.
    await page.evaluate(order => localStorage.setItem('gptchat_checkout', JSON.stringify({ provider: 'click', flow: 'redirect', at: Date.now(), attemptId: order, before: null })), ORDER);
    await page.goto(origin + '/ru/gpt-chat/?pay=return');
    await page.locator('.gpt-input-surface textarea').waitFor(); await page.waitForTimeout(400);
    assert.equal(ga('purchase').length, 1); assert.equal(meta('Purchase').length, 1);

    const servicePath = '/ru/ai-bot-dlya-biznesa/';
    const fillLead = async () => {
      const form = page.locator('[data-lead-form]');
      await form.locator('[name=name]').fill('Private fixture name');
      await form.locator('[name=contact]').fill(PRIVATE_CONTACT);
      await form.locator('[name=task]').fill(PRIVATE_TEXT);
      await form.locator('[name=consent]').check();
      await form.locator('button[type=submit]').click();
    };
    await page.goto(origin + servicePath + QUERY);
    await fillLead(); await waitFor(() => !!releaseLead, 'lead request is waiting for acknowledgement');
    assert.equal(ga('generate_lead').length, 0, 'submit is not a lead');
    leadOutcome = 'failure'; releaseLead!();
    await waitFor(() => ga('lead_form_failed').length === 1, 'failed intake is not a lead');
    assert.equal(ga('generate_lead').length, 0);
    leadOutcome = 'success';
    await page.locator('[data-lead-form] button[type=submit]').click();
    await waitFor(() => ga('generate_lead').length === 1, 'acknowledged intake counts once');
    assert.equal(events.filter(e => e.vendor === 'ym' && e.args[1] === 'reachGoal' && e.args[2] === 'lead_form_success').length, 1);
    assert.equal((leadRequests[0].utm as Record<string, unknown>).utm_source, 'qa-fixture', 'campaign attribution reaches intake');
    assert.equal(leadRequests[0].requestId, leadRequests[1].requestId, 'retry preserves idempotency key');
    // Contact duplicates are acknowledged but do not count as new leads.
    leadOutcome = 'duplicate';
    await page.reload(); await fillLead();
    await waitFor(() => leadRequests.length === 3, 'duplicate response received'); await page.waitForTimeout(200);
    assert.equal(ga('generate_lead').length, 1);
    const serialized = JSON.stringify(events);
    for (const privateValue of [PRIVATE_TEXT, PRIVATE_CONTACT, 'Private fixture name', 'lead_measurement_fixture']) assert.ok(!serialized.includes(privateValue), `analytics excludes ${privateValue}`);
    assert.equal(errors.length, 0, errors.join('\n'));
    await context.close();
  } finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
