import type { LeadRadarLead } from '../../shared/lead-radar';
import { validTelegramContactResolution, type TelegramContactResolution } from '../../shared/lead-radar-contact-resolution';

export interface ContactCheckJob { companyId: string; searchId: string; candidateKeys: string[]; sourceByCandidate?: Record<string,'openstreetmap'> }
export interface ContactCheckProgress { completed: string[]; resolved: string[]; pausedUntil: number; reason: string | null;
  outcomes?: Record<string,{reason:string;status:TelegramContactResolution['status']}>;
  checkedKeys?: Record<string,string[]>;
  sourcePauses?: { openstreetmap?: { until:number; reason:string } };
}
export const emptyContactCheckProgress = (): ContactCheckProgress => ({ completed: [], resolved: [], pausedUntil: 0, reason: null });

/** Restart user-requested freshness checks, never the account's cooldown. */
export const restartContactCheckProgress = (progress: ContactCheckProgress): ContactCheckProgress => ({
  ...progress, completed: [], resolved: [], ...(progress.outcomes?{outcomes:{}}:{}), ...(progress.checkedKeys?{checkedKeys:{}}:{}),
});

export function contactCheckCompleted(job: ContactCheckJob, progress: ContactCheckProgress): boolean {
  const checked=progress.checkedKeys?.[job.companyId];
  return progress.completed.includes(job.companyId) && (!checked || job.candidateKeys.every(key=>checked.includes(key)));
}

export function contactCheckExplanation(lead: LeadRadarLead | undefined, progress: ContactCheckProgress): string | null {
  if (!lead) return null;
  const job=selectedContactCheckJobs([lead])[0];
  if (job && !contactCheckCompleted(job,progress) && job.candidateKeys.some(key=>job.sourceByCandidate?.[key]==='openstreetmap')
    && (progress.sourcePauses?.openstreetmap?.until??0)>Date.now()) return 'Источник номера временно недоступен. Контакт отложен; другие источники проверяются отдельно';
  if (job && !contactCheckCompleted(job,progress)) return 'Номер/контакт компании найден — проверка Telegram ещё не завершена';
  const outcome=progress.outcomes?.[lead.id];
  if (outcome?.reason==='privacy_or_missing') return 'Telegram не смог найти аккаунт по номеру: его нет или поиск скрыт настройками приватности';
  if (outcome?.reason==='business_listing_changed') return 'Данные публичной карточки изменились — нужно обновить источник номера';
  if (outcome?.reason==='username_exists_ownership_unconfirmed') return 'Аккаунт существует, но его связь с компанией ещё не подтверждена';
  if (outcome?.status==='unsupported') return 'Найденный контакт не подходит для отправки через Telegram';
  if (lead.contactCandidates?.some(c=>c.kind==='phone' && c.phoneType==='mobile' && !c.lookupEligible)) return 'Мобильный номер найден, но источник пока не подтверждает его связь с этой компанией';
  return null;
}

export function selectedContactCheckJobs(leads: readonly LeadRadarLead[], excluded: readonly string[] = []): ContactCheckJob[] {
  return [...new Map(leads.filter((lead) => !excluded.includes(lead.id) && !lead.suppressed
    && !['do_not_contact', 'contacted', 'replied', 'qualified', 'meeting', 'won'].includes(lead.lifecycle))
    .map((lead) => [lead.id, { companyId: lead.id, searchId: lead.searchId,
      candidateKeys: [...new Set((lead.contactCandidates ?? []).filter((candidate) => candidate.lookupEligible
        && candidate.ownership !== 'personal' && (candidate.kind !== 'phone' || candidate.ownership === 'company'))
        .map((candidate) => candidate.key))],
      ...((lead.contactCandidates??[]).some(c=>c.kind==='phone' && /^https:\/\/(www\.)?openstreetmap\.org\/(node|way|relation)\/[1-9]\d*\/?$/.test(c.sourceUrl??''))
        ? {sourceByCandidate:Object.fromEntries((lead.contactCandidates??[]).filter(c=>c.kind==='phone'
          && /^https:\/\/(www\.)?openstreetmap\.org\/(node|way|relation)\/[1-9]\d*\/?$/.test(c.sourceUrl??'')).map(c=>[c.key,'openstreetmap' as const]))} : {}),
    }])).values()].filter((job) => job.candidateKeys.length > 0);
}

/** The server owns receipts, source proof and rate limits. This resumable loop only requests checks, never sends. */
export async function runSelectedContactChecks(input: {
  jobs: readonly ContactCheckJob[]; progress: ContactCheckProgress;
  resolve: (job: ContactCheckJob, candidateKey: string) => Promise<TelegramContactResolution>;
  save: (progress: ContactCheckProgress) => void; cancelled: () => boolean;
  wait: (ms: number) => Promise<void>; now?: () => number;
}): Promise<ContactCheckProgress> {
  const now = input.now ?? Date.now;
  let progress = { ...input.progress, completed: [...input.progress.completed], resolved: [...input.progress.resolved] };
  // Older clients treated a source outage as an account-wide cooldown. Retain
  // that source's deadline while allowing independent sources to proceed.
  if (progress.reason==='business_listing_unavailable' && progress.pausedUntil>now()) {
    progress={...progress,sourcePauses:{...progress.sourcePauses,openstreetmap:{until:Math.max(progress.pausedUntil,
      progress.sourcePauses?.openstreetmap?.until??0),reason:'business_listing_unavailable'}},pausedUntil:0,reason:null};
    input.save(progress);
  }
  if (progress.pausedUntil > now()) return progress;
  progress.reason = null; progress.pausedUntil=0;
  let deferred=false;
  for (const job of input.jobs) {
    if (contactCheckCompleted(job,progress)) continue;
    let resolved = false;
    let lastResult: TelegramContactResolution | undefined;
    let jobDeferred=false;
    for (const key of job.candidateKeys) {
      const source=job.sourceByCandidate?.[key];
      if (source && (progress.sourcePauses?.[source]?.until??0)>now()) {jobDeferred=true;continue;}
      const deadline = now() + 130_000;
      for (;;) {
        if (input.cancelled()) return progress;
        const result = await input.resolve(job, key);
        if (!validTelegramContactResolution(result)) throw new Error('invalid_contact_check_response');
        lastResult=result;
        if (input.cancelled()) return progress;
        if (result.reason==='business_listing_unavailable' && ['limited','failed'].includes(result.status)) {
          // This reason is emitted only by the OSM source check, never Telegram.
          progress={...progress,sourcePauses:{...progress.sourcePauses,openstreetmap:{
            until:now()+(result.retryAfterSeconds??900)*1000,reason:result.reason}},
            outcomes:{...progress.outcomes,[job.companyId]:{status:result.status,reason:result.reason}}};
          jobDeferred=true;input.save(progress);await input.wait(3_000);break;
        }
        if (result.status === 'limited' || result.status === 'failed' || result.reason === 'check_expired') {
          progress = { ...progress, pausedUntil: now() + (result.retryAfterSeconds ?? 60) * 1000, reason: result.reason };
          input.save(progress); return progress;
        }
        // A three-second interval also separates successful candidates/companies.
        await input.wait(3_000);
        if (result.status !== 'pending') {
          // A real username without company ownership is not our successful
          // endpoint. Continue to the next candidate just like the Worker does.
          resolved = result.status === 'resolved' && result.reason !== 'username_exists_ownership_unconfirmed';
          break;
        }
        if (now() >= deadline) {
          progress = { ...progress, reason: 'waiting_for_bridge' }; input.save(progress); return progress;
        }
      }
      if (resolved) break;
    }
    if (jobDeferred && !resolved) {deferred=true;continue;}
    progress = { ...progress, completed: [...new Set([...progress.completed, job.companyId])],
      resolved: resolved ? [...new Set([...progress.resolved, job.companyId])] : progress.resolved.filter(id=>id!==job.companyId),
      checkedKeys:{...progress.checkedKeys,[job.companyId]:[...job.candidateKeys]},
      ...(lastResult?{outcomes:{...progress.outcomes,[job.companyId]:{reason:lastResult.reason,status:lastResult.status}}}:{}),
    };
    input.save(progress);
  }
  if(deferred){progress={...progress,reason:'source_checks_deferred'};input.save(progress);}
  return progress;
}

const storageKey = (scope: string) => `lead-radar:contact-checks:v2:${scope}`;
export function saveContactCheckProgress(scope: string, progress: ContactCheckProgress): void {
  try { sessionStorage.setItem(storageKey(scope), JSON.stringify({ progress, expires: Date.now() + 86_400_000 })); } catch { /* Optional tab-local recovery. */ }
}
export function readContactCheckProgress(scope: string): ContactCheckProgress {
  try {
    const stored=sessionStorage.getItem(storageKey(scope));
    const data = JSON.parse(stored ?? sessionStorage.getItem(`lead-radar:contact-checks:v1:${scope}`) ?? 'null');
    const p = data?.progress;
    const ids = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 500 && v.every((id) => typeof id === 'string' && /^[A-Za-z0-9:_-]{1,80}$/.test(id));
    if (data?.expires > Date.now() && ids(p?.completed) && ids(p?.resolved) && Number.isFinite(p.pausedUntil)
      && (p.reason === null || typeof p.reason === 'string' && /^[a-z_]{1,80}$/.test(p.reason))) {
      const outcomes=p.outcomes && typeof p.outcomes==='object' && !Array.isArray(p.outcomes)
        ? Object.entries(p.outcomes).slice(0,500).filter(([id,value])=>ids([id]) && value && typeof value==='object'
          && /^[a-z][a-z0-9_]{2,79}$/.test(String((value as {reason?:unknown}).reason))
          && ['pending','resolved','unresolved','unsupported','limited','failed'].includes(String((value as {status?:unknown}).status))) : [];
      const checkedKeys=p.checkedKeys && typeof p.checkedKeys==='object' && !Array.isArray(p.checkedKeys)
        ? Object.entries(p.checkedKeys).slice(0,500).filter(([id,keys])=>ids([id]) && Array.isArray(keys) && keys.length<=40
          && keys.every(key=>typeof key==='string' && key.length<=450)) : [];
      // Legacy progress did not record which candidates were checked. Recheck
      // through server receipts, retaining cooldown, without discarding drafts.
      const pause=p.sourcePauses?.openstreetmap;
      const sourcePauses=pause && Number.isSafeInteger(pause.until) && pause.until>0 && pause.reason==='business_listing_unavailable'
        ? {openstreetmap:{until:pause.until as number,reason:pause.reason as string}} : undefined;
      return {completed:stored?p.completed:[],resolved:stored?p.resolved:[],pausedUntil:p.pausedUntil,reason:p.reason,...(sourcePauses?{sourcePauses}:{}),
        outcomes:Object.fromEntries(outcomes.map(([id,value])=>[id,{reason:(value as {reason:string}).reason,status:(value as {status:TelegramContactResolution['status']}).status}])),
        checkedKeys:Object.fromEntries(checkedKeys.map(([id,keys])=>[id,keys as string[]]))};
    }
  } catch { /* Local metadata is untrusted, server receipts remain authoritative. */ }
  return emptyContactCheckProgress();
}
