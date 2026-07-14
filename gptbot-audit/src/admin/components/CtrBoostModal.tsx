// CTR Boost — internal-link suggestions modal for AI Draft Inbox.
//
// Renders the suggestions returned by /api/admin/ai-drafts/:id/suggest-links
// as a compact checklist with per-link CTR scores + projected uplift.
// The reviewer ticks the ones they want, edits anchor text in-place, and
// hits "Применить" to commit (calls /apply-links).
//
// Rules respected:
//   * Operator must explicitly select + apply.
//   * URLs are read-only (server validates against the inventory anyway).
//   * Anchors are editable inline so the reviewer can tweak phrasing.

import { useState, useMemo, useEffect } from 'react';
import { X, CircleCheck as CheckCircle2, RefreshCw, TrendingUp, ExternalLink, TriangleAlert as AlertTriangle } from 'lucide-react';
import { Badge, Button, Card } from './ui';

export interface CtrBoostSuggestion {
  target: string;
  anchor: string;
  reason: string;
  link_type: 'money' | 'cluster' | 'sibling';
  ctr_score: number;
  already_exists: boolean;
}

export interface CtrBoostPlan {
  ok: true;
  locale: 'ru' | 'uz';
  suggestions: CtrBoostSuggestion[];
  current_count: number;
  target_count: number;
  projected_uplift: number;
  provider: string;
  model: string;
  fallback_used: boolean;
  duration_ms: number;
}

interface Props {
  open: boolean;
  plan: CtrBoostPlan | null;
  loading: boolean;
  applyError: string | null;
  applyBusy: boolean;
  onApply: (accepted: Array<{ target: string; anchor: string; type: 'money' | 'cluster' | 'sibling' }>) => void;
  onRetry: () => void;
  onCancel: () => void;
}

export function CtrBoostModal({ open, plan, loading, applyError, applyBusy, onApply, onRetry, onCancel }: Props) {
  // Per-suggestion checked state + editable anchor.
  const [edited, setEdited] = useState<Record<number, { checked: boolean; anchor: string }>>({});

  // Re-seed the edit map whenever a fresh plan arrives. Default selection:
  // every NON-existing suggestion checked, existing ones unchecked.
  useEffect(() => {
    if (!plan) return;
    const next: Record<number, { checked: boolean; anchor: string }> = {};
    plan.suggestions.forEach((s, i) => {
      next[i] = { checked: !s.already_exists, anchor: s.anchor };
    });
    setEdited(next);
  }, [plan]);

  const selectedCount = useMemo(
    () => Object.values(edited).filter((e) => e.checked).length,
    [edited],
  );
  const projectedSelected = useMemo(() => {
    if (!plan) return 0;
    const fresh = plan.suggestions
      .map((s, i) => ({ s, i }))
      .filter(({ s, i }) => !s.already_exists && edited[i]?.checked)
      .map(({ s }) => s.ctr_score);
    if (fresh.length === 0) return 0;
    const avg = fresh.reduce((a, b) => a + b, 0) / fresh.length;
    const volume = Math.min(1, fresh.length / 6);
    return Math.round(avg * 0.35 * volume);
  }, [plan, edited]);

  if (!open) return null;

  function toggle(i: number) {
    setEdited((cur) => ({ ...cur, [i]: { ...cur[i], checked: !cur[i]?.checked } }));
  }
  function setAnchor(i: number, v: string) {
    setEdited((cur) => ({ ...cur, [i]: { ...cur[i], anchor: v } }));
  }
  function handleApply() {
    if (!plan) return;
    const accepted: Array<{ target: string; anchor: string; type: 'money' | 'cluster' | 'sibling' }> = [];
    plan.suggestions.forEach((s, i) => {
      const e = edited[i];
      if (!e?.checked) return;
      if (s.already_exists) return; // server rejects duplicates anyway
      const anchor = (e.anchor || s.anchor).trim();
      if (anchor.length < 4 || anchor.length > 120) return;
      accepted.push({ target: s.target, anchor, type: s.link_type });
    });
    if (accepted.length > 0) onApply(accepted);
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      data-testid="ctr-boost-modal"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-bg-base border border-white/10 rounded-2xl w-full max-w-4xl shadow-2xl mb-12">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <TrendingUp size={18} className="text-emerald-300" />
            <div>
              <h2 className="font-display text-lg text-white">CTR Boost · внутренние ссылки</h2>
              <div className="text-white/50 text-xs mt-0.5">
                {plan
                  ? `${plan.locale.toUpperCase()} · текущих ссылок: ${plan.current_count} · кандидатов: ${plan.suggestions.length}`
                  : 'Идёт анализ статьи и контентного инвентаря…'}
                {plan && (
                  <span className="ml-2 text-white/40">
                    · модель: <code className="text-white/60">{plan.provider}/{plan.model}</code>
                    {plan.fallback_used && <span className="ml-1 text-amber-300">· fallback</span>}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="text-white/60 hover:text-white p-1 rounded"
            onClick={onCancel}
            disabled={applyBusy}
            aria-label="Close"
            data-testid="ctr-boost-close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {loading && (
            <Card>
              <div className="text-white/70 text-sm flex items-center gap-2">
                <RefreshCw size={14} className="animate-spin" /> Анализирую статью + контентный инвентарь…
              </div>
            </Card>
          )}

          {applyError && (
            <Card className="border-red-500/30 bg-red-500/5">
              <div className="text-red-300 text-sm flex items-start gap-2" data-testid="ctr-boost-apply-error">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {applyError}
              </div>
            </Card>
          )}

          {plan && (
            <>
              {/* Projected uplift card */}
              <Card className="border-emerald-500/30 bg-emerald-500/5">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <div className="text-white/85 font-medium">Прогнозируемый прирост CTR</div>
                    <div className="text-emerald-200 text-2xl font-display mt-1" data-testid="ctr-boost-projected">
                      +{projectedSelected}%
                    </div>
                    <div className="text-white/50 text-xs mt-0.5">
                      Консервативная оценка по выбранным {selectedCount} ссылк{selectedCount === 1 ? 'е' : selectedCount < 5 ? 'ам' : 'ам'} (макс. модельный потолок 35%).
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-white/40 text-xs uppercase tracking-wide">Целевое</div>
                    <div className="text-white/80 text-xl font-display">{plan.target_count}</div>
                    <div className="text-white/40 text-xs">ссылок на статью</div>
                  </div>
                </div>
              </Card>

              {/* Suggestions checklist */}
              <div className="space-y-2" data-testid="ctr-boost-suggestions">
                {plan.suggestions.map((s, i) => {
                  const e = edited[i] ?? { checked: false, anchor: s.anchor };
                  const tone =
                    s.link_type === 'money' ? 'success' :
                    s.link_type === 'cluster' ? 'info' :
                    'neutral';
                  return (
                    <div
                      key={i}
                      className={`border rounded-lg px-4 py-3 transition-colors ${e.checked ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-white/10'}`}
                      data-testid={`ctr-boost-row-${i}`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 accent-emerald-400 cursor-pointer"
                          checked={e.checked}
                          disabled={s.already_exists}
                          onChange={() => toggle(i)}
                          data-testid={`ctr-boost-check-${i}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge tone={tone}>{s.link_type}</Badge>
                            {s.already_exists && <Badge tone="warning">уже на странице</Badge>}
                            <Badge tone={s.ctr_score >= 70 ? 'success' : s.ctr_score >= 50 ? 'info' : 'neutral'}>
                              CTR {s.ctr_score}
                            </Badge>
                            <code className="text-brand-cyan/80 text-xs flex items-center gap-1 truncate">
                              <ExternalLink size={11} />{s.target}
                            </code>
                          </div>
                          <input
                            type="text"
                            value={e.anchor}
                            onChange={(ev) => setAnchor(i, ev.target.value)}
                            disabled={!e.checked || s.already_exists}
                            className="mt-2 w-full bg-bg-base border border-white/10 rounded px-2 py-1.5 text-sm text-white/90 disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-emerald-400/40"
                            data-testid={`ctr-boost-anchor-${i}`}
                            maxLength={120}
                          />
                          <div className="text-white/55 text-xs mt-1.5">{s.reason}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer actions */}
        <div className="border-t border-white/10 px-6 py-4 flex items-center justify-end gap-2 flex-wrap">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={applyBusy} data-testid="ctr-boost-cancel">
            Отмена
          </Button>
          <Button variant="secondary" size="sm" onClick={onRetry} disabled={loading || applyBusy} data-testid="ctr-boost-retry">
            <RefreshCw size={14}/> Перезапросить
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleApply}
            disabled={!plan || selectedCount === 0 || applyBusy || loading}
            data-testid="ctr-boost-apply"
          >
            <CheckCircle2 size={14}/> {applyBusy ? 'Применяю…' : `Применить (${selectedCount})`}
          </Button>
        </div>
      </div>
    </div>
  );
}
