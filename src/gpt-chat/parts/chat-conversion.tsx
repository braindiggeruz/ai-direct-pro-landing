import { useEffect, useRef, useState } from 'react';
import type { Locale, PackTerms, PaymentProvider } from '../types';
import type { ChatRolePreset } from '../../shared/types';
import { EV, track } from '../analytics';
import { recordUiEvent } from '../ui-events';
import { EXIT_REASONS, paywallRole, trialCopy } from '../trial-copy';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import './conversion.css';

/**
 * Lazy, server-triggered once per owner. Closing never discards the
 * conversation. The heading and its line speak to the page's task (Ш1: the
 * page's role, data-chat-role); the price, answers and period come from the
 * server's PackTerms. Every provider's button carries the sum, none is
 * preselected. «Paketim bor» opens the pack window (onPay without a provider),
 * where a bought pack is found. Closed without paying, the window leaves one
 * optional question in the thread, «Nega hozir emas?»: four answers from a
 * closed list, no text field, once per view, and it never holds the closing.
 */
export function TrialPaywall({ locale, owner, role, pack, providers, termsUrl, apiBase, onPay }: {
  locale: Locale; owner: string; role?: ChatRolePreset; pack: PackTerms; providers: PaymentProvider[]; termsUrl: string | null;
  apiBase: string; onPay: (provider?: PaymentProvider) => void;
}) {
  const key = `gptchat_trial_offer_v1:${owner}`;
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(key) !== 'seen'; } catch { return true; } });
  // null: not asked; 'ask': shown under the closed window; 'done': answered; 'gone': closed. Asked at most once.
  const [survey, setSurvey] = useState<'ask' | 'done' | 'gone' | null>(null);
  const seen = useRef(false);
  const page = paywallRole(role);
  const c = trialCopy(locale, page, pack);
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
    setSurvey('done');
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
        <div className="gpt-trial-value"><strong>{c.pack}</strong><span>{c.facts}</span></div>
        <div className="gpt-trial-pay">{providers.map(provider => <button type="button" key={provider} data-provider={provider} onClick={() => { setOpen(false); track(EV.packPromptClicked, { locale, surface: 'trial_exhausted', provider }); onPay(provider); }}>{c.pay(provider)} <span aria-hidden="true">↗</span></button>)}</div>
        <small>{c.fine} {termsUrl && <>{c.acceptBefore}<a href={termsUrl} target="_blank" rel="noopener noreferrer">{c.acceptLink}</a>.</>}</small>
        <div className="gpt-trial-links">
          <button type="button" className="gpt-trial-later" data-testid="trial-have-pack" onClick={() => { setOpen(false); track(EV.packPromptClicked, { locale, surface: 'trial_exhausted', from: 'have_pack' }); onPay(); }}>{c.havePack}</button>
          <button type="button" className="gpt-trial-later" onClick={close}>{c.later}</button>
        </div>
      </DialogContent>
    </Dialog>
    {!open && (survey === 'ask' || survey === 'done') && (
      <section className="gpt-pack-prompt gpt-trial-survey" data-testid="trial-exit-survey" aria-label={c.survey.title}>
        {survey === 'ask' ? <>
          <button type="button" className="gpt-pack-prompt-close" aria-label={c.survey.close} onClick={() => setSurvey('gone')}>×</button>
          <strong>{c.survey.title}</strong>
          <div className="gpt-trial-reasons">{EXIT_REASONS.map(reason => <button type="button" key={reason} data-reason={reason} onClick={() => answer(reason)}>{c.survey.answers[reason]}</button>)}</div>
        </> : <p role="status">{c.survey.thanks}</p>}
      </section>
    )}
  </>;
}

/**
 * The pack after a useful answer. During the trial it shows once one trial
 * answer is left (Ш7, `trial`): «1 ta sinov javobi qoldi», the pack's facts
 * and its price, counted as the surface trial_last.
 */
export function ChatPackPrompt({ locale, owner, pack, providers, termsUrl, nearLimit, trial, apiBase, onPay, onOpen }: {
  locale:Locale;owner:string;pack:PackTerms;providers:PaymentProvider[];termsUrl:string|null;nearLimit:boolean;trial?:boolean;apiBase:string;
  onPay:(provider:PaymentProvider)=>void;onOpen:()=>void;
}) {
  const ru=locale==='ru', today=new Date().toISOString().slice(0,10), key=`gptchat_pack_prompt_v1:${owner}`;
  const [closed,setClosed]=useState(()=>{try{return localStorage.getItem(key)===today;}catch{return false;}});
  const card=useRef<HTMLElement>(null), seen=useRef(false);
  const surface=trial?'trial_last':nearLimit?'near_limit':'after_answer';
  const last=trial?trialCopy(locale,'general',pack):null;
  const price=new Intl.NumberFormat(ru?'ru-RU':'uz-UZ').format(pack.priceUzs);
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
    <p>{last?last.lastFacts:ru?`${pack.messageLimit} ответов · ${pack.months} календ. мес. · до ${pack.dailyLimit} в день`:`${pack.messageLimit} javob · ${pack.months} kalendar oy · kuniga ${pack.dailyLimit} tagacha`}</p>
    <div className="gpt-pack-prompt-actions"><b>{price} {ru?'сум':'so‘m'}</b>{providers.length && termsUrl ? providers.map(provider=><button type="button" key={provider} data-provider={provider} onClick={()=>{track(EV.packPromptClicked,{locale,surface,provider});onPay(provider);}}>{provider==='click'?'Click':provider==='payme'?'Payme':'Uzum Bank'} ↗</button>):<button type="button" onClick={onOpen}>{ru?'Выбрать пакет':'Paket tanlash'}</button>}</div>
    <small>{ru?'Разовая покупка, без автосписаний. ':'Bir martalik xarid, avtomatik yechim yo‘q. '}{termsUrl && <>{ru?'Оплачивая, принимаете ':'To‘lab, qabul qilasiz: '}<a href={termsUrl} target="_blank" rel="noopener noreferrer">{ru?'оферту':'oferta'}</a>.</>}{ru?' Презентации оплачиваются отдельно.':' Taqdimotlar alohida to‘lanadi.'}</small>
  </section>;
}
