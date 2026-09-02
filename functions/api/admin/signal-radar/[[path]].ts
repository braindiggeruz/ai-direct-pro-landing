/**
 * Signal Radar admin surface.
 *
 * Deliberately small: the module reuses the Owner Control Center shell so the
 * error vocabulary, request ids and role check are identical to Lead Radar.
 *
 * Heavy work (crawling tgstat, fetching t.me previews, scoring) does NOT happen
 * here. Pages functions on the free plan get ~30 ms CPU per request, so the
 * network side runs in the automation Worker. This file only writes seeds,
 * flips the runtime mode and puts a bounded message on the queue.
 */

import {
  methodNotAllowed,
  ownerError,
  ownerJson,
  readOwnerBody,
  withOwnerRole,
} from '../../../platform/admin';
import { ownerOrgId } from '../../../platform/lead-radar';
import {
  SignalRadarStore,
  signalLeadId,
  signalSchemaReady,
  signalTargetId,
} from '../../../platform/lead-radar/signal-store';
import { SIGNAL_JOIN_POLICY } from '../../../platform/lead-radar/signal-join-queue';
import {
  clearSignalMode,
  resolveSignalMode,
  signalScanStatusFor,
  writeSignalMode,
  writeSignalScanCursor,
} from '../../../platform/lead-radar/signal-mode';
import {
  parseSignalAutojoinMode,
  parseSignalLeadState,
  parseSignalSlugList,
  parseSignalTargetStatus,
  signalScanQueueMessage,
  type SignalLeadDetail,
  type SignalLeadState,
  type SignalRadarOverview,
} from '../../../../src/shared/signal-radar';

function pathParts(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => item.split('/')).filter(Boolean);
  return (value ?? '').split('/').filter(Boolean);
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function boundedString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
}

function boundedInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

const IDLE_SCAN = {
  queued: false,
  lastRequestedAt: null,
  nextAvailableAt: null,
  cooldownMs: 5 * 60 * 1000,
};

const EMPTY_OVERVIEW: SignalRadarOverview = {
  installed: false,
  mode: SIGNAL_JOIN_POLICY.mode,
  modeState: { mode: SIGNAL_JOIN_POLICY.mode, source: 'default', updatedAt: null },
  scan: { ...IDLE_SCAN },
  runtime: { enabled: false, queueReady: false },
  totals: {
    targets: 0, watching: 0, probation: 0, active: 0,
    leadsNew: 0, leadsSent: 0, joinQuotaLeft: 0,
  },
  targets: [],
  leads: [],
};

export const onRequestGet = withOwnerRole('platform_owner', async (ctx) => {
  const orgId = await ownerOrgId(ctx.actor.email);
  const parts = pathParts(ctx.params.path);
  // Resolved from the same function the cron worker calls, so what the page
  // shows and what the worker does are the same number. Never read the env
  // var for this directly: the database setting outranks it.
  const modeState = await resolveSignalMode(ctx.db, ctx.env);
  const scan = await signalScanStatusFor(ctx.db, orgId, Date.now());
  const runtime = {
    enabled: ctx.env.LEAD_RADAR_SIGNAL_ENABLED === 'true',
    queueReady: Boolean(ctx.env.AUTOMATION_QUEUE),
  };

  if (!(await signalSchemaReady(ctx.db))) {
    return ownerJson({ ...EMPTY_OVERVIEW, modeState, scan, runtime }, ctx.requestId);
  }
  const store = new SignalRadarStore(ctx.db);

  if (parts.length === 0) {
    const [counts, targets, leads] = await Promise.all([
      store.counts(orgId),
      store.listTargets(orgId, { limit: 50 }),
      store.listLeads(orgId, { state: ['new', 'drafted', 'approved'], limit: 50 }),
    ]);
    return ownerJson({
      installed: true,
      mode: modeState.mode,
      modeState,
      scan,
      runtime,
      totals: {
        targets: counts.targets,
        watching: counts.watching,
        probation: counts.probation,
        active: counts.active,
        leadsNew: counts.leadsNew,
        leadsSent: counts.leadsSent,
        joinQuotaLeft: Math.max(0, SIGNAL_JOIN_POLICY.maxJoined - counts.joined),
      },
      targets,
      leads,
    } satisfies SignalRadarOverview, ctx.requestId);
  }

  if (parts.length === 1 && parts[0] === 'targets') {
    const status = parseSignalTargetStatus(ctx.url.searchParams.get('status')) ?? undefined;
    const targets = await store.listTargets(orgId, {
      status,
      limit: boundedInt(ctx.url.searchParams.get('limit'), 50, 1, 200),
    });
    return ownerJson({ targets }, ctx.requestId);
  }

  if (parts.length === 1 && parts[0] === 'leads') {
    const state = parseSignalLeadState(ctx.url.searchParams.get('state')) ?? undefined;
    const leads = await store.listLeads(orgId, {
      state,
      limit: boundedInt(ctx.url.searchParams.get('limit'), 50, 1, 200),
    });
    return ownerJson({ leads }, ctx.requestId);
  }

  // One lead in full: the raw post behind it. Fetched on demand when the
  // operator expands a card, so the inbox itself stays a single query.
  if (parts.length === 2 && parts[0] === 'leads') {
    if (!signalLeadId(parts[1])) return ownerError('invalid_id', ctx.requestId, 400);
    const lead = await store.getLead(orgId, parts[1]);
    if (!lead) return ownerError('not_found', ctx.requestId, 404);
    const post = await store.getPost(orgId, lead.postId);
    return ownerJson({ lead, post } satisfies SignalLeadDetail, ctx.requestId);
  }

  return ownerError('route_not_found', ctx.requestId, 404);
});

export const onRequestPost = withOwnerRole('platform_owner', async (ctx) => {
  const orgId = await ownerOrgId(ctx.actor.email);
  const parts = pathParts(ctx.params.path);
  // ── POST /api/admin/signal-radar/scan ───────────────────────────────
  // Puts one bounded message on the automation queue and returns. Fetching a
  // Telegram preview costs far more than the ~30 ms of CPU a Pages function
  // gets, so the work itself always runs in the Worker.
  if (parts.length === 1 && parts[0] === 'scan') {
    if (ctx.env.LEAD_RADAR_SIGNAL_ENABLED !== 'true') {
      return ownerError('signal_disabled', ctx.requestId, 409);
    }
    const modeState = await resolveSignalMode(ctx.db, ctx.env);
    if (modeState.mode === 'off') return ownerError('signal_mode_off', ctx.requestId, 409);
    if (!ctx.env.AUTOMATION_QUEUE) return ownerError('queue_unavailable', ctx.requestId, 503);

    const now = Date.now();
    const before = await signalScanStatusFor(ctx.db, orgId, now);
    if (before.queued) {
      return ownerJson(
        { error: 'signal_scan_cooling_down', request_id: ctx.requestId, scan: before },
        ctx.requestId,
        429,
      );
    }
    let message;
    try {
      message = signalScanQueueMessage({
        orgId,
        requestedBy: ctx.actor.email,
        requestedAt: new Date(now).toISOString(),
      });
    } catch {
      return ownerError('invalid_org', ctx.requestId, 400);
    }
    // The cursor is written first and the send second: a lost queue send costs
    // the operator one cooldown window, while a lost cursor costs Telegram a
    // burst of duplicate fetches from a trigger-happy click.
    const cursor = { at: new Date(now).toISOString(), by: ctx.actor.email };
    await writeSignalScanCursor(ctx.db, orgId, cursor);
    await ctx.env.AUTOMATION_QUEUE.send(message);
    return ownerJson({ scan: await signalScanStatusFor(ctx.db, orgId, Date.now()) },
      ctx.requestId, 202);
  }

  if (parts.length !== 1 || parts[0] !== 'targets') {
    return ownerError('route_not_found', ctx.requestId, 404);
  }
  if (!(await signalSchemaReady(ctx.db))) {
    return ownerError('signal_schema_missing', ctx.requestId, 503);
  }
  const body = record(await readOwnerBody(ctx.request));
  if (!body) return ownerError('invalid_body', ctx.requestId, 400);

  const raw = typeof body.text === 'string' ? body.text
    : Array.isArray(body.slugs) ? body.slugs.join(' ')
      : '';
  const slugs = parseSignalSlugList(raw, 200);
  if (slugs.length === 0) return ownerError('signal_no_valid_slug', ctx.requestId, 400);

  const store = new SignalRadarStore(ctx.db);
  const source = boundedString(body.source, 80) ?? 'manual';
  const added: string[] = [];
  let skipped = 0;
  for (const slug of slugs) {
    const existing = await store.getTargetBySlug(orgId, slug);
    if (existing) { skipped += 1; continue; }
    const created = await store.upsertTarget(orgId, { slug, source, status: 'candidate' });
    added.push(created.id);
  }
  return ownerJson({ added: added.length, skipped, slugs }, ctx.requestId, 201);
});

export const onRequestPatch = withOwnerRole('platform_owner', async (ctx) => {
  const orgId = await ownerOrgId(ctx.actor.email);
  const parts = pathParts(ctx.params.path);
  const body = record(await readOwnerBody(ctx.request));
  if (!body) return ownerError('invalid_body', ctx.requestId, 400);

  // ── PATCH /api/admin/signal-radar/mode ──────────────────────────────
  // The runtime switch. It does not need migration 0057 — `system_settings`
  // predates Signal Radar — so it is checked before the schema guard below.
  // `join` may only be turned on deliberately: it is the one mode that spends
  // the account's reputation, so a stray click must not be enough.
  if (parts.length === 1 && parts[0] === 'mode') {
    if (!('mode' in body)) return ownerError('empty_patch', ctx.requestId, 400);
    const raw = body.mode;
    if (raw === null) {
      await clearSignalMode(ctx.db);
      return ownerJson({ mode: await resolveSignalMode(ctx.db, ctx.env) }, ctx.requestId);
    }
    const mode = parseSignalAutojoinMode(raw);
    if (!mode) return ownerError('invalid_mode', ctx.requestId, 400);
    if (mode === 'join' && body.confirm !== true) {
      return ownerError('signal_join_needs_confirmation', ctx.requestId, 409);
    }
    try {
      const next = await writeSignalMode(ctx.db, mode, ctx.actor.email);
      return ownerJson({ mode: next }, ctx.requestId);
    } catch {
      // Most likely a missing `system_settings` table. Say so instead of
      // reporting a generic 500 that nobody can act on.
      return ownerError('settings_unavailable', ctx.requestId, 503);
    }
  }

  if (!(await signalSchemaReady(ctx.db))) {
    return ownerError('signal_schema_missing', ctx.requestId, 503);
  }
  const store = new SignalRadarStore(ctx.db);

  if (parts.length === 2 && parts[0] === 'targets') {
    if (!signalTargetId(parts[1])) return ownerError('invalid_id', ctx.requestId, 400);
    const status = body.status === undefined ? undefined : parseSignalTargetStatus(body.status);
    if (body.status !== undefined && !status) return ownerError('invalid_status', ctx.requestId, 400);
    const note = body.note === undefined ? undefined : boundedString(body.note, 500);
    if (body.note !== undefined && body.note !== null && !note) {
      return ownerError('invalid_note', ctx.requestId, 400);
    }
    if (status === undefined && note === undefined) {
      return ownerError('empty_patch', ctx.requestId, 400);
    }
    const patch: Record<string, string | number | null> = {};
    if (status) patch.status = status;
    if (note !== undefined) patch.note = note;
    await store.updateTarget(orgId, parts[1], patch);
    const target = await store.getTarget(orgId, parts[1]);
    return target ? ownerJson({ target }, ctx.requestId) : ownerError('not_found', ctx.requestId, 404);
  }

  if (parts.length === 2 && parts[0] === 'leads') {
    if (!signalLeadId(parts[1])) return ownerError('invalid_id', ctx.requestId, 400);
    const state: SignalLeadState | undefined = body.state === undefined
      ? undefined
      : parseSignalLeadState(body.state) ?? undefined;
    if (body.state !== undefined && !state) return ownerError('invalid_state', ctx.requestId, 400);
    const draftText = body.draftText === undefined ? undefined : boundedString(body.draftText, 2000);
    if (body.draftText !== undefined && body.draftText !== null && !draftText) {
      return ownerError('invalid_draft', ctx.requestId, 400);
    }
    if (state === undefined && draftText === undefined) {
      return ownerError('empty_patch', ctx.requestId, 400);
    }
    const ok = await store.updateLead(orgId, parts[1], { state, draftText });
    if (!ok) return ownerError('not_found', ctx.requestId, 404);
    const lead = await store.getLead(orgId, parts[1]);
    return ownerJson({ lead }, ctx.requestId);
  }

  return ownerError('route_not_found', ctx.requestId, 404);
});

export const onRequestDelete = withOwnerRole('platform_owner', async (ctx) => {
  const orgId = await ownerOrgId(ctx.actor.email);
  const parts = pathParts(ctx.params.path);
  if (parts.length !== 2 || parts[0] !== 'targets') {
    return ownerError('route_not_found', ctx.requestId, 404);
  }
  if (!signalTargetId(parts[1])) return ownerError('invalid_id', ctx.requestId, 400);
  if (!(await signalSchemaReady(ctx.db))) {
    return ownerError('signal_schema_missing', ctx.requestId, 503);
  }
  const store = new SignalRadarStore(ctx.db);
  const target = await store.getTarget(orgId, parts[1]);
  if (!target) return ownerError('not_found', ctx.requestId, 404);
  // Never delete a group we are still inside; mark it so the worker can leave.
  if (target.status === 'probation' || target.status === 'active') {
    return ownerError('signal_target_joined', ctx.requestId, 409);
  }
  await store.updateTarget(orgId, parts[1], { status: 'ignored' });
  return ownerJson({ deleted: false, ignored: true, id: parts[1] }, ctx.requestId);
});

export const onRequestPut = methodNotAllowed('GET, POST, PATCH, DELETE');
