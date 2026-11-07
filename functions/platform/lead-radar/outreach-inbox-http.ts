import type { Env } from '../../_types';
import { ownerError, ownerJson } from '../admin/http';
import { isLeadRadarOrganizationAllowed } from './capabilities';
import { ingestOutreachInboxEvent, OutreachInboxError, parseOutreachInboxEvent } from './outreach-inbox';

const MAX_REQUEST_BYTES=24_576;
export async function readOutreachInboxJson(request:Request):Promise<unknown> {
  if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new OutreachInboxError('inbox_invalid_event',415);
  const declared=request.headers.get('Content-Length');
  if(declared && (!/^\d+$/u.test(declared) || Number(declared)>MAX_REQUEST_BYTES)) throw new OutreachInboxError('inbox_invalid_event',413);
  if(!request.body) throw new OutreachInboxError('inbox_invalid_event');
  const reader=request.body.getReader(),chunks:Uint8Array[]=[],decoder=new TextDecoder('utf-8',{fatal:true});let size=0;
  try {
    for(;;) { const {value,done}=await reader.read();if(done) break;size+=value.byteLength;
      if(size>MAX_REQUEST_BYTES) { await reader.cancel();throw new OutreachInboxError('inbox_invalid_event',413); }
      chunks.push(value);
    }
  } finally {reader.releaseLock();}
  const all=new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.byteLength;}
  try {return JSON.parse(decoder.decode(all));} catch {throw new OutreachInboxError('inbox_invalid_event');}
}

async function tokenMatches(header:string|null,token:string):Promise<boolean> {
  if(!header || header.length>1024 || !header.startsWith('Bearer ')) return false;
  const encode=new TextEncoder();
  const [actual,expected]=await Promise.all([header.slice(7),token].map(async(v)=>new Uint8Array(await crypto.subtle.digest('SHA-256',encode.encode(v)))));
  let mismatch=0;for(let index=0;index<expected.length;index++) mismatch|=expected[index]^actual[index];
  return mismatch===0;
}

export async function handleOutreachInboxIngest(request:Request,env:Env):Promise<Response> {
  const requestId=crypto.randomUUID();
  if(request.method!=='POST') {const response=ownerError('method_not_allowed',requestId,405);response.headers.set('Allow','POST');return response;}
  if(env.LEAD_RADAR_OUTREACH_INBOX_ENABLED!=='true') return ownerError('inbox_disabled',requestId,503);
  if(!/^[A-Za-z0-9_-]{43}$/u.test(env.LEAD_RADAR_OUTREACH_INBOX_TOKEN??'') || !env.LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY || !env.GPTBOT_DRAFTS_DB) return ownerError('inbox_unavailable',requestId,503);
  if(!await tokenMatches(request.headers.get('Authorization'),env.LEAD_RADAR_OUTREACH_INBOX_TOKEN!)) return ownerError('unauthorized',requestId,401);
  try {
    const event=parseOutreachInboxEvent(await readOutreachInboxJson(request));
    if(!isLeadRadarOrganizationAllowed(env,event.orgId)) return ownerError('forbidden',requestId,403);
    return ownerJson(await ingestOutreachInboxEvent({db:env.GPTBOT_DRAFTS_DB,dataKey:env.LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY,event}),requestId);
  } catch(error) {
    return error instanceof OutreachInboxError ? ownerError(error.code,requestId,error.status) : ownerError('inbox_unavailable',requestId,503);
  }
}
