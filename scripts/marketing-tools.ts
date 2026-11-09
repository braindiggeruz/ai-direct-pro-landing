import type { Page } from '../src/shared/types';
const BASE = '/assets/marketing-20261109/';
export function isMarketingTool(page: Page): boolean {
  return page.pageType === 'tool' && ['/ru/utm-generator/', '/ru/roas-kalkulyator/'].includes(page.url);
}
export const marketingToolStyle = `<link rel="stylesheet" href="${BASE}tools.css" />`;
export const marketingToolScript = `<script type="module" src="${BASE}tools.mjs"></script>`;
function input(name: string, label: string, value: string, help = '', numeric = false): string {
  return `<div><label for="mk-${name}">${label}</label><input id="mk-${name}" name="${name}" type="text" value="${value}"${numeric ? ' inputmode="decimal"' : ' maxlength="200"'} autocomplete="off"${help ? ` aria-describedby="mk-${name}-help"` : ''}>${help ? `<small id="mk-${name}-help">${help}</small>` : ''}</div>`;
}
export function renderMarketingTool(page: Page): string {
  if (!isMarketingTool(page)) return '';
  const utm = page.url === '/ru/utm-generator/';
  // Controls appear only after the module binds, preventing accidental native
  // form GET submission (and input leakage into the page URL) without JS.
  return `<section class="mk-tool" aria-labelledby="mk-title">
  <h2 id="mk-title">${utm ? 'Соберите ссылку для кампании' : 'Посчитайте отдачу от рекламы'}</h2>
  <p>Бесплатно, без регистрации. Значения обрабатываются только в вашем браузере.</p>
  <noscript><p>Для расчёта включите JavaScript. Формулы, примеры и инструкция доступны ниже без него.</p></noscript>
  <form data-marketing-tool="${utm ? 'utm' : 'roas'}" novalidate>
    <div data-tool-controls hidden>
    ${utm ? `<div class="mk-actions" aria-label="Примеры источника"><button type="button" data-tool-preset="meta">Meta</button><button type="button" data-tool-preset="google">Google</button><button type="button" data-tool-preset="telegram">Telegram</button></div>
    <div class="mk-grid"><div class="mk-full"><label for="mk-address">Адрес страницы</label><input id="mk-address" name="address" type="url" value="https://example.com/course/" maxlength="4096" autocomplete="off" aria-describedby="mk-address-help"><small id="mk-address-help">Замените example.com на ваш сайт. Не вставляйте секретные или персональные данные.</small></div>
    ${input('source','Источник · utm_source','facebook')}${input('medium','Тип трафика · utm_medium','paid_social')}${input('campaign','Кампания · utm_campaign','english_evening_nov')}${input('content','Объявление · utm_content','image_offer_a','Необязательно')}${input('term','Ключ · utm_term','','Необязательно')}
    <div class="mk-full"><label class="mk-check"><input type="checkbox" name="replace" checked>Заменить существующие UTM-поля формы. Остальные параметры и якорь сохраняются.</label></div></div>`
    : `<div class="mk-grid">${input('revenue','Выручка от рекламы, сум','6000000','За тот же период, что и расход',true)}${input('spend','Расход на размещение, сум','2000000','Больше нуля',true)}${input('margin','Маржа до рекламы, %','40','Необязательно. После переменных затрат, до рекламы; это не наценка.',true)}</div>`}
    <div class="mk-actions"><button type="submit">${utm ? 'Создать ссылку' : 'Рассчитать'}</button>${utm ? '<button type="button" data-tool-copy disabled>Скопировать ссылку</button>' : ''}</div>
    <label for="mk-result">${utm ? 'Готовая ссылка' : 'Результат'}</label><textarea id="mk-result" data-tool-output readonly spellcheck="false"></textarea>
    <p data-tool-status role="status" aria-live="polite" aria-atomic="true"></p>
    </div>
  </form></section>`;
}
