import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (file: string) => readFile(path.join(root, file), 'utf8');

test('landing mobile navigation exposes state and protects the background', async () => {
  const [header, styles] = await Promise.all([
    read('src/components/Header.tsx'),
    read('src/index.css'),
  ]);

  assert.match(header, /aria-expanded=\{mobileOpen\}/);
  assert.match(header, /aria-controls="mobile-primary-navigation"/);
  assert.match(header, /event\.key !== 'Escape'/);
  assert.match(header, /document\.body\.classList\.add\('mobile-menu-open'\)/);
  assert.match(header, /min-h-11 min-w-11/);
  assert.match(header, /inline-flex h-11 w-11/);
  assert.match(styles, /body\.mobile-menu-open\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(styles, /\.mobile-menu-panel\[data-open='true'\]/);
  assert.doesNotMatch(header, /transition-all/);
});

test('landing controls use interruptible, property-specific motion', async () => {
  const styles = await read('src/index.css');
  const reveal = styles.indexOf('.reveal {');
  const reducedMotion = styles.lastIndexOf('@media (prefers-reduced-motion: reduce)');

  assert.match(styles, /--ease-out-ui:\s*cubic-bezier\(0\.23, 1, 0\.32, 1\)/);
  assert.match(styles, /\.btn-primary:active\s*\{[^}]*scale\(0\.97\)/s);
  assert.match(styles, /@media \(hover: hover\) and \(pointer: fine\)/);
  assert.match(styles, /transition:\s*opacity 420ms var\(--ease-out-ui\), transform 420ms var\(--ease-out-ui\)/);
  assert.ok(reducedMotion > reveal, 'reduced-motion override must follow the reveal declaration');
});

test('sticky CTA appears after the hero and yields to the footer', async () => {
  const sticky = await read('src/components/StickyCTA.tsx');

  assert.match(sticky, /setPastHero\(!entry\.isIntersecting/);
  assert.match(sticky, /setNearFooter\(entry\.isIntersecting\)/);
  assert.match(sticky, /const show = pastHero && !nearFooter/);
  assert.match(sticky, /tabIndex=\{show \? 0 : -1\}/);
  assert.doesNotMatch(sticky, /transition-all/);
});

test('demo resolves quickly and becomes static for reduced motion', async () => {
  const demo = await read('src/components/DemoChat.tsx');

  assert.match(demo, /prefers-reduced-motion: reduce/);
  assert.match(demo, /setVisible\(SEQUENCE\.length\)/);
  assert.doesNotMatch(demo, /sleep\((?:700|900)\)/);
  assert.doesNotMatch(demo, /transition-all/);
});
