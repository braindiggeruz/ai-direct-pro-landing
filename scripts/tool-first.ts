// The first tool-first UX pilot is deliberately limited to two existing
// converter and two translator URLs. No content flag can move another chat's H1 or
// change its shell, and no browser/shared stylesheet dependency is added.
import type { Page } from '../src/shared/types';
import { renderUzTranslitBlock } from './translator-page';
import { renderTranslationTask } from './translation-task';
import { escapeHtml } from './widgets/html';

const CONVERTERS = new Map([
  ['/uz/kirill-lotin/', 'uz'],
  ['/ru/kirillica-v-latinicu/', 'ru'],
]);
const TRANSLATORS = new Map([
  ['/uz/rus-ozbek-tarjimon/', 'uz'],
  ['/ru/russko-uzbekskiy-perevodchik/', 'ru'],
]);

export function isConverterFirstPage(page: Page): boolean {
  return CONVERTERS.get(page.url) === page.locale
    && page.pageType === 'gpt-chat'
    && page.chatRole === 'teacher'
    && page.widgets?.length === 1
    && page.widgets[0] === 'uz-translit';
}

export function isTranslatorFirstPage(page: Page): boolean {
  return TRANSLATORS.get(page.url) === page.locale
    && page.pageType === 'gpt-chat'
    && page.chatRole === 'translator'
    && page.widgets?.length === 1
    && page.widgets[0] === 'uz-translit';
}

export function isToolFirstPage(page: Page): boolean {
  return isConverterFirstPage(page) || isTranslatorFirstPage(page);
}

/** The page's single H1 and existing converter; an empty string elsewhere. */
export function renderToolFirst(page: Page): string {
  if (!isToolFirstPage(page)) return '';
  const uz = page.locale === 'uz';
  const converter = isConverterFirstPage(page);
  const pair = converter
    ? uz ? '/ru/kirillica-v-latinicu/' : '/uz/kirill-lotin/'
    : uz ? '/ru/russko-uzbekskiy-perevodchik/' : '/uz/rus-ozbek-tarjimon/';
  return `<section id="tool-first" data-tool-first aria-labelledby="tool-first-title" tabindex="-1">
<style>
#tool-first{max-width:60rem;margin:0 auto;padding:1rem;color:#f2f8fa;overflow-wrap:anywhere}
#tool-first *{box-sizing:border-box}
#tool-first .tool-first-nav{display:flex;align-items:center;justify-content:space-between;gap:.75rem;margin:0 0 1rem;font-size:.9rem}
#tool-first .tool-first-nav a{display:inline-flex;align-items:center;min-height:44px;color:#8ceee3;text-decoration:underline;text-underline-offset:3px}
#tool-first .tool-first-nav a:first-child{font-weight:750;text-decoration:none}
#tool-first a:focus-visible,#tool-first:focus-visible{outline:3px solid #fce29c;outline-offset:3px}
#tool-first h1{margin:0 0 1rem;font-size:clamp(1.35rem,4vw,1.9rem);line-height:1.2;font-weight:750}
#tool-first #kirill-lotin{margin:0;padding:1rem}
#tool-first #kirill-lotin p{font-size:.9rem;line-height:1.45;margin-bottom:.75rem}
#tool-first #kirill-lotin textarea{min-height:5rem;height:5rem;margin-bottom:.75rem;resize:vertical}
#tool-first #kirill-lotin .uzt-actions{gap:.5rem;margin-bottom:.75rem}
#tool-first #kirill-lotin .uzt-actions button{flex:1 1 8rem;padding:.6rem .5rem;font-size:.85rem}
#tool-first #kirill-lotin .uzt-actions button:last-child{flex-basis:100%}
#tool-first #kirill-lotin .uzt-status:empty{min-height:0;margin:0}
#tool-first #kirill-lotin .uzt-note{font-size:.8rem;margin-top:.75rem}
@media(min-width:640px){#tool-first{padding:1.5rem}#tool-first #kirill-lotin{padding:1.5rem}#tool-first #kirill-lotin textarea{height:7rem}#tool-first #kirill-lotin .uzt-actions button:last-child{flex-basis:8rem}}
</style>
  <nav class="tool-first-nav" aria-label="${uz ? 'Sahifa bo‘ylab harakatlanish' : 'Навигация по странице'}"><a href="/">GPTBot.uz</a><a href="#main">${uz ? 'AI yordamchi' : 'AI-помощник'}</a><a href="${pair}" lang="${uz ? 'ru' : 'uz'}" hreflang="${uz ? 'ru' : 'uz'}">${uz ? 'Русский' : 'O‘zbekcha'}</a></nav>
  <h1 id="tool-first-title" data-testid="page-h1">${escapeHtml(page.h1)}</h1>
  ${converter ? renderUzTranslitBlock(page, { first: true }) : renderTranslationTask(page)}
</section>`;
}
