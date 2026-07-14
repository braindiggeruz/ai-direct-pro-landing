// Banner shown at the top of PageEditor / BlogEditor when an AI SEO draft has
// been handed off via the Editor Bridge (?aiPatch=…).
//
// The banner is purely presentational. It receives the AiDraftState from the
// useAiDraftBridge hook, an `onApply` callback that prefills the editor's
// local state, and a `onClear` callback that exits AI-draft mode.

import { Sparkles, ShieldCheck, X, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle2 } from 'lucide-react';
import { Button } from './ui';
import type { AiDraftState } from '../hooks/useAiDraftBridge';

interface AiDraftBannerProps {
  state: AiDraftState;
  onApply: () => void;
}

const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  description: 'Description',
  h1: 'H1',
  heroSubtitle: 'Hero subtitle',
  intro: 'Intro / excerpt',
  ogTitle: 'OG title',
  ogDescription: 'OG description',
  faq: 'FAQ',
  internalLinks: 'Internal links',
  topicCluster: 'Topic cluster',
  targetMoneyPage: 'Target money page',
  keywords: 'Keywords',
};

function summarizeValue(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'string') return v.length > 80 ? `${v.slice(0, 80)}…` : v;
  if (Array.isArray(v)) return `${v.length} item(s)`;
  if (typeof v === 'object') return '[object]';
  return String(v);
}

export function AiDraftBanner({ state, onApply }: AiDraftBannerProps) {
  if (state.status === 'idle' || !state.runId) return null;

  const isReady = state.status === 'ready';
  const hasError = state.status === 'error' || state.status === 'mismatch';

  return (
    <div
      className={`rounded-2xl border p-4 ${
        isReady
          ? 'border-brand-cyan/40 bg-brand-blue/10 text-white'
          : hasError
            ? 'border-amber-500/40 bg-amber-500/5 text-amber-100'
            : 'border-white/10 bg-white/[0.03] text-white/70'
      }`}
      data-testid="ai-draft-banner"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <Sparkles size={18} className={isReady ? 'text-brand-cyan mt-0.5' : 'text-white/40 mt-0.5'} />
          <div className="min-w-0">
            <div className="font-medium" data-testid="ai-draft-banner-title">
              {state.status === 'loading' && 'Loading AI SEO draft…'}
              {state.status === 'ready' && 'AI SEO draft loaded. Review changes before saving. Nothing is published yet.'}
              {state.status === 'mismatch' && 'AI draft does not match this editor entity.'}
              {state.status === 'error' && 'Could not load AI draft.'}
            </div>
            <div className="text-xs text-white/60 mt-1 leading-snug">
              runId <code className="text-white/80">{state.runId.slice(0, 8)}</code>
              {state.source && <span className="ml-2">· source: {state.source}</span>}
              {state.error && <span className="ml-2 text-amber-200">· {state.error}</span>}
            </div>
            {isReady && Object.keys(state.applied).length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-white/70" data-testid="ai-draft-fields">
                {Object.entries(state.applied).map(([k, v]) => (
                  <li key={k} className="flex items-start gap-2" data-testid={`ai-draft-field-${k}`}>
                    <ShieldCheck size={12} className="text-emerald-300 mt-0.5" />
                    <span className="text-white/80 font-medium">{FIELD_LABELS[k] || k}:</span>
                    <span className="text-white/60 truncate">{summarizeValue(v)}</span>
                  </li>
                ))}
              </ul>
            )}
            {isReady && state.skipped.length > 0 && (
              <div
                className="mt-2 text-xs text-amber-200 flex items-start gap-1"
                data-testid="ai-draft-skipped"
              >
                <AlertTriangle size={12} className="mt-0.5" />
                Skipped fields (not safe to forward to editor): {state.skipped.join(', ')}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isReady && !state.isApplied && (
            <Button
              size="sm"
              variant="primary"
              onClick={onApply}
              data-testid="ai-draft-apply-btn"
            >
              <CheckCircle2 size={14} /> Apply to draft
            </Button>
          )}
          {isReady && state.isApplied && (
            <span
              className="inline-flex items-center gap-1 text-emerald-300 text-xs"
              data-testid="ai-draft-applied-flag"
            >
              <CheckCircle2 size={12} /> Applied locally
            </span>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={state.clearDraft}
            data-testid="ai-draft-clear-btn"
          >
            <X size={14} /> Clear AI draft
          </Button>
        </div>
      </div>
    </div>
  );
}
