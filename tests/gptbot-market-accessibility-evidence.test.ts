import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const EVIDENCE = path.join(
  ROOT,
  'docs',
  'agents-platform',
  'evidence',
  'gptbot-market-productization-2026-08-01',
);

interface AccessibilityEvidence {
  tool: string;
  pageAudits: Array<{
    path: string;
    violations: unknown[];
    incomplete: unknown[];
    passes: number;
  }>;
  overflow: Array<{
    route: string;
    width: number;
    passed: boolean;
  }>;
  keyboard: Array<{
    focused: boolean;
    visibleFocus: boolean;
  }>;
  reducedMotion: {
    preference: string;
    elementsWithLongMotion: number;
  };
  totals: {
    pages: number;
    violations: number;
    incomplete: number;
    axePasses: number;
    overflowFailures: number;
    keyboardFocusFailures: number;
    reducedMotionFailures: number;
  };
  claimsNotMade: string[];
}

function evidence(): AccessibilityEvidence {
  return JSON.parse(fs.readFileSync(
    path.join(EVIDENCE, 'market-accessibility-automated.json'),
    'utf8',
  )) as AccessibilityEvidence;
}

test('committed accessibility evidence is complete and passing', () => {
  const audit = evidence();
  assert.equal(audit.tool, 'axe-core 4.12.1 with playwright-core');
  assert.deepEqual(audit.totals, {
    pages: 7,
    violations: 0,
    incomplete: 0,
    axePasses: 171,
    overflowFailures: 0,
    keyboardFocusFailures: 0,
    reducedMotionFailures: 0,
  });
  assert.equal(audit.pageAudits.length, 7);
  assert.ok(audit.pageAudits.every((item) =>
    item.violations.length === 0
      && item.incomplete.length === 0
      && item.passes > 0));
  assert.equal(audit.keyboard.length, 12);
  assert.ok(audit.keyboard.every((item) =>
    item.focused && item.visibleFocus));
  assert.equal(audit.reducedMotion.preference, 'reduce');
  assert.equal(audit.reducedMotion.elementsWithLongMotion, 0);
});

test('overflow evidence covers every required RU and UZ width', () => {
  const audit = evidence();
  const requiredWidths = [320, 360, 390, 430, 768, 1024, 1280, 1440, 1728];
  assert.equal(audit.overflow.length, requiredWidths.length * 2);
  for (const route of ['/ru/sotuvchi/', '/uz/sotuvchi/']) {
    assert.deepEqual(
      audit.overflow
        .filter((item) => item.route === route)
        .map((item) => item.width),
      requiredWidths,
    );
  }
  assert.ok(audit.overflow.every((item) => item.passed));
});

test('visual evidence, reports and explicit human-gate limitations ship together', () => {
  for (const file of [
    'website-ru-320.png',
    'website-ru-390-final.png',
    'website-ru-tablet-768.png',
    'website-ru-1440-final.png',
    'website-ru-wide-1728.png',
    'website-uz-390-final.png',
    'website-uz-1440-final.png',
    'trust-ru-390.png',
    'trust-ru-1440.png',
    'website-404-390.png',
    'website-404-1440.png',
    'website-ru-keyboard-focus.png',
    'website-ru-reduced-motion.png',
    'website-ru-200pct-reflow.png',
    'og-market-ru-preview.png',
    'website-visual-contact-sheet.webp',
  ]) {
    const target = path.join(EVIDENCE, file);
    assert.ok(fs.existsSync(target), file);
    assert.ok(fs.statSync(target).size > 1_000, file);
  }

  const report = fs.readFileSync(path.join(
    ROOT,
    'docs',
    'product',
    'GPTBOT_MARKET_ACCESSIBILITY_REPORT.md',
  ), 'utf8');
  assert.match(report, /ACCESSIBILITY_AUTOMATED=PASS/);
  assert.match(report, /no VoiceOver\/TalkBack pass/i);
  assert.match(report, /no native Uzbek language approval/i);

  const packageJson = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'package.json'),
    'utf8',
  )) as {
    scripts: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  assert.equal(packageJson.scripts['market:a11y'], 'tsx scripts/market-a11y-audit.ts');
  assert.equal(packageJson.devDependencies['axe-core'], '4.12.1');
  assert.equal(packageJson.devDependencies['playwright-core'], '1.61.1');

  const audit = evidence();
  for (const claim of [
    'VoiceOver pass',
    'TalkBack pass',
    'native Uzbek sign-off',
    'legal review',
  ]) assert.ok(audit.claimsNotMade.includes(claim), claim);
});
