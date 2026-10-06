/**
 * The content of a studio release day, prepared and tested in advance.
 *
 *   npx tsx apps/studio/scripts/release-content.ts r-st1                     check only
 *   npx tsx apps/studio/scripts/release-content.ts r-st1 --apply --date 2026-10-22
 *
 * Why a changeset and not edits in place. The studio pages stay `draft` until
 * the release (IMPLEMENTATION-PLAN T2.3/T2.4): a native speaker reads them
 * first. Everything that points at them has to land in the same commit as
 * their `published`: a link to a draft studio page is a broken link (the SEO
 * audit gate and tests/seo-link-graph.test.ts fail the build on it), and an
 * intent pair naming a draft fails tests/seo-intent-manifest.test.ts. So the
 * guide's new sentences, the link from /ru/gpt-dlya-ucheby/, pair C37, the
 * architecture decision A5 and the C29 wording wait here, next to the two
 * status flips, as exact text edits. tests/studio-release.test.ts applies
 * them to a copy of content/ on every run and runs the SEO suites on the
 * result, so the day's edits are known to pass before the day; and it proves
 * that the same edits with the pages still `draft` leave broken links.
 *
 * An edit is (file, find, replace): `find` must occur exactly once, so an
 * edit that no longer fits (the guide changed meanwhile) stops the release
 * instead of landing half-applied; `@@RELEASE_DATE@@` in `replace` becomes
 * the release day. Text edits keep each file's own formatting byte for byte.
 *
 * Frozen fields (STUDIO-SPEC §3.5): the guide keeps url, title, status,
 * robotsIndex, locale and datePublished (the homepage lists articles by them);
 * /ru/gpt-dlya-ucheby/ changes in its body only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export const RELEASE_DATE = '@@RELEASE_DATE@@';

export interface TextEdit {
  /** Repository-relative path, forward slashes. */
  file: string;
  why: string;
  find: string;
  replace: string;
}

export interface ContentRelease {
  id: string;
  /** The studio pages this release publishes. */
  publishes: string[];
  edits: TextEdit[];
}

const GUIDE = 'content/blog/uz/slayd-tayyorlash.json';
const STUDY = 'content/pages/ru/gpt-dlya-ucheby.json';
const MANIFEST = 'content/seo/intent-manifest.json';
const UZ_TOOL = 'content/studio/pages/uz/taqdimot-ai.json';
const RU_TOOL = 'content/studio/pages/ru/prezentatsiya-ai.json';

/** The sentences the guide gains (STUDIO-SPEC §11.6): the chat writes text; a ready .pptx is on the Taqdimot AI page. */
export const GUIDE_NEW_TEXT = {
  description: 'Slayd tayyorlash 5 qadamda: mavzu, 6–12 slaydli reja, slayd matni, ma’ruza matni, bezash. Chat matn yozadi; tayyor .pptx qoralamasi — Taqdimot AI’da.',
  firstScreen: 'Qisqa javob: slayd (prezentatsiya, taqdimot) 5 qadamda tayyorlanadi — mavzu, reja, slayd matni, ma’ruza matni va bezash. GPTBot.uz AI chati reja va matnni o‘zbek tilida yozadi, fayl yaratmaydi. Tayyor .pptx qoralamasi kerak bo‘lsa — {tool} sahifasi: mavzuni yozasiz, 6 slaydgacha fayl bepul yig‘iladi, keyin uni PowerPoint, Google Slides yoki Canva’da tekshirib, o‘zingiz to‘ldirasiz.',
  table: 'Chat fayl yaratmaydi; tayyor .pptx qoralamasi — Taqdimot AI sahifasida',
  caption: 'Chat reja va matn yozadi; tayyor .pptx qoralamasi — Taqdimot AI sahifasida.',
  faq: 'Chatning o‘zi fayl bermaydi: u reja, slayd matni va ma’ruza matnini yozadi. Tayyor .pptx qoralamasi — Taqdimot AI sahifasida: mavzuni yozasiz, kuniga 1 ta taqdimot (6 slaydgacha, 2 ta rasm bilan) bepul. Faylni PowerPoint, Google Slides yoki Canva’da ochib, faktlarni tekshiring va o‘zingiz to‘ldiring.',
} as const;

/** The one link the guide gains, with the brand as its anchor (§11.5). */
export const GUIDE_TOOL_LINK = { token: 'tool', target: '/uz/taqdimot-ai/', anchor: 'Taqdimot AI' } as const;
/** The one link /ru/gpt-dlya-ucheby/ gains in its body (§11.7). */
export const STUDY_TOOL_LINK = { token: 'deck', target: '/ru/prezentatsiya-ai/', anchor: 'генератор презентаций GPTBot.uz' } as const;

const C37 = `    {
      "id": "C37-uz-taqdimot-tool-vs-guide",
      "commercial": {
        "url": "/uz/taqdimot-ai/",
        "owns": "make the .pptx itself — «slayd ai», «ai slayd», «slayd yaratish», «slayd yasash», «taqdimot yaratish», «prezentatsiya ai», «ai prezentatsiya», «sun’iy intellekt slayd»: a tool that turns a topic into a file",
        "mustNotTarget": ["slayd tayyorlash", "prezentatsiya tayyorlash", "taqdimot tayyorlash", "slayd tayyorlash telefonda", "chatgpt uzbekcha", "chatgpt kirish uzbek tilida", "bepul ai chat"]
      },
      "informational": {
        "url": "/uz/blog/slayd-tayyorlash/",
        "owns": "how to prepare slides — plan, 6×6 rule, speaker notes, assembling by hand; it links the tool for a ready .pptx",
        "mustNotTarget": ["slayd ai", "ai slayd", "slayd yaratish", "slayd yasash", "taqdimot yaratish", "prezentatsiya ai", "ai prezentatsiya"]
      },
      "gscNote": "New studio URL (content/studio/pages/uz/taqdimot-ai.json, release R-ST1) with no Search Console history. In the same release the guide gave up «slayd yaratish» and its first screen, table, figure caption and FAQ say that the chat writes text and a ready .pptx draft is on the Taqdimot AI page (one body link, anchor «Taqdimot AI»). The hybrids «prezentatsiya tayyorlash ai» and «slayd tayyorlash sun’iy intellekt» stay with the guide and the tool declares neither; Search Console decides them together with «slayd tayyorlash bot» (STUDIO-SPEC §11.5, §15). The guide's keys are printed on no protected page.",
      "decision": "KEEP_DIFFERENT_INTENT",
      "decidedAt": "${RELEASE_DATE}"
    }`;

const A5 = `    {
      "id": "A5-ru-prezentatsiya-tool-vs-gpt-chat",
      "url": "/ru/prezentatsiya-ai/",
      "counterpart": "/ru/gpt-chat/",
      "decision": "KEEP_DIFFERENT_INTENT_NO_PAIR",
      "decidedAt": "${RELEASE_DATE}",
      "evidence": "The Russian studio tool (content/studio/pages/ru/prezentatsiya-ai.json, release R-ST1) makes a .pptx from a topic and declares «презентация ии», «нейросеть для презентаций», «сделать презентацию нейросетью» and «ии для презентаций»; no other document declares them (tests/studio-prerender.test.ts). The protected /ru/gpt-chat/ has a «План и текст презентации» row in its use-case table, says that the chat makes no presentation file, and declares none of the tool's keys.",
      "note": "An architecture decision, not a pair: a pair requires its informational side to link the commercial one (tests/seo-intent-manifest.test.ts), and /ru/gpt-chat/ is one of the ten protected pages, which link no studio page before the January 2027 reviewed revision (STUDIO-SPEC §11.7). The tool links the chat for a plan and speaker text; /ru/gpt-dlya-ucheby/ links the tool. Reconsider when the protected chat may link the tool, or when Search Console shows the two URLs on the same queries."
    }`;

/** Release R-ST1 (≈22.10): /uz/taqdimot-ai/ and /ru/prezentatsiya-ai/ go live (STUDIO-SPEC §13.1). */
export const R_ST1: ContentRelease = {
  id: 'r-st1',
  publishes: ['/uz/taqdimot-ai/', '/ru/prezentatsiya-ai/'],
  edits: [
    { file: UZ_TOOL, why: 'publish the Uzbek tool page', find: '"status": "draft",', replace: '"status": "published",' },
    { file: UZ_TOOL, why: 'its sitemap lastmod is the release day', find: '"updatedAt": "2026-10-06"', replace: `"updatedAt": "${RELEASE_DATE}"` },
    { file: RU_TOOL, why: 'publish the Russian tool page', find: '"status": "draft",', replace: '"status": "published",' },
    { file: RU_TOOL, why: 'its sitemap lastmod is the release day', find: '"updatedAt": "2026-10-06"', replace: `"updatedAt": "${RELEASE_DATE}"` },
    {
      file: GUIDE,
      why: 'the description no longer says the reader makes the .pptx alone',
      find: '"description": "Slayd tayyorlash 5 qadamda: mavzu, 6–12 slaydli reja, slayd matni, ma’ruza matni, bezash. GPTBot.uz chati matn yozadi, .pptx va dizaynni o‘zingiz qilasiz.",',
      replace: `"description": "${GUIDE_NEW_TEXT.description}",`,
    },
    {
      file: GUIDE,
      why: '«slayd yaratish» moves to the tool (pair C37)',
      find: '    "slayd yaratish",\n',
      replace: '',
    },
    {
      file: GUIDE,
      why: 'the first screen links the tool with the brand anchor «Taqdimot AI»',
      find: `    {
      "type": "p",
      "text": "Qisqa javob: slayd (prezentatsiya, taqdimot) 5 qadamda tayyorlanadi — mavzu, reja, slayd matni, ma’ruza matni va bezash. GPTBot.uz AI chati reja va matnni o‘zbek tilida yozadi, lekin .pptx yoki PDF fayl va dizayn yaratmaydi: faylni PowerPoint, Google Slides yoki Canva’da o‘zingiz tayyorlaysiz."
    },`,
      replace: `    {
      "type": "linkp",
      "text": "${GUIDE_NEW_TEXT.firstScreen}",
      "links": [
        {
          "token": "${GUIDE_TOOL_LINK.token}",
          "target": "${GUIDE_TOOL_LINK.target}",
          "anchor": "${GUIDE_TOOL_LINK.anchor}"
        }
      ]
    },`,
    },
    {
      file: GUIDE,
      why: 'the table row about the file names the tool',
      find: `          ".pptx yoki PDF fayl",
          "Yo‘q",
          "Faylni PowerPoint, Google Slides yoki Canva’da o‘zingiz tayyorlaysiz"`,
      replace: `          ".pptx yoki PDF fayl",
          "Yo‘q",
          "${GUIDE_NEW_TEXT.table}"`,
    },
    {
      file: GUIDE,
      why: 'the figure caption names the tool',
      find: 'Chat reja va matn yozadi, .pptx faylni o‘zingiz tayyorlaysiz."',
      replace: `${GUIDE_NEW_TEXT.caption}"`,
    },
    {
      file: GUIDE,
      why: 'the FAQ answer about a ready .pptx names the tool',
      find: '"a": "Yo‘q: chat faqat matn yozadi — reja, slayd matni va ma’ruza matni. Faylni (.pptx yoki PDF) PowerPoint, Google Slides yoki Canva’da o‘zingiz tayyorlaysiz. Fayl yaratadigan boshqa AI servislar ham bor, lekin ularning matni va faktlarini ham tekshirish kerak."',
      replace: `"a": "${GUIDE_NEW_TEXT.faq}"`,
    },
    { file: GUIDE, why: 'the guide changed on the release day', find: '"dateModified": "2026-10-05",', replace: `"dateModified": "${RELEASE_DATE}",` },
    {
      file: STUDY,
      why: 'one body link to the Russian tool, which otherwise only the language switch reaches (§11.7)',
      find: '    { "type": "p", "text": "Важно помнить: модель опирается на данные, на которых обучена, и не гарантирует актуальность. Современные факты, даты и цифры проверяйте самостоятельно." },\n',
      replace: '    { "type": "p", "text": "Важно помнить: модель опирается на данные, на которых обучена, и не гарантирует актуальность. Современные факты, даты и цифры проверяйте самостоятельно." },\n'
        + `    { "type": "linkp", "text": "Если нужен не только план, но и сам файл, {${STUDY_TOOL_LINK.token}} соберёт черновик презентации .pptx до 6 слайдов по вашей теме — бесплатно, раз в день. Текст и факты в нём тоже проверяйте сами.", "links": [{ "token": "${STUDY_TOOL_LINK.token}", "target": "${STUDY_TOOL_LINK.target}", "anchor": "${STUDY_TOOL_LINK.anchor}" }] },\n`,
    },
    {
      file: MANIFEST,
      why: 'pair C37: the tool owns making the file, the guide owns how to prepare slides',
      find: `      "decision": "KEEP_DIFFERENT_INTENT",
      "decidedAt": "2026-10-05"
    }
  ],
  "architectureDecisions": [`,
      replace: `      "decision": "KEEP_DIFFERENT_INTENT",
      "decidedAt": "2026-10-05"
    },
${C37}
  ],
  "architectureDecisions": [`,
    },
    {
      file: MANIFEST,
      why: 'C29: the guide no longer says that no .pptx can be had',
      find: 'it states in its first screen that the chat writes text only and makes no .pptx or PDF file and no design"',
      replace: 'it states in its first screen that the chat writes text and that a ready .pptx draft is on the studio page /uz/taqdimot-ai/ (pair C37)"',
    },
    {
      file: MANIFEST,
      why: 'decision A5: the Russian tool next to the protected Russian chat',
      find: '    }\n  ]\n}\n',
      replace: `    },\n${A5}\n  ]\n}\n`,
    },
    { file: MANIFEST, why: 'the manifest changed on the release day', find: '  "updatedAt": "2026-10-05",', replace: `  "updatedAt": "${RELEASE_DATE}",` },
  ],
};

export const RELEASES: Record<string, ContentRelease> = { [R_ST1.id]: R_ST1 };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function assertReleaseDate(date: string): void {
  if (!DAY.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new Error(`Not a calendar day: ${JSON.stringify(date)} (YYYY-MM-DD).`);
  }
}

const occurrences = (text: string, find: string): number => {
  let count = 0;
  for (let at = text.indexOf(find); at >= 0; at = text.indexOf(find, at + 1)) count += 1;
  return count;
};

/**
 * The release applied in memory: file → new content. `read` returns the
 * current content of a repository-relative file. Throws, naming every edit
 * that does not fit, when any `find` is missing or not unique, and when a
 * result is not valid JSON.
 */
export function applyRelease(release: ContentRelease, date: string, read: (file: string) => string): Map<string, string> {
  assertReleaseDate(date);
  const files = new Map<string, string>();
  const problems: string[] = [];
  for (const edit of release.edits) {
    const current = files.get(edit.file) ?? read(edit.file);
    const count = occurrences(current, edit.find);
    if (count !== 1) {
      problems.push(`${edit.file}: "${edit.why}" — the text to replace occurs ${count} times, expected once`);
      files.set(edit.file, current);
      continue;
    }
    files.set(edit.file, current.replace(edit.find, () => edit.replace.split(RELEASE_DATE).join(date)));
  }
  for (const [file, content] of files) {
    try {
      JSON.parse(content);
    } catch {
      problems.push(`${file}: not valid JSON after the edits`);
    }
  }
  if (problems.length) throw new Error(`Release ${release.id} does not apply:\n  ${problems.join('\n  ')}`);
  return files;
}

/** Reads from `root`; for the script and the tests. */
export const readFrom = (root: string) => (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

/** Writes the applied files into `root` (LF endings, as in the repository). */
export function writeRelease(root: string, files: Map<string, string>): void {
  for (const [file, content] of files) fs.writeFileSync(path.join(root, file), content, 'utf8');
}

function main(): void {
  const [id, ...rest] = process.argv.slice(2);
  const release = RELEASES[id ?? ''];
  if (!release) throw new Error(`Usage: release-content.ts <${Object.keys(RELEASES).join('|')}> [--apply --date YYYY-MM-DD]`);
  const apply = rest.includes('--apply');
  const dateFlag = rest.indexOf('--date');
  const date = dateFlag >= 0 ? rest[dateFlag + 1] ?? '' : new Date().toISOString().slice(0, 10);
  if (apply && dateFlag < 0) throw new Error('--apply needs --date YYYY-MM-DD, the release day.');
  const files = applyRelease(release, date, readFrom(ROOT));
  if (apply) writeRelease(ROOT, files);
  console.log(JSON.stringify({
    status: apply ? 'applied' : 'applies-cleanly',
    release: release.id,
    date,
    publishes: release.publishes,
    files: [...files.keys()],
    edits: release.edits.length,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : 'Release content failed.');
    process.exitCode = 1;
  }
}
