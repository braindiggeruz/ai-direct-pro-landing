// Приёмка UI поверх текущего SEO/one-tap baseline; старый snapshot df264eb1 не подменяет его.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { assertSeoProtection, BASELINE } from '../scripts/seo-protection';

const ROOT = path.resolve(import.meta.dirname, '..');
const REPORT = path.join(ROOT, 'docs/seo/evidence/2026-10-07-chat-ui/layout-report.json');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');
type Report = {
  checkedAt: string; ok: boolean; dist: string;
  summary: {
    composition: { failures: number }; sizes: string[]; states: string[];
    textUnderComposer: number; textOverlaps: number; controlOverlaps: number;
    smallTargets: number; contrastFails: number; honesty: number; answerFormat: number; sidebarStyle: number;
    keyboardNotDetected: number; unexpectedApiCalls: string[]; menuUnreachable: string[];
    negativeControls: Array<{ caught: boolean }>;
    frameVsMounted: Array<{ moved: string[] }>;
    transition: Array<{ problems: string[]; reducedMotion?: string }>;
    lightRendersDark: { compared: number; different: unknown[] };
    classicScrollbars: Array<{ gutter: number }>;
    billing: Array<{ size: string; purchase: boolean; sheet: { ok: boolean }; price: { amount: number; providers: string[]; ratio: number } }>;
    perf: Array<{ size: string; cls: number; lcp: { t: number } | null }>;
  };
};

test('UI keeps the current SEO baseline and source CSS budget', () => {
  assert.notEqual(BASELINE, 'docs/seo/evidence/2026-10-07-chat-ui/reviewed-protected-pages.json');
  assert.ok(fs.existsSync(path.join(ROOT, BASELINE)));
  assert.ok(Buffer.byteLength(read('src/gpt-chat/premium.css')) <= 30_000);
});

test('the fresh integrated UI passes the documented browser acceptance', {
  skip: !fs.existsSync(REPORT) && 'Нужен свежий layout-report после сборки интеграции',
}, () => {
  const report = JSON.parse(fs.readFileSync(REPORT, 'utf8')) as Report;
  for (const file of [
    'src/gpt-chat/premium.css', 'src/gpt-chat/account/account.css', 'src/gpt-chat/i18n.ts',
    'src/gpt-chat/markdown.ts', 'src/gpt-chat/components/AiChatConsole.tsx',
    'src/gpt-chat/components/AiChatMessageList.tsx', 'src/gpt-chat/components/AiSidebar.tsx',
    'src/gpt-chat/components/AiAccountPanel.tsx',
    'src/gpt-chat/components/AiAnswer.tsx', 'src/gpt-chat/components/RoleSelector.tsx',
    'scripts/prerender.ts', 'scripts/chat-layout-check.mjs',
  ]) assert.ok(Date.parse(report.checkedAt) >= fs.statSync(path.join(ROOT, file)).mtimeMs, `Устаревший отчёт: ${file}`);
  assert.equal(report.ok, true);
  const s = report.summary;
  assert.equal(s.composition.failures, 0, '1–6: ось, ширина, задачи, вертикаль, сноска и действия');
  assert.equal(s.answerFormat, 0, '6–7: форматирование и доступность формул');
  assert.ok(s.states.includes('drawer'), '8: drawer проверен');
  assert.equal(s.sidebarStyle, 0, '8: active/Telegram стили sidebar и portal drawer');
  for (const field of ['textUnderComposer', 'textOverlaps', 'controlOverlaps', 'smallTargets', 'contrastFails', 'honesty', 'keyboardNotDetected'] as const)
    assert.equal(s[field], 0, `9–11: ${field}`);
  assert.deepEqual(s.menuUnreachable, []);
  assert.deepEqual(s.unexpectedApiCalls, []);
  for (const size of ['320x568', '360x612', '360x740', '390x844', '412x915', '768x1024', '1366x768', '1440x900', '1920x1080']) assert.ok(s.sizes.includes(size), size);
  assert.equal(s.transition.length, 6, '12: переходы и reduced motion');
  assert.ok(s.transition.every(t => !t.problems.length));
  assert.equal(s.billing.length, 12, '13: обе локали, включая 640/700/701 px');
  for (const b of s.billing) {
    assert.ok(b.purchase, 'Текст покупки виден целиком, кнопка доступна и помещается на экране');
    assert.ok(b.sheet.ok && b.price.ratio >= 4.5);
    assert.equal(b.price.amount, 20000);
    assert.equal(b.price.providers.length, 1);
    for (const provider of ['Click']) assert.ok(b.price.providers.some(p => p.includes(provider)));
  }
  assert.equal(s.frameVsMounted.length, 18, '14: frame и mount во всех размерах и локалях');
  assert.ok(s.frameVsMounted.every(f => !f.moved.length));
  assert.equal(s.classicScrollbars.length, 4);
  assert.ok(s.classicScrollbars.every(s => s.gutter > 0));
  assert.ok(s.lightRendersDark.compared > 0, '14: нужен полный gate без --quick');
  assert.deepEqual(s.lightRendersDark.different, []);
  assert.equal(s.negativeControls.length, 5, '15: отрицательные контроли');
  assert.ok(s.negativeControls.every(n => n.caught));
  const perf = s.perf.filter(p => ['360x612', '390x844', '1366x768'].includes(p.size));
  assert.equal(perf.length, 6);
  assert.ok(perf.every(p => p.cls <= 0.05 && (p.lcp?.t ?? Infinity) <= 2500));
  assertSeoProtection(report.dist);
});
