import type { Page } from '../src/shared/types';
import { PSEO_PRACTICE_PAGES } from '../src/shared/pseo20';
import { pageQuizSet } from './tool-widgets';
import { renderPracticeQuizBlock } from './widgets/practice-quiz-block';
import { escapeHtml } from './widgets/html';

export const PSEO_STYLE_HREF = '/assets/pseo-20261108/pseo.css';
const cohort = (page: Page) => PSEO_PRACTICE_PAGES.find((item) => page.url === `/uz/${item.slug}/`);
export function isPseoPracticePage(page: Page): boolean {
  const item = cohort(page);
  return Boolean(item && page.locale === 'uz' && page.pageType === 'gpt-chat'
    && page.chatRole === 'teacher' && page.quizSet === item.set
    && page.widgets?.length === 1 && page.widgets[0] === 'practice-quiz');
}

function multiplication(): string {
  const numbers = Array.from({ length: 10 }, (_, index) => index + 1);
  const options = (selected: number) => numbers.map((n) => `<option${n === selected ? ' selected' : ''}>${n}</option>`).join('');
  return `<section class="ps-tool" data-multiplication aria-labelledby="multiplication-title">
    <h2 id="multiplication-title">1 dan 10 gacha karra jadvali</h2>
    <p>Qator va ustun kesishgan katakda ko‘paytma turadi. 3 × 4 — har birida 4 tadan bo‘lgan 3 ta guruh: 4 + 4 + 4 = 12.</p>
    <div data-multiplication-controls hidden><div class="ps-selects">
      <div><label for="factor-a">Birinchi son</label><select id="factor-a" data-factor-a>${options(3)}</select></div>
      <div><label for="factor-b">Ikkinchi son</label><select id="factor-b" data-factor-b>${options(4)}</select></div>
    </div><output for="factor-a factor-b" aria-live="polite">3 × 4 = 12</output></div>
    <div class="ps-scroll" tabindex="0" role="region" aria-label="Ko‘paytirish jadvali, kichik ekranda yon tomonga suring">
      <table class="ps-grid"><caption>Ko‘paytirish natijalari: qator × ustun</caption>
        <thead><tr><th scope="col">×</th>${numbers.map((n) => `<th scope="col">${n}</th>`).join('')}</tr></thead>
        <tbody>${numbers.map((a) => `<tr><th scope="row">${a}</th>${numbers.map((b) => `<td data-mul-a="${a}" data-mul-b="${b}">${a * b}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div><p class="ps-note">Kichik ekranda jadvalni yon tomonga suring. Jadval JavaScriptsiz ham to‘liq ko‘rinadi.</p>
  </section>`;
}

function equation(): string {
  return `<section class="ps-tool" data-linear-equation aria-labelledby="equation-title">
    <h2 id="equation-title">Chiziqli tenglamani tekshiring</h2>
    <p>x qatnashgan oddiy tenglama kiriting: masalan, 2x + 3 = x + 8. Yechim va o‘rniga qo‘yib tekshirish shu qurilmada hisoblanadi.</p>
    <form novalidate><div><label for="linear-equation">Tenglama</label>
      <input id="linear-equation" class="ym-hide-content" type="text" maxlength="160" value="2x + 3 = 11" autocomplete="off" spellcheck="false" aria-describedby="equation-help" /></div>
      <button class="ps-primary" type="submit" disabled>Qadamma-qadam yechish</button>
    </form>
    <p id="equation-help" class="ps-note">Faqat x, sonlar, + va − amallari. O‘nli kasr uchun nuqta yoki vergul mumkin. Qavs, kasr chizig‘i va darajalar qo‘llanmaydi. Natijada oddiy kasr chiqishi mumkin.</p>
    <div class="ym-hide-content" data-equation-output role="status" aria-live="polite" aria-atomic="true"><p class="ps-result">x = 4</p><ol><li>2x + 3 = 11 → 2x = 11 − 3</li><li>2x = 8 → x = 8 ÷ 2 = 4</li></ol><p>Tekshirish: 2 × 4 + 3 = 11.</p></div>
    <noscript><p>Hisoblash tugmasi JavaScript yoqilganda ishlaydi. Tayyor yechimlar va mashqlarni quyida o‘qishingiz mumkin.</p></noscript>
  </section>`;
}

export function renderPseoLearning(page: Page): string {
  if (!isPseoPracticePage(page)) return '';
  const item = cohort(page)!;
  const set = pageQuizSet(page);
  if (!set) throw new Error(`${page.url}: missing reviewed practice set`);
  const special = item.slug === 'karra-jadvali' ? multiplication() : item.slug === 'tenglama-yechish' ? equation() : '';
  return `<section id="tool-first" class="ps-learning" data-tool-first data-pseo-practice aria-labelledby="tool-first-title" tabindex="-1">
    <nav class="ps-nav" aria-label="Asosiy navigatsiya"><a class="ps-brand" href="/uz/">GPTBot.uz</a><a href="/uz/onlayn-testlar/">Barcha testlar</a><a href="#main">AI yordamchi ↗</a></nav>
    <nav class="ps-breadcrumb" aria-label="Sahifa yo‘li"><a href="/uz/">Bosh sahifa</a><span aria-hidden="true">/</span><a href="${item.parent}">${item.parent.includes('matematika') ? 'Matematika' : item.parent.includes('fizika') ? 'Fizika' : 'Onlayn testlar'}</a><span aria-hidden="true">/</span><span>${escapeHtml(page.breadcrumbLabel || page.h1)}</span></nav>
    <p class="ps-eyebrow">Mashq • tekshirish • tushunish</p>
    <h1 id="tool-first-title" data-testid="page-h1">${escapeHtml(page.h1)}</h1>
    <p class="ps-intro">${escapeHtml(page.heroSubtitle || page.description)}</p>
    <div class="ps-actions"><a class="ps-primary" href="#practice-quiz">Mashqni boshlash ↓</a><a class="ps-secondary" href="#seo-summary">Qoidalar va misollar</a></div>
    ${special}
    ${renderPracticeQuizBlock(page, set, { chatPosition: 'after' })}
    ${special ? '<script type="module" src="/assets/pseo-20261108/practice.js"></script>' : ''}
  </section>`;
}
