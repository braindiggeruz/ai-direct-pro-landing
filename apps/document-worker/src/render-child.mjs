import { renderPdf } from './renderer.mjs';

process.once('message', async message => {
  try {
    const result = await renderPdf(message.type, message.payload, message.options);
    process.send({ ok: true, pdf: result.pdf, pages: result.pages, rssBytes: process.memoryUsage().rss }, () => process.disconnect());
  } catch (error) {
    const code = error?.code === 'invalid_payload' ? 'invalid_payload' : 'render_failed';
    process.send({ ok: false, code }, () => process.disconnect());
  }
});
