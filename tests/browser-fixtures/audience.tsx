// Local-only interactive fixture. Vite build does NOT include this entry.
// No authenticated API, Firecrawl or Telegram request is allowed here.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { TelegramContactDirectory } from '../../src/admin/components/lead-radar/TelegramContactDirectory';
import { api } from '../../src/admin/lib/api';
import type { ContactDirectoryRow,LeadRadarAudience } from '../../src/shared/lead-radar-audiences';
import '../../src/index.css';

const rows:ContactDirectoryRow[]=Array.from({length:63},(_,i)=>{
  const id=`fixture_${i}`;
  const stamp=new Date().toISOString();
  const mobileOnly=i%2===1;
  return {key:id,status:i===0?'blocked':i===2?'conflict':i===3?'contacted':mobileOnly?'review':'verified',occurrences:i===4?5:1,
    sources:[{companyId:id,searchId:`search_${i}`,name:`Клиника ${i}`,category:i%2?'salon':'dentist',city:'Ташкент'}],
    lead:{id,searchId:`search_${i}`,name:`Клиника ${i}`,category:i%2?'salon':'dentist',city:'Ташкент',country:'UZ',address:null,website:`https://fixture${i}.example`,phone:mobileOnly?`+99890${String(1234500+i)}`:null,genericEmail:null,
      telegramUrl:mobileOnly?null:`https://t.me/fixture_${i}`,telegramContact:mobileOnly?null:{url:`https://t.me/fixture_${i}`,username:`fixture_${i}`,type:'business',confidence:.95,reason:'Fixture',evidenceIds:[],verifiedAt:stamp,messageable:false},
      decisionMakers:[],contactCandidates:[],enrichmentStatus:'terminal',enrichmentReason:'no_relevant_evidence',enrichmentAttempts:1,score:60,confidence:.95,priority:'P3',lifecycle:'new',suppressed:i===0,scoreComponents:[],signals:[],evidence:[],discoveredAt:stamp,lastVerifiedAt:stamp}};
});
const key='lead-radar-mobile-audience-ui-fixture-only-v2';
const read=():LeadRadarAudience[]=>JSON.parse(sessionStorage.getItem(key) ?? '[]');
let failRead = false;
let loseWriteResponse = false;
let networkDown = new URLSearchParams(window.location.search).get('network')==='down';
api.leadRadarAudiences=async()=>{if(networkDown)throw new TypeError('Simulated network failure');return {audiences:read()};};
api.leadRadarContactDirectory=async(filters={})=>{
  if(networkDown)throw new TypeError('Simulated network failure');
  const matches=rows.filter((row)=>(!filters.q || row.lead.name.includes(filters.q))&&(!filters.category || row.lead.category===filters.category)&&(!filters.city || row.lead.city===filters.city)&&(!filters.status || filters.status==='all' || row.status===filters.status));
  return {rows:matches.slice(filters.offset ?? 0,(filters.offset ?? 0)+20),total:matches.length,offset:filters.offset ?? 0,limit:20};
};
api.leadRadarSaveAudience=async(input)=>{
  const all=read();const previous=all.find((item)=>item.id===input.id);
  if(previous && previous.version!==input.version)throw Object.assign(new Error('conflict'),{code:'audience_version_conflict'});
  const saved={...input,version:input.version+1,createdAt:previous?.createdAt ?? new Date().toISOString(),updatedAt:new Date().toISOString()};
  sessionStorage.setItem(key,JSON.stringify([saved,...all.filter((item)=>item.id!==input.id)]));
  if(loseWriteResponse){loseWriteResponse=false;throw new TypeError('Simulated lost response');}
  return saved;
};
api.leadRadarAudience=async(id)=>{
  if(failRead){failRead=false;throw Object.assign(new Error('Simulated failed read'),{status:503,code:'audience_unavailable'});}
  const audience=read().find((item)=>item.id===id)!;
  return {audience,leads:rows.filter((row)=>audience.companyIds.includes(row.lead.id)).map((row)=>row.lead),missingCompanyIds:[]};
};
api.leadRadarTelegramCampaignRecovery=async()=>({active:null,latest:null});
window.fetch=async()=>{throw new Error('Fixture forbids network API requests');};
createRoot(document.getElementById('root')!).render(<React.StrictMode><main className="p-5 mx-auto max-w-7xl"><p className="text-amber-100 mb-4">Локальный тест · вымышленные контакты · отправка отключена</p>
  <button className="min-h-12 p-3" onClick={()=>{failRead=true;}}>Следующее чтение: ошибка</button>
  <button className="min-h-12 p-3" onClick={()=>{loseWriteResponse=true;}}>Следующий ответ сохранения: потерян</button>
  <button className="min-h-12 p-3" onClick={()=>{networkDown=false;}}>Восстановить тестовую сеть</button>
  <TelegramContactDirectory
  initialTemplate="Здравствуйте! Согласованный пример для {company_name}."
  telegramAccountEnabled={false} campaignOutreachEnabled={false} campaignAutoSendEnabled={false}
  telegramCampaignDailyLimit={30} telegramCampaignMinimumIntervalSeconds={120}
  onOpenSearch={()=>{}} /></main></React.StrictMode>);
