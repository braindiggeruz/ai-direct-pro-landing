// AI tool pages: a gpt-chat page with a chatRole (scripts/translator-page.ts)
// may carry chatStarters (its own chips on the chat's resting screen; the
// data-chat-starters attribute is chatRoleAttributes'), widgets
// (in-browser tools first under the chat) and, with the practice-quiz widget,
// quizSet (the question set it shows). This module is the content gate
// for them, renders the widgets' static HTML, their JSON-LD and the frame's
// chips, and names the one script per widget a page loads. A page without
// these fields gets empty strings, so every other page, the two protected
// chats first, renders byte for byte as before. Lives apart from
// scripts/prerender.ts so tests can read it without a build.
import { PAGE_WIDGETS, chatRolePreset, pageWidgetIssues, type Page, type PageWidget } from '../src/shared/types';
import { chatStarterIssues, chatStarters } from '../src/shared/chat-starters';
import { findQuizSet, quizSetIssues, type QuizSet } from '../src/tools/quiz/set';
import { QUIZ_SETS } from '../src/tools/quiz/sets';
import { renderUzTranslitBlock } from './translator-page';
import { ENTRIES, entryScript, type ViteManifest } from './vite-manifest';
import { renderCalculatorBlock } from './widgets/calculator-block';
import { renderIrregularVerbsBlock } from './widgets/irregular-verbs-block';
import { practiceQuizJsonLd, practiceQuizPrefillIssues, renderPracticeQuizBlock } from './widgets/practice-quiz-block';
import { escapeHtml } from './widgets/html';

/** Each widget's Vite entry (scripts/vite-manifest.ts ENTRIES key). */
export const WIDGET_ENTRY = {
  'uz-translit': 'translit',
  calculator: 'calculatorWidget',
  'irregular-verbs': 'irregularVerbs',
  'practice-quiz': 'practiceQuiz',
} as const satisfies Record<PageWidget, string>;

/** The built script of every widget, from the manifest (scripts/prerender.ts main). */
export type WidgetScripts = Record<PageWidget, string>;

/** Every widget's script from the build's manifest; throws (no render) when one is missing. */
export function widgetScriptsFrom(manifest: ViteManifest): WidgetScripts {
  return Object.fromEntries(PAGE_WIDGETS.map((widget) => [widget, entryScript(manifest, ENTRIES[WIDGET_ENTRY[widget]])])) as WidgetScripts;
}

const RENDER: Record<PageWidget, (page: Page, quizSets: readonly QuizSet[]) => string> = {
  'uz-translit': renderUzTranslitBlock,
  calculator: renderCalculatorBlock,
  'irregular-verbs': renderIrregularVerbsBlock,
  'practice-quiz': (page, quizSets) => {
    const set = pageQuizSet(page, quizSets);
    if (!set) throw new Error(`${page.url}: the practice-quiz widget has no valid quizSet`);
    return renderPracticeQuizBlock(page, set);
  },
};

/** A gpt-chat page with a role: the only pages that may carry starters or widgets. */
function isToolPage(page: Page): boolean {
  return page.pageType === 'gpt-chat' && chatRolePreset(page.chatRole) !== undefined;
}

function listsQuiz(page: Page): boolean {
  return Array.isArray(page.widgets) && page.widgets.includes('practice-quiz');
}

/**
 * What is wrong with a page's quizSet and the widget that shows it; [] on a
 * page with neither. The set must be registered (src/tools/quiz/sets), valid,
 * in the page's language, and every question's request for the chat must fit
 * the composer.
 */
export function quizPageIssues(page: Page, quizSets: readonly QuizSet[] = QUIZ_SETS): string[] {
  const hasQuiz = page.quizSet !== undefined;
  if (!hasQuiz && !listsQuiz(page)) return [];
  if (!hasQuiz) return ['the practice-quiz widget needs a quizSet'];
  if (!listsQuiz(page)) return ["quizSet needs widgets to list 'practice-quiz'"];
  const set = findQuizSet(page.quizSet, quizSets);
  if (!set) return [`quizSet «${String(page.quizSet)}» is not a registered question set (src/tools/quiz/sets/index.ts)`];
  const issues = quizSetIssues(set).map((issue) => `quiz set ${set.id}: ${issue}`);
  if (set.locale !== page.locale) issues.push(`quiz set ${set.id} is in ${set.locale}, the page in ${page.locale}`);
  if (!issues.length) issues.push(...practiceQuizPrefillIssues(set).map((issue) => `quiz set ${set.id}: ${issue}`));
  return issues;
}

/** The question set a tool page shows, when its quizSet and widgets are valid; undefined on every other page. */
export function pageQuizSet(page: Page, quizSets: readonly QuizSet[] = QUIZ_SETS): QuizSet | undefined {
  if (!pageWidgets(page).includes('practice-quiz') || quizPageIssues(page, quizSets).length) return undefined;
  return findQuizSet(page.quizSet, quizSets);
}

/**
 * Refuses to render a page whose starters or widgets are wrong (prerender
 * throws, so the build stops), or that carries them without being an AI tool
 * page. A page without either field passes untouched.
 */
export function toolPageIssues(page: Page, quizSets: readonly QuizSet[] = QUIZ_SETS): string[] {
  const issues: string[] = [];
  const hasStarters = page.chatStarters !== undefined;
  const hasWidgets = page.widgets !== undefined;
  const hasQuiz = page.quizSet !== undefined;
  if (page.chatRole !== undefined && !chatRolePreset(page.chatRole)) issues.push(`chatRole «${String(page.chatRole)}» is not one of the presets`);
  if ((hasStarters || hasWidgets || hasQuiz) && !isToolPage(page)) issues.push('chatStarters and widgets need pageType gpt-chat and a chatRole');
  if (hasStarters) issues.push(...chatStarterIssues(page.chatStarters));
  if (hasWidgets) issues.push(...pageWidgetIssues(page.widgets));
  issues.push(...quizPageIssues(page, quizSets));
  return issues;
}

export function assertToolPage(page: Page, quizSets: readonly QuizSet[] = QUIZ_SETS): void {
  const issues = toolPageIssues(page, quizSets);
  if (issues.length) throw new Error(`${page.url}: refusing to render an AI tool page with invalid fields:\n  ${issues.join('\n  ')}`);
}

/** The widgets a page shows, in its order; [] on every page that is not an AI tool page. */
export function pageWidgets(page: Page): PageWidget[] {
  if (!isToolPage(page) || pageWidgetIssues(page.widgets).length) return [];
  return [...(page.widgets as PageWidget[])];
}

/** The starters a page shows; undefined on every page that is not an AI tool page or has none. */
export function pageStarters(page: Page) {
  return isToolPage(page) ? chatStarters(page.chatStarters) : undefined;
}

/** The widgets' blocks, first in the text under the chat; '' without widgets. */
export function renderToolWidgets(page: Page, quizSets: readonly QuizSet[] = QUIZ_SETS): string {
  return pageWidgets(page).map((widget) => RENDER[widget](page, quizSets)).join('');
}

/**
 * The JSON-LD nodes the page's widgets add to its @graph
 * (scripts/prerender.ts buildJsonLd): the practice quiz as a schema.org Quiz;
 * [] on every other page.
 */
export function toolJsonLd(page: Page, pageUrl: string, quizSets: readonly QuizSet[] = QUIZ_SETS): Record<string, unknown>[] {
  const set = pageQuizSet(page, quizSets);
  return set ? [practiceQuizJsonLd(set, pageUrl)] : [];
}

/**
 * The chips' row (.gpt-starters, the frame's and the chat's): labels whole,
 * one scrolling row on a phone, centred rows from 640px. Inline in the head
 * of a page with chips only, outside #gpt-chat-root so it outlives the frame;
 * the chat's own sheet (premium.css, held to 30 000 B) and the pages without
 * chips do not carry it.
 */
export const STARTERS_STYLE = '<style>.gpt-starters{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none}.gpt-starters li{flex:none;max-width:100%}.gpt-starters .gpt-task{width:auto;padding:0 16px}@media (min-width:640px){.gpt-starters{flex-wrap:wrap;justify-content:center;overflow:visible}}</style>';

/**
 * What a page with chips adds to its head, after the chat's modulepreloads:
 * the lazy part chat-tool, which the chat waits for before it mounts
 * (src/gpt-chat/main.tsx), as one more modulepreload, and the chips' style;
 * '' on every other page.
 */
export function chatToolHead(page: Page, href: string | null | undefined): string {
  if (!pageStarters(page)) return '';
  return `${href ? `\n<link rel="modulepreload" href="${escapeHtml(href)}" />` : ''}\n${STARTERS_STYLE}`;
}

/** One module script per widget the page shows, each on a line of its own after the chat's; '' without widgets. */
export function toolWidgetScripts(page: Page, scripts: Partial<WidgetScripts>): string {
  return pageWidgets(page)
    .map((widget) => scripts[widget])
    .filter((href): href is string => typeof href === 'string' && href.length > 0)
    .map((href) => `\n<script type="module" src="${escapeHtml(href)}"></script>`)
    .join('');
}

/**
 * The chips of the frame the chat replaces (scripts/prerender.ts,
 * renderGptChatMain): on a page with starters, its own chips with their
 * labels, so the mounted chat's row takes the same place; undefined
 * elsewhere, where the frame keeps its four empty pills.
 */
export function starterFrame(page: Page): string | undefined {
  const starters = pageStarters(page);
  if (!starters) return undefined;
  const chips = starters.map((starter) => `<li><span class="gpt-task"><span>${escapeHtml(starter.label)}</span></span></li>`).join('');
  return `<ul class="gpt-tasks gpt-starters gpt-shell-tasks" aria-hidden="true">${chips}</ul>`;
}
