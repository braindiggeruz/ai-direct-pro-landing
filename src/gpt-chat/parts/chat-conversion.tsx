import { useEffect, useRef, useState } from 'react';
import type { Locale, PackTerms, PaymentProvider } from '../types';
import type { ChatRolePreset } from '../../shared/types';
import { EV, track } from '../analytics';
import { recordUiEvent } from '../ui-events';
import { EXIT_REASONS, paywallRole, trialCopy } from '../trial-copy';
import { listed, offersOf, perAnswer } from '../pack-offers';
import { packText } from '../pack-text';
import { keepNames } from '../keep-names';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import './conversion.css';

/**
 * The provider names a browser's page translation must leave alone (keep-names.tsx). This part loads on its
 * own, so the guard shares a chunk with the parts that use it instead of joining the pack window's: the pay
 * screens, which load after the window, would otherwise import the whole window (19 kB against 12).
 */
const BRANDS = ['Click', 'Payme', 'Uzum Bank'];

/** When this browser first saw the limit card of a spent trial (epoch ms, localStorage). */
const WALL_KEY = 'gptchat_wall_first';
/** The wall is counted once per page load, however often its card mounts. */
let wallCounted = false;

/**
 * Lazy, server-triggered once per owner. Closing never discards the
 * conversation. The heading and its line speak to the page's task (Ш1: the
 * page's role, data-chat-role); the price, answers and period come from the
 * server's PackTerms. Every provider's button carries the sum, none is
 * preselected. While the server offers the 3-day pack too (pack-offers.ts),
 * each pack is a row with its own buttons, the small one first: one tap still
 * pays, and the tap names its pack. «Paketim bor» opens the pack window (onPay without a provider),
 * where a bought pack is found. Closed without paying, the window leaves one
 * optional question in the thread, «Nega hozir emas?»: four answers from a
 * closed list, no text field, once per view, and it never holds the closing.
 */
export function TrialPaywall({ locale, owner, role, pack, providers, termsUrl, apiBase, onPay }: {
  locale: Locale; owner: string; role?: ChatRolePreset; pack: PackTerms; providers: PaymentProvider[]; termsUrl: string | null;
  apiBase: string; onPay: (provider?: PaymentProvider, sku?: 'once') => void;
}) {
  const key = `gptchat_trial_offer_v1:${owner}`;
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(key) !== 'seen'; } catch { return true; } });
  // null: not asked; 'ask': shown under the closed window; 'done': answered; 'help': answered «Нет карты», with the way on that needs no card; 'gone': closed. Asked at most once.
  const [survey, setSurvey] = useState<'ask' | 'done' | 'help' | 'gone' | null>(null);
  const seen = useRef(false);
  const page = paywallRole(role);
  const c = trialCopy(locale, page, pack);
  // Someone at the paywall holds no pack: the small one first.
  const offers = listed(offersOf(pack), false);
  const o = packText(locale);
  const brand = (provider: PaymentProvider) => (provider === 'click' ? 'Click' : provider === 'payme' ? 'Payme' : 'Uzum Bank');
  useEffect(() => {
    if (!open || seen.current) return;
    seen.current = true;
    try { localStorage.setItem(key, 'seen'); } catch { /* Once while mounted. */ }
    track(EV.packPromptViewed, { locale, surface: 'trial_exhausted', role_id: page });
    recordUiEvent(apiBase, 'pack_prompt_viewed', 'trial_exhausted');
    // Which tool's visitors reach the paywall: the page's role from a closed list, nothing else.
    recordUiEvent(apiBase, 'trial_paywall_role', page);
  }, [open, apiBase, key, locale, page]);
  useEffect(() => {
    if (survey !== 'done') return;
    const timer = window.setTimeout(() => setSurvey('gone'), 4000);
    return () => window.clearTimeout(timer);
  }, [survey]);
  const close = () => {
    setOpen(false);
    setSurvey((state) => state ?? 'ask');
    track(EV.packPromptDismissed, { locale, surface: 'trial_exhausted' });
    recordUiEvent(apiBase, 'pack_prompt_dismissed', 'trial_exhausted');
  };
  const answer = (reason: (typeof EXIT_REASONS)[number]) => {
    recordUiEvent(apiBase, 'trial_exit_reason', reason);
    // «Нет карты»: someone else can pay (the pack window's «Попросить оплатить»; it opens with that line open).
    setSurvey(reason === 'no_card' && providers.some(provider => provider !== 'uzum') ? 'help' : 'done');
  };
  return <>
    <Dialog open={open} onOpenChange={value => { if (!value) close(); }}>
      <DialogContent className="gpt-account-dialog gpt-trial-dialog" data-role={page} showCloseButton={false} onCloseAutoFocus={event => {
        event.preventDefault(); document.querySelector<HTMLButtonElement>('[data-testid="ai-account-trigger"]')?.focus();
      }}>
        <button type="button" className="gpt-trial-close" onClick={close} aria-label={c.close}>×</button>
        <div className="gpt-trial-mark" aria-hidden="true">✦</div>
        <span className="gpt-trial-eyebrow">{c.eyebrow}</span>
        <DialogTitle>{c.title}</DialogTitle>
        <DialogDescription>{c.line}</DialogDescription>
        {offers.length > 1 ? (
          <div className="gpt-trial-packs" data-testid="trial-packs">
            {/* The 3-day pack leads (conversion audit 2026-11-22, B2); the other pack's buttons are quiet outlines. */}
            {offers.map(offer => (
              <div className={offer.sku === 'once' ? 'gpt-trial-pack gpt-trial-pack-lead' : 'gpt-trial-pack'} key={offer.sku} data-sku={offer.sku}>
                <div className="gpt-trial-pack-head"><strong>{o.name(offer)}</strong><b>{o.sum(offer)}</b></div>
                {offer.sku === 'once' && <em className="gpt-trial-pack-job" data-testid="trial-pack-job">{o.job}</em>}
                <span>{o.facts(offer)} · {o.per(perAnswer(offer))}</span>
                <div className="gpt-trial-pay"><i aria-hidden="true">{o.via}</i>{providers.filter(provider => offer.sku === 'month' || provider !== 'uzum').map(provider => (
                  <button type="button" key={provider} className={offer.sku === 'once' ? undefined : 'gpt-trial-quiet'} data-provider={provider} data-sku={offer.sku} aria-label={o.pay(offer, brand(provider))} translate="no" onClick={() => {
                    setOpen(false);
                    track(EV.packPromptClicked, { locale, surface: 'trial_exhausted', provider });
                    onPay(provider, offer.sku === 'once' ? 'once' : undefined);
                  }}>{brand(provider)} <span aria-hidden="true">↗</span></button>
                ))}</div>
              </div>
            ))}
          </div>
        ) : <>
          <div className="gpt-trial-value"><strong>{c.pack}</strong><span>{c.facts}</span></div>
          <div className="gpt-trial-pay">{providers.map(provider => <button type="button" key={provider} data-provider={provider} onClick={() => { setOpen(false); track(EV.packPromptClicked, { locale, surface: 'trial_exhausted', provider }); onPay(provider); }}>{keepNames(`${c.pay(provider)} `, BRANDS)}<span aria-hidden="true">↗</span></button>)}</div>
        </>}
        <small>{c.fine} {termsUrl && <>{c.acceptBefore}<a href={termsUrl} target="_blank" rel="noopener noreferrer">{c.acceptLink}</a>.</>}</small>
        <div className="gpt-trial-links">
          <button type="button" className="gpt-trial-later" data-testid="trial-have-pack" onClick={() => { setOpen(false); track(EV.packPromptClicked, { locale, surface: 'trial_exhausted', from: 'have_pack' }); onPay(); }}>{c.havePack}</button>
          <button type="button" className="gpt-trial-later" onClick={close}>{c.later}</button>
        </div>
      </DialogContent>
    </Dialog>
    {!open && (survey === 'ask' || survey === 'done' || survey === 'help') && (
      <section className="gpt-pack-prompt gpt-trial-survey" data-testid="trial-exit-survey" aria-label={c.survey.title}>
        {survey === 'ask' ? <>
          <button type="button" className="gpt-pack-prompt-close" aria-label={c.survey.close} onClick={() => setSurvey('gone')}>×</button>
          <strong>{c.survey.title}</strong>
          <div className="gpt-trial-reasons">{EXIT_REASONS.map(reason => <button type="button" key={reason} data-reason={reason} onClick={() => answer(reason)}>{c.survey.answers[reason]}</button>)}</div>
        </> : survey === 'help' ? <>
          <button type="button" className="gpt-pack-prompt-close" aria-label={c.survey.close} onClick={() => setSurvey('gone')}>×</button>
          <p role="status">{c.survey.thanks}</p>
          <div className="gpt-trial-reasons"><button type="button" data-testid="trial-ask-pay" onClick={() => {
            try { sessionStorage.setItem('gptchat_ask', '1'); } catch { /* The window opens without the line open. */ }
            setSurvey('gone');
            track(EV.packPromptClicked, { locale, surface: 'trial_exhausted', from: 'ask_pay' });
            onPay();
          }}>{c.survey.askPay}</button></div>
        </> : <p role="status">{c.survey.thanks}</p>}
      </section>
    )}
  </>;
}

/**
 * The 3-day pack on the limit card, above the monthly pack's own line and
 * buttons (components/AiLimitPay.tsx, start bundle): the card is what a
 * visitor sees after the paywall is closed, and on every return. Drawn only
 * while the server offers the pack; one tap pays it, and the tap names it.
 */
export function LimitSmallPack({ locale, pack, providers, onPay }: {
  locale: Locale; pack: PackTerms; providers: PaymentProvider[]; onPay: (provider: PaymentProvider) => void;
}) {
  // Once per page view, a second after the card stands: how long ago this
  // browser first met the trial's wall (roadmap №2, 0.4). The limit and the
  // first meeting are read from storage by their keys: the console stores the
  // limit in an effect that runs after this one, hence the wait. A closed list
  // and the tab's random id, nothing about the visitor.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        if (wallCounted || (JSON.parse(sessionStorage.getItem('gptchat_limit') || 'null') as { reason?: unknown } | null)?.reason !== 'trial') return;
        wallCounted = true;
        const now = Date.now();
        const first = Number(localStorage.getItem(WALL_KEY)) || 0;
        if (!first) localStorage.setItem(WALL_KEY, String(now));
        const days = (now - first) / 86_400_000;
        recordUiEvent(document.getElementById('gpt-chat-root')?.dataset.apiBase ?? '', 'trial_wall_seen',
          !first ? 'first' : days < 1 ? 'same_day' : days < 3 ? 'd1_2' : days < 8 ? 'd3_7' : 'd8_plus');
      } catch { /* Storage is blocked: the view is not counted. */ }
    }, 1_000);
    return () => window.clearTimeout(timer);
  }, []);
  const [month, small] = offersOf(pack);
  if (!small) return null;
  const o = packText(locale);
  const brand = (provider: PaymentProvider) => (provider === 'click' ? 'Click' : 'Payme');
  return (
    <div className="gpt-limit-small" data-testid="limit-small-pack">
      <p className="gpt-limit-pay-line"><strong>{o.sum(small)}</strong> · {o.facts(small)}</p>
      <div className="gpt-limit-small-pay">
        <i aria-hidden="true">{o.via}</i>
        {providers.filter(provider => provider !== 'uzum').map(provider => (
          <button type="button" className="gpt-primary" key={provider} data-testid="limit-pay-small" data-provider={provider} aria-label={o.pay(small, brand(provider))} translate="no" onClick={() => {
            track(EV.packPromptClicked, { locale, surface: 'limit_card', provider });
            onPay(provider);
          }}>{brand(provider)}<span aria-hidden="true">↗</span></button>
        ))}
      </div>
      <p className="gpt-limit-or">{o.or(month)}</p>
    </div>
  );
}

/**
 * The pack after a useful answer. During the trial it shows once one trial
 * answer is left (Ш7, `trial`): «1 ta sinov javobi qoldi», the pack's facts
 * and its price, counted as the surface trial_last.
 *
 * While the server offers the 3-day pack, the trial's card sells that one
 * (conversion audit 2026-11-22): the first payment is the hard one, and the
 * card had quoted only the monthly sum to someone one answer from the wall.
 */
export function ChatPackPrompt({ locale, owner, pack, providers, termsUrl, nearLimit, trial, apiBase, onPay, onOpen }: {
  locale:Locale;owner:string;pack:PackTerms;providers:PaymentProvider[];termsUrl:string|null;nearLimit:boolean;trial?:boolean;apiBase:string;
  onPay:(provider:PaymentProvider,sku?:'once')=>void;onOpen:()=>void;
}) {
  const ru=locale==='ru', today=new Date().toISOString().slice(0,10), key=`gptchat_pack_prompt_v1:${owner}`;
  const [closed,setClosed]=useState(()=>{try{return localStorage.getItem(key)===today;}catch{return false;}});
  const card=useRef<HTMLElement>(null), seen=useRef(false);
  const surface=trial?'trial_last':nearLimit?'near_limit':'after_answer';
  const last=trial?trialCopy(locale,'general',pack):null;
  const small=trial?offersOf(pack).find(offer=>offer.sku==='once'):undefined;
  const o=packText(locale);
  const price=new Intl.NumberFormat(ru?'ru-RU':'uz-UZ').format(small?small.priceUzs:pack.priceUzs);
  useEffect(()=>{
    const el=card.current;
    if(!el || closed || seen.current)return;
    const observe=new IntersectionObserver(entries=>{
      if(!entries.some(e=>e.intersectionRatio>=.5) || seen.current)return;
      seen.current=true;
      track(EV.packPromptViewed,{locale,surface});
      recordUiEvent(apiBase,'pack_prompt_viewed',surface);
      observe.disconnect();
    },{threshold:.5});
    observe.observe(el);return()=>observe.disconnect();
  },[closed,locale,surface,apiBase]);
  if(closed)return null;
  return <section ref={card} className="gpt-pack-prompt" data-testid="chat-pack-prompt" data-surface={surface} aria-label={ru?'Пакет текстового чата':'Matnli chat paketi'}>
    <button type="button" className="gpt-pack-prompt-close" aria-label={ru?'Скрыть предложение на сегодня':'Taklifni bugunga yashirish'} onClick={()=>{setClosed(true);try{localStorage.setItem(key,today);}catch{/* The mounted card still stays closed. */}track(EV.packPromptDismissed,{locale,surface});recordUiEvent(apiBase,'pack_prompt_dismissed',surface);}}>×</button>
    <strong>{last?last.lastTitle:nearLimit?(ru?'Бесплатных ответов осталось мало':'Bepul javoblar kamaymoqda'):(ru?'Нужно больше ответов для работы и учёбы?':'Ish va o‘qish uchun ko‘proq javob kerakmi?')}</strong>
    <p>{small?`${o.facts(small)}. ${o.job}`:last?last.lastFacts:ru?`${pack.messageLimit} ответов · ${pack.months} календ. мес. · до ${pack.dailyLimit} в день`:`${pack.messageLimit} javob · ${pack.months} kalendar oy · kuniga ${pack.dailyLimit} tagacha`}</p>
    <div className="gpt-pack-prompt-actions"><b>{price} {ru?'сум':'so‘m'}</b>{providers.length && termsUrl ? providers.filter(provider=>!small||provider!=='uzum').map(provider=><button type="button" key={provider} data-provider={provider} data-sku={small?'once':'month'} translate="no" onClick={()=>{track(EV.packPromptClicked,{locale,surface,provider});onPay(provider,small?'once':undefined);}}>{provider==='click'?'Click':provider==='payme'?'Payme':'Uzum Bank'} ↗</button>):<button type="button" onClick={onOpen}>{ru?'Выбрать пакет':'Paket tanlash'}</button>}</div>
    <small>{ru?'Разовая покупка, без автосписаний. ':'Bir martalik xarid, avtomatik yechim yo‘q. '}{termsUrl && <>{ru?'Оплачивая, принимаете ':'To‘lab, qabul qilasiz: '}<a href={termsUrl} target="_blank" rel="noopener noreferrer">{ru?'оферту':'oferta'}</a>.</>}{ru?' Презентации оплачиваются отдельно.':' Taqdimotlar alohida to‘lanadi.'}</small>
  </section>;
}
