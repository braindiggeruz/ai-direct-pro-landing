// AI SEO Autopilot tab — embedded inside /admin-tools/seo-booster.
//
// Flow:
//   1. Admin picks a URL from the Booster report (orphan candidates listed by default).
//   2. Picks an action + provider.
//   3. Frontend builds the AiPatchContext from BoosterReport data already in memory.
//   4. Browser-side LLM (Puter or Mock) generates a candidate JSON patch.
//   5. POST /api/seo/ai/validate-patch — backend returns AiSeoPatch with per-field
//      blocked/warnings flags.
//   6. UI renders field-by-field diff with Accept/Reject toggles.
//   7. Admin clicks "Apply approved fields" → POST /api/seo/ai/apply-patch.
//      The backend appends an entry to content/seo/ai-runs.json. No live pages
//      are mutated. "Publish to GitHub" stays manual.
//
// Provider safety:
//   - Puter.js loads only when this tab actually mounts (admin /admin-tools only).
//   - Mock provider is used when Puter is unavailable.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, Select } from '../../components/ui';
import { api } from '../../lib/api';
import { pickProvider, type ProviderChoice } from '../../lib/aiProviders';
import { buildSystemPrompt, buildUserPrompt, parsePatchJson } from './prompt';
import { AlertTriangle, CheckCircle2, RefreshCw, Sparkles, X, ShieldCheck, Loader2, ArrowRight } from 'lucide-react';
import type { BoosterReport, BoosterItem } from '../../../shared/booster';
import type {
  AiSeoAction,
  AiSeoPatch,
  AiSeoPatchCandidate,
  AiPatchContext,
  AiProviderStatus,
} from '../../../shared/ai-seo';
import { AI_SEO_ACTIONS, AI_SEO_ACTION_LABELS } from '../../../shared/ai-seo';
import { CLUSTERS } from '../../../shared/booster';
import {
  parseEditorRoute,
  mapApprovedFieldsToEditorDraft,
  draftStorageKey,
  type DraftHandoff,
} from '../../../shared/ai-seo-bridge';
import { readDigestFromSession } from './serpHandoff';
import type { SerpDigest } from '../../../shared/serp';

interface Props {
  report: BoosterReport;
  /** When the SERP Intelligence tab handed off a URL, AiAutopilotTab opens
   *  with that URL preselected and the latest SerpDigest already wired into
   *  the prompt context. */
  preselectedUrl?: string | null;
}

function previewValue(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'string') return v.length > 220 ? `${v.slice(0, 220)}…` : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try { return JSON.stringify(v, null, 2).slice(0, 600); } catch { return '[unserializable]'; }
}

function compactSerpDigest(d: SerpDigest | null) {
  if (!d) return undefined;
  return {
    intent: d.intent,
    topCompetitorTitles: d.topCompetitors.slice(0, 5).map((c) => c.title),
    relatedSearches: d.relatedSearches.slice(0, 5),
    faqIdeas: d.faqIdeas.slice(0, 5).map((f) => f.question),
    contentGaps: d.contentGaps.slice(0, 7).map((g) => g.topic),
  };
}

function buildContext(item: BoosterItem, report: BoosterReport, serpDigest: SerpDigest | null): AiPatchContext {
  const allUrls = report.items.map((i) => i.url);
  const clusterId =
    CLUSTERS.find((c) => c.money.ru.includes(item.url) || c.money.uz.includes(item.url))?.id
    || item.cluster;
  const cluster = CLUSTERS.find((c) => c.id === clusterId);
  const clusterMoneyUrls = cluster
    ? [...cluster.money.ru, ...cluster.money.uz].filter((u) => u !== item.url && allUrls.includes(u))
    : [];
  const peers = report.items
    .filter((i) => i.kind === 'blog' && i.locale === item.locale && i.cluster === clusterId && i.url !== item.url)
    .slice(0, 8)
    .map((i) => ({ url: i.url, title: i.title }));
  return {
    url: item.url,
    locale: item.locale,
    kind: item.kind,
    pageType: item.pageType,
    primaryKeyword: item.primaryKeyword,
    title: item.title,
    description: item.description,
    h1: item.h1,
    faqQ: [],
    internalTargets: [],
    allowedSlugs: allUrls,
    clusterPeers: peers,
    clusterMoneyUrls,
    serpDigest: compactSerpDigest(serpDigest),
  };
}

function ProviderStatusCard({ s }: { s: AiProviderStatus }) {
  const toneByAvail = {
    available: 'success',
    loading: 'info',
    missing: 'warning',
    failed: 'danger',
  } as const;
  const tone = toneByAvail[s.availability];
  return (
    <div className="bg-bg-surface border border-white/10 rounded-2xl p-4" data-testid={`ai-provider-${s.provider}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-white capitalize">{s.provider}</div>
        <Badge tone={tone}>{s.availability}</Badge>
      </div>
      {s.model && <div className="text-xs text-white/40 mb-1">model: {s.model}</div>}
      {s.note && <div className="text-xs text-white/60 leading-snug">{s.note}</div>}
    </div>
  );
}

export default function AiAutopilotTab({ report, preselectedUrl }: Props) {
  // Orphan candidates first — that's the primary use-case we ship in MVP.
  const orphans = useMemo(
    () => report.items
      .filter((i) => i.isOrphan && i.status === 'published')
      .sort((a, b) => (b.scores.moneyPower ?? 0) - (a.scores.moneyPower ?? 0)),
    [report],
  );
  const allCandidates = useMemo(
    () => report.items
      .filter((i) => i.status === 'published')
      .sort((a, b) => b.scores.indexationPriority - a.scores.indexationPriority),
    [report],
  );

  const [selectedUrl, setSelectedUrl] = useState<string>(preselectedUrl || orphans[0]?.url || allCandidates[0]?.url || '');

  // When the SERP tab hands off a URL after we are already mounted, follow
  // that selection so the operator sees the same URL pre-picked.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (preselectedUrl && preselectedUrl !== selectedUrl) setSelectedUrl(preselectedUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedUrl]);
  const [action, setAction] = useState<AiSeoAction>('fix_orphan_article');
  const [providerChoice, setProviderChoice] = useState<ProviderChoice>('auto');
  const [providers, setProviders] = useState<AiProviderStatus[]>([]);
  const [serperConfigured, setSerperConfigured] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [patch, setPatch] = useState<AiSeoPatch | null>(null);
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<{ ok: boolean; runId?: string; appliedFieldCount?: number; error?: string } | null>(null);
  const nav = useNavigate();

  useEffect(() => {
    void (async () => {
      try {
        const s = await api.aiProviderStatus();
        setProviders(s.providers);
        setSerperConfigured(!!s.serper?.configured);
      } catch { /* ignore */ }
    })();
  }, []);

  const selectedItem = report.items.find((i) => i.url === selectedUrl) || null;

  const onGenerate = async () => {
    if (!selectedItem) return;
    setGenerating(true);
    setError(null);
    setPatch(null);
    setApproved(new Set());
    setApplyResult(null);
    try {
      const serpDigest = readDigestFromSession(selectedItem.url);
      const ctx = buildContext(selectedItem, report, serpDigest);
      const sys = buildSystemPrompt(action, ctx);
      const user = buildUserPrompt(action, ctx);
      const provider = await pickProvider(providerChoice);
      const { text, model } = await provider.generate({ action, ctx, systemPrompt: sys, userPrompt: user });
      const parsed = parsePatchJson(text) as Partial<AiSeoPatchCandidate> | null;
      if (!parsed || !Array.isArray(parsed.fields)) {
        throw new Error('Provider returned non-JSON or malformed patch');
      }
      const candidate: AiSeoPatchCandidate = {
        url: ctx.url,
        locale: ctx.locale,
        action,
        provider: provider.id,
        model: model || provider.id,
        fields: parsed.fields,
        summary: typeof parsed.summary === 'string' ? parsed.summary : undefined,
        requiresHumanReview: !!parsed.requiresHumanReview,
      };
      const { patch: validated } = await api.aiValidatePatch(candidate);
      setPatch(validated);
      // Pre-approve only the low-risk, non-blocked fields with warnings empty.
      const preapproved = new Set(
        validated.fields
          .filter((f) => !f.blocked && (f.warnings || []).length === 0 && f.risk === 'low')
          .map((f) => f.id),
      );
      setApproved(preapproved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  const onApply = async () => {
    if (!patch || approved.size === 0) return;
    setApplying(true);
    setApplyResult(null);
    try {
      const r = await api.aiApplyPatch(patch, Array.from(approved));
      setApplyResult(r);
    } catch (e) {
      setApplyResult({ ok: false, error: (e as Error).message });
    } finally {
      setApplying(false);
    }
  };

  const toggleField = (id: string, blocked: boolean) => {
    if (blocked) return;
    const next = new Set(approved);
    if (next.has(id)) next.delete(id); else next.add(id);
    setApproved(next);
  };

  return (
    <div className="space-y-6" data-testid="ai-autopilot-tab">
      {/* Provider + safety banner */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3" data-testid="ai-provider-grid">
        {providers.map((p) => <ProviderStatusCard key={p.provider} s={p} />)}
      </div>

      <Card>
        <div className="flex items-start gap-3 text-sm text-white/70" data-testid="ai-safety-banner">
          <ShieldCheck size={18} className="text-emerald-300 mt-0.5" />
          <div>
            <div className="text-white font-medium mb-1">Draft-only mode — AI never publishes.</div>
            <div className="leading-snug text-white/60">
              Every AI patch is validated by backend, reviewed field-by-field,
              and recorded into <code className="text-white/80">content/seo/ai-runs.json</code>.
              Live pages under <code>content/pages/**</code> and <code>content/blog/**</code> are
              untouched. <strong>Publish to GitHub</strong> and <strong>IndexNow</strong> remain
              manual.
              {!serperConfigured && (
                <span className="block mt-1 text-white/40">
                  Serper SERP Intelligence: not configured (P1). Add SERPER_API_KEY in
                  Cloudflare Pages env to enable in the next release.
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Configurator */}
      <Card>
        <div className="grid sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs uppercase text-white/40 mb-1">URL</label>
            <Select value={selectedUrl} onChange={(e) => setSelectedUrl(e.target.value)} data-testid="ai-url-select">
              {orphans.length > 0 && (
                <optgroup label={`Orphans (${orphans.length})`}>
                  {orphans.map((i) => <option key={i.url} value={i.url}>{i.url}</option>)}
                </optgroup>
              )}
              <optgroup label="All published">
                {allCandidates.filter((i) => !orphans.includes(i)).map((i) => (
                  <option key={i.url} value={i.url}>{i.url}</option>
                ))}
              </optgroup>
            </Select>
          </div>
          <div>
            <label className="block text-xs uppercase text-white/40 mb-1">Action</label>
            <Select value={action} onChange={(e) => setAction(e.target.value as AiSeoAction)} data-testid="ai-action-select">
              {AI_SEO_ACTIONS.map((a) => (
                <option key={a} value={a}>{AI_SEO_ACTION_LABELS[a]}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-xs uppercase text-white/40 mb-1">Provider</label>
            <Select value={providerChoice} onChange={(e) => setProviderChoice(e.target.value as ProviderChoice)} data-testid="ai-provider-select">
              <option value="auto">Auto (Free)</option>
              <option value="puter">Puter</option>
              <option value="mock">Mock (offline)</option>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={onGenerate} disabled={!selectedItem || generating} className="w-full" data-testid="ai-generate-btn">
              {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {generating ? 'Generating…' : 'Generate AI patch'}
            </Button>
          </div>
        </div>
        {selectedItem && (
          <div className="mt-3 text-xs text-white/50" data-testid="ai-selected-meta">
            {selectedItem.kind} · {selectedItem.pageType} · keyword="{selectedItem.primaryKeyword || '—'}" ·
            incoming={selectedItem.incomingLinks} · quality={selectedItem.scores.quality}/100
          </div>
        )}
        {error && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/5 text-red-300 px-3 py-2 text-sm" data-testid="ai-generate-error">
            {error}
          </div>
        )}
      </Card>

      {/* Patch review */}
      {patch && (
        <Card data-testid="ai-patch-review">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Badge tone={patch.acceptable ? 'info' : 'danger'}>
                {patch.acceptable ? 'Draft patch — not published' : 'Rejected by validator'}
              </Badge>
              <span className="text-xs text-white/50">runId {patch.runId.slice(0, 8)}</span>
              {patch.provider && <Badge tone="neutral">{patch.provider}</Badge>}
              {patch.model && <Badge tone="neutral">{patch.model}</Badge>}
            </div>
            <Button variant="secondary" size="sm" onClick={onGenerate} disabled={generating} data-testid="ai-regenerate-btn">
              <RefreshCw size={14} /> Regenerate
            </Button>
          </div>

          {patch.summary && <p className="text-sm text-white/70 mb-3" data-testid="ai-patch-summary">{patch.summary}</p>}

          {patch.globalErrors.length > 0 && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 text-red-300 px-3 py-2 text-sm mb-3" data-testid="ai-patch-global-errors">
              <div className="font-medium mb-1">Patch rejected:</div>
              <ul className="list-disc list-inside text-xs">
                {patch.globalErrors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
          {patch.globalWarnings.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 text-amber-200 px-3 py-2 text-sm mb-3" data-testid="ai-patch-global-warnings">
              <ul className="list-disc list-inside text-xs">
                {patch.globalWarnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          <div className="space-y-3">
            {patch.fields.length === 0 && (
              <div className="text-white/50 text-sm">Provider returned no actionable fields.</div>
            )}
            {patch.fields.map((f) => {
              const isApproved = approved.has(f.id);
              const riskTone = f.risk === 'high' ? 'danger' : f.risk === 'medium' ? 'warning' : 'success';
              return (
                <div
                  key={f.id}
                  className={`rounded-xl border px-4 py-3 ${
                    f.blocked
                      ? 'border-red-500/30 bg-red-500/5'
                      : isApproved
                        ? 'border-emerald-500/30 bg-emerald-500/5'
                        : 'border-white/10 bg-white/[0.02]'
                  }`}
                  data-testid={`ai-field-${f.field}`}
                >
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{f.field}</span>
                      <Badge tone={riskTone}>risk: {f.risk}</Badge>
                      {f.blocked && <Badge tone="danger">blocked</Badge>}
                      {!f.blocked && (f.warnings || []).length > 0 && <Badge tone="warning">{(f.warnings || []).length} warning(s)</Badge>}
                    </div>
                    <div className="flex items-center gap-2">
                      {f.blocked ? (
                        <span className="text-xs text-red-300 inline-flex items-center gap-1">
                          <X size={12} /> {f.blockReason}
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant={isApproved ? 'primary' : 'secondary'}
                          onClick={() => toggleField(f.id, !!f.blocked)}
                          data-testid={`ai-field-toggle-${f.field}`}
                        >
                          {isApproved ? <><CheckCircle2 size={12} /> Approved</> : 'Approve'}
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-white/60 mb-2">{f.reason}</div>
                  <div className="grid sm:grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-bg-base/60 border border-white/5 p-2" data-testid={`ai-field-before-${f.field}`}>
                      <div className="text-white/40 uppercase tracking-wide mb-1">Before</div>
                      <pre className="whitespace-pre-wrap text-white/70">{previewValue(f.before)}</pre>
                    </div>
                    <div className="rounded-lg bg-bg-base/60 border border-white/5 p-2" data-testid={`ai-field-after-${f.field}`}>
                      <div className="text-white/40 uppercase tracking-wide mb-1">After</div>
                      <pre className="whitespace-pre-wrap text-emerald-200">{previewValue(f.after)}</pre>
                    </div>
                  </div>
                  {(f.warnings || []).length > 0 && (
                    <ul className="mt-2 text-xs text-amber-200 list-disc list-inside">
                      {(f.warnings || []).map((w, i) => (
                        <li key={i} className="inline-flex items-center gap-1 mr-3"><AlertTriangle size={10} /> {w}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
            <div className="text-xs text-white/40">
              {approved.size} of {patch.fields.filter((f) => !f.blocked).length} approvable field(s) accepted
            </div>
            <Button onClick={onApply} disabled={!patch.acceptable || approved.size === 0 || applying} data-testid="ai-apply-btn">
              {applying ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {applying ? 'Applying…' : 'Apply approved fields'}
            </Button>
          </div>

          {applyResult && (
            <ApplyResultPanel
              result={applyResult}
              patch={patch}
              approvedIds={approved}
              onNavigate={(p) => nav(p)}
            />
          )}
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor Bridge — "Send to Page/Blog Editor" panel
// ---------------------------------------------------------------------------
interface ApplyResultPanelProps {
  result: { ok: boolean; runId?: string; appliedFieldCount?: number; error?: string };
  patch: AiSeoPatch;
  approvedIds: Set<string>;
  onNavigate: (path: string) => void;
}

function ApplyResultPanel({ result, patch, approvedIds, onNavigate }: ApplyResultPanelProps) {
  if (!result.ok) {
    return (
      <div
        className="mt-3 rounded-lg border border-red-500/30 bg-red-500/5 text-red-300 px-3 py-2 text-sm"
        data-testid="ai-apply-result"
      >
        Apply failed: {result.error}
      </div>
    );
  }

  const route = parseEditorRoute(patch.url);
  // Snapshot approved field values from patch, mirroring what backend wrote.
  const appliedSnapshot: Record<string, unknown> = {};
  for (const f of patch.fields) {
    if (approvedIds.has(f.id) && !f.blocked) {
      appliedSnapshot[f.field] = f.after;
    }
  }
  const { patch: bridgePatch, skipped } = route
    ? mapApprovedFieldsToEditorDraft(appliedSnapshot, route.target)
    : { patch: {} as Record<string, unknown>, skipped: [] };

  const targetLabel = route?.target === 'blog' ? 'Blog Editor' : 'Page Editor';
  const canSend = !!route && Object.keys(bridgePatch).length > 0 && !!result.runId;

  const sendToEditor = () => {
    if (!canSend || !route || !result.runId) return;
    const handoff: DraftHandoff = {
      runId: result.runId,
      url: patch.url,
      target: route.target,
      locale: route.locale,
      slug: route.slug,
      applied: bridgePatch,
      approvedFields: Object.keys(bridgePatch),
      createdAt: new Date().toISOString(),
    };
    // Hybrid handoff: backend ledger is source of truth (?aiPatch=runId),
    // sessionStorage is the offline fallback for fast UX / reload survival.
    try { sessionStorage.setItem(draftStorageKey(result.runId), JSON.stringify(handoff)); }
    catch { /* sessionStorage can be unavailable in private mode; safe to ignore */ }
    onNavigate(`${route.path}?aiPatch=${encodeURIComponent(result.runId)}`);
  };

  return (
    <div
      className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-emerald-200 px-3 py-2 text-sm space-y-2"
      data-testid="ai-apply-result"
    >
      <div>
        Recorded {result.appliedFieldCount} approved field(s) to AI ledger
        (runId <code className="text-white/80">{result.runId?.slice(0, 8)}</code>).
        Live URLs unchanged.
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap pt-2 border-t border-emerald-500/15">
        <div className="text-xs text-white/60">
          {route
            ? <>Target: <code className="text-white/80">{route.target}</code> · <code className="text-white/80">{route.locale}/{route.slug}</code></>
            : <span className="text-amber-300">URL is not editable (admin/api/non-content).</span>}
          {skipped.length > 0 && (
            <span className="block text-amber-300 mt-1">
              Skipped (unsupported in editor draft): {skipped.join(', ')}
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="primary"
          onClick={sendToEditor}
          disabled={!canSend}
          data-testid="ai-send-to-editor-btn"
        >
          <ArrowRight size={14} /> Send to {targetLabel}
        </Button>
      </div>
      <div className="text-xs text-white/40 leading-snug">
        Draft only — you still need to save and Publish to GitHub in the editor.
      </div>
    </div>
  );
}
