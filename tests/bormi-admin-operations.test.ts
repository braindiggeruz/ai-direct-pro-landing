// ADMIN-4A: the read-only orders and questions surface.
//
// Two things have to stay true for this screen to be safe to exist. It must not
// be able to write, and it must not be able to see a buyer. Both are asserted
// twice over: against the source, because a route that gains a POST would gain
// it in a file, and against a running database, because a projection that
// gained a phone number would gain it in a row.
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as orderDetailRoute from '../functions/api/admin/orders/[id]/index';
import * as ordersRoute from '../functions/api/admin/orders/index';
import * as questionDetailRoute from '../functions/api/admin/questions/[id]/index';
import * as questionsRoute from '../functions/api/admin/questions/index';
import {
  callRoute,
  freshAdminDb,
  platformToken,
  seedCheckoutPrerequisites,
  seedOrder,
  seedProduct,
  seedQuestion,
} from './helpers/bormi-admin-fixture';

const ROOT = new URL('../', import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, ROOT), 'utf8');
}

function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const READ_MODEL = 'functions/platform/admin/operations.ts';
const OPERATIONS_PAGE = 'apps/bormi-admin/src/pages/Operations.tsx';
const ORDER_PAGE = 'apps/bormi-admin/src/pages/OrderDetail.tsx';
const QUESTION_PAGE = 'apps/bormi-admin/src/pages/QuestionDetail.tsx';
const CLIENT_FILES = [OPERATIONS_PAGE, ORDER_PAGE, QUESTION_PAGE];
const ROUTES = [
  'functions/api/admin/orders/index.ts',
  'functions/api/admin/orders/[id]/index.ts',
  'functions/api/admin/questions/index.ts',
  'functions/api/admin/questions/[id]/index.ts',
];

/** The columns that identify a person. None may appear in any statement. */
const BUYER_COLUMNS = [
  'buyer_name',
  'buyer_phone',
  'buyer_address',
  'buyer_identity_id',
  'question_text',
  'reply_text',
];

const owner = () => platformToken('platform_owner');

function seedMarketplace(): ReturnType<typeof freshAdminDb> {
  const db = freshAdminDb();
  seedCheckoutPrerequisites(db);
  seedProduct(db, { id: 'product_1', status: 'published', version: 1 });
  seedOrder(db, {
    id: 'order_stalled', number: 'B-1001', status: 'placed',
    createdAt: '2026-08-01T00:00:00.000Z',
    item: { productId: 'product_1', name: 'Товар продавца', priceMinor: 150000 },
  });
  seedOrder(db, {
    id: 'order_done', number: 'B-1002', status: 'placed', fulfillment: 'done',
    createdAt: '2026-08-02T00:00:00.000Z',
    item: { productId: 'product_1', name: 'Товар продавца', priceMinor: 90000 },
  });
  seedOrder(db, {
    id: 'order_cancelled', number: 'B-1003', status: 'cancelled', totalMinor: null,
    createdAt: '2026-08-03T00:00:00.000Z', item: null,
  });
  seedQuestion(db, { id: 'question_open', status: 'open', createdAt: '2026-08-01T00:00:00.000Z' });
  seedQuestion(db, {
    id: 'question_answered', status: 'answered', createdAt: '2026-08-02T00:00:00.000Z',
  });
  seedQuestion(db, {
    id: 'question_closed', status: 'closed', createdAt: '2026-08-03T00:00:00.000Z',
  });
  return db;
}

// ── The surface cannot write ─────────────────────────────────────────────────

test('operations: every route is owner-only and answers GET alone', async () => {
  for (const path of ROUTES) {
    const route = code(await source(path));
    assert.match(route, /withOwnerRole\('platform_owner'/, `${path} is not owner-guarded`);
    for (const method of ['Post', 'Put', 'Patch', 'Delete']) {
      assert.match(
        route,
        new RegExp(`onRequest${method} = methodNotAllowed\\('GET'\\)`),
        `${path} does not refuse ${method}`,
      );
    }
  }
});

test('operations: the read model contains no statement that could change a row', async () => {
  const model = code(await source(READ_MODEL));
  for (const verb of ['INSERT', 'UPDATE ', 'DELETE', 'CREATE ', 'ALTER ', 'DROP ', '.batch(']) {
    assert.ok(!model.includes(verb), `the read model contains ${verb.trim()}`);
  }
});

test('operations: the screens offer no control that acts on an order or a question', async () => {
  for (const path of CLIENT_FILES) {
    const page = code(await source(path));
    for (const word of [
      'Подтвердить', 'Отменить заказ', 'Ответить', 'Закрыть обращение',
      'Удалить', 'Вернуть деньги', 'Возврат средств',
    ]) {
      assert.ok(!page.includes(word), `${path} offers "${word}"`);
    }
    // No form, no text entry, and no mutating verb anywhere on the surface.
    assert.doesNotMatch(page, /<textarea|<form|method: '(POST|PUT|PATCH|DELETE)'/);
    // Availability is not decided by a disabled control either: an action that
    // does not exist is absent, exactly as ADMIN-3B established.
    assert.doesNotMatch(page, /disabled=\{true\}/, `${path} ships a disabled command`);
  }
});

test('operations: no bulk selection and no export', async () => {
  for (const path of CLIENT_FILES) {
    const page = code(await source(path));
    for (const forbidden of ['type="checkbox"', 'selectedIds', 'Выбрать все', 'Экспорт', 'CSV']) {
      assert.ok(!page.includes(forbidden), `${path} offers ${forbidden}`);
    }
  }
});

test('operations: ADMIN-4A adds no migration', async () => {
  const migrations = await readdir(new URL('migrations/', ROOT));
  // 33: 0031 and 0032 belong to AUTH-1, 0033 to ADMIN-3B. A read surface that
  // needed a schema change would be a read surface reading something new.
  assert.equal(migrations.length, 33, 'a migration appeared beside the read surface');
  // The last one in the ledger is still ADMIN-3B's audit widening. The order
  // and handoff tables ADMIN-4A reads were created by 0021 and 0023 and are not
  // touched: this surface reads a schema that already existed.
  assert.equal(migrations.sort().at(-1), '0033_owner_audit_listing_actions.sql');
});

// ── The surface cannot see a person ──────────────────────────────────────────

test('operations: no buyer column is named anywhere in the read model', async () => {
  const model = await source(READ_MODEL);
  const statements = model
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//'))
    .join('\n');
  for (const column of BUYER_COLUMNS) {
    // `question_text` and `reply_text` appear in a CASE that tests for their
    // presence and never selects them, so those two are checked by the running
    // assertions below rather than by absence here.
    if (column === 'question_text' || column === 'reply_text') continue;
    assert.ok(!statements.includes(column), `the read model selects ${column}`);
  }
});

test('operations: no response carries a buyer, a phone or a message', async () => {
  const db = seedMarketplace();
  const token = await owner();
  const answers = await Promise.all([
    callRoute(ordersRoute.onRequestGet, db, '/api/admin/orders', { token }),
    callRoute(questionsRoute.onRequestGet, db, '/api/admin/questions', { token }),
    callRoute(orderDetailRoute.onRequestGet, db, '/api/admin/orders/order_stalled', {
      token, params: { id: 'order_stalled' },
    }),
    callRoute(questionDetailRoute.onRequestGet, db, '/api/admin/questions/question_open', {
      token, params: { id: 'question_open' },
    }),
  ]);

  for (const answer of answers) {
    const body = JSON.stringify(answer.body);
    assert.equal(answer.status, 200);
    for (const column of BUYER_COLUMNS) {
      assert.ok(!body.includes(column), `a response carries the ${column} field`);
    }
    // The seeded values themselves, in case a projection renamed the field.
    for (const value of ['Покупатель Тест', '+998900000000', 'Тестовый адрес', 'Вопрос покупателя', 'Ответ продавца']) {
      assert.ok(!body.includes(value), `a response carries "${value}"`);
    }
    assert.ok(!body.includes('identity_buyer'), 'a response carries a buyer identity');
  }
});

test('operations: a question reports that words exist without reporting the words', async () => {
  const db = seedMarketplace();
  const answer = await callRoute(questionsRoute.onRequestGet, db, '/api/admin/questions', {
    token: await owner(),
  });
  const rows = answer.body.questions as { id: string; has_question: boolean; has_reply: boolean }[];
  const open = rows.find((row) => row.id === 'question_open');
  const answered = rows.find((row) => row.id === 'question_answered');
  assert.equal(open?.has_question, true);
  assert.equal(open?.has_reply, false);
  assert.equal(answered?.has_reply, true);
});

// ── Authority ────────────────────────────────────────────────────────────────

test('operations: support, an unsigned caller and an unknown role are all refused', async () => {
  const db = seedMarketplace();
  const cases: [string | null, number, string][] = [
    [await platformToken('support_readonly'), 403, 'insufficient_role'],
    [null, 401, 'missing_token'],
    [await platformToken('seller'), 403, 'unknown_role'],
  ];
  for (const [token, status, error] of cases) {
    for (const route of [ordersRoute.onRequestGet, questionsRoute.onRequestGet]) {
      const answer = await callRoute(route, db, '/api/admin/orders', { token });
      assert.equal(answer.status, status);
      assert.equal(answer.body.error, error);
    }
  }
});

// ── Bounded, server-side reads ───────────────────────────────────────────────

test('operations: the page size is the server’s, not the caller’s', async () => {
  const db = seedMarketplace();
  const answer = await callRoute(ordersRoute.onRequestGet, db, '/api/admin/orders', {
    token: await owner(),
    search: '?limit=100000&offset=-5',
  });
  const page = answer.body.page as { limit: number; offset: number };
  assert.equal(page.limit, 100, 'the caller widened the page');
  assert.equal(page.offset, 0, 'a negative offset was accepted');
});

test('operations: pagination is applied by SQLite, not by the browser', async () => {
  const db = seedMarketplace();
  const token = await owner();
  const first = await callRoute(ordersRoute.onRequestGet, db, '/api/admin/orders', {
    token, search: '?limit=1&offset=0',
  });
  const second = await callRoute(ordersRoute.onRequestGet, db, '/api/admin/orders', {
    token, search: '?limit=1&offset=1',
  });
  const firstRows = first.body.orders as { reference: string }[];
  const secondRows = second.body.orders as { reference: string }[];
  assert.equal(firstRows.length, 1);
  assert.equal(secondRows.length, 1);
  assert.notEqual(firstRows[0].reference, secondRows[0].reference);
  // `total` describes the queue, `count` the page.
  assert.equal(first.body.total, 3);
  assert.equal(first.body.count, 1);
});

test('operations: the ordering is newest first and the caller cannot change it', async () => {
  const db = seedMarketplace();
  const answer = await callRoute(ordersRoute.onRequestGet, db, '/api/admin/orders', {
    token: await owner(),
    search: '?sort=oldest',
  });
  assert.equal(answer.body.sort, 'created_desc');
  const rows = answer.body.orders as { reference: string }[];
  assert.deepEqual(rows.map((row) => row.reference), ['B-1003', 'B-1002', 'B-1001']);
});

test('operations: a filter narrows the query, not the page already sent', async () => {
  const db = seedMarketplace();
  const token = await owner();
  const placed = await callRoute(ordersRoute.onRequestGet, db, '/api/admin/orders', {
    token, search: '?stage=placed',
  });
  assert.equal(placed.body.total, 1, 'the filter did not reach the count');
  assert.deepEqual((placed.body.orders as { reference: string }[]).map((r) => r.reference), ['B-1001']);

  const done = await callRoute(ordersRoute.onRequestGet, db, '/api/admin/orders', {
    token, search: '?stage=done',
  });
  assert.deepEqual((done.body.orders as { reference: string }[]).map((r) => r.reference), ['B-1002']);
});

test('operations: a filter value outside the closed list is refused, never widened', async () => {
  const db = seedMarketplace();
  const token = await owner();
  const stage = await callRoute(ordersRoute.onRequestGet, db, '/api/admin/orders', {
    token, search: '?stage=refunded',
  });
  assert.equal(stage.status, 400);
  assert.equal(stage.body.error, 'invalid_stage');

  const status = await callRoute(questionsRoute.onRequestGet, db, '/api/admin/questions', {
    token, search: '?status=escalated',
  });
  assert.equal(status.status, 400);
  assert.equal(status.body.error, 'invalid_status');

  const store = await callRoute(ordersRoute.onRequestGet, db, '/api/admin/orders', {
    token, search: '?store=' + encodeURIComponent("' OR 1=1 --"),
  });
  assert.equal(store.status, 400);
  assert.equal(store.body.error, 'invalid_store');
});

test('operations: the question filter narrows to the state it names', async () => {
  const db = seedMarketplace();
  const answer = await callRoute(questionsRoute.onRequestGet, db, '/api/admin/questions', {
    token: await owner(), search: '?status=open',
  });
  assert.equal(answer.body.total, 1);
  assert.deepEqual((answer.body.questions as { id: string }[]).map((r) => r.id), ['question_open']);
});

test('operations: a page of rows costs a bounded number of statements', async () => {
  // The N+1 this guards against: one query per row for the store name or the
  // item. The list is one statement, the count is one, the summary is two.
  const db = seedMarketplace();
  const before = db.rows<{ n: number }>('SELECT 1 AS n').length;
  assert.equal(before, 1);
  const model = code(await source(READ_MODEL));
  const listBody = model.slice(
    model.indexOf('export async function listOrderRows'),
    model.indexOf('export async function countOrders'),
  );
  assert.equal((listBody.match(/db\.prepare/g) ?? []).length, 1, 'the list runs more than one query');
  assert.ok(listBody.includes('JOIN sotuvchi_stores') === false, 'the join moved out of the shared fragment');
  assert.ok(model.includes('LEFT JOIN sotuvchi_order_items'), 'the item is fetched per row');
});

// ── The words the screen says ────────────────────────────────────────────────

test('operations: the derived stage matches what the domain stores', async () => {
  const db = seedMarketplace();
  const answer = await callRoute(ordersRoute.onRequestGet, db, '/api/admin/orders', {
    token: await owner(),
  });
  const rows = answer.body.orders as { reference: string; stage: string; waiting_on: string }[];
  const byReference = Object.fromEntries(rows.map((row) => [row.reference, row]));
  assert.equal(byReference['B-1001'].stage, 'placed');
  assert.equal(byReference['B-1001'].waiting_on, 'seller');
  assert.equal(byReference['B-1002'].stage, 'done');
  assert.equal(byReference['B-1002'].waiting_on, 'nobody');
  assert.equal(byReference['B-1003'].stage, 'cancelled');
  assert.equal(byReference['B-1003'].waiting_on, 'nobody');
});

test('operations: a queue waiting longer than a working day is called stalled', async () => {
  const db = seedMarketplace();
  const answer = await callRoute(ordersRoute.onRequestGet, db, '/api/admin/orders', {
    token: await owner(),
  });
  const rows = answer.body.orders as { reference: string; attention: string }[];
  const stalled = rows.find((row) => row.reference === 'B-1001');
  // Seeded on 2026-08-01 and never confirmed, so by any later clock it is late.
  assert.equal(stalled?.attention, 'stalled');
  assert.equal(rows.find((row) => row.reference === 'B-1002')?.attention, 'none');
});

test('operations: every status the domain can hold has a Russian sentence', async () => {
  const text = await source('apps/bormi-admin/src/lib/text.ts');
  // Every value the two CHECK constraints permit, and no invented sixth.
  for (const key of ['draft', 'placed', 'confirmed', 'done', 'cancelled']) {
    assert.match(text, new RegExp(`\\n  ${key}: '`), `ORDER_STATUS is missing ${key}`);
  }
  for (const key of ['open', 'answered', 'closed', 'expired']) {
    assert.match(text, new RegExp(`\\n  ${key}: '`), `HANDOFF_STATUS is missing ${key}`);
  }
  for (const reason of [
    'unknown_intent', 'buyer_requested_human', 'catalog_no_result',
    'order_question', 'seller_initiated',
  ]) {
    assert.match(text, new RegExp(`${reason}:`), `QUESTION_REASON is missing ${reason}`);
  }
});

test('operations: an unknown key falls through to itself rather than to a guess', async () => {
  const text = code(await source('apps/bormi-admin/src/lib/text.ts'));
  assert.match(text, /export function label\(map: Record<string, string>, key: string\): string \{\s*return map\[key\] \?\? key;/);
});

// ── The screens ──────────────────────────────────────────────────────────────

test('operations: the section is in the menu once, under Операции', async () => {
  const shell = await source('apps/bormi-admin/src/components/AppShell.tsx');
  assert.match(shell, /title: 'Операции'/);
  assert.match(shell, /to: '\/operations', label: 'Заказы и вопросы'/);
  const app = await source('apps/bormi-admin/src/App.tsx');
  assert.match(app, /path="\/operations" element=\{<Operations \/>\}/);
  assert.match(app, /path="\/operations\/orders\/:id"/);
  assert.match(app, /path="\/operations\/questions\/:id"/);
});

test('operations: the two queues are tabs a screen reader can follow', async () => {
  const page = await source(OPERATIONS_PAGE);
  assert.match(page, /role="tablist"/);
  assert.match(page, /role="tab"/);
  assert.match(page, /role="tabpanel"/);
  assert.match(page, /aria-selected=\{tab === entry\.key\}/);
  assert.match(page, /aria-controls=\{`operations-panel-\$\{entry\.key\}`\}/);
  assert.match(page, /aria-labelledby="operations-tab-orders"/);
});

test('operations: the list has a table for desktop and cards for 320px', async () => {
  const page = code(await source(OPERATIONS_PAGE));
  assert.ok((page.match(/className="hidden md:block"/g) ?? []).length === 2);
  assert.ok((page.match(/className="space-y-3 md:hidden"/g) ?? []).length === 2);
  // Every control a finger has to hit is at least 44px tall.
  assert.doesNotMatch(page, /className="[^"]*\bh-8\b/);
  assert.ok((page.match(/min-h-11/g) ?? []).length >= 6);
});

test('operations: loading, empty, filtered-empty and error all have a state', async () => {
  const page = await source(OPERATIONS_PAGE);
  assert.match(page, /active\.loading \? <div className="skeleton/);
  assert.match(page, /<ErrorState code=\{active\.error \?\? 'unknown'\} onRetry=\{active\.reload\}/);
  assert.match(page, /По этому фильтру заказов нет/);
  assert.match(page, /Заказов пока нет/);
  assert.match(page, /По этому фильтру вопросов нет/);
  assert.match(page, /Вопросов пока нет/);
});

test('operations: the detail screens say what they cannot show and why', async () => {
  const order = await source(ORDER_PAGE);
  assert.match(order, /Имя, телефон и адрес покупателя здесь недоступны/);
  const question = await source(QUESTION_PAGE);
  assert.match(question, /Текст вопроса и ответа здесь недоступен/);
});

test('operations: a missing row is a 404 with a way back, not a crash', async () => {
  const db = seedMarketplace();
  const token = await owner();
  const order = await callRoute(orderDetailRoute.onRequestGet, db, '/api/admin/orders/nope', {
    token, params: { id: 'nope' },
  });
  assert.equal(order.status, 404);
  assert.equal(order.body.error, 'order_not_found');

  const question = await callRoute(
    questionDetailRoute.onRequestGet, db, '/api/admin/questions/nope', {
      token, params: { id: 'nope' },
    },
  );
  assert.equal(question.status, 404);
  assert.equal(question.body.error, 'question_not_found');

  for (const page of [await source(ORDER_PAGE), await source(QUESTION_PAGE)]) {
    assert.match(page, /Вернуться к очереди/);
  }
});

test('operations: an identifier that is not one is refused before it reaches SQL', async () => {
  const db = seedMarketplace();
  const answer = await callRoute(orderDetailRoute.onRequestGet, db, '/api/admin/orders/x', {
    token: await owner(), params: { id: "' OR 1=1 --" },
  });
  assert.equal(answer.status, 400);
  assert.equal(answer.body.error, 'invalid_order_id');
});

test('operations: every answer forbids caching and indexing', async () => {
  const db = seedMarketplace();
  const answer = await callRoute(ordersRoute.onRequestGet, db, '/api/admin/orders', {
    token: await owner(),
  });
  assert.equal(answer.headers.get('Cache-Control'), 'no-store');
  assert.match(String(answer.headers.get('X-Robots-Tag')), /noindex/);
});

test('operations: the summary counts the marketplace, not the page', async () => {
  const db = seedMarketplace();
  const answer = await callRoute(ordersRoute.onRequestGet, db, '/api/admin/orders', {
    token: await owner(), search: '?limit=1&stage=placed',
  });
  const summary = answer.body.summary as Record<string, number>;
  assert.equal(answer.body.count, 1);
  assert.equal(summary.orders_total, 3);
  assert.equal(summary.orders_awaiting_seller, 1);
  assert.equal(summary.questions_total, 3);
  assert.equal(summary.questions_open, 1);
});

test('operations: an empty marketplace is empty, not an error', async () => {
  const db = freshAdminDb();
  const token = await owner();
  const orders = await callRoute(ordersRoute.onRequestGet, db, '/api/admin/orders', { token });
  assert.equal(orders.status, 200);
  assert.equal(orders.body.total, 0);
  assert.deepEqual(orders.body.orders, []);
  const questions = await callRoute(
    questionsRoute.onRequestGet, db, '/api/admin/questions', { token },
  );
  assert.equal(questions.status, 200);
  assert.deepEqual(questions.body.questions, []);
});

// ── Nothing else moved ───────────────────────────────────────────────────────

test('operations: AUTH-1F, QuickPost and the rollout flag are untouched', async () => {
  const wrangler = await source('wrangler.toml');
  assert.match(wrangler, /MARKET_OWNER_TELEGRAM_BINDING_ENABLED = "false"/);
  assert.match(wrangler, /MARKET_QUICKPOST_ENABLED = "false"/);
  assert.match(wrangler, /MARKET_QUICKPOST_AI_ENABLED = "false"/);
  // The rollout flag is a released state, not a constant: it shipped "false" and
  // the release that deployed the panel set it "true". The three above are the
  // ones this slice must never move.
  assert.match(wrangler, /^BORMI_ADMIN_V2_ENABLED = "(true|false)"$/m);
  for (const path of ROUTES) {
    assert.doesNotMatch(code(await source(path)), /BORMI_ADMIN_V2_ENABLED/, path);
  }
});

test('operations: the legacy agent endpoints keep their own contract', async () => {
  // ADMIN-4A adds routes beside `/api/admin/agents/orders` and `/handoffs`
  // rather than changing them: the old console still reads them, and a support
  // user still has the access those endpoints granted.
  const legacyOrders = code(await source('functions/api/admin/agents/orders.ts'));
  const legacyHandoffs = code(await source('functions/api/admin/agents/handoffs.ts'));
  assert.match(legacyOrders, /withOwnerRole\('support_readonly'/);
  assert.match(legacyHandoffs, /withOwnerRole\('support_readonly'/);
});
