/**
 * Draws the studio's og image (1200×630 PNG) in a local Chrome and saves it in
 * apps/studio/public/, from where the studio build copies it to
 * dist/assets/studio/.
 *
 *   npx tsx apps/studio/scripts/render-og.ts og-taqdimot-v1.png
 *
 * /assets/* is cached for a year as immutable, so a published name is never
 * redrawn: a new picture gets a new version (-v2) and the page record points
 * at it. The script refuses to overwrite an existing file.
 *
 * The picture has no people and no claim: the tool's name, the .pptx format,
 * the GPTBot.uz wordmark and three abstract slides (title bars, bullet lines,
 * a geometric "picture"). The same image serves the Uzbek and the Russian
 * page, so its only words are names.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PUBLIC = path.join(ROOT, 'apps/studio/public');
const FONT = path.join(ROOT, 'public/assets/fonts/geist-latin-wght-normal.woff2');
export const OG_SIZE = { width: 1200, height: 630 } as const;

const CHROME = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].filter((candidate): candidate is string => Boolean(candidate));

const slide = (x: number, y: number, rotate: number, accent: string, picture: boolean) => `
<div style="position:absolute;left:${x}px;top:${y}px;width:420px;height:236px;transform:rotate(${rotate}deg);border-radius:18px;background:#0c1828;border:2px solid #1f2b3d;box-shadow:0 30px 60px rgba(0,0,0,.45);padding:26px;box-sizing:border-box">
  <div style="width:${picture ? 190 : 260}px;height:18px;border-radius:9px;background:${accent}"></div>
  <div style="margin-top:26px;display:flex;gap:22px">
    <div style="flex:1">
      ${[0.92, 0.78, 0.86, 0.64].map((w) => `<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px"><div style="width:9px;height:9px;border-radius:50%;background:${accent}"></div><div style="height:10px;width:${Math.round(w * 100)}%;border-radius:5px;background:#2a3a52"></div></div>`).join('')}
    </div>
    ${picture ? `<div style="width:150px;height:118px;border-radius:12px;background:linear-gradient(160deg,#16324f,#0f2238);position:relative;overflow:hidden">
      <div style="position:absolute;left:18px;bottom:0;width:0;height:0;border-left:46px solid transparent;border-right:46px solid transparent;border-bottom:70px solid #2fe6d1;opacity:.75"></div>
      <div style="position:absolute;left:66px;bottom:0;width:0;height:0;border-left:38px solid transparent;border-right:38px solid transparent;border-bottom:52px solid #229ed9"></div>
      <div style="position:absolute;right:20px;top:16px;width:26px;height:26px;border-radius:50%;background:#e8a33d"></div>
    </div>` : ''}
  </div>
</div>`;

export function ogHtml(fontUrl: string, locale: 'uz' | 'ru' = 'uz'): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Geist;src:url("${fontUrl}") format("woff2");font-weight:100 900}
html,body{margin:0;width:${OG_SIZE.width}px;height:${OG_SIZE.height}px;overflow:hidden;background:#05070d;font-family:Geist,Arial,sans-serif;color:#e6eef7}
</style></head><body>
<div style="position:absolute;inset:0;background:radial-gradient(circle at 18% 22%,rgba(34,158,217,.28),transparent 46%),radial-gradient(circle at 88% 86%,rgba(47,230,209,.18),transparent 42%)"></div>
<div style="position:absolute;left:72px;top:70px;display:flex;align-items:center;gap:12px;font-size:30px;font-weight:600;letter-spacing:-.01em">
  <div style="width:16px;height:16px;border-radius:50%;background:#2fe6d1"></div>GPTBot.uz
</div>
<div style="position:absolute;left:72px;top:206px;font-size:${locale === 'ru' ? 64 : 104}px;font-weight:700;line-height:1.15;letter-spacing:-.035em">${locale === 'ru' ? 'Презентация<br>с ИИ' : 'Taqdimot<br>AI'}</div>
<div style="position:absolute;left:72px;top:458px;display:flex;gap:14px">
  <div style="padding:12px 22px;border-radius:999px;background:#229ed9;color:#05070d;font-size:30px;font-weight:700">.pptx</div>
  <div style="padding:12px 22px;border-radius:999px;border:2px solid #2fe6d1;color:#2fe6d1;font-size:30px;font-weight:600">AI</div>
</div>
${slide(650, 70, -6, '#229ed9', false)}
${slide(700, 214, 3, '#2fe6d1', true)}
${slide(610, 368, -2, '#e8a33d', false)}
</body></html>`;
}

async function main(): Promise<void> {
  const name = process.argv[2] ?? '';
  if (!/^og-[a-z0-9]+(?:-[a-z0-9]+)*-v\d+\.png$/.test(name)) throw new Error('Usage: render-og.ts og-<name>-v<N>.png');
  const target = path.join(PUBLIC, name);
  if (fs.existsSync(target)) throw new Error(`${name} exists; /assets/* is immutable, draw a new version instead.`);
  const executablePath = CHROME.find((candidate) => fs.existsSync(candidate));
  if (!executablePath) throw new Error('No local Chrome found. Set CHROME_PATH.');
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: OG_SIZE, deviceScaleFactor: 1 });
    // The font as a data: URL: a page made by setContent may not read file: URLs.
    await page.setContent(ogHtml(`data:font/woff2;base64,${fs.readFileSync(FONT).toString('base64')}`, process.argv[3] === 'ru' ? 'ru' : 'uz'), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    fs.mkdirSync(PUBLIC, { recursive: true });
    await page.screenshot({ path: target, type: 'png' });
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify({ status: 'drawn', file: path.relative(ROOT, target).split(path.sep).join('/'), bytes: fs.statSync(target).size }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'og image failed.');
    process.exitCode = 1;
  });
}
