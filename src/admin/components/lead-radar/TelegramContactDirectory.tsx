import { useCallback,useEffect,useRef,useState } from 'react';
import { api } from '../../lib/api';
import { Button,Input,Label,Select } from '../ui';
import { TelegramAccountCampaignPanel,type TelegramAccountCampaignPanelProps } from './TelegramAccountCampaignPanel';
import { AUDIENCE_LIMIT,type AudienceDetail,type ContactDirectoryPage,type ContactDirectoryRow,
  type LeadRadarAudience } from '../../../shared/lead-radar-audiences';

const STATUS = {verified:'Подтверждён · нужно основание',review:'Нужна проверка',conflict:'Общий контакт разных компаний',contacted:'Уже писали / исход требует проверки',blocked:'Не связываться'};
function errorCopy(error:unknown):string {
  const code=(error as {code?:string})?.code;
  if (code==='audience_version_conflict') return 'Аудитория изменилась в другой вкладке. Нажмите «Обновить аудиторию», затем повторите выбор.';
  if (code==='audience_contact_blocked_or_conflicted') return 'Один из контактов запрещён или принадлежит разным компаниям. Обновите список и проверьте источник.';
  if (code==='audience_duplicate_contact') return 'Этот Telegram уже есть в аудитории под другой компанией. Один получатель — одно сообщение.';
  if (code==='audience_members_unavailable') return 'Часть контактов изменилась или удалена. Обновите аудиторию и уберите недоступные записи.';
  if (code==='audience_schema_unavailable') return 'Общая база ещё не готова на сервере. Существующие поиски сохранены; повторите обновление позже.';
  return 'Не удалось подтвердить изменение на сервере. Выбор не считается сохранённым; обновите аудиторию перед повтором.';
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
  const mutation=useRef(false);
  const mounted=useRef(true);
  const readEpoch=useRef(0);
  const createId=useRef(`aud_${crypto.randomUUID().replaceAll('-','')}`);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{
    let active=true;
    setLoading(true);setError(null);
    api.leadRadarContactDirectory(filters).then((next)=>{if(active)setPage(next);})
      .catch((failure)=>{if(active)setError(errorCopy(failure));})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[filters]);
  const openAudience=useCallback(async(id:string)=>{
    const epoch=++readEpoch.current;
    setBusy(true);setError(null);setComposer(false);
    try {
      const next=await api.leadRadarAudience(id);
      if(mounted.current && readEpoch.current===epoch) {
        setDetail(next);setDraftName(next.audience.name);
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
    mutation.current=true;setBusy(true);setError(null);setNotice(null);setComposer(false);
    ++readEpoch.current;
    try {
      const saved=await api.leadRadarSaveAudience({id:detail?.audience.id ?? createId.current,name,
        version:detail?.audience.version ?? 0,companyIds:ids});
      const fresh=await api.leadRadarAudience(saved.id);
      if(!mounted.current)return;
      setDetail(fresh);setDraftName(saved.name);
      setAudiences((current)=>[saved,...current.filter((item)=>item.id!==saved.id)]);
      setNotice(`Сохранено на сервере: ${saved.companyIds.length}/${AUDIENCE_LIMIT}. Отправка не запускалась.`);
      const url=new URL(window.location.href);url.searchParams.set('audience',saved.id);window.history.replaceState(null,'',url);
    } catch(failure) {if(mounted.current)setError(errorCopy(failure));}
    finally {mutation.current=false;if(mounted.current)setBusy(false);}
  }
  const selected=new Set(detail?.audience.companyIds ?? []);
  function selectedInRow(row:ContactDirectoryRow):string[] {
    return [row.lead.id,...row.sources.map((source)=>source.companyId)].filter((id)=>selected.has(id));
  }
  async function toggle(row:ContactDirectoryRow):Promise<void> {
    if(busy || !detail)return;
    const current=selectedInRow(row);
    const next=new Set(selected);
    if(current.length)current.forEach((id)=>next.delete(id));
    else {
      if(next.size>=AUDIENCE_LIMIT){setError('В аудитории максимум 50 получателей. Создайте отдельную аудиторию для следующей кампании.');return;}
      next.add(row.lead.id);
    }
    await save([...next]);
  }
  async function addFiltered():Promise<void> {
    if(busy || !detail || mutation.current)return;
    setBusy(true);setError(null);setComposer(false);
    mutation.current=true;
    try {
      const next=new Set(selected);
      let offset=0;
      while(next.size<AUDIENCE_LIMIT) {
        const result=await api.leadRadarContactDirectory({...filters,offset});
        if(!mounted.current)return;
        for(const row of result.rows) {
          if(row.status==='verified' && !row.sources.some((item)=>next.has(item.companyId)) && next.size<AUDIENCE_LIMIT)next.add(row.lead.id);
        }
        offset+=result.limit;
        if(offset>=result.total)break;
        setNotice(`Проверяем общую базу: ${offset}/${result.total}, выбрано ${next.size}/50…`);
      }
      mutation.current=false;
      await save([...next]);
    } catch(failure) {if(mounted.current)setError(errorCopy(failure));}
    finally {mutation.current=false;if(mounted.current)setBusy(false);}
  }
  const rows=(page?.rows ?? []).filter((row)=>status==='all' || row.status===status);
  return <section className="space-y-5" aria-label="Общая база Telegram" data-testid="telegram-contact-directory">
    <div className="rounded-2xl border border-brand-cyan/20 bg-[#091523] p-5 space-y-3">
      <h2 className="text-xl font-semibold">Все Telegram-контакты</h2>
      <p className="text-sm text-white/65">Из всех сохранённых поисков, без повторного сбора и расхода Firecrawl. Один Telegram — одна строка. Обычные телефоны, боты, группы и личные профили сюда не попадают.</p>
      <p className="text-sm text-white/65">Подтверждённый контакт ещё не означает разрешение на рассылку. Основание, актуальность, история и запреты проверяются сервером перед отправкой.</p>
    </div>
    {error && <div role="alert" className="rounded-xl border border-rose-300/30 p-4 text-rose-100">{error}</div>}
    {notice && <p role="status" className="text-sm text-brand-cyan">{notice}</p>}
    <div className="rounded-2xl border border-white/10 p-5 space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="min-w-64 flex-1"><Label htmlFor="audience-select">Сохранённая аудитория / её кампании</Label>
          <Select id="audience-select" value={detail?.audience.id ?? ''} disabled={busy} onChange={(event)=>{if(event.target.value)void openAudience(event.target.value);}}>
            <option value="">Создайте аудиторию</option>{audiences.map((item)=><option key={item.id} value={item.id}>{item.name} · {item.companyIds.length}/50</option>)}
          </Select></div>
        <Button variant="secondary" disabled={busy} onClick={()=>{setDetail(null);setComposer(false);setDraftName('Новая аудитория');createId.current=`aud_${crypto.randomUUID().replaceAll('-','')}`;}}>Новая аудитория</Button>
        {detail && <Button variant="secondary" disabled={busy} onClick={()=>void openAudience(detail.audience.id)}>Обновить аудиторию</Button>}
      </div>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1"><Label htmlFor="audience-name">Название</Label><Input id="audience-name" maxLength={100} value={draftName} disabled={busy} onChange={(event)=>setDraftName(event.target.value)} /></div>
        <Button disabled={busy || !draftName.trim()} onClick={()=>void save([...selected],draftName)}>{detail?'Сохранить название':'Создать аудиторию'}</Button>
      </div>
      {detail && <>
        <div className="flex flex-wrap gap-3 items-center"><strong>Выбрано {selected.size}/50 · версия {detail.audience.version}</strong>
          <Button variant="secondary" disabled={busy || selected.size===0} onClick={()=>void save([])}>Очистить выбор</Button>
          <Button disabled={busy} onClick={()=>setComposer((value)=>!value)}>{composer?'Скрыть подготовку':'Открыть кампанию аудитории'}</Button>
        </div>
        <p className="text-xs text-white/60">Каждое изменение сохраняется на сервере. Фильтры и страницы не сбрасывают выбор. Новая кампания не запускается без отдельного подтверждения.</p>
        <details><summary className="cursor-pointer py-2">Выбранные компании из всех страниц ({selected.size})</summary>
          {detail.leads.map((lead)=><div key={lead.id} className="flex items-center justify-between gap-3 py-2 text-sm"><span>{lead.name} · {lead.city}</span><Button variant="ghost" disabled={busy} onClick={()=>void save([...selected].filter((id)=>id!==lead.id))}>Убрать</Button></div>)}
          {detail.missingCompanyIds.length>0 && <Button disabled={busy} onClick={()=>void save([...selected].filter((id)=>!detail.missingCompanyIds.includes(id)))}>Убрать удалённые записи ({detail.missingCompanyIds.length})</Button>}
        </details>
      </>}
    </div>
    <form className="flex flex-wrap gap-3 items-end" onSubmit={(event)=>{event.preventDefault();setFilters({q,category,city,offset:0});}}>
      <div className="flex-1 min-w-48"><Label htmlFor="directory-q">Компания / username</Label><Input id="directory-q" value={q} onChange={(event)=>setQ(event.target.value)} /></div>
      <div><Label htmlFor="directory-category">Категория (точно как в карточке)</Label><Input id="directory-category" value={category} onChange={(event)=>setCategory(event.target.value)} placeholder="Все ниши" /></div>
      <div><Label htmlFor="directory-city">Город</Label><Input id="directory-city" value={city} onChange={(event)=>setCity(event.target.value)} placeholder="Все города" /></div>
      <Button type="submit" disabled={loading || busy}>Применить</Button>
      <Button type="button" variant="secondary" disabled={loading || busy} onClick={()=>{setQ('');setCategory('');setCity('');setFilters({q:'',category:'',city:'',offset:0});}}>Сбросить</Button>
    </form>
    <div className="flex flex-wrap gap-3 justify-between items-end">
      <div><Label htmlFor="directory-status">Статус на этой странице</Label><Select id="directory-status" value={status} onChange={(event)=>setStatus(event.target.value)}><option value="all">Все статусы</option>{Object.entries(STATUS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</Select></div>
      <Button disabled={busy || loading || !detail || selected.size>=50} onClick={()=>void addFiltered()}>Добавить подтверждённые из всех страниц (до 50)</Button>
    </div>
    <p className="text-xs text-white/60">Массовый выбор учитывает нишу, город и строку поиска; берёт только подтверждённые контакты, которым ещё не писали. Статусный фильтр выше меняет только отображение текущей страницы.</p>
    <div className="overflow-x-auto rounded-2xl border border-white/10" aria-busy={loading}>
      <table className="w-full text-left text-sm"><thead><tr className="bg-white/5"><th className="p-3">Выбор</th><th>Компания / ниша</th><th>Telegram</th><th>Проверка / история</th><th>Источники</th></tr></thead>
      <tbody>{rows.map((row)=><tr key={row.key} className="border-t border-white/10 align-top"><td className="p-3"><input type="checkbox" aria-label={`Выбрать ${row.lead.name}`} checked={selectedInRow(row).length>0}
        disabled={busy || loading || !detail || (!selectedInRow(row).length && (row.status!=='verified' || selected.size>=50))} onChange={()=>void toggle(row)} /></td>
        <td className="p-3"><strong>{row.lead.name}</strong><p className="text-white/60">{row.lead.category} · {row.lead.city}</p></td>
        <td className="p-3">{row.lead.telegramContact?<a className="text-brand-cyan" href={`https://t.me/${row.lead.telegramContact.username}`} target="_blank" rel="noreferrer">@{row.lead.telegramContact.username}</a>:'Скрыт'}</td>
        <td className="p-3"><span className={row.status==='verified'?'text-brand-cyan':'text-amber-100'}>{STATUS[row.status]}</span></td>
        <td className="p-3"><details><summary className="cursor-pointer">Найден {row.occurrences} раз</summary>{row.sources.map((source)=><button type="button" className="block py-2 text-brand-cyan" key={source.companyId} onClick={()=>onOpenSearch(source.searchId)}>{source.name} · {source.category} · {source.city}</button>)}
          {row.occurrences>row.sources.length && <p>Показаны последние 50 источников.</p>}</details></td></tr>)}</tbody></table>
      {!loading && rows.length===0 && <p className="p-6 text-white/60">{page?.total ? 'На этой странице нет контактов с выбранным статусом.' : 'В сохранённых результатах нет подходящих публичных Telegram-контактов. Подключение аккаунта не создаёт контакты само по себе.'}</p>}
    </div>
    <div className="flex items-center justify-between gap-3"><Button variant="secondary" disabled={loading || busy || !page || page.offset===0} onClick={()=>setFilters((value)=>({...value,offset:Math.max(0,value.offset-20)}))}>Назад</Button>
      <span className="text-sm text-white/60">{loading?'Загружаем…':`${page?.total ?? 0} уникальных контактов · страница ${Math.floor((page?.offset ?? 0)/20)+1}`}</span>
      <Button variant="secondary" disabled={loading || busy || !page || page.offset+page.limit>=page.total} onClick={()=>setFilters((value)=>({...value,offset:value.offset+20}))}>Далее</Button></div>
    {composer && detail && <TelegramAccountCampaignPanel key={`${detail.audience.id}:${detail.audience.version}`} {...campaignProps}
      audience={{audienceId:detail.audience.id,audienceVersion:detail.audience.version}}
      leads={detail.leads} initialSelectedLeadIds={detail.audience.companyIds} />}
  </section>;
}
