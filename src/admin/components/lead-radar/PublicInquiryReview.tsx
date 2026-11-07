import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ExternalLink, LoaderCircle, ShieldCheck } from 'lucide-react';
import type { LeadRadarLead } from '../../../shared/lead-radar';
import { api } from '../../lib/api';
import { publicInquiryReviewRows, runPublicInquiryReview, type PublicInquiryReviewOperation } from '../../lib/public-inquiry-review';
import { Button, Label, Select } from '../ui';

export function PublicInquiryReview({leads,disabled,onReadyChange,onAuthorized,onBusyChange}:{leads:LeadRadarLead[];disabled:boolean;onReadyChange:(ready:boolean)=>void;onAuthorized:(ids:string[])=>void;onBusyChange:(busy:boolean)=>void}) {
  const validityId=useId();
  const rows=useMemo(()=>publicInquiryReviewRows(leads),[leads]),signature=JSON.stringify(rows);
  const [sources,setSources]=useState<Record<string,string>>({}),[days,setDays]=useState(7),[attested,setAttested]=useState(false);
  const [confirmed,setConfirmed]=useState<string[]>([]),[busy,setBusy]=useState(false),[failed,setFailed]=useState<string|null>(null);
  const [complete,setComplete]=useState(false),operations=useRef<PublicInquiryReviewOperation[]|null>(null),version=useRef(0),running=useRef(false);
  const callbacks=useRef({onReadyChange,onAuthorized,onBusyChange});callbacks.current={onReadyChange,onAuthorized,onBusyChange};
  const reset=()=>{version.current++;operations.current=null;setConfirmed([]);setFailed(null);setComplete(false);setAttested(false);callbacks.current.onReadyChange(false);};
  useEffect(()=>{version.current++;operations.current=null;setSources({});setConfirmed([]);setFailed(null);setComplete(false);setAttested(false);callbacks.current.onReadyChange(false);},[signature]);
  const cancel=useCallback(()=>{version.current++;callbacks.current.onBusyChange(false);},[]);
  useEffect(()=>cancel,[cancel]);
  const count=rows.length,missing=rows.filter((row)=>!row.sources.length||row.reason),ready=count>0&&count<=50&&!missing.length;
  async function approve() {
    if(disabled||running.current||!ready||!attested||complete)return;
    const current=version.current;
    if(!operations.current) {
      const expiresAt=new Date(Date.now()+days*86_400_000).toISOString();
      operations.current=rows.map((row)=>({key:`public-business-review-${crypto.randomUUID()}`,input:{searchId:row.searchId,leadId:row.companyId,
        contactBasis:'public_business_inquiry',evidenceReference:sources[row.companyId]??row.sources[0],expiresAt}}));
    }
    running.current=true;setBusy(true);setFailed(null);callbacks.current.onReadyChange(false);callbacks.current.onBusyChange(true);
    try {
      const result=await runPublicInquiryReview({operations:operations.current,confirmed,authorize:(payload,key)=>api.leadRadarAuthorizeTelegramCampaignContact(payload,key),
        cancelled:()=>version.current!==current,progress:(ids)=>{if(version.current===current)setConfirmed(ids);}});
      if(version.current!==current)return;
      setConfirmed(result.confirmed);setFailed(result.failedCompanyId);setComplete(result.complete);
      callbacks.current.onAuthorized(result.confirmed);callbacks.current.onReadyChange(result.complete);
    } catch {if(version.current===current)setFailed('unknown');}
    finally {running.current=false;setBusy(false);callbacks.current.onBusyChange(false);}
  }
  return <section aria-label="Проверка источников первого обращения" className="mt-4 overflow-hidden rounded-2xl border border-brand-cyan/20 bg-brand-cyan/[0.04]">
    <div className="border-b border-white/10 p-4"><h4 className="flex items-center gap-2 text-sm font-semibold text-white"><ShieldCheck size={17} className="text-brand-cyan" aria-hidden="true" />Одна проверка выбранной аудитории</h4>
      <p className="mt-2 text-xs leading-5 text-white/65">Сверьте компанию, Telegram и страницу с контактом. Одно подтверждение сохранит основание отдельно для каждой компании. Сообщения отправятся только после предпросмотра и отдельного запуска.</p></div>
    <div className="space-y-4 p-4">
      {!count?<p className="text-sm text-white/60">Сначала выберите компании в аудитории.</p>:<ol className="max-h-80 space-y-2 overflow-y-auto pr-1">{rows.map((row,index)=>{
        const source=sources[row.companyId]??row.sources[0];return <li key={row.companyId} className="rounded-xl border border-white/10 bg-[#05070d]/35 p-3">
          <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="break-words text-sm font-medium text-white"><span className="mr-2 text-white/40">{index+1}.</span>{row.name}</p><p className="mt-1 text-xs text-white/55">{row.username?'@'+row.username:'Корпоративный Telegram не подтверждён'}</p></div>{confirmed.includes(row.companyId)&&<CheckCircle2 size={16} className="shrink-0 text-emerald-300" aria-label="Основание сохранено сервером" />}</div>
          {row.reason?<p className="mt-2 text-xs leading-5 text-amber-100">{row.reason}</p>:<div className="mt-2 space-y-2">
            {row.sources.length>1&&<label className="block text-xs text-white/60">Источник<Select aria-label={`Источник контакта ${row.name}`} value={source} disabled={disabled||busy||complete} onChange={(event)=>{setSources((current)=>({...current,[row.companyId]:event.target.value}));reset();}}>{row.sources.map((url)=><option value={url} key={url}>{url}</option>)}</Select></label>}
            <a href={source} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-2 break-all rounded-lg px-2 text-xs leading-5 text-brand-cyan hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"><ExternalLink size={13} className="shrink-0" aria-hidden="true" />{source}</a>
          </div>}
        </li>;
      })}</ol>}
      {!!missing.length&&<p role="status" className="text-xs leading-5 text-amber-100">У {missing.length} из {count} компаний не хватает свежего источника. Завершите проверку контактов или измените аудиторию. Частичная рассылка автоматически не запускается.</p>}
      {count>50&&<p role="alert" className="text-xs text-amber-100">В одной проверке допускается до 50 выбранных компаний.</p>}
      <div><Label htmlFor={validityId}>Срок подтверждения источников</Label><Select id={validityId} value={days} disabled={disabled||busy||complete} onChange={(event)=>{setDays(Number(event.target.value));reset();}}><option value={7}>7 дней</option><option value={14}>14 дней</option><option value={30}>30 дней</option></Select></div>
      <label className={`flex min-h-12 items-start gap-3 rounded-xl border border-white/10 p-3 text-sm leading-6 text-white/80 ${disabled||busy||!ready?'opacity-50':'cursor-pointer'}`}><input type="checkbox" checked={attested} disabled={disabled||busy||!ready||complete} onChange={(event)=>setAttested(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[#2fe6d1]" /><span><strong className="block text-white">Я проверил источники всех {count} компаний</strong>Это корпоративные контакты для первого релевантного делового обращения. Согласие на регулярную рассылку не заявляю; отказы и предыдущие обращения будут учтены.</span></label>
      {failed&&<p role="alert" className="rounded-xl border border-amber-200/20 p-3 text-xs leading-5 text-amber-100">Подтверждено {confirmed.length} из {count}. Следующие компании не обрабатывались. Запуск заблокирован; восстановление повторит незавершённую операцию с тем же ключом, без отправки сообщения.</p>}
      <Button type="button" disabled={disabled||busy||!ready||!attested||complete} onClick={()=>void approve()} className="min-h-12 w-full">{busy?<LoaderCircle size={16} className="animate-spin" aria-hidden="true" />:<ShieldCheck size={16} aria-hidden="true" />}{busy?`Сохраняем ${confirmed.length} из ${count}…`:complete?`Подтверждены все ${count} компаний`:failed?'Восстановить подтверждения':`Подтвердить источники ${count} компаний`}</Button>
      {complete&&<p role="status" className="text-xs leading-5 text-emerald-200">Сервер подтвердил {confirmed.length} из {count}. Теперь проверьте точные сообщения кнопкой подготовки. Отправка ещё не запускалась.</p>}
    </div>
  </section>;
}
