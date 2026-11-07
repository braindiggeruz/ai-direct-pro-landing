import { chromium } from 'playwright-core';
import { createDocumentHtml, paginateDocument } from './template.mjs';
import { DocumentError, MAX_PDF_BYTES } from './schema.mjs';

export async function renderPdf(type, payload, options = {}) {
  const html = await createDocumentHtml(type, payload);
  const browser = await chromium.launch({
    headless: true, executablePath: options.executablePath,
    timeout: Math.min(options.timeoutMs ?? 90000, 20000),
    args: ['--disable-dev-shm-usage', '--disable-background-networking', '--disable-component-update', '--no-default-browser-check', '--disable-sync', '--host-resolver-rules=MAP * ~NOTFOUND'],
  });
  try {
    const context = await browser.newContext({ javaScriptEnabled: false, offline: true, serviceWorkers: 'block', acceptDownloads: false });
    let blockedRequests = 0;
    await context.route('**/*', route => { blockedRequests++; return route.abort('blockedbyclient'); });
    const page = await context.newPage();
    page.setDefaultTimeout(Math.min(options.timeoutMs ?? 90000, 20000));
    await page.emulateMedia({ media: 'print', reducedMotion: 'reduce' });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(async () => {
      // The escaped source is hidden until pagination. Preload every embedded subset
      // before measuring; otherwise font substitution could invalidate line breaks.
      await Promise.all([400, 600, 700, 800].map(weight => document.fonts.load(`${weight} 16px Manrope`, 'AĀАҚҒҲЎ')));
      await document.fonts.ready;
      if (!document.fonts.check('400 16px Manrope', 'AĀАҚҒҲЎ')) throw new Error('font_unavailable');
    });
    const layout = await page.evaluate(paginateDocument);
    if (blockedRequests) throw new DocumentError('render_failed');
    if (options.screenshotPath) await page.locator('.page').first().screenshot({ path: options.screenshotPath });
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true, tagged: true, displayHeaderFooter: false });
    if (pdf.length > MAX_PDF_BYTES || pdf.subarray(0, 5).toString() !== '%PDF-') throw new DocumentError('render_failed');
    return { pdf, ...layout, blockedRequests };
  } finally { await browser.close(); }
}
