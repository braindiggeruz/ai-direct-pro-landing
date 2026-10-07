// The AI pack window on the built chat pages, with nothing real behind it
// (paid-chat plan WP-17, acceptance): serves dist/ on localhost and answers
// the chat's account, payment, sign-in and event requests from fixed states,
// so every screen of the window can be looked at on a phone-sized browser, in
// Russian and Uzbek, long before billing is switched on. No D1, no payment
// provider, no secret, no network: the page may only load its own files
// (Content-Security-Policy), so no analytics hit leaves the machine.
//
//   npm run build:fast
//   npx tsx scripts/pack-window-preview.ts [--port 4317] [--state member]
//   open http://localhost:4317/ru/gpt-chat/ or /uz/gpt-uzbek-tilida/
//   switch the account:  http://localhost:4317/__preview/<state>
//   back from paying:    http://localhost:4317/ru/gpt-chat/?pay=return
//
// Sending a message answers with the hourly limit, so the limit card and its
// "AI-пакет" button can be followed into the window too. The console reports
// the head's inline analytics snippets as blocked: that is the policy at work.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ORDER = `pay_${'0'.repeat(31)}1`;
const EARLIER = `pay_${'0'.repeat(31)}2`;
const PACK = { priceUzs: 20000, messageLimit: 300, dailyLimit: 50, months: 1, vat: { percent: 12, includedTiyin: 214286 } };
const DAY = 86_400_000;

/** The account views the preview can answer with, shaped as functions/api/gpt/account.ts answers. */
export function previewViews(now = Date.now()): Record<string, Record<string, unknown>> {
  const base = {
    ok: true, loginAvailable: true, loginMethods: ['bot'], mode: 'live', providers: ['click', 'uzum'],
    pack: PACK, termsVersion: 'ai-paket-2026-10-v4', freeLimits: { daily: 15, hourly: 5 }, botHandoff: false,
    uzumFlow: 'checkout', terms: { ru: 'https://gptbot.uz/ru/oferta/', uz: 'https://gptbot.uz/uz/oferta/' }, user: null,
    // Guest checkout is on in production (2026-10-07): a guest pays Click in one tap.
    guestCheckout: true,
  };
  const member = { ...base, user: { signedIn: true, storageKey: 'p'.repeat(64) }, remaining: 3, paymentCode: null, receipts: [], access: null, payment: null };
  const paid = {
    ...member,
    remaining: 120,
    access: {
      order_id: ORDER, starts_at: now - 2 * DAY, ends_at: now + 28 * DAY, message_limit: 300, remaining: 120, dayRemaining: 37,
      renewSoon: false, packs: 1, totalLimit: 300, paidThrough: now + 28 * DAY, firstRemaining: 120,
    },
    payment: { id: ORDER, state: 'paid', provider: 'click', createdAt: now - 2 * DAY, cancellable: false },
    receipts: [{ kind: 'PERFORM', receipt_url: 'https://ofd.soliq.uz/epi?t=EZ0000000000&r=1&c=20261001120000&s=1' }],
  };
  // Renewed early: two packs side by side, turns draw from the earlier one first.
  const packs = {
    ...paid,
    remaining: 420,
    access: {
      order_id: EARLIER, starts_at: now - 20 * DAY, ends_at: now + 10 * DAY, message_limit: 300, remaining: 420, dayRemaining: 50,
      renewSoon: false, packs: 2, totalLimit: 600, paidThrough: now + 28 * DAY, firstRemaining: 120,
    },
  };
  return {
    guest: base,
    // Payme live beside Click (its cash desk opened): a guest's two one-tap buttons.
    onetap: { ...base, providers: ['click', 'payme'] },
    off: { ...base, loginAvailable: false, loginMethods: [], mode: null, providers: [] },
    member,
    test: { ...member, mode: 'test' },
    pending: { ...member, payment: { id: ORDER, state: 'prepared', provider: 'click', createdAt: now, cancellable: false } },
    // An invoice Click has not seen yet: it can be closed to pay with Uzum Bank.
    unseen: { ...member, payment: { id: ORDER, state: 'pending', provider: 'click', createdAt: now, cancellable: true } },
    paid,
    packs,
    code: { ...member, uzumFlow: 'code', paymentCode: '123456782' },
    cancelled: { ...member, payment: { id: ORDER, state: 'cancelled', provider: 'click', createdAt: now, cancellable: false } },
    // Money the Seller returned (a double charge, a payment that started no
    // pack; the offer, section 8): the pack closed, the refund receipt shown.
    refunded: {
      ...member,
      payment: { id: ORDER, state: 'refunded', provider: 'click', createdAt: now - DAY, cancellable: false },
      receipts: [
        { kind: 'PERFORM', receipt_url: 'https://ofd.soliq.uz/epi?t=EZ0000000000&r=1&c=20261001120000&s=1' },
        { kind: 'CANCEL', receipt_url: 'https://ofd.soliq.uz/epi?t=EZ0000000000&r=2&c=20261002120000&s=2' },
      ],
    },
  };
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
};
const POLICY = "default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com";

function serve(port: number, initial: string): http.Server {
  const dist = path.join(ROOT, 'dist');
  let state = initial;
  const send = (res: http.ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  return http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    const route = `${req.method} ${url.pathname}`;
    const views = previewViews();
    if (url.pathname.startsWith('/__preview/')) {
      const next = url.pathname.slice('/__preview/'.length);
      if (!(next in views)) return send(res, 404, { states: Object.keys(views) });
      state = next;
      console.log(`state: ${state}`);
      return send(res, 200, { state });
    }
    if (route === 'GET /api/gpt/account') return send(res, 200, views[state]);
    if (route === 'POST /api/gpt/account') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        // Closing the open invoice ends it as the server would; the account has no other action.
        if (!body.includes('"cancel_invoice"')) return send(res, 400, { ok: false, code: 'bad_request' });
        state = 'cancelled';
        send(res, 200, { ok: true });
      });
      return;
    }
    if (route === 'POST /api/gpt/subscribe')
      return state === 'code'
        ? send(res, 200, { ok: true, mode: 'code', paymentCode: '123456782' })
        // A test order: the window waits for it; /__preview/paid or /cancelled ends it.
        : send(res, 200, { ok: true, mode: 'test', attemptId: ORDER, amount: 2_000_000, currency: 'UZS' });
    if (route === 'POST /api/gpt/auth/bot/start')
      return send(res, 200, { ok: true, id: '0123456789abcdef', mode: 'pick', code: '47', deepLink: `https://t.me/gptbotuz_bot?start=login_${'ab'.repeat(16)}`, expiresIn: 600_000 });
    if (route === 'POST /api/gpt/auth/bot/status') return send(res, 200, { ok: true, status: 'pending' });
    if (route === 'POST /api/gpt/auth/logout') {
      state = 'guest';
      return send(res, 200, { ok: true });
    }
    if (route === 'POST /api/gpt/event') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => console.log(`event: ${body}`));
      return send(res, 200, { ok: true });
    }
    if (route === 'GET /api/auth/config') return send(res, 200, { turnstileRequired: false, turnstileSiteKey: null });
    if (route === 'POST /api/gpt/session') return send(res, 200, { ok: true, sessionId: 'sess_preview' });
    if (route === 'POST /api/gpt/chat')
      return send(res, 429, { ok: false, code: 'limit_reached', reason: 'hourly', tier: 'free', limits: { daily: 15, hourly: 5 }, retryAfterSec: 1500, remaining: 10 });
    if (url.pathname.startsWith('/api/')) return send(res, 404, { ok: false, code: 'not_found' });
    // Files of the build; a directory is its index.html. Inside dist/ only:
    // a bare prefix test would also let /../dist-old/ through.
    const inside = (file: string) => file === dist || file.startsWith(dist + path.sep);
    const file = path.normalize(path.join(dist, decodeURIComponent(url.pathname)));
    const target = inside(file) && fs.existsSync(file) && fs.statSync(file).isDirectory() ? path.join(file, 'index.html') : file;
    if (!inside(target) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('not found');
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(target)] ?? 'application/octet-stream', 'Content-Security-Policy': POLICY, 'Cache-Control': 'no-store' });
    fs.createReadStream(target).pipe(res);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arg = (name: string, fallback: string) => {
    const index = process.argv.indexOf(`--${name}`);
    return index > 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
  };
  const port = Number(arg('port', '4317'));
  const state = arg('state', 'guest');
  if (!(state in previewViews())) throw new Error(`Unknown state ${state}; one of ${Object.keys(previewViews()).join(', ')}.`);
  if (!fs.existsSync(path.join(ROOT, 'dist', 'ru', 'gpt-chat', 'index.html'))) throw new Error('No build: run npm run build:fast first.');
  serve(port, state).listen(port, '127.0.0.1', () => {
    console.log(`Pack window preview on http://localhost:${port}/ru/gpt-chat/ (state ${state}); /__preview/<state> switches.`);
  });
}
