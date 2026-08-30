import { useCallback,useEffect,useRef,useState } from 'react';
import { api } from '../../lib/api';
import { Button,Input,Label,Select } from '../ui';
import { TelegramAccountCampaignPanel,type TelegramAccountCampaignPanelProps } from './TelegramAccountCampaignPanel';
import { AUDIENCE_LIMIT,type AudienceDetail,type ContactDirectoryPage,type ContactDirectoryRow,
  type LeadRadarAudience } from '../../../shared/lead-radar-audiences';
import { recipientContactChoices, recipientContactSummary } from '../../../shared/lead-radar-recipient-contacts';
import { ContactCandidates } from './ContactCandidates';
import { audienceFailureMessage, saveAudienceWithRecovery } from '../../lib/audience-save';

const STATUS = {verified:'Подтверждён · нужно основание',review:'Нужна проверка',conflict:'Общий контакт разных компаний',contacted:'Уже писали / исход требует проверки',blocked:'Не связываться'};
const NICHE_LABELS:Record<string,string> = {dentist:'Стоматологии',car_repair:'Автосервисы',hairdresser:'Парикмахерские',salon:'Салоны красоты'};
function errorCopy(error:unknown):string {
  const code=(error as {code?:string})?.code;
  if (code==='audience_version_conflict') return 'Аудитория изменилась в другой вкладке. Нажмите «Обновить аудиторию», затем повторите выбор.';
  if (code==='audience_contact_blocked_or_conflicted') return 'Один из контактов запрещён или принадлежит разным компаниям. Обновите список и проверьте источник.';
  if (code==='audience_duplicate_contact') return 'Этот Telegram уже есть в аудитории под другой компанией. Один получатель — одно сообщение.';
  if (code==='audience_members_unavailable') return 'Часть контактов изменилась или удалена. Обновите аудиторию и уберите недоступные записи.';
  if (code==='audience_schema_unavailable') return 'Общая база ещё не готова на сервере. Существующие поиски сохранены; повторите обновление позже.';
  if (code==='directory_narrow_verification_filter') return 'Для проверки этого фильтра выберите нишу или город: слишком много контактов для одного запроса.';
  if (code==='directory_scan_limit') return 'Каталог превысил лимит безопасной загрузки. Контакты не потеряны; массовый выбор остановлен без частичного сохранения.';
  return audienceFailureMessage(error);
}
type Props=Omit<TelegramAccountCampaignPanelProps,'searchId'|'audience'|'leads'|'initialSelectedLeadIds'> & {onOpenSearch:(id:string)=>void};
export function TelegramContactDirectory({onOpenSearch,...campaignProps}:Props) {
  const [page,setPage]=useState<ContactDirectoryPage|null>(null);
  const [audiences,setAudiences]=useState<LeadRadarAudience[]>([]);
  const [detail,setDetail]=useState<AudienceDetail|null>(null);
  const [draftName,setDraftName]=useState('Общая аудитория');
  const [q,setQ]=useState('');
  const [category,setCategory]=useState('');
  const [city,setCity]=useState('');
  const [filters,setFilters]=useState({q:'',category:'',city:'',offset:0});
  const [status,setStatus]=useState('all');
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [composer,setComposer]=useState(false);
  const [refreshPending,setRefreshPending]=useState(false);
  const [pendingSelection,setPendingSelection]=useState<string[]|null>(null);
  const pendingName=useRef<string|null>(null);
  const mutation=useRef(false);
  const mounted=useRef(true);
  const readEpoch=useRef(0);
  const createId=useRef(`aud_${crypto.randomUUID().replaceAll('-','')}`);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{
    let active=true;
    setLoading(true);setError(null);
    let inFlight=false;
    const refresh=async(initial=false)=>{
      if (inFlight || (!initial && (document.hidden || mutation.current))) return;
      inFlight=true;
      try {const next=await api.leadRadarContactDirectory({...filters,status});if(active){setPage(next);if(!initial && pendingName.current===null)setError(null);}}
      catch(failure) {if(active)setError(errorCopy(failure));}
      finally {inFlight=false;if(active && initial)setLoading(false);}
    };
    void refresh(true);
    const timer=window.setInterval(()=>void refresh(),30_000);
    return()=>{active=false;window.clearInterval(timer);};
  },[filters,status]);
  const openAudience=useCallback(async(id:string)=>{
    const epoch=++readEpoch.current;
    setBusy(true);setError(null);
    try {
      const next=await api.leadRadarAudience(id);
      if(mounted.current && readEpoch.current===epoch) {
        setDetail(next);setDraftName(pendingName.current ?? next.audience.name);setRefreshPending(false);
        const url=new URL(window.location.href);url.searchParams.set('audience',id);window.history.replaceState(null,'',url);
      }
    } catch(failure) {if(mounted.current && readEpoch.current===epoch)setError(errorCopy(failure));}
    finally {if(mounted.current && readEpoch.current===epoch)setBusy(false);}
  },[]);
  useEffect(()=>{
    let active=true;
    api.leadRadarAudiences().then(async(result)=>{
      if(!active)return;
      setAudiences(result.audiences);
      const requested=new URLSearchParams(window.location.search).get('audience');
      const existing=result.audiences.find((item)=>item.id===requested) ?? result.audiences[0];
      if(existing)await openAudience(existing.id);
    }).catch((failure)=>{if(active)setError(errorCopy(failure));});
    return()=>{active=false;};
  },[openAudience]);
  async function save(ids:string[],name=detail?.audience.name ?? draftName):Promise<void> {
    if(mutation.current)return;
    mutation.current=true;setBusy(true);setError(null);setNotice(null);
    setPendingSelection(ids);
    pendingName.current=name;
    ++readEpoch.current;
    try {
      const result=await saveAudienceWithRecovery({id:detail?.audience.id ?? createId.current,name,
        version:detail?.audience.version ?? 0,companyIds:ids},{save:api.leadRadarSaveAudience,read:api.leadRadarAudience});
      if(!mounted.current)return;
      const saved=result.audience;
      const known=new Map([...(detail?.leads ?? []),...(page?.rows.map((row)=>row.lead) ?? [])].map((lead)=>[lead.id,lead]));
      setDetail(result.detail ?? {audience:saved,leads:saved.companyIds.flatMap((id)=>known.has(id)?[known.get(id)!]:[]),
        missingCompanyIds:[],excludedRecipientIds:detail?.excludedRecipientIds ?? []});
      setDraftName(saved.name);setRefreshPending(result.refreshPending);
      setPendingSelection(null);
      pendingName.current=null;
      setAudiences((current)=>[saved,...current.filter((item)=>item.id!==saved.id)]);
      setNotice(result.refreshPending ? `Выбор сохранён: ${saved.companyIds.length}. Статусы пока не обновились — нажмите «Обновить аудиторию». Редактор и сообщение сохранены.`
        : `Сохранено на сервере: ${saved.companyIds.length}/${AUDIENCE_LIMIT}. Отправка не запускалась.`);
      const url=new URL(window.location.href);url.searchParams.set('audience',saved.id);window.history.replaceState(null,'',url);
    } catch(failure) {if(mounted.current){setError(errorCopy(failure));setRefreshPending(true);}}
    finally {mutation.current=false;if(mounted.current)setBusy(false);}
  }
  const selected=new Set(pendingSelection ?? detail?.audience.companyIds ?? []);
  function selectedInRow(row:ContactDirectoryRow):string[] {
    return [row.lead.id,...(row.memberIds ?? row.sources.map((source)=>source.companyId))].filter((id)=>selected.has(id));
  }
  async function toggle(row:ContactDirectoryRow):Promise<void> {
    if(busy || !detail)return;
    const current=selectedInRow(row);
    const next=new Set(selected);
    if(current.length)current.forEach((id)=>next.delete(id));
    else {
      if(next.size>=AUDIENCE_LIMIT){setError(`В общей аудитории максимум ${AUDIENCE_LIMIT} контактов. Уточните фильтр или создайте другую аудиторию.`);return;}
      next.add(row.lead.id);
    }
    await save([...next]);
  }
  async function addFiltered():Promise<void> {
    if(busy || mutation.current)return;
    setBusy(true);setError(null);
    mutation.current=true;
    try {
      const next=new Set(selected);
      let offset=0;
      while(true) {
        const result=await api.leadRadarContactDirectory({...filters,status,offset});
        if(!mounted.current)return;
        for(const row of result.rows) {
          if(!['blocked','conflict','contacted'].includes(row.status) && recipientContactChoices(row.lead).selectable
            && !(row.memberIds ?? row.sources.map((item)=>item.companyId)).some((id)=>next.has(id))) next.add(row.lead.id);
        }
        if(next.size>AUDIENCE_LIMIT){setError(`Найдено больше ${AUDIENCE_LIMIT} контактов. Уточните нишу или город. Частичный выбор не сохранён.`);return;}
        offset+=result.limit;
        if(offset>=result.total)break;
        setNotice(`Проверяем общую базу: ${offset}/${result.total}, выбрано ${next.size}…`);
      }
      mutation.current=false;
      await save([...next]);
    } catch(failure) {if(mounted.current)setError(errorCopy(failure));}
    finally {mutation.current=false;if(mounted.current)setBusy(false);}
  }
  const rows=(page?.rows ?? []).filter((row)=>status==='all' || row.status===status);
  return <section className="space-y-5" aria-label="Общая база Telegram" data-testid="telegram-contact-directory">
    <div className="rounded-2xl border border-brand-cyan/20 bg-[#091523] p-5 space-y-3">
      <h2 className="text-xl font-semibold">Мобильные и Telegram — все ниши</h2>
      <p className="text-sm text-white/80">Все компании с мобильным телефоном или публичным Telegram-username из сохранённых поисков. Стационарные номера, боты и известные личные профили исключены. Повторы объединены.</p>
      <p className="text-sm text-white/65">Подтверждённый контакт ещё не означает разрешение на рассылку. Основание, актуальность, история и запреты проверяются сервером перед отправкой.</p>
    </div>
    {error && <div role="alert" className="rounded-xl border border-rose-300/30 p-4 text-rose-100">{error}</div>}
    {pendingSelection && !busy && <p role="status" className="text-amber-100">Ваш выбор ({pendingSelection.length}) ещё не подтверждён сервером и остаётся в этой вкладке. <Button variant="secondary" onClick={()=>void save(pendingSelection,pendingName.current ?? draftName)}>Повторить сохранение выбора</Button></p>}
    {notice && <p role="status" className="text-sm text-brand-cyan">{notice}</p>}
    <div className="rounded-2xl border border-white/10 p-5 space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="min-w-64 flex-1"><Label htmlFor="audience-select">Сохранённая аудитория / её кампании</Label>
          <Select id="audience-select" value={detail?.audience.id ?? ''} disabled={busy || pendingSelection!==null} onChange={(event)=>{if(event.target.value)void openAudience(event.target.value);}}>
            <option value="">Создайте аудиторию или нажмите «Выбрать все»</option>{audiences.map((item)=><option key={item.id} value={item.id}>{item.name} · {item.companyIds.length} контактов</option>)}
          </Select></div>
        <Button variant="secondary" disabled={busy || pendingSelection!==null} onClick={()=>{setDetail(null);setComposer(false);setDraftName('Новая аудитория');createId.current=`aud_${crypto.randomUUID().replaceAll('-','')}`;}}>Новая аудитория</Button>
        {detail && <Button variant="secondary" disabled={busy} onClick={()=>void openAudience(detail.audience.id)}>Обновить аудиторию</Button>}
      </div>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1"><Label htmlFor="audience-name">Название</Label><Input id="audience-name" maxLength={100} value={draftName} disabled={busy} onChange={(event)=>setDraftName(event.target.value)} /></div>
        <Button disabled={busy || !draftName.trim()} onClick={()=>void save([...selected],draftName)}>{detail?'Сохранить название':'Создать аудиторию'}</Button>
      </div>
      {detail && <>
        <div className="flex flex-wrap gap-3 items-center"><strong>Выбрано {selected.size} контактов · версия {detail.audience.version}</strong>
          <Button variant="secondary" disabled={busy || selected.size===0} onClick={()=>void save([])}>Очистить выбор</Button>
          <Button disabled={busy} onClick={()=>setComposer((value)=>!value)}>{composer?'Скрыть подготовку':'Открыть кампанию аудитории'}</Button>
        </div>
        <p className="text-sm text-white/80">Выбор сохраняется на сервере и не сбрасывается фильтрами. В одной кампании — до 50 проверенных адресатов; остальные остаются в аудитории. Выбор мобильного номера ещё не подтверждает Telegram.</p>
        <details><summary className="cursor-pointer py-2">Выбранные компании из всех страниц ({selected.size})</summary>
          {detail.leads.map((lead)=><div key={lead.id} className="flex items-center justify-between gap-3 py-2 text-sm"><span>{lead.name} · {lead.city}</span><Button variant="ghost" disabled={busy} onClick={()=>void save([...selected].filter((id)=>id!==lead.id))}>Убрать</Button></div>)}
          {detail.missingCompanyIds.length>0 && <Button disabled={busy} onClick={()=>void save([...selected].filter((id)=>!detail.missingCompanyIds.includes(id)))}>Убрать удалённые записи ({detail.missingCompanyIds.length})</Button>}
        </details>
      </>}
    </div>
    {detail && <div hidden={!composer}><TelegramAccountCampaignPanel key={detail.audience.id} {...campaignProps}
      campaignOutreachEnabled={campaignProps.campaignOutreachEnabled && !refreshPending && pendingSelection===null && !busy}
      audience={{audienceId:detail.audience.id,audienceVersion:detail.audience.version}}
      leads={detail.leads} onContactsUpdated={()=>{setFilters((value)=>({...value}));void openAudience(detail.audience.id);}}
      initialSelectedLeadIds={detail.audience.companyIds} excludedRecipientIds={detail.excludedRecipientIds} /></div>}
    <details open={!composer} className="space-y-4 rounded-2xl border border-white/10 p-4"><summary className="cursor-pointer py-2 font-medium">Каталог контактов и фильтры</summary>
    <form className="flex flex-wrap gap-3 items-end" onSubmit={(event)=>{event.preventDefault();setFilters({q,category,city,offset:0});}}>
      <div className="flex-1 min-w-48"><Label htmlFor="directory-q">Компания / телефон / username</Label><Input id="directory-q" value={q} onChange={(event)=>setQ(event.target.value)} /></div>
      <div><Label htmlFor="directory-category">Ниша</Label><Select id="directory-category" value={category} onChange={(event)=>setCategory(event.target.value)}>
        <option value="">Все ниши</option>{[...new Set([...Object.keys(NICHE_LABELS), ...(page?.rows.map((row)=>row.lead.category) ?? []), category])].filter(Boolean).map((value)=><option key={value} value={value}>{NICHE_LABELS[value] ?? value}</option>)}
      </Select></div>
      <div><Label htmlFor="directory-city">Город</Label><Input id="directory-city" value={city} onChange={(event)=>setCity(event.target.value)} placeholder="Все города" /></div>
      <Button type="submit" disabled={loading || busy}>Применить</Button>
      <Button type="button" variant="secondary" disabled={loading || busy} onClick={()=>{setQ('');setCategory('');setCity('');setFilters({q:'',category:'',city:'',offset:0});}}>Сбросить</Button>
    </form>
    <div className="flex flex-wrap gap-3 justify-between items-end">
      <div><Label htmlFor="directory-status">Статус во всей базе</Label><Select id="directory-status" value={status} disabled={busy} onChange={(event)=>{setStatus(event.target.value);setFilters((value)=>({...value,offset:0}));}}><option value="all">Все статусы</option>{Object.entries(STATUS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</Select></div>
      <Button disabled={busy || loading} onClick={()=>void addFiltered()} aria-describedby="directory-bulk-help">{busy?'Сохраняем выбор…':'Выбрать все с мобильным или username'}</Button>
    </div>
    <p id="directory-bulk-help" className="text-sm text-white/80">Одна кнопка выбирает контакты из всех страниц с учётом фильтров и создаёт аудиторию при необходимости. Запреты, конфликты и уже контактированные компании не выбираются. Telegram и основание для отправки проверяются отдельно. Платный сбор и отправка не запускаются.</p>
    <div className="overflow-x-auto rounded-2xl border border-white/10" aria-busy={loading}>
      <table className="w-full text-left text-sm"><caption className="sr-only">Контакты из всех ниш: выбор, мобильные номера, Telegram и причины ограничения</caption><thead><tr className="bg-white/5"><th scope="col" className="p-3">Выбор</th><th scope="col">Компания / ниша</th><th scope="col">Мобильный / username</th><th scope="col">Проверка / история</th><th scope="col">Источники</th></tr></thead>
      <tbody>{rows.map((row)=><tr key={row.key} className="border-t border-white/10 align-top"><td className="p-3"><label className="inline-flex min-h-11 min-w-11 items-center justify-center"><input type="checkbox" aria-label={`Выбрать ${row.lead.name}`} checked={selectedInRow(row).length>0}
        className="h-6 w-6 accent-[#2fe6d1] focus-visible:ring-2 focus-visible:ring-brand-cyan" disabled={busy || loading || !detail || (!selectedInRow(row).length && (['blocked','conflict','contacted'].includes(row.status) || selected.size>=AUDIENCE_LIMIT))} onChange={()=>void toggle(row)} /></label></td>
        <td className="p-3"><strong>{row.lead.name}</strong><p className="text-white/60">{NICHE_LABELS[row.lead.category] ?? row.lead.category} · {row.lead.city}</p></td>
        <td className="p-3 break-words">{row.status==='blocked'?'Скрыто: не связываться':recipientContactSummary(row.lead) || 'Нужна проверка источника'}</td>
        <td className="p-3"><span className={row.status==='verified'?'text-brand-cyan':'text-amber-100'}>{STATUS[row.status]}</span>
          {!['blocked','conflict'].includes(row.status) && <ContactCandidates candidates={row.lead.contactCandidates} enrichment={row.lead.contactEnrichment} searchId={row.lead.searchId} companyId={row.lead.id}
            canCheck={campaignProps.telegramAccountEnabled} onResolved={()=>{setFilters((value)=>({...value}));if(detail)void openAudience(detail.audience.id);}} />}</td>
        <td className="p-3"><details><summary className="cursor-pointer">Найден {row.occurrences} раз</summary>{row.sources.map((source)=><button type="button" className="block py-2 text-brand-cyan" key={source.companyId} onClick={()=>onOpenSearch(source.searchId)}>{source.name} · {source.category} · {source.city}</button>)}
          {row.occurrences>row.sources.length && <p>Показаны последние 50 источников.</p>}</details></td></tr>)}</tbody></table>
      {!loading && rows.length===0 && <p className="p-6 text-white/80">В выбранном фильтре нет мобильных телефонов или публичных Telegram-username. Попробуйте «Все статусы» или другую нишу.</p>}
    </div>
    <div className="flex items-center justify-between gap-3"><Button variant="secondary" disabled={loading || busy || !page || page.offset===0} onClick={()=>setFilters((value)=>({...value,offset:Math.max(0,value.offset-20)}))}>Назад</Button>
      <span className="text-sm text-white/60">{loading?'Загружаем…':`${page?.total ?? 0} уникальных контактов · страница ${Math.floor((page?.offset ?? 0)/20)+1}`}</span>
      <Button variant="secondary" disabled={loading || busy || !page || page.offset+page.limit>=page.total} onClick={()=>setFilters((value)=>({...value,offset:value.offset+20}))}>Далее</Button></div>
    </details>
  </section>;
}
