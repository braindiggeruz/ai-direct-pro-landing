// SERP Intelligence tab — lives under /admin-tools/seo-booster.
//
// What it does:
//   - Shows Serper provider status (configured / cached / runs).
//   - Lets the admin pick a URL from the Booster report and run a single
//     SERP snapshot (cache-first, 7d TTL).
//   - Displays top10 competitors, related searches, PAA, content gaps,
//     title/meta opportunities, and the rank spot-check for gptbot.uz.
//   - Saves the most recent digest into sessionStorage so the AI Autopilot
//     tab can opt-in to use it as inspirational context.
//
// Hard guarantees:
//   - No auto-query on tab open. Manual button only.
//   - Cache TTL + 24h cooldown enforced server-side; the UI just renders
//     "cached" badges.
//   - Raw upstream payload is never displayed beyond what backend trimmed.

import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, Input, Select } from '../../components/ui';
import { api } from '../../lib/api';
import type { BoosterReport, BoosterItem } from '../../../shared/booster';
import type {
  SerperProviderStatus,
  SerpDigest,
  SerperQueryResult,
} from '../../../shared/serp';
import {
  Search,
  RefreshCw,
  Globe,
  Target,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { writeDigestToSession } from './serpHandoff';

interface Props {
  report: BoosterReport;
  /** Switch parent SeoBooster to AI Autopilot tab and preselect the URL. */
  onSendToAutopilot: (url: string) => void;
}

export default function SerpIntelligenceTab({ report, onSendToAutopilot }: Props) {
  const [status, setStatus] = useState<SerperProviderStatus | null>(null);
  const [statusErr, setStatusErr] = useState<string | null>(null);
  const [selectedUrl, setSelectedUrl] = useState<string>('');
  const [extraQuery, setExtraQuery] = useState<string>('');
  const [running, setRunning] = useState(false);
  const [runErr, setRunErr] = useState<string | null>(null);
  const [result, setResult] = useState<SerperQueryResult | null>(null);

  useEffect(() => { void (async () => {
    try { setStatus(await api.serperStatus()); }
    catch (e) { setStatusErr((e as Error).message); }
  })(); }, []);

  const pushableItems = useMemo(() => report.items.filter((i) => i.status === 'published'), [report.items]);
  const selectedItem: BoosterItem | undefined = useMemo(
    () => pushableItems.find((i) => i.url === selectedUrl),
    [pushableItems, selectedUrl],
  );

  const runAnalyze = async (forceRefresh = false) => {
    if (!selectedItem) return;
    setRunning(true); setRunErr(null); setResult(null);
    try {
      const r = await api.serperAnalyzeUrl({
        url: selectedItem.url,
        locale: selectedItem.locale as 'ru' | 'uz',
        title: selectedItem.title,
        description: selectedItem.description,
        h1: selectedItem.h1,
        primaryKeyword: selectedItem.primaryKeyword,
        extraQuery: extraQuery.trim() || undefined,
        forceRefresh,
      });
      setResult(r);
      writeDigestToSession(selectedItem.url, r.digest);
      // Refresh status so cachedSnapshots / queriesToday update.
      try { setStatus(await api.serperStatus()); } catch { /* ignore */ }
    } catch (e) {
      setRunErr((e as Error).message);
    }
    setRunning(false);
  };

  return (
    <div className="space-y-4" data-testid="serp-intel">
      {/* === Status === */}
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Globe size={16} className="text-brand-cyan" />
            <span className="text-sm text-white/60">Serper:</span>
            {status
              ? <Badge tone={status.configured ? 'success' : 'warning'} data-testid="serp-status-badge">
                  {status.configured ? 'configured' : 'missing key'}
                </Badge>
              : <span className="text-white/40 text-sm">loading…</span>}
          </div>
          {status && (
            <>
              <div className="text-sm text-white/60">
                Cached snapshots: <strong className="text-white" data-testid="serp-cached-count">{status.cachedSnapshots}</strong>
              </div>
              <div className="text-sm text-white/60">
                Queries today: <strong className="text-white" data-testid="serp-queries-today">{status.queriesToday}</strong>
              </div>
              <div className="text-sm text-white/60">
                Last check: <strong className="text-white">{status.lastCheckAt ? new Date(status.lastCheckAt).toLocaleString() : '—'}</strong>
              </div>
            </>
          )}
          {statusErr && <span className="text-xs text-red-300">status failed: {statusErr}</span>}
        </div>
        {status && (
          <div className="text-xs text-white/40 mt-2">{status.note}</div>
        )}
        <div className="text-xs text-white/40 mt-1">Manual checks only. Cached 7 days to save credits.</div>
      </Card>

      {/* === Selector === */}
      <Card>
        <h3 className="font-display text-base text-white mb-3 flex items-center gap-2">
          <Search size={16} /> Pick a URL from SEO Booster
        </h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <Select
            value={selectedUrl}
            onChange={(e) => setSelectedUrl(e.target.value)}
            data-testid="serp-url-select"
          >
            <option value="">— select URL —</option>
            {pushableItems.map((it) => (
              <option key={it.url} value={it.url}>
                [{it.locale}] {it.kind} · {it.url}
              </option>
            ))}
          </Select>
          <Input
            placeholder='Optional extra query, e.g. "AI бот Ташкент"'
            value={extraQuery}
            onChange={(e) => setExtraQuery(e.target.value)}
            disabled={!selectedItem}
            data-testid="serp-extra-query"
          />
        </div>

        {selectedItem && (
          <div className="mt-3 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-xs text-white/70 space-y-1">
            <div>title: <span className="text-white/90">{selectedItem.title}</span></div>
            <div>description: <span className="text-white/90">{selectedItem.description}</span></div>
            <div>primaryKeyword: <span className="text-white/90">{selectedItem.primaryKeyword || '—'}</span></div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mt-3">
          <Button
            onClick={() => void runAnalyze(false)}
            disabled={!selectedItem || running || !status?.configured}
            data-testid="serp-run-btn"
          >
            {running ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {running ? 'Running…' : 'Run SERP Snapshot'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => void runAnalyze(true)}
            disabled={!selectedItem || running || !status?.configured}
            data-testid="serp-force-refresh-btn"
          >
            <RefreshCw size={14} /> Force refresh
          </Button>
          {!status?.configured && (
            <span className="text-xs text-amber-300 flex items-center gap-1">
              <AlertTriangle size={12} /> Add SERPER_API_KEY in Cloudflare Pages env to enable.
            </span>
          )}
        </div>
        {runErr && (
          <div
            className="mt-3 rounded-lg border border-red-500/30 bg-red-500/5 text-red-300 px-3 py-2 text-sm"
            data-testid="serp-run-error"
          >
            {runErr}
          </div>
        )}
      </Card>

      {/* === Results === */}
      {result && <DigestPanel
        digest={result.digest}
        cached={result.cached}
        cacheStatus={result.cacheStatus}
        onSendToAutopilot={() => selectedItem && onSendToAutopilot(selectedItem.url)}
      />}
    </div>
  );
}

function DigestPanel({ digest, cached, cacheStatus, onSendToAutopilot }: {
  digest: SerpDigest;
  cached: boolean;
  cacheStatus: SerperQueryResult['cacheStatus'];
  onSendToAutopilot: () => void;
}) {
  return (
    <div className="space-y-4" data-testid="serp-digest">
      <Card>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-widest text-white/40">SERP digest</div>
            <h3 className="font-display text-lg text-white mt-1">
              {digest.query}
            </h3>
            <div className="text-xs text-white/60 mt-1">
              intent: <Badge tone="info">{digest.intent}</Badge>{' '}
              · {digest.locale} · {digest.location}{' '}
              <Badge tone={cached ? 'neutral' : 'success'} data-testid="serp-cache-badge">{cacheStatus}</Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {digest.rankSpotCheck.found ? (
              <Badge tone="success" data-testid="serp-rank-found">
                <Target size={12} /> gptbot.uz · #{digest.rankSpotCheck.position}
              </Badge>
            ) : (
              <Badge tone="warning" data-testid="serp-rank-missing">
                <Target size={12} /> gptbot.uz · not in top10
              </Badge>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={onSendToAutopilot}
              data-testid="serp-send-to-autopilot-btn"
            >
              <Sparkles size={14} /> Generate AI patch from SERP context
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <h4 className="text-sm font-semibold text-white mb-2">Top competitors</h4>
          <ol className="space-y-2 text-sm" data-testid="serp-competitors">
            {digest.topCompetitors.map((c) => (
              <li key={c.position} className="flex gap-2" data-testid={`serp-competitor-${c.position}`}>
                <span className="text-white/40 w-6 shrink-0">#{c.position}</span>
                <div className="min-w-0">
                  <div className="text-white truncate">{c.title}</div>
                  <div className="text-white/40 text-xs">{c.domain}</div>
                  <div className="text-white/60 text-xs leading-snug mt-0.5">{c.snippet}</div>
                </div>
              </li>
            ))}
            {digest.topCompetitors.length === 0 && <li className="text-white/40 text-sm">No organic results.</li>}
          </ol>
        </Card>

        <Card>
          <h4 className="text-sm font-semibold text-white mb-2">Related searches</h4>
          <ul className="space-y-1 text-sm" data-testid="serp-related">
            {digest.relatedSearches.map((q, i) => (
              <li key={i} className="text-white/80 flex items-start gap-1">
                <ShieldCheck size={12} className="text-emerald-300 mt-1 shrink-0" /> {q}
              </li>
            ))}
            {digest.relatedSearches.length === 0 && <li className="text-white/40">—</li>}
          </ul>
          <h4 className="text-sm font-semibold text-white mt-4 mb-2">FAQ ideas</h4>
          <ul className="space-y-1 text-sm" data-testid="serp-faqs">
            {digest.faqIdeas.map((f, i) => (
              <li key={i} className="text-white/80 flex items-start gap-2" data-testid={`serp-faq-${i}`}>
                <Badge tone="info">{f.source}</Badge> <span>{f.question}</span>
              </li>
            ))}
            {digest.faqIdeas.length === 0 && <li className="text-white/40">—</li>}
          </ul>
        </Card>

        <Card>
          <h4 className="text-sm font-semibold text-white mb-2">Content gaps</h4>
          <ul className="space-y-1 text-sm" data-testid="serp-gaps">
            {digest.contentGaps.map((g, i) => (
              <li key={i} className="text-white/80 flex items-center gap-2">
                <Badge tone="warning">×{g.competitorCount}</Badge> {g.topic}
              </li>
            ))}
            {digest.contentGaps.length === 0 && <li className="text-white/40">No clear gaps detected — solid coverage.</li>}
          </ul>
        </Card>

        <Card>
          <h4 className="text-sm font-semibold text-white mb-2">Title / meta opportunities</h4>
          <ul className="space-y-2 text-sm" data-testid="serp-meta-opps">
            {digest.titleMetaOpportunities.map((o, i) => (
              <li key={i} className="text-white/80">
                <Badge tone="info">{o.field}</Badge>{' '}
                <span className="text-white/60 text-xs">(current: {o.currentLength} chars)</span>
                <div className="text-white/90 mt-1">{o.suggestion}</div>
              </li>
            ))}
            {digest.titleMetaOpportunities.length === 0 && <li className="text-white/40">Title / description are within recommended bounds.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
