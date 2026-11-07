import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const ROOT = path.resolve(import.meta.dirname, '..');
const browserPath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const evidence = path.join(ROOT, 'reports/documents-ui');

test('document UI: explicit consent, stable retry, restored jobs, cancel/download, owner draft and mobile layout', { skip: !browserPath, timeout: 180_000 }, async () => {
  const server = await createServer({ configFile: path.join(ROOT, 'vite.config.ts'), cacheDir: path.join(ROOT, 'apps/studio/node_modules/.cache/document-ui'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false } });
  await server.listen();
  const origin = server.resolvedUrls!.local[0].replace(/\/$/, '');
  const browser = await chromium.launch({ executablePath: browserPath, headless: true });
  fs.mkdirSync(evidence, { recursive: true });
  try {
    for (const width of [360, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, acceptDownloads: true });
      const page = await context.newPage();
      page.setDefaultNavigationTimeout(60_000);
      page.setDefaultTimeout(45_000);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      let jobs: Array<Record<string, unknown>> = [];
      let gets = 0, disabled = false, loseResponse = false;
      const creates: Array<{ key: string | undefined; body: { type: string; payload: Record<string, unknown> } }> = [];
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      await context.route('**/api/**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
        if (!url.pathname.includes('/documents')) return json({ ok: false, error: 'fixture_unavailable' }, 503);
        if (url.pathname.endsWith('/download')) return route.fulfill({ contentType: 'application/pdf', headers: { 'Content-Disposition': 'attachment; filename="fixture.pdf"' }, body: '%PDF-1.7\nfixture' });
        if (url.pathname.endsWith('/cancel')) { jobs = jobs.map(job => ({ ...job, status: 'cancelled', updatedAt: Date.now() })); return json({ ok: true, job: jobs[0] }); }
        if (request.method() === 'GET') { gets++; return disabled ? json({ ok: false, error: 'documents_unavailable' }, 503) : json({ ok: true, jobs, retentionHours: 24 }); }
        creates.push({ key: request.headers()['idempotency-key'], body: request.postDataJSON() });
        const now = Date.now();
        if (!jobs.length) jobs = [{ id: 'doc_ui_fixture_000000001', type: creates.at(-1)!.body.type, status: 'queued', createdAt: now, updatedAt: now, expiresAt: now + 86_400_000, attempts: 0, errorCode: null }];
        if (loseResponse) { loseResponse = false; return route.abort('failed'); }
        return json({ ok: true, job: jobs[0], replay: creates.length > 1 });
      });
      await page.goto(`${origin}/tests/browser-fixtures/documents.html`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Мои облачные PDF' }).waitFor();
      assert.equal(gets, 0, 'no document request before explicit history click');
      await page.getByRole('button', { name: 'Мои облачные PDF' }).click();
      await page.getByText('Пока нет документов.').waitFor();
      assert.equal(creates.length, 0);

      await page.goto(`${origin}/tests/browser-fixtures/documents.html?mode=export`);
      const create = page.getByRole('button', { name: 'Создать PDF в облаке', exact: true });
      await create.waitFor();
      assert.equal(creates.length, 0, 'opening result never uploads text');
      assert.match(await page.locator('[data-document-export]').innerText(), /Текст и файл хранятся 24 часа/);
      loseResponse = true;
      await create.click();
      await page.getByRole('alert').waitFor();
      assert.equal(creates.length, 1);
      await create.click();
      await page.locator('[data-document-status="queued"]').waitFor();
      assert.equal(creates.length, 2);
      assert.equal(creates[0].key, creates[1].key, 'lost response retry uses same key');
      assert.deepEqual(creates[0].body, creates[1].body);
      assert.equal((creates[0].body.payload.slides as unknown[]).length, 2, 'cover is included');
      await page.reload();
      await page.locator('[data-document-status="queued"]').waitFor();
      assert.equal(creates.length, 2, 'reload restores without creating');
      jobs = jobs.map(job => ({ ...job, status: 'running', updatedAt: Date.now() }));
      await page.getByRole('button', { name: 'Обновить статус', exact: true }).click();
      await page.locator('[data-document-status="running"]').waitFor();
      await page.getByRole('button', { name: 'Отменить', exact: true }).click();
      await page.locator('[data-document-status="cancelled"]').waitFor();
      jobs = jobs.map(job => ({ ...job, status: 'ready', updatedAt: Date.now() }));
      await page.getByRole('button', { name: 'Обновить статус', exact: true }).click();
      await page.locator('[data-document-status="ready"]').waitFor();
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Скачать PDF', exact: true }).click();
      assert.ok((await download).suggestedFilename().endsWith('.pdf'));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(evidence, `consumer-${width}.png`), fullPage: true });
      disabled = true;
      await page.reload();
      await page.locator('[data-document-disabled]').waitFor();
      assert.equal(await create.count(), 0);

      disabled = false; jobs = [];
      await page.goto(`${origin}/tests/browser-fixtures/documents.html?mode=admin`);
      await page.getByText('Пока нет документов', { exact: true }).waitFor();
      const countBefore = creates.length;
      await page.getByLabel('Компания *', { exact: true }).fill('Fixture company');
      await page.getByLabel('Цель проекта *', { exact: true }).fill('Owner supplied objective');
      await page.getByLabel('Язык PDF').selectOption('uz');
      await page.getByRole('button', { name: 'Создать PDF-черновик', exact: true }).click();
      await page.locator('[data-document-status="queued"]').waitFor();
      assert.equal(creates.length, countBefore + 1);
      assert.deepEqual(creates.at(-1)!.body, { type: 'proposal_pdf', payload: { company: 'Fixture company', objective: 'Owner supplied objective', packageId: 'custom', locale: 'uz' } });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(evidence, `owner-${width}.png`), fullPage: true });
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); await server.close(); }
});
