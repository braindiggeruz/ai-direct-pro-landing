// ADMIN-3A: the read-only listings and categories surface.
//
// These are source-inspection tests, like the rest of the bormi-admin corpus.
// They exist to hold three properties that are cheap to break and expensive to
// discover: the surface stays read-only, every query stays bounded and indexed,
// and nothing about a person reaches the screen.
//
// Two of them are worth stating outright. There is no assertion here that a
// button is disabled, because a disabled button is not the property wanted —
// the property is that no write control and no write endpoint exists at all.
// And nothing asserts a quality score, because there is none: the platform
// measures no views and no sales, so a number would be an opinion.
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, ROOT), 'utf8');
}

/** Source with prose removed, so assertions test code and not comments. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const READ_MODEL = 'functions/platform/admin/listings.ts';
const OVERVIEW_MODEL = 'functions/platform/admin/projections.ts';
const LIST_ROUTE = 'functions/api/admin/listings/index.ts';
const DETAIL_ROUTE = 'functions/api/admin/listings/[id]/index.ts';
const MEDIA_ROUTE = 'functions/api/admin/listings/[id]/media/[index].ts';
const CATEGORY_ROUTE = 'functions/api/admin/categories/index.ts';
const LISTINGS_PAGE = 'apps/bormi-admin/src/pages/Listings.tsx';
const DETAIL_PAGE = 'apps/bormi-admin/src/pages/ListingDetail.tsx';
const CATEGORIES_PAGE = 'apps/bormi-admin/src/pages/Categories.tsx';
const API = 'apps/bormi-admin/src/lib/api.ts';
const TEXT = 'apps/bormi-admin/src/lib/text.ts';
const FIXTURES = 'apps/bormi-admin/src/lib/fixtures.ts';
const SHELL = 'apps/bormi-admin/src/components/AppShell.tsx';
const APP = 'apps/bormi-admin/src/App.tsx';

const SERVER_FILES = [READ_MODEL, LIST_ROUTE, DETAIL_ROUTE, MEDIA_ROUTE, CATEGORY_ROUTE];
const CLIENT_FILES = [LISTINGS_PAGE, DETAIL_PAGE, CATEGORIES_PAGE];

// ── Authority ────────────────────────────────────────────────────────────────

test('listings: every route is owner-only, and the role is checked first', async () => {
  for (const path of [LIST_ROUTE, DETAIL_ROUTE, MEDIA_ROUTE, CATEGORY_ROUTE]) {
    const route = code(await source(path));
    assert.match(
      route,
      /withOwnerRole\('platform_owner'/,
      `${path} does not take the owner role`,
    );
    // `withOwnerRole` authorises before the handler body runs, so there is no
    // ordering to get wrong — but a handler exported without it would be open.
    assert.doesNotMatch(route, /export const onRequestGet = async/, `${path} bypasses the guard`);
  }
});

test('listings: support_readonly is not admitted to the catalogue', async () => {
  for (const path of [LIST_ROUTE, DETAIL_ROUTE, MEDIA_ROUTE, CATEGORY_ROUTE]) {
    const route = code(await source(path));
    assert.doesNotMatch(route, /support_readonly/, `${path} widens the role`);
  }
});

test('listings: the rollout flag is not treated as authority', async () => {
  // The flag decides whether the panel renders, never whether the data may be
  // read: the server does not consult it, and the client cannot grant itself
  // anything by flipping it.
  for (const path of SERVER_FILES) {
    assert.doesNotMatch(code(await source(path)), /BORMI_ADMIN_V2_ENABLED/, path);
  }
});

// ── Read-only ────────────────────────────────────────────────────────────────

test('listings: no route offers a write, and every other method is refused', async () => {
  for (const path of [LIST_ROUTE, DETAIL_ROUTE, MEDIA_ROUTE, CATEGORY_ROUTE]) {
    const route = code(await source(path));
    for (const method of ['Post', 'Put', 'Patch', 'Delete']) {
      assert.match(
        route,
        new RegExp(`onRequest${method} = methodNotAllowed\\('GET'\\)`),
        `${path} does not refuse ${method}`,
      );
    }
  }
});

test('listings: the read model contains no statement that could change a row', async () => {
  for (const path of SERVER_FILES) {
    const text = code(await source(path));
    for (const verb of ['INSERT', 'UPDATE ', 'DELETE FROM', 'CREATE TABLE', 'ALTER TABLE', 'DROP ']) {
      assert.ok(!text.includes(verb), `${path} contains ${verb}`);
    }
  }
});

test('listings: the list and the categories screens offer no command at all', async () => {
  // ADMIN-3B put three commands on the detail screen and nowhere else. A
  // command reachable from a table row would be a command performed without
  // reading the card it changes.
  for (const path of [LISTINGS_PAGE, CATEGORIES_PAGE]) {
    const page = code(await source(path));
    for (const word of [
      'Опубликовать', 'Снять с публикации', 'Архивировать', 'Отправить в архив',
      'Переместить в архив', 'Удалить', 'Редактировать', 'Сохранить',
    ]) {
      assert.ok(!page.includes(word), `${path} offers "${word}"`);
    }
    assert.doesNotMatch(page, /runListingCommand/, `${path} can run a command`);
  }
});

test('listings: the detail offers only the three transitions the domain has', async () => {
  const page = code(await source(DETAIL_PAGE));
  // Exactly these, and nothing that edits content or deletes anything.
  for (const allowed of ['Опубликовать', 'Снять с публикации', 'Переместить в архив']) {
    assert.ok(page.includes(allowed), `the detail is missing "${allowed}"`);
  }
  for (const forbidden of ['Удалить', 'Редактировать', 'Изменить карточку', 'Сохранить', 'Восстановить']) {
    assert.ok(!page.includes(forbidden), `the detail offers "${forbidden}"`);
  }
  // Availability is decided by status, so an impossible command is absent
  // rather than rendered and greyed out.
  assert.doesNotMatch(page, /disabled=\{true\}/, 'the detail ships a permanently disabled command');
  assert.match(page, /command\.from\.includes\(listing\.status\)/);
});

test('listings: every read the client performs is a GET', async () => {
  const api = code(await source(API));
  // The read surface is the `adminApi` object itself. It used to be sliced at
  // `runListingCommand`, on the assumption that the module's one write came
  // last; the moderation vertical added two more, and a boundary defined by
  // "the first write function" is one that quietly shrinks every time a command
  // is added above it. The object is the real boundary: it is what every screen
  // reads through, and no mutating verb belongs inside it.
  const readsStart = api.indexOf('export const adminApi');
  assert.notEqual(readsStart, -1, 'the read surface is no longer one object');
  const reads = api.slice(readsStart, api.indexOf('\n};', readsStart));
  for (const method of ["'POST'", "'PUT'", "'PATCH'", "'DELETE'"]) {
    assert.ok(!reads.includes(method), `a read can send ${method}`);
  }
  // PUT, PATCH and DELETE exist nowhere in the client, command or otherwise.
  for (const method of ["method: 'PUT'", "method: 'PATCH'", "method: 'DELETE'"]) {
    assert.ok(!api.includes(method), `the client can send ${method}`);
  }
});

// ── Bounded, indexed, and not an N+1 ─────────────────────────────────────────

test('listings: the list is bounded by the shared owner limits', async () => {
  const model = code(await source(READ_MODEL));
  // Not a new limit: the same `OWNER_LIMITS` every other owner endpoint uses,
  // so one change bounds the whole surface.
  assert.match(model, /OWNER_LIMITS\.pageSizeDefault/);
  assert.match(model, /OWNER_LIMITS\.pageSizeMax/);
  const route = code(await source(LIST_ROUTE));
  assert.match(route, /parsePagination\(ctx\.url\)/);
  assert.match(model, /LIMIT \? OFFSET \?/);
});

test('listings: an unrecognised filter value is refused, never widened', async () => {
  const route = code(await source(LIST_ROUTE));
  // `parseEnumFilter` throws on a value outside the closed list rather than
  // falling back to "all", so a typo cannot silently return more rows.
  for (const filter of ['status', 'availability', 'media', 'quality', 'sort']) {
    assert.match(
      route,
      new RegExp(`parseEnumFilter\\(ctx\\.url, '${filter}'`),
      `${filter} is not validated against a closed list`,
    );
  }
  assert.match(route, /requireIdentifier\(rawStore/);
});

test('listings: ordering is total, so a page boundary cannot drop a row', async () => {
  const model = code(await source(READ_MODEL));
  // `id` is the primary key, so `(normalized_name, id)` is unique and the sort
  // is deterministic across pages.
  assert.match(model, /ORDER BY product\.normalized_name ASC, product\.id ASC/);
  assert.match(model, /ORDER BY product\.normalized_name DESC, product\.id DESC/);
});

test('listings: sorting by updated_at is not offered, because no index covers it', async () => {
  const model = code(await source(READ_MODEL));
  // EXPLAIN QUERY PLAN on production D1: `ORDER BY updated_at DESC` is
  // "SCAN p" plus a temp B-tree. ADMIN-3A adds no index, so it adds no sort.
  assert.match(model, /LISTING_SORTS = \['name', 'name_desc'\]/);
  assert.doesNotMatch(model, /ORDER BY product\.updated_at/);
  const page = await source(LISTINGS_PAGE);
  // And the screen says why, rather than leaving a reader to wonder.
  assert.match(page, /Сортировка по дате изменения не предлагается/);
});

test('listings: search is a bounded prefix against the normalised column', async () => {
  const model = code(await source(READ_MODEL));
  assert.match(model, /normalized_name LIKE \? ESCAPE/);
  // A leading wildcard cannot use the index, so none is built.
  assert.doesNotMatch(model, /LIKE '%/);
  assert.match(model, /queryLength: 80/);
  assert.match(model, /queryMinimum: 2/);
  const route = code(await source(LIST_ROUTE));
  // Normalised with the catalogue's own function, so the term is compared
  // against what the column actually holds.
  assert.match(route, /normalizedProductName/);
});

test('listings: labels are joined, not fetched per row', async () => {
  const model = code(await source(READ_MODEL));
  const listBody = model.slice(model.indexOf('export async function listListings'));
  assert.match(listBody, /JOIN sotuvchi_stores/);
  assert.match(listBody, /LEFT JOIN sotuvchi_categories/);
  // One statement for the page. A per-row lookup would show up as a loop with
  // an await inside it.
  assert.doesNotMatch(listBody, /for \([\s\S]{0,120}await/);
});

test('listings: category counts are one grouped statement, not one per category', async () => {
  const model = code(await source(READ_MODEL));
  const body = model.slice(model.indexOf('export async function listCategories'));
  assert.match(body, /db\.batch/);
  assert.match(body, /GROUP BY product\.category_id, product\.status/);
  assert.doesNotMatch(body, /map\([^)]*async/);
});

test('listings: the table, the pager and the tiles count one population', async () => {
  // `listListings` joins stores, so every other statement that answers a
  // question about "how many listings" has to join them too. Private classified
  // listings have a null `store_id` — `0034` made it nullable so a private
  // seller would not need a fake shop — and counting them here produced a total
  // the table could never reach and pages that came back empty.
  //
  // The anchor is the table name, not `FROM sotuvchi_products AS product`. The
  // statements this guard exists to reject are the ones that were here before,
  // and they had no alias at all — anchoring on the alias made the match list
  // empty and the loop below vacuous, so the test passed on exactly the text it
  // was written to catch. For the same reason an entry with no statements to
  // check is a stale test rather than a silent pass.
  const surfaces = [
    { file: READ_MODEL, entries: ['countListings', 'listingSummary'] },
    { file: OVERVIEW_MODEL, entries: ['loadPlatformOverview'] },
  ] as const;

  for (const { file, entries } of surfaces) {
    const model = code(await source(file));
    for (const entry of entries) {
      const start = model.indexOf(`export async function ${entry}`);
      assert.notEqual(start, -1, `${entry} is gone; this test is stale`);
      const body = model.slice(start, model.indexOf('\nexport ', start + 1));
      const statements = body.match(/FROM sotuvchi_products\b[\s\S]*?`/g) ?? [];
      assert.ok(statements.length > 0, `${entry} counts no products; this test is stale`);
      for (const statement of statements) {
        assert.match(
          statement,
          /JOIN sotuvchi_stores AS store ON store\.id = product\.store_id/,
          `${entry} counts products the catalogue table cannot show`,
        );
      }
    }
  }
});

test('listings: nothing selects the whole table', async () => {
  const model = code(await source(READ_MODEL));
  // `SELECT product.*` is used once, for a single row addressed by primary key.
  const starMatches = [...model.matchAll(/SELECT product\.\*/g)];
  assert.equal(starMatches.length, 1, 'more than one statement selects every column');
  const detail = model.slice(model.indexOf('export async function getListingRow'));
  assert.match(detail, /WHERE product\.id = \?/);
});

// ── Quality ──────────────────────────────────────────────────────────────────

test('listings: quality is deterministic and names the column behind each reason', async () => {
  const model = code(await source(READ_MODEL));
  assert.match(model, /no_photo: 'json_array_length\(product\.media_refs_json\) = 0'/);
  assert.match(model, /no_category: 'product\.category_id IS NULL'/);
  assert.match(model, /no_description: "\(product\.description IS NULL OR trim\(product\.description\) = ''\)"/);
  assert.match(model, /unavailable: "product\.availability = 'unavailable'"/);
});

test('listings: quality has three states and no score', async () => {
  const model = code(await source(READ_MODEL));
  assert.match(model, /LISTING_QUALITY_STATES = \['good', 'needs_attention', 'incomplete'\]/);
  for (const path of [READ_MODEL, ...CLIENT_FILES]) {
    // Only executable code: the screens say in plain Russian that there is no
    // score and no rating, and a ban on those words would forbid saying so.
    const text = code(await source(path));
    for (const forbidden of ['score', 'Score', 'rating', 'Rating']) {
      assert.ok(!text.includes(forbidden), `${path} implies a score via "${forbidden}"`);
    }
    // No number presented out of a maximum, in any of the usual shapes.
    assert.doesNotMatch(text, /\d\s*\/\s*(100|10|5)\b/, `${path} renders a score`);
    assert.doesNotMatch(text, /percent|процент/i, `${path} renders a percentage`);
  }
  // And the detail screen states the absence rather than leaving it implied.
  const detail = await source(DETAIL_PAGE);
  assert.match(detail, /Оценки в баллах нет/);
});

test('listings: the same rule produces the same verdict on the server and in fixtures', async () => {
  // A fixture that graded differently from the server would let a review sign
  // off on a screen that cannot exist.
  const model = code(await source(READ_MODEL));
  const fixtures = code(await source(FIXTURES));
  for (const text of [model, fixtures]) {
    assert.match(text, /reasons\.includes\('no_photo'\) \|\| reasons\.includes\('no_category'\)/);
  }
});

test('listings: fixture search matches by prefix, exactly as the server does', async () => {
  const fixtures = code(await source(FIXTURES));
  assert.match(fixtures, /normalizeFixtureName\(row\.name\)\.startsWith/);
  assert.doesNotMatch(fixtures, /row\.name\.toLowerCase\(\)\.includes/);
});

// ── Vocabulary ───────────────────────────────────────────────────────────────

test('listings: no raw status or availability key reaches a screen', async () => {
  const text = code(await source(TEXT));
  for (const key of ['draft', 'published', 'archived']) {
    assert.match(text, new RegExp(`${key}: '`), `${key} has no Russian label`);
  }
  for (const key of ['available', 'unavailable', 'preorder']) {
    assert.match(text, new RegExp(`${key}: '`), `${key} has no Russian label`);
  }
  for (const key of ['good', 'needs_attention', 'incomplete']) {
    assert.match(text, new RegExp(`${key}: '`), `${key} has no Russian label`);
  }
  // And every screen goes through the lookup rather than printing the key.
  for (const path of CLIENT_FILES) {
    const page = code(await source(path));
    assert.doesNotMatch(page, /\{row\.status\}/, `${path} prints a raw status`);
    assert.doesNotMatch(page, /\{listing\.status\}/, `${path} prints a raw status`);
  }
});

test('listings: an unknown value falls back safely instead of breaking', async () => {
  const text = code(await source(TEXT));
  // `label` returns the key rather than undefined, so an unmapped value renders
  // as itself instead of as "undefined" or an empty cell.
  assert.match(text, /export function label\(map: Record<string, string>, key: string\): string \{\s*return map\[key\] \?\? key;/);
});

test('listings: the money format agrees with the buyer presenter', async () => {
  const text = code(await source(TEXT));
  // `price_minor` holds whole som — the catalogue proves it and the buyer's
  // own presenter prints it undivided. Dividing here showed every price at a
  // hundredth of what the buyer was quoted.
  assert.doesNotMatch(text, /minor \/ 100/);
  const buyer = code(await source('functions/agents/sotuvchi/buyer/cards.ts'));
  assert.doesNotMatch(buyer, /priceMinor \/ 100/);
});

// ── Privacy ──────────────────────────────────────────────────────────────────

test('listings: nothing about a person is selected or rendered', async () => {
  for (const path of [...SERVER_FILES, ...CLIENT_FILES]) {
    const text = code(await source(path));
    for (const field of [
      'telegram_id', 'telegramId', 'username', 'phone', 'buyer_name', 'buyerName',
      'buyer_phone', 'buyerPhone', 'buyer_address', 'buyerAddress', 'initData',
      'identity_id', 'identityId', 'session_secret', 'sessionSecret',
    ]) {
      assert.ok(!text.includes(field), `${path} touches ${field}`);
    }
  }
});

test('listings: the media reference itself never leaves the server', async () => {
  const model = code(await source(READ_MODEL));
  // A caller gets an index and a kind. The R2 key is built server-side from the
  // product's own org and store, so a request can only address an object inside
  // the store that owns the product it named.
  assert.match(model, /media: mediaRefs\.map\(\(reference, index\) => \(\{/);
  assert.match(model, /index,\s*kind:/);
  const contracts = code(await source('apps/bormi-admin/src/lib/contracts.ts'));
  const mediaType = contracts.slice(contracts.indexOf('export interface ListingMedia'));
  assert.doesNotMatch(mediaType.slice(0, 200), /reference|key|url|handle/i);
  const media = code(await source(MEDIA_ROUTE));
  assert.match(media, /mediaObjectKey\(String\(row\.org_id/);
});

test('listings: no credential is ever put in a URL', async () => {
  const api = code(await source(API));
  // Images are fetched with the bearer header, not with a signed address: a
  // capability in a URL lands in history and in any referrer.
  assert.match(api, /headers\.Authorization = `Bearer \$\{bearer\}`/);
  assert.doesNotMatch(api, /\?token=|&token=|\?bearer=/);
  for (const path of CLIENT_FILES) {
    assert.doesNotMatch(code(await source(path)), /token/i, `${path} mentions a token`);
  }
});

test('listings: the search term is never logged', async () => {
  for (const path of SERVER_FILES) {
    const text = code(await source(path));
    assert.doesNotMatch(text, /console\.(log|info|warn|error)/, `${path} logs`);
  }
});

// ── Every state the screen can be in ─────────────────────────────────────────

test('listings: loading, both empties, error and stale are all handled', async () => {
  const page = code(await source(LISTINGS_PAGE));
  assert.match(page, /listings\.loading/);
  assert.match(page, /skeleton/);
  assert.match(page, /ErrorState/);
  assert.match(page, /onRetry=\{listings\.reload\}/);
  // The two empties are different answers and say different things.
  assert.match(page, /Объявлений пока нет/);
  assert.match(page, /По этим фильтрам ничего не найдено/);
  // Stale: `Freshness` keeps the previous answer on screen while reloading.
  assert.match(page, /refreshing=\{listings\.refreshing\}/);
  assert.match(page, /fetchedAt=\{listings\.fetchedAt\}/);
});

test('listings: a missing card is a safe 404 with a way back', async () => {
  const route = code(await source(DETAIL_ROUTE));
  assert.match(route, /ownerError\('listing_not_found', ctx\.requestId, 404\)/);
  const page = code(await source(DETAIL_PAGE));
  assert.match(page, /detail\.error === 'listing_not_found'/);
  assert.match(page, /Вернуться к списку/);
});

test('listings: the filters survive opening a card and coming back', async () => {
  const page = code(await source(LISTINGS_PAGE));
  // The row link carries the current query string, and the detail sends it back.
  assert.match(page, /search: params\.toString\(\)/);
  const detail = code(await source(DETAIL_PAGE));
  assert.match(detail, /pathname: '\/listings', search: location\.search/);
});

test('listings: the reset control appears only when something is filtered', async () => {
  const page = code(await source(LISTINGS_PAGE));
  assert.match(page, /activeCount > 0 \? \(\s*<button/);
  assert.match(page, /Сбросить фильтры/);
});

// ── Layout and accessibility ─────────────────────────────────────────────────

test('listings: a phone gets cards, a desktop gets the table', async () => {
  const page = code(await source(LISTINGS_PAGE));
  assert.match(page, /hidden md:block/);
  assert.match(page, /space-y-3 md:hidden/);
});

test('listings: wide content scrolls inside its own container', async () => {
  const page = code(await source(LISTINGS_PAGE));
  // `TableFrame` owns the only horizontal scroll container, so the page body
  // never scrolls sideways.
  assert.match(page, /<TableFrame>/);
  const ui = code(await source('apps/bormi-admin/src/components/ui.tsx'));
  assert.match(ui, /table-scroll/);
});

test('listings: tables are labelled and their headers are column headers', async () => {
  for (const path of [LISTINGS_PAGE, CATEGORIES_PAGE]) {
    const page = await source(path);
    assert.match(page, /<caption className="sr-only">/, `${path} has an unlabelled table`);
  }
  const ui = code(await source('apps/bormi-admin/src/components/ui.tsx'));
  assert.match(ui, /scope="col"/);
});

test('listings: pagination is labelled and announces where the reader is', async () => {
  const page = code(await source(LISTINGS_PAGE));
  assert.match(page, /aria-label="Страницы каталога"/);
  assert.match(page, /aria-live="polite"/);
  assert.match(page, /Показано \{count\(offset \+ 1\)\}/);
});

test('listings: the row action is a real control, always visible', async () => {
  const page = code(await source(LISTINGS_PAGE));
  // Not a hover affordance: a control that appears on hover cannot be reached
  // by touch or by keyboard without guessing it is there.
  assert.doesNotMatch(page, /group-hover:|hover:opacity-100/);
  assert.match(page, /min-h-11/);
  // And the row itself is not pretending to be a button.
  assert.doesNotMatch(page, /<tr[^>]*onClick/);
});

test('listings: status is carried by a word, with colour only as the second signal', async () => {
  const page = code(await source(LISTINGS_PAGE));
  assert.match(page, /<Badge tone=\{statusTone\(row\.status\)\}>\{label\(LISTING_STATUS, row\.status\)\}<\/Badge>/);
  assert.match(page, /<Badge tone=\{qualityTone\(row\.quality\)\}>\{label\(QUALITY_STATE, row\.quality\)\}<\/Badge>/);
});

test('listings: every image carries alternative text', async () => {
  const detail = code(await source(DETAIL_PAGE));
  assert.match(detail, /alt=\{`Изображение \$\{media\.index \+ 1\} карточки`\}/);
});

test('listings: the object URL an image creates is released', async () => {
  const detail = code(await source(DETAIL_PAGE));
  // Left attached, the blob is pinned for the lifetime of the tab.
  assert.match(detail, /URL\.revokeObjectURL/);
});

// ── Navigation and scope ─────────────────────────────────────────────────────

test('listings: the menu gains Content and nothing that is not built', async () => {
  const shell = code(await source(SHELL));
  assert.match(shell, /title: 'Контент'/);
  assert.match(shell, /to: '\/listings', label: 'Объявления'/);
  assert.match(shell, /to: '\/categories', label: 'Категории'/);
  // Sections whose stages have not happened do not appear in the menu.
  // «Заказы» left this list when ADMIN-4A built the screen behind it, and
  // «Модерация» left it the same way: both entries below now open a screen
  // that reaches a real endpoint. The rest still name nothing that exists.
  for (const absent of ['Медиа', 'Пользователи', 'QuickPost']) {
    assert.ok(!shell.includes(absent), `the menu offers "${absent}", which does not exist`);
  }
  assert.match(shell, /title: 'Модерация'/);
  assert.match(shell, /to: '\/moderation', label: 'На модерации'/);
  assert.match(shell, /to: '\/reports', label: 'Жалобы'/);
});

test('listings: the routes are registered and lazily loaded', async () => {
  const app = code(await source(APP));
  assert.match(app, /path="\/listings" element=\{<Listings \/>\}/);
  assert.match(app, /path="\/listings\/:id" element=\{<ListingDetail \/>\}/);
  assert.match(app, /path="\/categories" element=\{<Categories \/>\}/);
  assert.match(app, /lazy\(\(\) => import\('\.\/pages\/Listings'\)\)/);
});

test('listings: no dependency was added for a table, a chart or an icon', async () => {
  const pkg = JSON.parse(await source('apps/bormi-admin/package.json')) as {
    dependencies: Record<string, string>;
  };
  // Still exact, and still the point of the test: a table, a chart and an icon
  // are all things this panel draws itself. `motion` is the one addition, made
  // deliberately for the premium operational UI - the rail's shared active
  // indicator, the filter tab indicator and the expand rows - and it is named
  // here so the next one has to be argued for too.
  assert.deepEqual(
    Object.keys(pkg.dependencies).sort(),
    ['motion', 'react', 'react-dom', 'react-router'],
    'the admin app gained a runtime dependency',
  );
  // The things this test was written to keep out.
  for (const rejected of ['react-table', '@tanstack/react-table', 'recharts', 'chart.js', 'lucide-react', '@hugeicons/react']) {
    assert.equal(pkg.dependencies[rejected], undefined, `${rejected} was installed`);
  }
});

test('listings: no migration, and no schema change', async () => {
  const migrations = await readdir(new URL('migrations/', ROOT));
  // ADMIN-3A is a read-only surface. Later product slices may legitimately add
  // migrations, so guard this slice by ownership instead of freezing the
  // repository-wide migration count.
  assert.ok(
    migrations.every((name) => !/admin_(?:listings_read|listing_read_surface)/i.test(name)),
    'the Admin listings read surface must not own a migration',
  );
});

test('listings: AUTH-1F, QuickPost and the rollout flag are untouched', async () => {
  const wrangler = await source('wrangler.toml');
  // The rollout flag is a released state, not a constant: it shipped "false" and
  // the release that deployed the panel set it "true". The three below are the
  // ones this slice must never move.
  assert.match(wrangler, /^BORMI_ADMIN_V2_ENABLED = "(true|false)"$/m);
  assert.match(wrangler, /MARKET_QUICKPOST_ENABLED = "false"/);
  assert.match(wrangler, /MARKET_QUICKPOST_AI_ENABLED = "false"/);
  assert.match(wrangler, /MARKET_OWNER_TELEGRAM_BINDING_ENABLED = "false"/);
});

test('listings: the Mini App and the previous console are not touched', async () => {
  for (const path of [...SERVER_FILES, ...CLIENT_FILES]) {
    const text = code(await source(path));
    assert.doesNotMatch(text, /market-mini-app/, `${path} reaches into the Mini App`);
  }
  // The buyer presenter is imported, which is the point — the preview is the
  // buyer's own rendering — but nothing writes to the buyer's surface.
  const detail = code(await source(DETAIL_ROUTE));
  assert.match(detail, /from '\.\.\/\.\.\/\.\.\/\.\.\/agents\/sotuvchi\/buyer\/cards'/);
});

test('listings: the preview is the buyer presenter, not a second implementation', async () => {
  const detail = code(await source(DETAIL_ROUTE));
  for (const fn of ['formatBuyerPrice', 'formatBuyerAvailability', 'boundedBuyerDescription']) {
    assert.match(detail, new RegExp(fn), `the preview does not use ${fn}`);
  }
  const page = code(await source(DETAIL_PAGE));
  // And the screen renders what the server produced rather than formatting the
  // raw columns a second time.
  assert.match(page, /\{preview\.price\}/);
  assert.match(page, /\{preview\.availability\}/);
});

test('listings: the preview invents no field the buyer does not see', async () => {
  const model = code(await source(READ_MODEL));
  const preview = model.slice(model.indexOf('preview: {'));
  for (const invented of ['views', 'rating', 'reviews', 'discount', 'delivery', 'popularity', 'verified']) {
    assert.ok(!preview.includes(invented), `the preview invents ${invented}`);
  }
});

// ── Fixtures stay out of production ──────────────────────────────────────────

test('listings: fixture data cannot reach a production build', async () => {
  const api = code(await source(API));
  assert.match(api, /import\.meta\.env\.DEV\s*&&\s*import\.meta\.env\.VITE_ADMIN_FIXTURES === '1'/);
  const fixtures = await source(FIXTURES);
  // Every invented product says so in its own name.
  assert.match(fixtures, /синтетическ/i);
  assert.doesNotMatch(fixtures, /@(gmail|mail|yandex)\./, 'a fixture carries a real-looking address');
  assert.match(fixtures, /example\.invalid/);
});

test('listings: the built admin bundle contains no fixture content', async () => {
  // The guarantee is structural — `import.meta.env.DEV` is statically false in
  // a production build, so the branch and the module are dropped — and this
  // asserts the shape that guarantee depends on.
  const api = code(await source(API));
  // Every synthetic call site sits behind the flag — whether it is written as a
  // ternary or as an early return.
  const syntheticCalls = [...api.matchAll(/synthetic[A-Za-z]+\(/g)].length;
  const guards = [...api.matchAll(/FIXTURE_MODE/g)].length;
  assert.ok(
    guards >= syntheticCalls,
    `${syntheticCalls} fixture calls but only ${guards} FIXTURE_MODE guards`,
  );
  assert.match(api, /if \(FIXTURE_MODE\) return Promise\.resolve\(syntheticListings/);
  // The media fetch refuses outright under fixtures rather than reaching out.
  assert.match(api, /if \(FIXTURE_MODE\) return null;/);
});
