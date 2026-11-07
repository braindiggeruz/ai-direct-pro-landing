import type { LeadRadarInboxEvent, LeadRadarInboxClassification, LeadRadarInboxItem } from '../../../src/shared/lead-radar-inbox';
import { encryptTelegramCampaignSecret, decryptTelegramCampaignSecret } from './telegram-campaign-crypto';
import { LeadRadarStore } from './store';
import { OutreachInboxStore, type OutreachInboxRow } from './outreach-inbox-store';

const MAX_BODY_BYTES = 16_384;
const BODY_TTL_MS = 7 * 24 * 60 * 60_000;
const ORG = /^(?:owner_[a-f0-9]{24}|org_[a-f0-9]{32,64})$/u;
const EVENT_ID = /^lrinb_[a-f0-9]{32}$/u;
const ENCODER = new TextEncoder();
export class OutreachInboxError extends Error {
  constructor(readonly code: 'inbox_invalid_event'|'inbox_conflict'|'inbox_effect_unavailable'|'inbox_unavailable'|'inbox_not_found'|'inbox_invalid_cursor'|'inbox_invalid_classification'|'inbox_suppression_pending', readonly status=400) { super(code); }
}

function record(value: unknown): value is Record<string,unknown> { return value!==null && typeof value==='object' && !Array.isArray(value); }
export function parseOutreachInboxEvent(value: unknown, now=new Date()): LeadRadarInboxEvent {
  const keys=['schemaVersion','orgId','accountId','outboundEffectId','externalEventId','kind','occurredAt','text'];
  if (!record(value) || Object.keys(value).some((key)=>!keys.includes(key))
    || value.schemaVersion!==1 || typeof value.orgId!=='string' || !ORG.test(value.orgId)
    || typeof value.accountId!=='string' || !/^lrtgua_[a-f0-9]{32}$/u.test(value.accountId)
    || typeof value.outboundEffectId!=='string' || !/^lrtgce_[a-f0-9]{32}$/u.test(value.outboundEffectId)
    || typeof value.externalEventId!=='string' || !/^[A-Za-z0-9:_-]{1,160}$/u.test(value.externalEventId)
    || (value.kind!=='reply' && value.kind!=='opt_out')
    || typeof value.occurredAt!=='string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u.test(value.occurredAt)
    || !Number.isFinite(Date.parse(value.occurredAt)) || Date.parse(value.occurredAt)>now.getTime()+5*60_000
    || (value.text!==undefined && (typeof value.text!=='string' || [...value.text].length>4096 || ENCODER.encode(value.text).byteLength>MAX_BODY_BYTES || value.text.includes('\u0000')))) {
    throw new OutreachInboxError('inbox_invalid_event');
  }
  return { schemaVersion:1, orgId:value.orgId, accountId:value.accountId, outboundEffectId:value.outboundEffectId,
    externalEventId:value.externalEventId,kind:value.kind,occurredAt:new Date(value.occurredAt).toISOString(),
    ...(typeof value.text==='string' && value.text.length>0 ? {text:value.text} : {}) };
}

async function sha256(value: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',ENCODER.encode(value)))].map((b)=>b.toString(16).padStart(2,'0')).join('');
}
async function fingerprint(dataKey: string, value: string): Promise<string> {
  // A keyed digest prevents offline guessing of short/private reply text.
  if (!/^[A-Za-z0-9_-]{43}$/u.test(dataKey)) throw new OutreachInboxError('inbox_unavailable',503);
  const raw=Uint8Array.from(atob(dataKey.replaceAll('-','+').replaceAll('_','/')+'='),(c)=>c.charCodeAt(0));
  const root=await crypto.subtle.importKey('raw',raw,'HKDF',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:ENCODER.encode('gptbot.outreach-inbox.v1'),info:ENCODER.encode('payload-fingerprint')},root,{name:'HMAC',hash:'SHA-256',length:256},false,['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,ENCODER.encode(value)))].map((b)=>b.toString(16).padStart(2,'0')).join('');
}
const scope=(orgId:string,id:string)=>`outreach-inbox:${orgId}:${id}`;

async function applyEvent(db:D1Database,row:OutreachInboxRow,now:Date):Promise<void> {
  if(row.workflow_state==='applied') return;
  const store=new OutreachInboxStore(db);
  if(row.kind==='reply') { await store.applyReply(row,now.toISOString()); return; }
  // This is the existing org-wide alias closure (canonical/domain/phone/name),
  // not a local lifecycle shortcut. Pending remains a durable dispatch barrier
  // across crashes both before and after the DNC batch.
  const suppressed=await new LeadRadarStore(db).updateLifecycle(row.org_id,row.company_id,'do_not_contact',now.toISOString());
  if(!suppressed || !await store.finishOptOut(row,now.toISOString())) throw new OutreachInboxError('inbox_suppression_pending',503);
}

export async function ingestOutreachInboxEvent(input:{db:D1Database;dataKey:string;event:unknown;now?:Date}):Promise<{id:string;replayed:boolean;workflowState:'applied'}> {
  const now=input.now??new Date(),event=parseOutreachInboxEvent(input.event,now),store=new OutreachInboxStore(input.db);
  if(!await store.hasSchema()) throw new OutreachInboxError('inbox_unavailable',503);
  const externalDigest=await sha256(JSON.stringify([event.orgId,event.accountId,event.externalEventId]));
  const id=`lrinb_${externalDigest.slice(0,32)}`;
  const digest=await fingerprint(input.dataKey,JSON.stringify(event));
  let row=await store.get(event.orgId,id),inserted=false;
  if(!row) {
    const expiresAt=new Date(Math.min(now.getTime(),Date.parse(event.occurredAt))+BODY_TTL_MS).toISOString();
    const encrypted=event.text && expiresAt>now.toISOString()
      ? await encryptTelegramCampaignSecret(input.dataKey,scope(event.orgId,id),event.text) : null;
    inserted=await store.insert({id,org_id:event.orgId,account_id:event.accountId,outbound_effect_id:event.outboundEffectId,
      external_event_digest:externalDigest,payload_digest:digest,kind:event.kind,occurred_at:event.occurredAt,received_at:now.toISOString(),
      body_ciphertext:encrypted?.ciphertext??null,body_iv:encrypted?.iv??null,body_present:event.text?1:0,body_expires_at:expiresAt});
    row=await store.get(event.orgId,id);
  }
  if(!row) throw new OutreachInboxError('inbox_effect_unavailable',404);
  if(row.payload_digest!==digest) throw new OutreachInboxError('inbox_conflict',409);
  await applyEvent(input.db,row,now);
  await store.purgeExpiredBodies(event.orgId,now.toISOString());
  return {id,replayed:!inserted,workflowState:'applied'};
}

/** Idempotent recovery for pending replies/opt-outs, plus bounded body deletion.
 * The runtime owner calls this even while the ingress flag is off. */
export async function maintainOutreachInbox(input:{db:D1Database;orgId:string;now?:Date;limit?:number}):Promise<{applied:number;pending:number;purgedBodies:number}> {
  if(!ORG.test(input.orgId)) throw new OutreachInboxError('inbox_invalid_event');
  const now=input.now??new Date(),store=new OutreachInboxStore(input.db);
  if(!await store.hasSchema()) throw new OutreachInboxError('inbox_unavailable',503);
  let applied=0,pending=0;
  for(const row of await store.pending(input.orgId,Math.max(1,Math.min(50,Math.floor(input.limit??20))))) {
    try { await applyEvent(input.db,row,now); applied++; } catch { pending++; }
  }
  return {applied,pending,purgedBodies:await store.purgeExpiredBodies(input.orgId,now.toISOString())};
}

function parseCursor(value:string|undefined):{receivedAt:string;id:string}|null {
  if(!value) return null;
  try {
    if(value.length>256 || !/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error();
    const [receivedAt,id]=JSON.parse(atob(value.replaceAll('-','+').replaceAll('_','/')));
    if(typeof receivedAt!=='string' || new Date(receivedAt).toISOString()!==receivedAt || typeof id!=='string' || !EVENT_ID.test(id)) throw new Error();
    return {receivedAt,id};
  } catch { throw new OutreachInboxError('inbox_invalid_cursor'); }
}

export async function listOutreachInbox(input:{db:D1Database;orgId:string;dataKey?:string;cursor?:string;limit?:number;now?:Date}):Promise<{items:LeadRadarInboxItem[];nextCursor:string|null}> {
  if(!ORG.test(input.orgId)) throw new OutreachInboxError('inbox_invalid_event');
  const limit=input.limit??20;
  if(!Number.isInteger(limit) || limit<1 || limit>50) throw new OutreachInboxError('inbox_invalid_cursor');
  const now=(input.now??new Date()).toISOString(),store=new OutreachInboxStore(input.db);
  if(!await store.hasSchema()) throw new OutreachInboxError('inbox_unavailable',503);
  const rows=await store.list(input.orgId,parseCursor(input.cursor),limit+1),page=rows.slice(0,limit);
  const items=await Promise.all(page.map(async(row):Promise<LeadRadarInboxItem>=>{
    let text:string|null=null,bodyState:LeadRadarInboxItem['bodyState']=!row.body_present?'not_provided':row.body_expires_at<=now?'expired':'unavailable';
    if(row.body_expires_at>now && row.body_ciphertext && row.body_iv && input.dataKey) {
      try { text=await decryptTelegramCampaignSecret(input.dataKey,scope(input.orgId,row.id),{ciphertext:row.body_ciphertext,iv:row.body_iv});bodyState='available'; } catch { /* No ciphertext, key or reply text in logs/errors. */ }
    }
    return {id:row.id,companyId:row.company_id,companyName:row.company_name,campaignId:row.campaign_id,kind:row.kind,
      occurredAt:row.occurred_at,receivedAt:row.received_at,classification:row.classification,workflowState:row.workflow_state,text,bodyState,suppressed:row.suppressed===1};
  }));
  const last=page.at(-1);
  return {items,nextCursor:rows.length>limit && last ? btoa(JSON.stringify([last.received_at,last.id])).replaceAll('+','-').replaceAll('/','_').replace(/=+$/u,'') : null};
}

export async function classifyOutreachInbox(input:{db:D1Database;orgId:string;id:unknown;classification:unknown;now?:Date}):Promise<{ok:true}> {
  if(!ORG.test(input.orgId) || typeof input.id!=='string' || !EVENT_ID.test(input.id)
    || !['needs_reply','interested','declined','handled'].includes(String(input.classification))) throw new OutreachInboxError('inbox_invalid_classification');
  if(!await new OutreachInboxStore(input.db).classify(input.orgId,input.id,input.classification as LeadRadarInboxClassification,(input.now??new Date()).toISOString())) throw new OutreachInboxError('inbox_not_found',404);
  return {ok:true};
}
