import type { LeadRadarLead } from '../../shared/lead-radar';
import { validTelegramContactResolution, type TelegramContactResolution } from '../../shared/lead-radar-contact-resolution';

export interface ContactCheckJob { companyId: string; searchId: string; candidateKeys: string[] }
export interface ContactCheckProgress { completed: string[]; resolved: string[]; pausedUntil: number; reason: string | null }
export const emptyContactCheckProgress = (): ContactCheckProgress => ({ completed: [], resolved: [], pausedUntil: 0, reason: null });

export function selectedContactCheckJobs(leads: readonly LeadRadarLead[], excluded: readonly string[] = []): ContactCheckJob[] {
  return [...new Map(leads.filter((lead) => !excluded.includes(lead.id) && !lead.suppressed
    && !['do_not_contact', 'contacted', 'replied', 'qualified', 'meeting', 'won'].includes(lead.lifecycle))
    .map((lead) => [lead.id, { companyId: lead.id, searchId: lead.searchId,
      candidateKeys: [...new Set((lead.contactCandidates ?? []).filter((candidate) => candidate.lookupEligible
        && candidate.ownership !== 'personal' && (candidate.kind !== 'phone' || candidate.ownership === 'company'))
        .map((candidate) => candidate.key))],
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
  if (progress.pausedUntil > now()) return progress;
  progress.reason = null;
  for (const job of input.jobs) {
    if (progress.completed.includes(job.companyId)) continue;
    let resolved = false;
    for (const key of job.candidateKeys) {
      const deadline = now() + 130_000;
      for (;;) {
        if (input.cancelled()) return progress;
        const result = await input.resolve(job, key);
        if (!validTelegramContactResolution(result)) throw new Error('invalid_contact_check_response');
        if (input.cancelled()) return progress;
        if (result.status === 'limited' || result.status === 'failed' || result.reason === 'check_expired') {
          progress = { ...progress, pausedUntil: now() + (result.retryAfterSeconds ?? 60) * 1000, reason: result.reason };
          input.save(progress); return progress;
        }
        // A three-second interval also separates successful candidates/companies.
        await input.wait(3_000);
        if (result.status !== 'pending') { resolved = result.status === 'resolved'; break; }
        if (now() >= deadline) {
          progress = { ...progress, reason: 'waiting_for_bridge' }; input.save(progress); return progress;
        }
      }
      if (resolved) break;
    }
    progress = { ...progress, completed: [...progress.completed, job.companyId],
      resolved: resolved ? [...progress.resolved, job.companyId] : progress.resolved };
    input.save(progress);
  }
  return progress;
}

const storageKey = (scope: string) => `lead-radar:contact-checks:v1:${scope}`;
export function saveContactCheckProgress(scope: string, progress: ContactCheckProgress): void {
  try { sessionStorage.setItem(storageKey(scope), JSON.stringify({ progress, expires: Date.now() + 86_400_000 })); } catch { /* Optional tab-local recovery. */ }
}
export function readContactCheckProgress(scope: string): ContactCheckProgress {
  try {
    const data = JSON.parse(sessionStorage.getItem(storageKey(scope)) ?? 'null');
    const p = data?.progress;
    const ids = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 500 && v.every((id) => typeof id === 'string' && /^[A-Za-z0-9:_-]{1,80}$/.test(id));
    if (data?.expires > Date.now() && ids(p?.completed) && ids(p?.resolved) && Number.isFinite(p.pausedUntil)
      && (p.reason === null || typeof p.reason === 'string' && /^[a-z_]{1,80}$/.test(p.reason))) return p;
  } catch { /* Local metadata is untrusted, server receipts remain authoritative. */ }
  return emptyContactCheckProgress();
}
