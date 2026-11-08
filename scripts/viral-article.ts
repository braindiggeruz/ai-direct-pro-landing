import type { BlogArticle, BodyBlock } from '../src/shared/types';
import { renderLeadDemo } from './lead-demo';
import { renderLeadForm } from './lead-form';

/** This campaign layout is deliberately limited to one authored article. */
export const VIRAL_ARTICLE_URL = '/ru/blog/ii-zahvatit-mir-nachnem-s-zayavok/';
export const isViralArticle = (url: string): boolean => url === VIRAL_ARTICLE_URL;
const ASSETS = '/assets/campaigns/ai-routine/dark';
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderViralArticle(a: BlogArticle, renderBlock: (block: BodyBlock) => string, authorMeta: string): string {
  const sections = new Map<string, { heading: string; blocks: BodyBlock[] }>();
  let current = '';
  for (const block of a.body || []) {
    if (block.type === 'h2' && block.id) {
      current = block.id;
      sections.set(current, { heading: block.text, blocks: [] });
    } else if (current) sections.get(current)!.blocks.push(block);
  }
  const body = (id: string) => (sections.get(id)?.blocks || []).map(renderBlock).join('\n');
  const acts = [
    { id: 'act-one', number: '01', label: 'Большой план. Маленький вопрос.', image: 'c02-late-message-960.webp', alt: 'Робот за столом читает вечернее сообщение' },
    { id: 'act-two', number: '02', label: 'Меньше фантазий. Больше пользы.', image: 'c03-three-questions-960.webp', alt: 'Робот разбирает карточки с частыми вопросами' },
    { id: 'act-three', number: '03', label: 'Человек остаётся главным.', image: 'c04-request-handoff-960.webp', alt: 'Робот передаёт аккуратную карточку обращения' },
  ];
  return `<article class="vr-article">
  <section class="vr-hero" aria-labelledby="viral-title">
    <div class="vr-hero-copy">
      <p class="vr-eyebrow"><span class="vr-dot" aria-hidden="true"></span> Для владельцев учебных центров</p>
      <h1 id="viral-title" data-testid="article-h1">ИИ захватит мир?<br><span>Сначала — заявки.</span></h1>
      <p class="vr-intro">${escape(a.intro)}</p>
      <div class="vr-actions"><a class="vr-button btn-primary" href="#lead-demo">Посмотреть, как это работает <span aria-hidden="true">↗</span></a><a class="vr-text-link" href="#lead-form">Хочу бота для своего центра <span aria-hidden="true">→</span></a></div>
      <p class="vr-caption">Пример без регистрации · AI-бот для бизнеса — от 1 990 000 сум</p>
    </div>
    <figure class="vr-hero-art">
      <img src="${ASSETS}/hero-1200.webp" srcset="${ASSETS}/hero-640.webp 640w, ${ASSETS}/hero-1200.webp 1200w, ${ASSETS}/hero-1600.webp 1600w" sizes="(min-width: 1000px) 600px, (min-width: 720px) 50vw, 100vw" width="1200" height="800" alt="Робот отложил план захвата мира и разбирает вопросы учебного центра" fetchpriority="high" loading="eager" decoding="async" />
      <figcaption><span class="vr-dot" aria-hidden="true"></span> Захват мира перенесён. Поступил вопрос о курсах.</figcaption>
    </figure>
  </section>
  <div class="vr-strip" aria-label="Сценарий работы"><span>Ответ по вашим материалам</span><span aria-hidden="true">→</span><span>Понятная заявка</span><span aria-hidden="true">→</span><span>Решение за человеком</span></div>
  <section class="vr-story" aria-labelledby="story-heading">
    <div class="vr-section-heading"><div><p class="vr-eyebrow">Немного фантастики. Знакомая рутина.</p><h2 id="story-heading">Восстание машин<br>началось с «Здравствуйте».</h2></div><p>Вымышленная история об учебном центре в Ташкенте. Если у вас есть администратор, он поймёт.</p></div>
    <div class="vr-acts">${acts.map(act => `<section class="vr-act" aria-labelledby="${act.id}"><div class="vr-act-visual"><img src="${ASSETS}/${act.image}" alt="${act.alt}" width="960" height="640" loading="lazy" decoding="async" /><span class="vr-act-number">${act.number}</span></div><p class="vr-act-label">${act.label}</p><h3 id="${act.id}">${escape(sections.get(act.id)?.heading || '')}</h3><div class="vr-prose">${body(act.id)}</div></section>`).join('')}</div>
  </section>
  <section class="vr-demo-section" aria-labelledby="try-scenario"><div class="vr-section-heading"><div><p class="vr-eyebrow">Теперь ваша очередь</p><h2 id="try-scenario">Три выбора.<br>Одна понятная карточка.</h2></div><p>Пройдите путь клиента до обращения. Это учебный сценарий с готовыми ответами, без подключения AI-модели.</p></div>${renderLeadDemo('ru')}</section>
  <section class="vr-control" aria-labelledby="real-boundaries"><div><p class="vr-eyebrow">Автоматизация с границами</p><h2 id="real-boundaries">Рутина — боту.<br>Решения — вашей команде.</h2><img src="${ASSETS}/c05-one-scenario-960.webp" alt="Робот и человек вместе выбирают один рабочий сценарий" width="960" height="640" loading="lazy" decoding="async" /></div><div class="vr-prose">${body('real-boundaries')}</div></section>
  <section class="vr-offer" aria-labelledby="one-scenario"><div class="vr-offer-title"><p class="vr-eyebrow">Ваш первый полезный бот</p><h2 id="one-scenario">Начнём с одной задачи.<br>И сделаем её понятной.</h2><p class="vr-price"><small>Разработка AI-бота</small>от 1 990 000 <span>сум</span></p><ul class="vr-offer-points"><li>Один канал: Telegram или Instagram</li><li>Ответы по согласованной базе знаний</li><li>Сбор контакта и сценарий обращения</li></ul><a class="vr-button btn-primary" href="#lead-form">Разобрать мой сценарий <span aria-hidden="true">↗</span></a></div><div class="vr-prose">${body('one-scenario')}</div></section>
  <div class="vr-form-wrap"><div class="vr-form-intro"><p class="vr-eyebrow">Без «захвата» вашего бюджета</p><h2>Расскажите,<br> что повторяется<br> каждый день.</h2><p>Куда пишут ваши клиенты? О чём спрашивают? Кому передать заявку? С этого начнём разговор о первой версии.</p><span class="vr-form-note">Достаточно телефона или Telegram. Примеры переписок и контакты ваших клиентов не нужны.</span></div>${renderLeadForm(a)}</div>
  <div class="vr-author">${authorMeta}<p>История и изображения созданы для иллюстрации сценария. Состав настоящего проекта согласуем отдельно.</p></div>
  </article>`;
}
