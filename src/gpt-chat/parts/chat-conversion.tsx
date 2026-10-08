import { useEffect, useRef, useState } from 'react';
import type { Locale, PackTerms, PaymentProvider } from '../types';
import { EV, track } from '../analytics';
import { recordUiEvent } from '../ui-events';
import './conversion.css';

export function ChatPackPrompt({ locale, owner, pack, providers, termsUrl, nearLimit, apiBase, onPay, onOpen }: {
  locale:Locale;owner:string;pack:PackTerms;providers:PaymentProvider[];termsUrl:string|null;nearLimit:boolean;apiBase:string;
  onPay:(provider:PaymentProvider)=>void;onOpen:()=>void;
}) {
  const ru=locale==='ru', today=new Date().toISOString().slice(0,10), key=`gptchat_pack_prompt_v1:${owner}`;
  const [closed,setClosed]=useState(()=>{try{return localStorage.getItem(key)===today;}catch{return false;}});
  const card=useRef<HTMLElement>(null), seen=useRef(false);
  const surface=nearLimit?'near_limit':'after_answer';
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
  return <section ref={card} className="gpt-pack-prompt" data-testid="chat-pack-prompt" aria-label={ru?'Пакет текстового чата':'Matnli chat paketi'}>
    <button type="button" className="gpt-pack-prompt-close" aria-label={ru?'Скрыть предложение на сегодня':'Taklifni bugunga yashirish'} onClick={()=>{setClosed(true);try{localStorage.setItem(key,today);}catch{/* The mounted card still stays closed. */}track(EV.packPromptDismissed,{locale,surface});recordUiEvent(apiBase,'pack_prompt_dismissed',surface);}}>×</button>
    <strong>{nearLimit?(ru?'Бесплатных ответов осталось мало':'Bepul javoblar kamaymoqda'):(ru?'Нужно больше ответов для работы и учёбы?':'Ish va o‘qish uchun ko‘proq javob kerakmi?')}</strong>
    <p>{ru?`${pack.messageLimit} ответов · ${pack.months} календ. мес. · до ${pack.dailyLimit} в день`:`${pack.messageLimit} javob · ${pack.months} kalendar oy · kuniga ${pack.dailyLimit} tagacha`}</p>
    <div className="gpt-pack-prompt-actions"><b>{price} {ru?'сум':'so‘m'}</b>{providers.length && termsUrl ? providers.map(provider=><button type="button" key={provider} data-provider={provider} onClick={()=>{track(EV.packPromptClicked,{locale,surface,provider});onPay(provider);}}>{provider==='click'?'Click':provider==='payme'?'Payme':'Uzum Bank'} ↗</button>):<button type="button" onClick={onOpen}>{ru?'Выбрать пакет':'Paket tanlash'}</button>}</div>
    <small>{ru?'Разовая покупка, без автосписаний. ':'Bir martalik xarid, avtomatik yechim yo‘q. '}{termsUrl && <>{ru?'Оплачивая, принимаете ':'To‘lab, qabul qilasiz: '}<a href={termsUrl} target="_blank" rel="noopener noreferrer">{ru?'оферту':'oferta'}</a>.</>}{ru?' Презентации оплачиваются отдельно.':' Taqdimotlar alohida to‘lanadi.'}</small>
  </section>;
}
