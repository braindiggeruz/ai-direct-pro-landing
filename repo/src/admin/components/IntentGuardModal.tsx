// Intent Guard drawer/modal — shown after analyze (or after retarget).
//
// Answers the 5 questions:
//   1. Есть ли конфликт?
//   2. С какой страницей?
//   3. Почему страницы конкурируют?
//   4. Что предлагает AI изменить?
//   5. Какой будет риск после изменения?
//
// Two modes:
//   * analysis-only:    shows conflicts + recommendation; CTA goes to retarget
//   * proposal-applied: also shows the AI-generated optimized article diff,
//                       Apply / Retry / Cancel buttons, and after Apply the
//                       recheck risk score (before → after).

import { useMemo } from 'react';
import { X, CheckCircle2, RefreshCw, Wand2, ChevronRight } from 'lucide-react';
import { Badge, Button, Card } from './ui';
import { IntentGuardBadge } from './IntentGuardBadge';
import { useT } from '../i18n';
import type {
  IntentConflict, IntentFingerprint, IntentRiskLevel, RetargetProposal,
  SemanticVerdict,
} from '../../shared/intent-guard';
import type { AiDraftArticle } from '../../shared/ai-drafts';

export interface IntentGuardAnalysisView {
  risk_score: number;
  risk_level: IntentRiskLevel;
  fingerprint: IntentFingerprint;
  intent_key: string;
  conflicts: IntentConflict[];
  inventory_counts: { pages_total: number; pages_published: number; blog_total: number; blog_published: number; drafts_pending: number; reservations_active: number };
  recommendation: SemanticVerdict['recommendation'];
  serper: { used: boolean; queries_run: number; overlap_score: number };
  semantic: { used: boolean; summary: string; model?: string };
}

export interface RetargetState {
  proposal: RetargetProposal;
  risk_score_before: number;
  provisional_risk_score?: number;
  attempts_summary?: Array<{ iteration: number; risk_score: number; accepted: boolean; rejection_reason?: string; strategy: string }>;
}

export interface ApplyResult {
  risk_score_after: number;
  risk_level_after: IntentRiskLevel;
}

interface Props {
  open: boolean;
  locale: 'ru' | 'uz';
  analysis: IntentGuardAnalysisView | null;
  retarget: RetargetState | null;
  applyResult: ApplyResult | null;
  busyAnalyze: boolean;
  busyRetarget: boolean;
  busyApply: boolean;
  /** Whether the Apply button is enabled. False for editor mode without
      an onApply callback (publish-guard only). */
  canApply?: boolean;
  error: string | null;
  onRefineWithAi: () => void;          // request a retarget proposal
  onApply: () => void;                  // commit current proposal
  onAnotherVariant: () => void;         // re-run retarget with same context
  onCancel: () => void;
}

function localiseStrategy(s: RetargetProposal['strategy'] | string, t: ReturnType<typeof useT>['t']): string {
  switch (s) {
    case 'keep':                  return t.intentGuard.strategyKeep;
    case 'narrow':                return t.intentGuard.strategyNarrow;
    case 'change_audience':       return t.intentGuard.strategyChangeAudience;
    case 'change_industry':       return t.intentGuard.strategyChangeIndustry;
    case 'change_channel':        return t.intentGuard.strategyChangeChannel;
    case 'change_funnel_stage':   return t.intentGuard.strategyChangeFunnel;
    case 'change_modifier':       return t.intentGuard.strategyChangeModifier;
    case 'change_content_format': return t.intentGuard.strategyChangeFormat;
    case 'merge':                 return t.intentGuard.strategyMerge;
    case 'reject':                return t.intentGuard.strategyReject;
    default:                      return s as string;
  }
}

function localiseSource(s: IntentConflict['source_type'], t: ReturnType<typeof useT>['t']): string {
  switch (s) {
    case 'money_page':     return t.intentGuard.sourceMoneyPage;
    case 'blog':           return t.intentGuard.sourceBlog;
    case 'ai_draft':       return t.intentGuard.sourceAiDraft;
    case 'reserved_topic': return t.intentGuard.sourceReservedTopic;
    case 'plan_item':      return t.intentGuard.sourcePlanItem;
    default:               return s;
  }
}

export function IntentGuardModal({
  open, locale, analysis, retarget, applyResult,
  busyAnalyze, busyRetarget, busyApply, canApply = true, error,
  onRefineWithAi, onApply, onAnotherVariant, onCancel,
}: Props) {
  const { t, tpl } = useT();
  const diff = useMemo(() => {
    if (!retarget || !analysis) return null;
    return buildArticleDiff(retarget.proposal.optimized_article);
  }, [retarget, analysis]);
  if (!open) return null;
  if (!analysis) return null;

  const conflicts = analysis.conflicts.slice(0, 5);
  const isLow = analysis.risk_level === 'low';
  const showApply = !!retarget && retarget.proposal.decision !== 'reject';
  const after = applyResult;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      data-testid="intent-guard-modal"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-bg-base border border-white/10 rounded-2xl w-full max-w-5xl shadow-2xl mb-12">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Wand2 size={18} className="text-brand-cyan"/>
            <div>
              <h2 className="font-display text-lg text-white" data-testid="intent-guard-modal-title">
                {t.intentGuard.drawerTitle} · {locale.toUpperCase()}
              </h2>
              <p className="text-white/55 text-xs mt-0.5">{t.intentGuard.drawerSubtitle}</p>
            </div>
          </div>
          <button
            type="button"
            className="text-white/60 hover:text-white p-1 rounded"
            onClick={onCancel}
            disabled={busyApply}
            aria-label={t.intentGuard.cancel}
            data-testid="intent-guard-close"
          >
            <X size={18}/>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <Card className="border-red-500/30 bg-red-500/5">
              <div className="text-red-300 text-sm" data-testid="intent-guard-error">{error}</div>
            </Card>
          )}

          {/* Q1 + Q2 — конфликт / страница */}
          <Card className={isLow ? 'border-emerald-500/30 bg-emerald-500/5' : (analysis.risk_level === 'medium' ? 'border-amber-500/30 bg-amber-500/5' : 'border-red-500/30 bg-red-500/5')}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-white font-medium" data-testid="intent-guard-question-conflict">
                  {t.intentGuard.qIsConflict}
                </div>
                <div className="text-white/80 text-sm mt-1">
                  {isLow ? t.intentGuard.statusUniqueBody
                   : analysis.risk_level === 'medium' ? t.intentGuard.statusOverlapBody
                   : t.intentGuard.statusConflictBody}
                </div>
              </div>
              <IntentGuardBadge level={analysis.risk_level} score={analysis.risk_score} size="md" testId="intent-guard-current-badge"/>
            </div>
            <div className="text-white/55 text-xs mt-3">
              {t.intentGuard.inventoryCounts}:{' '}
              {analysis.inventory_counts.pages_published} {t.intentGuard.inventoryPages}{' · '}
              {analysis.inventory_counts.blog_published} {t.intentGuard.inventoryBlog}{' · '}
              {analysis.inventory_counts.drafts_pending} {t.intentGuard.inventoryDrafts}{' · '}
              {analysis.inventory_counts.reservations_active} {t.intentGuard.inventoryReservations}
            </div>
          </Card>

          {/* Q2 conflicts list */}
          {!isLow && conflicts.length > 0 && (
            <Card>
              <div className="text-white font-medium mb-2" data-testid="intent-guard-question-pages">{t.intentGuard.qWithWhichPage}</div>
              <ul className="space-y-2 text-sm" data-testid="intent-guard-conflicts-list">
                {conflicts.map((c) => (
                  <li key={c.id} className="border border-white/10 rounded-lg px-3 py-2" data-testid={`intent-guard-conflict-${c.id}`}>
                    <div className="flex items-start gap-2 flex-wrap">
                      <Badge tone={c.source_type === 'money_page' ? 'success' : c.source_type === 'blog' ? 'info' : 'neutral'}>{localiseSource(c.source_type, t)}</Badge>
                      <code className="text-brand-cyan text-xs">{c.url || c.id}</code>
                      <span className="text-white/70 text-sm flex-1 min-w-0 truncate" title={c.title}>{c.title}</span>
                      <IntentGuardBadge level={c.similarity.score >= 65 ? 'high' : c.similarity.score >= 30 ? 'medium' : 'low'} score={c.similarity.score} testId={`intent-guard-conflict-score-${c.id}`}/>
                    </div>
                    <div className="text-white/55 text-xs mt-1.5" data-testid={`intent-guard-conflict-reason-${c.id}`}>
                      <strong className="text-white/70">{t.intentGuard.qWhyCompete}</strong> {c.reason}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Q4 — proposal */}
          {showApply && retarget && (
            <Card className="border-brand-blue/30 bg-brand-blue/5" data-testid="intent-guard-proposal">
              <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                <div className="text-white font-medium">{t.intentGuard.qWhatProposeChange}</div>
                <Badge tone="info">{localiseStrategy(retarget.proposal.strategy, t)}</Badge>
              </div>
              <div className="text-white/80 text-sm whitespace-pre-line" data-testid="intent-guard-proposal-reason">{retarget.proposal.reason}</div>
              {/* Attempts summary — visible only when AI iterated. */}
              {retarget.attempts_summary && retarget.attempts_summary.length > 1 && (
                <div className="mt-3 border border-white/10 rounded-lg p-2 text-xs" data-testid="intent-guard-attempts">
                  <div className="text-white/65 mb-1">
                    AI сделал <strong className="text-white">{retarget.attempts_summary.length}</strong> {retarget.attempts_summary.length > 1 ? 'попытки' : 'попытку'} разведения интентов:
                  </div>
                  <ul className="space-y-0.5">
                    {retarget.attempts_summary.map((a) => (
                      <li key={a.iteration} className={a.accepted ? 'text-emerald-300' : 'text-amber-300/90'}>
                        Попытка {a.iteration}: риск {a.risk_score}, стратегия {a.strategy}{a.accepted ? ' — принята' : ` — ${a.rejection_reason || 'отклонена'}`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {retarget.proposal.changes.length > 0 && (
                <div className="mt-3">
                  <div className="text-white/70 text-xs mb-1">{t.intentGuard.proposalIntroduced}</div>
                  <ul className="list-disc list-inside text-emerald-200/90 text-sm space-y-0.5" data-testid="intent-guard-proposal-changes">
                    {retarget.proposal.changes.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </div>
              )}
              {retarget.proposal.kept.length > 0 && (
                <div className="mt-3 text-white/60 text-xs">
                  <strong className="text-white/70">{t.intentGuard.keptHeading}:</strong> {retarget.proposal.kept.join('; ')}
                </div>
              )}
              {retarget.proposal.warnings.length > 0 && (
                <div className="mt-3 text-amber-300/90 text-xs" data-testid="intent-guard-proposal-warnings">
                  <strong>{t.intentGuard.warningsHeading}:</strong>
                  <ul className="list-disc list-inside mt-1">{retarget.proposal.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                </div>
              )}
              {diff && (
                <details className="mt-3 text-white/70 text-xs">
                  <summary className="cursor-pointer text-white/80">Подробный diff (Было / Стало)</summary>
                  <DiffPreview diff={diff}/>
                </details>
              )}
            </Card>
          )}

          {/* Q5 — predicted result + actual after Apply */}
          {showApply && retarget && (
            <Card data-testid="intent-guard-risk-comparison">
              <div className="text-white font-medium mb-2">{t.intentGuard.qNewRisk}</div>
              <div className="flex items-center gap-4 flex-wrap">
                <div data-testid="intent-guard-risk-before">
                  <div className="text-white/50 text-xs">{t.intentGuard.riskBefore}</div>
                  <IntentGuardBadge level={analysis.risk_level} score={retarget.risk_score_before} size="md"/>
                </div>
                <ChevronRight size={18} className="text-white/40"/>
                {after ? (
                  <div data-testid="intent-guard-risk-after">
                    <div className="text-white/50 text-xs">{t.intentGuard.riskAfter}</div>
                    <IntentGuardBadge level={after.risk_level_after} score={after.risk_score_after} size="md"/>
                  </div>
                ) : (
                  <div className="text-white/50 text-xs">
                    {t.intentGuard.expectedResultPending}
                  </div>
                )}
              </div>
              {after && (
                <div className="mt-3 text-sm" data-testid="intent-guard-recheck-text">
                  {after.risk_score_after < retarget.risk_score_before
                    ? <span className="text-emerald-300">{tpl(t.intentGuard.riskReduced, { before: retarget.risk_score_before, after: after.risk_score_after })}</span>
                    : after.risk_level_after === 'medium'
                      ? <span className="text-amber-300">{tpl(t.intentGuard.riskStillMedium, { before: retarget.risk_score_before, after: after.risk_score_after })}</span>
                      : <span className="text-red-300">{tpl(t.intentGuard.riskStillHigh, { before: retarget.risk_score_before, after: after.risk_score_after })}</span>}
                </div>
              )}
            </Card>
          )}

          {/* Dev details */}
          <details className="text-white/40 text-xs">
            <summary className="cursor-pointer text-white/70">{t.intentGuard.devDetails}</summary>
            <pre className="text-white/60 text-[11px] bg-bg-base border border-white/10 rounded-lg p-3 overflow-x-auto mt-2" data-testid="intent-guard-dev-details">
{JSON.stringify({
  fingerprint: analysis.fingerprint,
  intent_key: analysis.intent_key,
  serper: analysis.serper,
  semantic: analysis.semantic,
  proposal_decision: retarget?.proposal.decision,
  proposal_strategy: retarget?.proposal.strategy,
}, null, 2)}
            </pre>
            <div className="text-white/45 text-[11px] mt-2">{t.intentGuard.semanticDisclaimer}</div>
          </details>
        </div>

        <div className="border-t border-white/10 px-6 py-4 flex items-center justify-end gap-2 flex-wrap">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busyApply} data-testid="intent-guard-cancel">
            {t.intentGuard.cancel}
          </Button>
          {!retarget && !isLow && (
            <Button variant="primary" size="sm" onClick={onRefineWithAi} disabled={busyRetarget || busyAnalyze} data-testid="intent-guard-refine">
              {busyRetarget ? <RefreshCw size={14} className="animate-spin"/> : <Wand2 size={14}/>}
              {analysis.risk_level === 'medium' ? t.intentGuard.btnRefineWithAi : t.intentGuard.btnSeparateIntents}
            </Button>
          )}
          {retarget && (
            <>
              <Button variant="secondary" size="sm" onClick={onAnotherVariant} disabled={busyRetarget || busyApply} data-testid="intent-guard-another-variant">
                <RefreshCw size={14}/> {t.intentGuard.btnCreateAnotherVariant}
              </Button>
              <Button variant="primary" size="sm" onClick={onApply} disabled={busyApply || !canApply || retarget.proposal.decision === 'reject'} data-testid="intent-guard-apply">
                <CheckCircle2 size={14}/> {busyApply ? t.intentGuard.applyApplying : t.intentGuard.applyHeading}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface ArticleDiffSection {
  field: string;
  before: string;
  after: string;
}

function buildArticleDiff(article: AiDraftArticle): ArticleDiffSection[] {
  return [
    { field: 'meta_title', before: '', after: article.meta_title },
    { field: 'meta_description', before: '', after: article.meta_description },
    { field: 'h1', before: '', after: article.h1 },
    { field: 'excerpt', before: '', after: article.excerpt },
    { field: 'target_keyword', before: '', after: article.target_keyword },
    { field: 'target_money_page', before: '', after: article.target_money_page || '' },
  ];
}

function DiffPreview({ diff }: { diff: ArticleDiffSection[] }) {
  return (
    <div className="space-y-2 mt-2">
      {diff.map((d) => (
        <div key={d.field} className="border border-white/10 rounded-lg px-2 py-1.5">
          <div className="text-white/55 text-[11px] font-mono">{d.field}</div>
          <div className="text-white/85 text-sm whitespace-pre-wrap mt-0.5" data-testid={`intent-guard-diff-${d.field}`}>{d.after || '—'}</div>
        </div>
      ))}
    </div>
  );
}
