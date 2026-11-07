import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { renderPdf } from '../apps/document-worker/src/renderer.mjs';
import { renderIsolated } from '../apps/document-worker/src/worker.mjs';

const executablePath = process.env.DOCUMENT_TEST_CHROMIUM;
const artifacts = new URL('../apps/document-worker/.artifacts/', import.meta.url);
test('real Chromium: RU/UZ text, hostile markup, long text paginate without loss or overflow', { skip: !executablePath, timeout: 240000 }, async () => {
  await mkdir(artifacts, { recursive: true });
  const fixtures = [
    ['proposal_pdf', 'proposal-ru', { locale: 'ru', company: 'Студия будущего', packageId: 'custom', objective: 'Собрать понятный документ с согласованными условиями. Подготовить структуру, дизайн и материалы для обсуждения.', scope: ['Определить состав работ и ожидаемый результат.', 'Согласовать этапы и ответственных.'], budgetTerms: 'Стоимость и сроки определяются после согласования состава работ.', contact: 'Контакт указывает владелец.' }],
    ['presentation_pdf', 'presentation-uz', { locale: 'uz', title: 'O‘zbekcha taqdimot · Ўзбекча тақдимот', slides: [{ title: 'G‘oyadan aniq natijaga', bullets: ['Maqsadni aniqlash va kelishilgan vazifalarni yozish.', 'Ғоя, қадам, ҳамкорлик: ўзбекча ҳарфлар тўғри кўриниши керак.'], notes: 'Shartlar loyiha egasi bilan kelishiladi.' }] }],
    ['presentation_pdf', 'presentation-long', { locale: 'ru', title: 'Проверка переноса', slides: [{ title: 'Длинный текст сохраняется полностью', bullets: Array.from({ length: 12 }, (_, i) => `${i + 1}. ` + 'Длинный согласованный текст для проверки переноса на следующую страницу. '.repeat(12)), notes: '<script>alert(1)</script><img src="https://example.invalid">' + 'Примечание. '.repeat(200) }] }],
  ];
  for (const [type, name, payload] of fixtures) {
    const result = await renderPdf(type, payload, { executablePath, screenshotPath: new URL(`${name}.png`, artifacts).pathname.replace(/^\/([A-Z]:)/, '$1') });
    assert.equal(result.overflow, false); assert.equal(result.textIntegrity, true); assert.equal(result.blockedRequests, 0);
    assert.ok(result.pdf.length > 5000); assert.ok(result.pdf.length < 10 * 1024 * 1024);
    if (name.endsWith('long')) assert.ok(result.pages > 1);
    await writeFile(new URL(`${name}.pdf`, artifacts), result.pdf);
    console.log(JSON.stringify({ fixture: name, pages: result.pages, pdfBytes: result.pdf.length }));
  }
});

test('isolated render child returns PDF and exits after closing browser', { skip: !executablePath, timeout: 90000 }, async () => {
  const result = await renderIsolated({ type: 'presentation_pdf', payload: { locale: 'ru', title: 'Проверка', slides: [{ title: 'Работает', bullets: ['Один процесс на одно задание.'] }] } }, { executablePath, timeoutMs: 75000 }, new AbortController().signal);
  assert.equal(result.pdf.subarray(0, 5).toString(), '%PDF-'); assert.equal(result.pages, 1);
});
