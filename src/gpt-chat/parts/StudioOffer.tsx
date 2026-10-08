import { lazy, Suspense, useEffect, useState } from 'react';
import type { StudioLocale, StudioPlanId, StudioPublicConfig } from '../../../apps/studio/src/api';
import { billingRuntime } from '../../../apps/studio/src/billing/runtime';
import { sellingProviders } from '../../../apps/studio/src/billing/providers';
import { offerOrder, perPresentation, studioPrice } from './studio-offer-model';
import './studio-offer.css';

const Example = lazy(() => import('./StudioOfferExample').then(m => ({ default: m.StudioOfferExample })));

/** Prices and capabilities come from /config; no order or paid AI is started on view. */
export function StudioOffer({ config, locale, result, repeat, units, onChoose }: {
  config: StudioPublicConfig; locale: StudioLocale; result: boolean; repeat: boolean; units: number | null;
  onChoose: (plan: StudioPlanId) => void;
}) {
  const ru = locale === 'ru', [example, setExample] = useState(false);
  const available = sellingProviders(config).length > 0 && config.tools.fullDeck && units !== null;
  const free = config.shapes.free, full = config.shapes.full;
  useEffect(() => {
    const funnel = billingRuntime().funnel;
    if (result) { funnel.upgradeViewed(repeat); funnel.tariffsViewed('after_result'); }
  }, [result, repeat]);
  const choose = (plan: StudioPlanId) => { billingRuntime().funnel.upgradeSelected(plan); onChoose(plan); };
  return <section className="gpt-studio-offer" data-studio-offer={result ? 'result' : 'draft'} aria-label={ru ? 'Возможности презентации' : 'Taqdimot imkoniyatlari'}>
    <h3>{result ? (ru ? 'Готовы развить эту презентацию?' : 'Shu taqdimotni kengaytiramizmi?') : (ru ? 'От темы — к готовому выступлению' : 'Mavzudan tayyor nutqqacha')}</h3>
    <div className="gpt-offer-comparison">
      <div><strong>{ru ? 'Бесплатный пример' : 'Bepul namuna'}</strong><span>{free.maxSlides} {ru ? 'содержательных слайдов' : 'mazmunli slayd'} · {free.images} {ru ? 'изображения' : 'rasm'}</span><small>{ru ? 'PPTX и локальные правки' : 'PPTX va lokal tahrirlar'}</small></div>
      <div><strong>{ru ? 'Полная презентация' : 'To‘liq taqdimot'}</strong><span>{ru ? 'До ' : ''}{full.maxSlides} {ru ? 'слайдов' : 'tagacha slayd'} · {full.images} {ru ? 'изображений' : 'rasm'}</span><small>{full.notes ? (ru ? 'Текст выступления · ' : 'Nutq matni · ') : ''}{full.palettes} {ru ? 'палитры' : 'palitra'}</small></div>
    </div>
    {units !== null && units > 0 ? <p>{ru ? `В вашем пакете осталось: ${units}. Полный запуск расходует 1 презентацию; локальные правки бесплатны.` : `Paketingizda ${units} ta qoldi. To‘liq yaratish 1 taqdimotni sarflaydi; lokal tahrirlar bepul.`}</p> : <div className="gpt-offer-purchases">{offerOrder(repeat).map(id => {
      const plan = config.plans.find(p => p.id === id);
      if (!plan) return null;
      const each = perPresentation(plan.amountUzs, plan.presentationFull);
      return <div key={id} data-offer-plan={id}>
        <span>{id === 'kunlik' ? (ru ? 'Для этой задачи · 24 часа' : 'Shu vazifa uchun · 24 soat') : (ru ? 'Для серии · календарный месяц' : 'Bir nechta ish uchun · kalendar oy')}</span>
        <button type="button" className={id === offerOrder(repeat)[0] ? 'gpt-offer-buy' : 'gpt-offer-secondary'} disabled={!available} onClick={() => choose(id)}>{id === 'kunlik' ? (ru ? 'Полная версия — ' : 'To‘liq versiya — ') : `${plan.presentationFull} ${ru ? 'презентаций — ' : 'ta taqdimot — '}`}{studioPrice(plan.amountUzs, locale)}</button>
        {each !== null && <small>{studioPrice(each, locale)} {ru ? `за презентацию при использовании всех ${plan.presentationFull}` : `har biri, ${plan.presentationFull} tasidan to‘liq foydalansangiz`}</small>}
      </div>;
    })}</div>}
    {!available && units === 0 && <p role="status">{ru ? 'Оплата временно недоступна. Ваш результат сохранится.' : 'To‘lov vaqtincha mavjud emas. Natijangiz saqlanadi.'}</p>}
    {units === null && <p role="status">{ru ? 'Проверяем ваш пакет. Выбор покупки станет доступен после проверки прав.' : 'Paketingiz tekshirilmoqda. Huquqlar tekshirilgach xaridni tanlash mumkin.'}</p>}
    <button type="button" className="gpt-workspace-link" aria-expanded={example} onClick={() => setExample(v => !v)}>{ru ? 'Посмотреть пример слайда и заметок' : 'Slayd va izohlar namunasini ko‘rish'} {example ? '−' : '+'}</button>
    {example && <Suspense fallback={<p role="status">{ru ? 'Открываем пример…' : 'Namuna ochilmoqda…'}</p>}><Example locale={locale} palettes={full.palettes}/></Suspense>}
    <small>{result ? (ru ? 'Бесплатный PPTX остаётся доступен. Полный результат появится после отдельного запуска.' : 'Bepul PPTX saqlanadi. To‘liq natija alohida yaratishdan keyin chiqadi.') : (ru ? 'Разовая покупка. Без автосписаний. AI-чат — отдельный пакет.' : 'Bir martalik xarid. Avtomatik yechim yo‘q. AI-chat uchun alohida paket.')}</small>
  </section>;
}
