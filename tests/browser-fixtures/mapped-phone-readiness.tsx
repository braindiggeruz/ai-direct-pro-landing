// Synthetic UI only. No real contacts, source requests, campaigns or messages.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {CampaignReadiness} from '../../src/admin/components/lead-radar/CampaignReadiness';
import {api} from '../../src/admin/lib/api';
import type {LeadRadarLead} from '../../src/shared/lead-radar';
import '../../src/index.css';
const checked=new Set<string>();
const leads=[1,2].map(i=>({id:`mapped_fixture_${i}`,searchId:'mapped_fixture',name:`Вымышленная клиника ${i}`,
  website:null,phone:`+99890123456${i}`,country:'UZ',suppressed:false,lifecycle:'new',telegramContact:null,
  contactCandidates:[{key:`phone:+99890123456${i}`,kind:'phone',phoneType:'mobile',value:`+99890123456${i}`,
    ownership:'company',lookupEligible:true,reason:'mobile_unverified',sourceUrl:'https://www.openstreetmap.org/node/123456',evidenceIds:['fixture'],observedAt:'2026-03-07T00:00:00Z'}],
})) as LeadRadarLead[];
api.leadRadarResolveContact=async(_search,id)=>{checked.add(id);return id==='mapped_fixture_1'
  ?{status:'unresolved',username:null,reason:'privacy_or_missing',retryAfterSeconds:null}
  :{status:'resolved',username:null,peerRef:`lrpeer:${'c'.repeat(32)}`,reason:'regular_user_resolved',retryAfterSeconds:null};};
api.leadRadarCampaignPreflight=async ids=>{
  const verified=ids.filter(id=>id==='mapped_fixture_2' && checked.has(id));
  return {checkedAt:new Date().toISOString(),blockers:[],selection:{selected:ids.length,verified:verified.length,automatic:0,
    manual:verified.length,excluded:ids.length-verified.length,verifiedCompanyIds:verified,automaticCompanyIds:[],
    items:ids.map(id=>({companyId:id,name:leads.find(lead=>lead.id===id)!.name,classification:verified.includes(id)?'manual':'excluded',
      reasonCode:verified.includes(id)?'documented_basis_required':'no_verified_corporate_endpoint',authorization:null}))}};
};
window.fetch=async()=>{throw new Error('Synthetic fixture forbids network access');};
createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-3xl p-5">
  <p>Локальный тест: два вымышленных мобильных номера без сайта и username. Реальных отправок 0.</p>
  <CampaignReadiness scope="mapped-phones-fixture" leads={leads} basis="" canCheck disabled={false} revision={0}
    onSnapshot={()=>{}} onSelectReady={()=>{}} />
</main>);
