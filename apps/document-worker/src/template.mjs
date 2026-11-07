import { readFile } from 'node:fs/promises';
import { validatePayload } from './schema.mjs';

export function escapeHtml(value) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
const messages = {
  ru: { proposal: 'Коммерческое предложение', objective: 'Задача', scope: 'Состав работ', terms: 'Условия', contact: 'Контакт', presentation: 'Презентация', continuation: 'Продолжение', notes: 'Комментарий' },
  uz: { proposal: 'Tijorat taklifi', objective: 'Vazifa', scope: 'Ishlar tarkibi', terms: 'Shartlar', contact: 'Aloqa', presentation: 'Taqdimot', continuation: 'Davomi', notes: 'Izoh' },
};
async function fontsCss() {
  const ranges = {
    2: 'U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F',
    3: 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116',
    6: 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF',
    7: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  };
  return (await Promise.all(Object.entries(ranges).map(async ([index, range]) => {
    const data = await readFile(new URL(`../fonts/manrope-${index}.woff2`, import.meta.url));
    return `@font-face{font-family:Manrope;font-style:normal;font-weight:400 800;src:url(data:font/woff2;base64,${data.toString('base64')}) format('woff2');unicode-range:${range}}`;
  }))).join('\n');
}
export async function createDocumentHtml(type, payload) {
  validatePayload(type, payload);
  const m = messages[payload.locale];
  const section = (heading, blocks) => `<section data-title="${escapeHtml(heading)}">${blocks}</section>`;
  const block = (value, kind = 'paragraph') => `<p class="${kind}">${escapeHtml(value)}</p>`;
  const title = type === 'proposal_pdf' ? payload.company : payload.title;
  const sections = type === 'presentation_pdf'
    ? payload.slides.map(slide => section(slide.title, slide.bullets.map(b => block(b, 'bullet')).join('') + (slide.notes ? block(slide.notes, 'notes') : ''))).join('')
    : [section(m.objective, block(payload.objective)),
       ...(payload.scope?.length ? [section(m.scope, payload.scope.map(b => block(b, 'bullet')).join(''))] : []),
       ...(payload.budgetTerms ? [section(m.terms, block(payload.budgetTerms))] : []),
       ...(payload.contact ? [section(m.contact, block(payload.contact))] : [])].join('');
  return `<!doctype html><html lang="${payload.locale}"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src 'none'; connect-src 'none'; script-src 'none'; base-uri 'none'; form-action 'none'">
<title>${escapeHtml(title)}</title><style>${await fontsCss()}
*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:Manrope,sans-serif;background:#fff;color:#171d14;font-size:15px;line-height:1.65;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@page{size:${type === 'proposal_pdf' ? 'A4' : '1280px 720px'};margin:0}
.source{display:none}.page{width:${type === 'proposal_pdf' ? '210mm' : '1280px'};height:${type === 'proposal_pdf' ? '297mm' : '720px'};padding:${type === 'proposal_pdf' ? '48px 52px 36px' : '46px 68px 34px'};display:flex;flex-direction:column;background:#f9faf6;break-after:page;position:relative;overflow:hidden;border-top:10px solid #c4ee62}.page:last-child{break-after:auto}
.masthead{display:flex;justify-content:space-between;align-items:center;gap:20px;flex-shrink:0;padding-bottom:22px;border-bottom:1px solid #d8ded0}.brand{font-weight:800;letter-spacing:-.04em;font-size:23px}.kind{text-transform:uppercase;font-size:10px;letter-spacing:.15em;color:#5c6754;text-align:right}.kicker{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#4c6337;margin:24px 0 9px;flex-shrink:0}
h1{font-size:${type === 'proposal_pdf' ? '38px' : '40px'};line-height:1.2;letter-spacing:-.045em;font-weight:700;margin:0 0 22px;white-space:pre-wrap;overflow-wrap:anywhere;flex-shrink:0}.document-title{font-size:12px;line-height:1.5;color:#637057;margin:0 0 14px;overflow-wrap:anywhere;white-space:pre-wrap;flex-shrink:0;max-height:90px;overflow:hidden}
.content{flex:1;min-height:0;overflow:hidden;position:relative}.content p{margin:0 0 16px;white-space:pre-wrap;overflow-wrap:anywhere;word-break:normal}.content p.bullet{padding:14px 18px 14px 30px;border-left:3px solid #a3c84e;background:#edf1e5;border-radius:0 9px 9px 0;position:relative}.content p.bullet:before{content:'';position:absolute;left:14px;top:25px;width:4px;height:4px;background:#62832c;border-radius:50%}.content p.notes{font-size:13px;color:#56604c;padding:12px 0;border-top:1px solid #d8ded0}.section-heading{font-size:18px;line-height:1.35;margin:24px 0 12px;letter-spacing:-.025em;overflow-wrap:anywhere}.section-heading:first-child{margin-top:0}.proposal .document-title{display:none}.footer{flex-shrink:0;display:flex;justify-content:space-between;gap:20px;padding-top:16px;margin-top:18px;border-top:1px solid #d8ded0;color:#647157;font-size:10px;letter-spacing:.04em}.footer strong{font-weight:600}.page.presentation .content{font-size:21px;line-height:1.5}.page.presentation .content p.notes{font-size:15px}.page.presentation .content p.bullet{padding:12px 20px 12px 34px;margin-bottom:12px}.page.presentation .document-title{font-size:12px;margin-bottom:10px}.continuation{color:#7c8871}
</style></head><body data-type="${type}" data-kind="${escapeHtml(type === 'proposal_pdf' ? m.proposal : m.presentation)}" data-continuation="${m.continuation}"><main class="source" data-document-title="${escapeHtml(title)}">${sections}</main><div id="pages"></div></body></html>`;
}

// This function is trusted application code, evaluated through Playwright's isolated channel.
// User content has already been escaped and is handled only through textContent.
export function paginateDocument() {
  const source = document.querySelector('.source');
  const pages = document.querySelector('#pages');
  const presentation = document.body.dataset.type === 'presentation_pdf';
  const maxPages = 600;
  let count = 0;
  const originals = [];
  const rendered = [];
  function newPage(sectionTitle, continuation) {
    if (++count > maxPages) throw new Error('page_limit');
    const page = document.createElement('article');
    page.className = `page ${presentation ? 'presentation' : 'proposal'}`;
    const mast = document.createElement('header'); mast.className = 'masthead';
    const brand = document.createElement('span'); brand.className = 'brand'; brand.textContent = 'GPTBot.uz';
    const kind = document.createElement('span'); kind.className = 'kind'; kind.textContent = document.body.dataset.kind;
    mast.append(brand, kind);
    const kicker = document.createElement('div'); kicker.className = 'kicker';
    kicker.textContent = continuation ? document.body.dataset.continuation : String(count).padStart(2, '0');
    const documentTitle = document.createElement('div'); documentTitle.className = 'document-title'; documentTitle.textContent = source.dataset.documentTitle;
    const heading = document.createElement('h1'); heading.textContent = sectionTitle;
    const content = document.createElement('div'); content.className = 'content';
    const footer = document.createElement('footer'); footer.className = 'footer';
    const footerBrand = document.createElement('strong'); footerBrand.textContent = 'GPTBot.uz';
    const number = document.createElement('span'); number.className = 'page-number';
    footer.append(footerBrand, number);
    page.append(mast, kicker, documentTitle, heading, content, footer); pages.append(page);
    if (content.clientHeight < 120 || documentTitle.scrollHeight > documentTitle.clientHeight + 1) throw new Error('layout_overflow');
    return content;
  }
  function fits(content) { return content.scrollHeight <= content.clientHeight + 1 && content.scrollWidth <= content.clientWidth + 1; }
  let proposalContent;
  for (const section of source.children) {
    const pageTitle = presentation ? section.dataset.title : source.dataset.documentTitle;
    let content = presentation ? newPage(pageTitle, false) : proposalContent || newPage(pageTitle, false);
    if (!presentation) {
      const heading = document.createElement('h2'); heading.className = 'section-heading'; heading.textContent = section.dataset.title;
      content.append(heading);
      if (heading.offsetTop + heading.offsetHeight + 80 > content.clientHeight) {
        heading.remove(); content = newPage(pageTitle, true); content.append(heading);
      }
    }
    for (const original of section.children) {
      originals.push(original.textContent);
      let remaining = original.textContent;
      while (remaining.length) {
        const paragraph = original.cloneNode(false); paragraph.textContent = remaining; content.append(paragraph);
        if (fits(content)) { rendered.push(remaining); remaining = ''; continue; }
        paragraph.remove();
        if ([...content.children].some(element => element.tagName === 'P')) {
          const trailingHeading = content.lastElementChild?.tagName === 'H2' ? content.lastElementChild : null;
          trailingHeading?.remove(); content = newPage(pageTitle, true);
          if (trailingHeading) content.append(trailingHeading);
          continue;
        }
        // Split a long block at a measured boundary; never shrink or silently clip its text.
        content.append(paragraph);
        const chars = Array.from(remaining);
        let lo = 1; let hi = chars.length; let best = 0;
        while (lo <= hi) {
          const mid = Math.floor((lo + hi) / 2); paragraph.textContent = chars.slice(0, mid).join('');
          if (fits(content)) { best = mid; lo = mid + 1; } else hi = mid - 1;
        }
        if (!best) throw new Error('layout_overflow');
        // Prefer a word boundary while preserving every code point.
        let boundary = best;
        for (let i = best - 1; i > Math.max(0, best - 100); i--) if (/\s/u.test(chars[i])) { boundary = i + 1; break; }
        const part = chars.slice(0, boundary).join(''); paragraph.textContent = part; rendered.push(part);
        remaining = chars.slice(boundary).join('');
        if (remaining) content = newPage(pageTitle, true);
      }
    }
    if (!presentation) proposalContent = content;
  }
  if (originals.join('') !== rendered.join('')) throw new Error('text_integrity');
  for (const [index, page] of [...pages.children].entries()) {
    page.querySelector('.page-number').textContent = `${String(index + 1).padStart(2, '0')} / ${String(count).padStart(2, '0')}`;
    if (!fits(page.querySelector('.content')) || page.scrollHeight > page.clientHeight + 1 || page.scrollWidth > page.clientWidth + 1) throw new Error('layout_overflow');
  }
  source.remove();
  return { pages: count, overflow: false, textIntegrity: true };
}
