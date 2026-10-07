/**
 * Draws the honest evaluation set of the photo tool (DECISIONS 07.10.2026
 * §13 п. 7; BUILD-PLAN stream C): pictures of school tasks as a phone would
 * photograph them, with the right final answer of each in answers.json.
 *
 *   npx tsx apps/studio/scripts/photo-eval-set.ts --out <dir>
 *
 * The owner's 50 real photos do not exist yet, so the set is SELF-RENDERED:
 * printed tasks (textbook fonts) and «handwritten» ones (handwriting-like
 * fonts installed on the build machine, blue ink, a lined or squared
 * notebook page, a slant), each then «photographed»: rotated a little,
 * lit unevenly, blurred by a fraction of a pixel, grained, saved as JPEG.
 * Four pictures are unreadable on purpose (blurred, an empty page, cut
 * off, not a task). A synthetic hand is cleaner than a child's, so the
 * result is an UPPER estimate (PHOTO-EVAL.md says so first).
 *
 * The pictures hold no names, faces, schools or classes. Nothing is
 * fetched: a local Chrome draws the HTML (playwright-core, as render-og.ts).
 * The set lives outside the repository; this script and answers.json are
 * the recipe, so the set can be drawn again.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CHROME = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].filter((candidate): candidate is string => Boolean(candidate));

export type EvalKind = 'printed' | 'handwritten' | 'unreadable';
export type EvalSubject = 'matematika' | 'fizika' | 'kimyo' | 'ona_tili' | 'rus_tili' | 'boshqa';

export interface EvalTask {
  readonly id: string;
  readonly kind: EvalKind;
  readonly subject: EvalSubject;
  /** The lines of the task as written on the page (HTML allowed for fractions and indices). */
  readonly lines: readonly string[];
  /** The right final answer, for the reader of the report. */
  readonly answer: string;
  /** Tokens that must all appear in the model's `answer` field (numbers compared without spaces, with . for ,). */
  readonly answerTokens: readonly string[];
  /** Picture tweaks. */
  readonly font?: 'print' | 'serif' | 'hand1' | 'hand2' | 'hand3' | 'hand4';
  readonly page?: 'lined' | 'squared' | 'plain';
  readonly rotate?: number;
  readonly blur?: number;
  readonly dark?: boolean;
  readonly crop?: boolean;
  readonly expectUnreadable?: boolean;
}

const frac = (num: string, den: string) => `<span class="frac"><span>${num}</span><span>${den}</span></span>`;
const mixed = (whole: string, num: string, den: string) => `<span class="mixed">${whole}${frac(num, den)}</span>`;

/** 30 tasks: 14 printed, 12 handwritten, 4 unreadable. */
export const EVAL_TASKS: readonly EvalTask[] = [
  // ── printed: mathematics (8)
  { id: 'p01-kasrlar', kind: 'printed', subject: 'matematika', font: 'print', page: 'plain', rotate: 1.8,
    lines: ['<b>245.</b> Hisoblang:', `a) ${frac('2', '3')} + ${frac('3', '4')} − ${frac('5', '6')} =`, `b) ${frac('3', '5')} : ${frac('9', '10')} =`, `d) ${mixed('1', '1', '2')} · ${frac('2', '3')} =`],
    answer: 'a) 7/12; b) 2/3; d) 1', answerTokens: ['7/12', '2/3', '1'] },
  { id: 'p02-tenglama', kind: 'printed', subject: 'matematika', font: 'print', page: 'plain', rotate: -1.2,
    lines: ['<b>318.</b> Tenglamani yeching:', '3x − 7 = 2x + 5'], answer: 'x = 12', answerTokens: ['12'] },
  { id: 'p03-foiz', kind: 'printed', subject: 'matematika', font: 'serif', page: 'plain', rotate: 2.2,
    lines: ['<b>12-masala.</b> Sinfdagi 25 o‘quvchining 60 % i qizlar.', 'Sinfda nechta qiz bor?'], answer: '15', answerTokens: ['15'] },
  { id: 'p04-pifagor', kind: 'printed', subject: 'matematika', font: 'print', page: 'plain', rotate: -2.5,
    lines: ['<b>7.</b> To‘g‘ri burchakli uchburchakning katetlari', '6 sm va 8 sm. Gipotenuzani toping.'], answer: '10 sm', answerTokens: ['10'] },
  { id: 'p05-yuza', kind: 'printed', subject: 'matematika', font: 'serif', page: 'plain', rotate: 1.1,
    lines: ['<b>54.</b> To‘g‘ri to‘rtburchakning tomonlari 12 sm va 7 sm.', 'Uning perimetri va yuzini toping.'], answer: 'P = 38 sm, S = 84 sm²', answerTokens: ['38', '84'] },
  { id: 'p06-tezlik', kind: 'printed', subject: 'matematika', font: 'print', page: 'plain', rotate: -0.8, dark: true,
    lines: ['<b>9.</b> Avtomobil 240 km masofani 3 soatda bosib o‘tdi.', 'Uning tezligini toping.'], answer: '80 km/soat', answerTokens: ['80'] },
  { id: 'p07-kvadrat', kind: 'printed', subject: 'matematika', font: 'print', page: 'plain', rotate: 2.8,
    lines: ['<b>41.</b> Tenglamaning ildizlarini toping:', 'x² − 5x + 6 = 0'], answer: 'x₁ = 2, x₂ = 3', answerTokens: ['2', '3'] },
  { id: 'p08-test', kind: 'printed', subject: 'matematika', font: 'serif', page: 'plain', rotate: -1.6,
    lines: ['<b>15.</b> Qaysi son tub son?', 'A) 21&nbsp;&nbsp;&nbsp;&nbsp;B) 27&nbsp;&nbsp;&nbsp;&nbsp;C) 29&nbsp;&nbsp;&nbsp;&nbsp;D) 33'], answer: 'C) 29', answerTokens: ['29'] },
  // ── printed: physics (3)
  { id: 'p09-kinetik', kind: 'printed', subject: 'fizika', font: 'print', page: 'plain', rotate: -1.2,
    lines: ['<b>18-mashq.</b> Massasi 500 g bo‘lgan to‘p 36 km/soat tezlik', 'bilan uchmoqda. To‘pning kinetik energiyasini toping (J da).', `E<sub>k</sub> = ${frac('m · v²', '2')}`], answer: '25 J', answerTokens: ['25'] },
  { id: 'p10-om', kind: 'printed', subject: 'fizika', font: 'serif', page: 'plain', rotate: 1.4,
    lines: ['<b>3.</b> O‘tkazgichga 12 V kuchlanish berilgan,', 'qarshiligi 4 Om. Tok kuchini toping.'], answer: 'I = 3 A', answerTokens: ['3'] },
  { id: 'p11-zichlik', kind: 'printed', subject: 'fizika', font: 'print', page: 'plain', rotate: -2.1, dark: true,
    lines: ['<b>27.</b> Massasi 540 g, hajmi 200 sm³ bo‘lgan', 'jismning zichligini toping.'], answer: '2,7 g/sm³', answerTokens: ['2.7'] },
  // ── printed: chemistry, Uzbek, Russian (3)
  { id: 'p12-molyar', kind: 'printed', subject: 'kimyo', font: 'print', page: 'plain', rotate: 1.9,
    lines: ['<b>6.</b> Suvning (H₂O) molyar massasini hisoblang.', 'M(H) = 1 g/mol, M(O) = 16 g/mol.'], answer: '18 g/mol', answerTokens: ['18'] },
  { id: 'p13-koplik', kind: 'printed', subject: 'ona_tili', font: 'serif', page: 'plain', rotate: -1.3,
    lines: ['<b>88-mashq.</b> So‘zlarni ko‘plik shaklida yozing:', 'kitob, daftar, o‘quvchi.'], answer: 'kitoblar, daftarlar, o‘quvchilar', answerTokens: ['kitoblar', 'daftarlar', 'o‘quvchilar'] },
  { id: 'p14-rus-foiz', kind: 'printed', subject: 'rus_tili', font: 'print', page: 'plain', rotate: 2.4,
    lines: ['<b>Задача 5.</b> Найдите 15 % от числа 240.'], answer: '36', answerTokens: ['36'] },
  // ── handwritten: mathematics (8)
  { id: 'h01-daftar', kind: 'handwritten', subject: 'matematika', font: 'hand1', page: 'lined', rotate: -2.5,
    lines: ['Uy vazifasi. 3-masala', 'Bir o‘quvchi 3 ta daftar va 2 ta ruchka sotib oldi.', 'Daftar 4 500 so‘m, ruchka 2 000 so‘m.', 'U 20 000 so‘m berdi. Qancha qaytim oladi?', 'Yechish:'], answer: '2 500 so‘m', answerTokens: ['2500'] },
  { id: 'h02-amallar', kind: 'handwritten', subject: 'matematika', font: 'hand2', page: 'squared', rotate: 3.1,
    lines: ['7 · 8 − 56 : 7 = ?'], answer: '48', answerTokens: ['48'] },
  { id: 'h03-qism', kind: 'handwritten', subject: 'matematika', font: 'hand3', page: 'lined', rotate: -1.7,
    lines: ['Bir sonning 3/4 qismi 36 ga teng.', 'Shu sonni toping.'], answer: '48', answerTokens: ['48'] },
  { id: 'h04-tenglama', kind: 'handwritten', subject: 'matematika', font: 'hand1', page: 'squared', rotate: 2.0, dark: true,
    lines: ['2x + 3 = 11', 'x = ?'], answer: 'x = 4', answerTokens: ['4'] },
  { id: 'h05-burchak', kind: 'handwritten', subject: 'matematika', font: 'hand4', page: 'lined', rotate: -3.0,
    lines: ['Uchburchakning ikki burchagi 50° va 60°.', 'Uchinchi burchagini toping.'], answer: '70°', answerTokens: ['70'] },
  { id: 'h06-poyezd', kind: 'handwritten', subject: 'matematika', font: 'hand2', page: 'lined', rotate: 1.5,
    lines: ['Poyezd 90 km/soat tezlik bilan', '2,5 soat yurdi. Masofa qancha?'], answer: '225 km', answerTokens: ['225'] },
  { id: 'h07-taqqoslash', kind: 'handwritten', subject: 'matematika', font: 'hand3', page: 'squared', rotate: -2.2,
    lines: ['Kasrlarni taqqoslang:', `${frac('3', '5')}  va  ${frac('7', '10')}`], answer: '3/5 < 7/10 (katta kasr: 7/10)', answerTokens: ['7/10'] },
  { id: 'h08-doira', kind: 'handwritten', subject: 'matematika', font: 'hand1', page: 'lined', rotate: 2.7,
    lines: ['Doiraning radiusi 7 sm.', 'Aylana uzunligini toping (π ≈ 3,14).'], answer: 'C ≈ 43,96 sm', answerTokens: ['43.96'] },
  // ── handwritten: physics (2)
  { id: 'h09-kuch', kind: 'handwritten', subject: 'fizika', font: 'hand2', page: 'squared', rotate: -1.9,
    lines: ['m = 2 kg', 'a = 3 m/s²', 'F = ?'], answer: 'F = 6 N', answerTokens: ['6'] },
  { id: 'h10-tushish', kind: 'handwritten', subject: 'fizika', font: 'hand4', page: 'lined', rotate: 1.3, dark: true,
    lines: ['Jism 20 m balandlikdan erkin tushdi.', 'g = 10 m/s². Tushish vaqtini toping.'], answer: 't = 2 s', answerTokens: ['2'] },
  // ── handwritten: other (2)
  { id: 'h11-reaksiya', kind: 'handwritten', subject: 'kimyo', font: 'hand3', page: 'lined', rotate: -2.6,
    lines: ['Reaksiya tenglamasini tenglashtiring:', 'Mg + O₂ → MgO'], answer: '2Mg + O₂ → 2MgO', answerTokens: ['2Mg', '2MgO'] },
  { id: 'h12-poytaxt', kind: 'handwritten', subject: 'ona_tili', font: 'hand1', page: 'lined', rotate: 2.1,
    lines: ['Gapni to‘ldiring:', 'Toshkent — O‘zbekistonning ________ .'], answer: 'poytaxti', answerTokens: ['poytaxti'] },
  // ── unreadable (4)
  { id: 'u01-xira', kind: 'unreadable', subject: 'boshqa', font: 'hand2', page: 'lined', rotate: -2.0, blur: 7, expectUnreadable: true,
    lines: ['Masala. Bir sonning 3/4 qismi 36 ga teng.', 'Shu sonni toping.'], answer: 'o‘qilmaydi (xira)', answerTokens: [] },
  { id: 'u02-bosh', kind: 'unreadable', subject: 'boshqa', font: 'print', page: 'lined', rotate: 1.5, expectUnreadable: true,
    lines: [], answer: 'o‘qilmaydi (bo‘sh varaq)', answerTokens: [] },
  { id: 'u03-kesilgan', kind: 'unreadable', subject: 'boshqa', font: 'print', page: 'plain', rotate: -1.0, crop: true, expectUnreadable: true,
    lines: ['<b>19.</b> Avtobus 60 km/soat tezlik bilan', 'yurdi. Masofani toping, agar', 'vaqt'], answer: 'o‘qilmaydi (kesilgan: shart tugamagan)', answerTokens: [] },
  { id: 'u04-royxat', kind: 'unreadable', subject: 'boshqa', font: 'hand3', page: 'plain', rotate: 2.4, expectUnreadable: true,
    lines: ['Non', 'Sut — 2 ta', 'Tuxum', 'Guruch 1 kg'], answer: 'o‘qilmaydi (topshiriq emas: xarid ro‘yxati)', answerTokens: [] },
];

/** Fonts installed on the build machine (Windows): textbook ones, and handwriting-like ones for the «handwritten» tasks. */
export const FONTS: Readonly<Record<NonNullable<EvalTask['font']>, string>> = {
  print: '"Arial", "Liberation Sans", sans-serif',
  serif: '"Times New Roman", "Liberation Serif", serif',
  hand1: '"Segoe Print", "Comic Sans MS", cursive',
  hand2: '"Ink Free", "Segoe Print", cursive',
  hand3: '"Bradley Hand ITC", "Segoe Script", cursive',
  hand4: '"Segoe Script", "Segoe Print", cursive',
};

export const PAGE_SIZE = { width: 1240, height: 880 } as const;

/** The HTML of one task page as a phone photo of it. */
export function taskHtml(task: EvalTask, seed: number): string {
  const hand = task.kind !== 'printed';
  const ink = hand ? '#1f2d7a' : '#151515';
  const size = hand ? 40 : 36;
  const font = FONTS[task.font ?? (hand ? 'hand1' : 'print')];
  const page = task.page ?? (hand ? 'lined' : 'plain');
  const background =
    page === 'lined'
      ? 'background-color:#f6f4ec;background-image:linear-gradient(#c4d2e8 2px, transparent 2px),linear-gradient(90deg, transparent 88px, #e8aaaa 88px, #e8aaaa 90px, transparent 90px);background-size:100% 48px, 100% 100%;background-position:0 70px, 0 0'
      : page === 'squared'
        ? 'background-color:#f6f4ec;background-image:linear-gradient(#dde4ee 1px, transparent 1px),linear-gradient(90deg, #dde4ee 1px, transparent 1px);background-size:32px 32px'
        : 'background-color:#f8f6f0';
  const lines = task.lines
    .map((line, i) => {
      const slant = hand ? ((seed + i * 7) % 5) * 0.4 - 0.8 : 0;
      return `<div class="line" style="transform:rotate(${slant}deg)">${line}</div>`;
    })
    .join('');
  const crop = task.crop ? 'clip-path:inset(0 0 46% 0);' : '';
  const shade = task.dark
    ? 'linear-gradient(100deg, rgba(0,0,0,.42) 0%, rgba(0,0,0,.12) 45%, rgba(0,0,0,0) 70%)'
    : 'linear-gradient(100deg, rgba(0,0,0,.14) 0%, rgba(0,0,0,0) 50%, rgba(0,0,0,.08) 100%)';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:${PAGE_SIZE.width}px;height:${PAGE_SIZE.height}px;overflow:hidden;background:#6f6a60}
.table{position:absolute;inset:0;background:radial-gradient(circle at 30% 20%, #8a8378, #5a564e 70%)}
.sheet{position:absolute;left:40px;top:30px;right:40px;bottom:30px;${background};box-shadow:0 18px 40px rgba(0,0,0,.45);transform:rotate(${task.rotate ?? 0}deg);filter:blur(${task.blur ?? 0.45}px);${crop}}
.text{position:absolute;left:${page === 'lined' ? 118 : 70}px;top:${page === 'lined' ? 82 : 60}px;right:50px;color:${ink};font-family:${font};font-size:${size}px;line-height:${page === 'lined' ? '48px' : '1.45'}}
.line{margin-bottom:${page === 'lined' ? 0 : 18}px;transform-origin:left center;white-space:nowrap}
.frac{display:inline-flex;flex-direction:column;align-items:center;vertical-align:middle;margin:0 6px;line-height:1.05}
.frac span:first-child{border-bottom:3px solid ${ink};padding:0 6px}
.frac span:last-child{padding:0 6px}
.mixed{display:inline-flex;align-items:center}
sub{font-size:.6em}
.shade{position:absolute;inset:0;background:${shade};pointer-events:none}
.grain{position:absolute;inset:0;opacity:.18;mix-blend-mode:multiply}
</style></head><body>
<div class="table"></div>
<div class="sheet"><div class="text">${lines}</div></div>
<div class="shade"></div>
<svg class="grain" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${seed}"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>
</body></html>`;
}

export interface DrawnSet {
  readonly dir: string;
  readonly files: string[];
}

/** Draws every task into `out` (JPEG, quality 78) and writes answers.json next to them. */
export async function drawEvalSet(out: string): Promise<DrawnSet> {
  const executablePath = CHROME.find((candidate) => fs.existsSync(candidate));
  if (!executablePath) throw new Error('No local Chrome found. Set CHROME_PATH.');
  fs.mkdirSync(out, { recursive: true });
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ executablePath, headless: true });
  const files: string[] = [];
  try {
    const page = await browser.newPage({ viewport: { ...PAGE_SIZE }, deviceScaleFactor: 1 });
    for (const [i, task] of EVAL_TASKS.entries()) {
      await page.setContent(taskHtml(task, 11 + i * 13), { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const file = path.join(out, `${task.id}.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: 78 });
      files.push(file);
    }
  } finally {
    await browser.close();
  }
  const answers = Object.fromEntries(
    EVAL_TASKS.map((task) => [
      `${task.id}.jpg`,
      { kind: task.kind, subject: task.subject, task: task.lines.map((line) => line.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()).join(' '), answer: task.answer, answerTokens: task.answerTokens, expectUnreadable: task.expectUnreadable === true },
    ]),
  );
  fs.writeFileSync(path.join(out, 'answers.json'), `${JSON.stringify(answers, null, 2)}\n`);
  return { dir: out, files };
}

async function main(): Promise<void> {
  const flag = process.argv.indexOf('--out');
  const out = flag > 0 && process.argv[flag + 1] ? path.resolve(process.argv[flag + 1]) : null;
  if (!out) throw new Error('Usage: photo-eval-set.ts --out <dir>');
  const drawn = await drawEvalSet(out);
  const counts = { printed: 0, handwritten: 0, unreadable: 0 };
  for (const task of EVAL_TASKS) counts[task.kind]++;
  console.log(JSON.stringify({ status: 'drawn', dir: drawn.dir, files: drawn.files.length, ...counts }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'eval set failed.');
    process.exitCode = 1;
  });
}
