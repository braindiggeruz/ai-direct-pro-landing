import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Inbox, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from '../../lib/api';
import { Button, Select } from '../ui';
import type { LeadRadarInboxClassification, LeadRadarInboxPage } from '../../../shared/lead-radar-inbox';

const classifications:Record<LeadRadarInboxClassification,string>={needs_reply:'Нужен ответ',interested:'Есть интерес',declined:'Не заинтересован',handled:'Обработано'};
const date=(value:string)=>new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));

export function OutreachInbox() {
  const [data,setData]=useState<LeadRadarInboxPage|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [cursor,setCursor]=useState<string|undefined>(),[history,setHistory]=useState<(string|undefined)[]>([]);
  const [saving,setSaving]=useState<string|null>(null),generation=useRef(0);
  const refresh=useCallback(async()=>{
    const current=++generation.current;setBusy(true);setError('');
    try {const result=await api.leadRadarInbox(cursor);if(current===generation.current)setData(result);}
    catch {if(current===generation.current)setError('Не удалось получить входящие. Состояние ответов пока не подтверждено.');}
    finally {if(current===generation.current)setBusy(false);}
  },[cursor]);
  const cancelRequests=useCallback(()=>{generation.current++;},[]);
  useEffect(()=>{setData(null);void refresh();return cancelRequests;},[refresh,cancelRequests]);
  const classify=async(id:string,classification:LeadRadarInboxClassification)=>{
    setSaving(id);setError('');
    try {await api.leadRadarClassifyInbox(id,classification);await refresh();}
    catch {setError('Отметка не подтверждена сервером. Обновите входящие перед повторной попыткой.');}
    finally {setSaving(null);}
  };
  return <section aria-labelledby="outreach-inbox-title" className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#08111f]/80">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 p-5 sm:p-6">
      <div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-brand-cyan/20 bg-brand-cyan/10 text-brand-cyan"><Inbox size={21} aria-hidden="true" /></span>
        <div><h2 id="outreach-inbox-title" className="text-xl font-semibold text-white">Ответы компаний</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-white/60">Входящие сообщения, связанные с вашей кампанией. Отметьте интерес и следующий шаг.</p></div>
      </div>
      <Button variant="secondary" disabled={busy || !!saving} onClick={()=>void refresh()}><RefreshCw size={15} className={busy?'animate-spin':''} aria-hidden="true" />Обновить</Button>
    </div>
    <div className="space-y-4 p-5 sm:p-6" aria-busy={busy}>
      {error && <div role="alert" className="rounded-xl border border-rose-300/20 p-4 text-sm text-rose-100" style={{backgroundColor:'rgb(253 164 175 / 0.05)'}}>{error}</div>}
      {!data && busy && <div role="status" className="flex items-center justify-center gap-3 py-12 text-white/65"><LoaderCircle size={20} className="animate-spin" aria-hidden="true" />Загружаем входящие…</div>}
      {data && data.availability!=='ready' && <div role="status" className="rounded-xl border border-amber-300/20 bg-amber-300/[0.04] p-4 text-sm leading-6 text-amber-50">
        <strong className="block text-white">Автоматический сбор ответов ещё не подключён</strong>
        Здесь появятся реальные входящие после подключения Telegram Sender. Отправленное сообщение само по себе не считается ответом. Сохранённая история ниже остаётся доступной.
      </div>}
      {data?.availability==='ready' && <p className="text-xs leading-5 text-white/55">Приём событий включён. В списке только подтверждённые входящие; отсутствие записей не доказывает отсутствие ответов в Telegram.</p>}
      {data && !data.items.length && !error && <div className="rounded-2xl border border-dashed border-white/15 px-5 py-10 text-center">
        <Inbox size={30} className="mx-auto text-white/30" aria-hidden="true" /><p className="mt-3 text-base font-semibold text-white">{data.availability==='ready'?'Входящих в этой выборке пока нет':'История входящих пока пуста'}</p>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-white/55">Ответы появятся с названием компании и текстом. Доставку и показы по этому экрану оценивать нельзя.</p>
      </div>}
      <ul className="space-y-3">{data?.items.map((item)=><li key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-base font-semibold text-white">{item.companyName}</h3><p className="mt-1 text-xs text-white/50"><time dateTime={item.occurredAt}>{date(item.occurredAt)}</time></p></div>
          {item.kind==='opt_out' || item.suppressed ? <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/20 px-3 py-1.5 text-xs text-amber-100"><ShieldCheck size={13} aria-hidden="true" />{item.workflowState==='pending'?'Отписка обрабатывается':'Не связываться'}</span>
            : <label className="text-xs text-white/60"><span className="sr-only">Статус ответа компании {item.companyName}</span><Select className="min-h-11" style={{minWidth:'11rem'}} value={item.classification} disabled={!!saving || busy || item.workflowState==='pending'} onChange={(event)=>void classify(item.id,event.target.value as LeadRadarInboxClassification)}>{Object.entries(classifications).map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select></label>}
        </div>
        {item.text!==null ? <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-white/85">{item.text}</p>
          : <p className="mt-4 text-sm italic text-white/45">{item.bodyState==='expired'?'Текст удалён по сроку хранения (7 дней).':item.bodyState==='not_provided'?'Событие получено без текста.':'Текст сейчас недоступен.'}</p>}
        {item.workflowState==='pending' && <p role="status" className="mt-3 text-xs leading-5 text-amber-100">{item.kind==='opt_out'?'Новые отправки этого аккаунта приостановлены до обработки отписки. Уже начатую отправку отозвать нельзя.':'Обработка события ещё не завершена.'}</p>}
      </li>)}</ul>
      {data && (history.length>0 || data.nextCursor) && <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-4">
        <Button variant="secondary" disabled={!history.length || busy || !!saving} onClick={()=>{setCursor(history.at(-1));setHistory((items)=>items.slice(0,-1));}}><ArrowLeft size={15} aria-hidden="true" />Назад</Button>
        <span className="text-xs text-white/55">Страница {history.length+1}</span>
        <Button variant="secondary" disabled={!data.nextCursor || busy || !!saving} onClick={()=>{setHistory((items)=>[...items,cursor]);setCursor(data.nextCursor??undefined);}}>Дальше<ArrowRight size={15} aria-hidden="true" /></Button>
      </div>}
      <p className="text-xs leading-5 text-white/45">Тексты хранятся до 7 дней. «Не заинтересован» — ваша рабочая отметка; явная просьба больше не писать исключает компанию из новых отправок во всей базе.</p>
    </div>
  </section>;
}
