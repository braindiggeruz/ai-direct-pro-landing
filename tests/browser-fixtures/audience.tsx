// Local-only interactive fixture. Vite build does NOT include this entry.
// No authenticated API, Firecrawl or Telegram request is allowed here.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { TelegramContactDirectory } from '../../src/admin/components/lead-radar/TelegramContactDirectory';
import { api } from '../../src/admin/lib/api';
import type { ContactDirectoryRow,LeadRadarAudience } from '../../src/shared/lead-radar-audiences';
import '../../src/index.css';

const rows:ContactDirectoryRow[]=Array.from({length:26},(_,i)=>{
  const id=`fixture_${i}`;
  const stamp=new Date().toISOString();
  return {key:id,status:i===0?'blocked':i===1?'review':i===2?'conflict':i===3?'contacted':'verified',occurrences:i===4?5:1,
    sources:[{companyId:id,searchId:`search_${i}`,name:`Клиника ${i}`,category:i%2?'salon':'dentist',city:'Ташкент'}],
    lead:{id,searchId:`search_${i}`,name:`Клиника ${i}`,category:i%2?'salon':'dentist',city:'Ташкент',country:'UZ',address:null,website:`https://fixture${i}.example`,phone:null,genericEmail:null,
      telegramUrl:`https://t.me/fixture_${i}`,telegramContact:{url:`https://t.me/fixture_${i}`,username:`fixture_${i}`,type:'business',confidence:.95,reason:'Fixture',evidenceIds:[],verifiedAt:stamp,messageable:false},
      decisionMakers:[],contactCandidates:[],enrichmentStatus:'terminal',enrichmentReason:'no_relevant_evidence',enrichmentAttempts:1,score:60,confidence:.95,priority:'P3',lifecycle:'new',suppressed:i===0,scoreComponents:[],signals:[],evidence:[],discoveredAt:stamp,lastVerifiedAt:stamp}};
});
const key='lead-radar-audience-ui-fixture-only';
const read=():LeadRadarAudience[]=>JSON.parse(sessionStorage.getItem(key) ?? '[]');
api.leadRadarAudiences=async()=>({audiences:read()});
api.leadRadarContactDirectory=async(filters={})=>{
  const matches=rows.filter((row)=>(!filters.q || row.lead.name.includes(filters.q))&&(!filters.category || row.lead.category===filters.category)&&(!filters.city || row.lead.city===filters.city));
  return {rows:matches.slice(filters.offset ?? 0,(filters.offset ?? 0)+20),total:matches.length,offset:filters.offset ?? 0,limit:20};
};
api.leadRadarSaveAudience=async(input)=>{
  const all=read();const previous=all.find((item)=>item.id===input.id);
  if(previous && previous.version!==input.version)throw Object.assign(new Error('conflict'),{code:'audience_version_conflict'});
  const saved={...input,version:input.version+1,createdAt:previous?.createdAt ?? new Date().toISOString(),updatedAt:new Date().toISOString()};
  sessionStorage.setItem(key,JSON.stringify([saved,...all.filter((item)=>item.id!==input.id)]));return saved;
};
api.leadRadarAudience=async(id)=>{
  const audience=read().find((item)=>item.id===id)!;
  return {audience,leads:rows.filter((row)=>audience.companyIds.includes(row.lead.id)).map((row)=>row.lead),missingCompanyIds:[]};
};
api.leadRadarTelegramCampaignRecovery=async()=>({active:null,latest:null});
window.fetch=async()=>{throw new Error('Fixture forbids network API requests');};
createRoot(document.getElementById('root')!).render(<React.StrictMode><main className="p-5 mx-auto max-w-7xl"><p className="text-amber-100 mb-4">Локальный тест · вымышленные контакты · отправка отключена</p><TelegramContactDirectory
  initialTemplate="Здравствуйте! Согласованный пример для {company_name}."
  telegramAccountEnabled={false} campaignOutreachEnabled={false} campaignAutoSendEnabled={false}
  telegramCampaignDailyLimit={30} telegramCampaignMinimumIntervalSeconds={120}
  onOpenSearch={()=>{}} /></main></React.StrictMode>);
