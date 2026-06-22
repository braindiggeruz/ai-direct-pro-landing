// Drop-in Intent Guard control surface for the AI Draft Detail page +
// Blog Editor. Owns:
//   * the indicator badge (red/yellow/green)
//   * the "Проверить и улучшить" button
//   * triggering analyze + retarget + apply (apply only when source='draft')
//   * showing the IntentGuardModal
//
// Two modes:
//   * mode='draft'  — talks to /cannibalization/analyze + /retarget +
//                     /apply-retarget against an existing AI draft.
//                     Locale + draftId required.
//   * mode='editor' — analyses an in-memory BlogArticle / unsaved form.
//                     Apply is disabled (no draft to mutate); the panel
//                     becomes a publish guard.

import { useEffect, useState } from 'react';
import { ShieldAlert, ShieldCheck, AlertTriangle, Wand2, RefreshCw } from 'lucide-react';
import { Button, Card } from './ui';
import { IntentGuardBadge } from './IntentGuardBadge';
import { IntentGuardModal, type IntentGuardAnalysisView, type RetargetState, type ApplyResult } from './IntentGuardModal';
import { api } from '../lib/api';
import { useT } from '../i18n';
import type { AiDraftArticle, AiDraftRecord } from '../../shared/ai-drafts';
import type { IntentRiskLevel } from '../../shared/intent-guard';

interface BaseProps {
  locale: 'ru' | 'uz';
  /** Optional initial state — when we already have a recent analysis cached. */
  initialAnalysis?: IntentGuardAnalysisView | null;
  onDraftUpdated?: (draft: AiDraftRecord) => void;
  testIdPrefix?: string;
  className?: string;
}

interface DraftModeProps extends BaseProps {
  mode: 'draft';
  draftId: string;
  article: AiDraftArticle | null;
}
interface EditorModeProps extends BaseProps {
  mode: 'editor';
  article: AiDraftArticle | null;
  draftId?: string;
}

export type IntentGuardPanelProps = DraftModeProps | EditorModeProps;

export function IntentGuardPanel(props: IntentGuardPanelProps) {
  const { t } = useT();
  const [analysis, setAnalysis] = useState<IntentGuardAnalysisView | null>(props.initialAnalysis ?? null);
  const [retarget, setRetarget] = useState<RetargetState | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [open, setOpen] = useState(false);
  const [busyAnalyze, setBusyAnalyze] = useState(false);
  const [busyRetarget, setBusyRetarget] = useState(false);
  const [busyApply, setBusyApply] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const prefix = props.testIdPrefix || 'intent-guard-panel';

  useEffect(() => {
    // Reset retarget proposal when the underlying article identity changes.
    setRetarget(null);
    setApplyResult(null);
  }, [props.mode === 'draft' ? props.draftId : null, props.locale, props.article?.slug]);

  async function doAnalyze(autoOpen = true) {
    if (!props.article) { setErr(t.intentGuard.analyzeFailed); return; }
    setBusyAnalyze(true); setErr(null);
    try {
      const r = await api.cannibalizationAnalyze(
        props.mode === 'draft'
          ? { source: 'draft', draftId: props.draftId, locale: props.locale }
          : { source: 'editor', article: props.article, draftId: props.draftId }
      );
      const a: IntentGuardAnalysisView = {
        risk_score: r.risk_score,
        risk_level: r.risk_level,
        fingerprint: r.fingerprint,
        intent_key: r.intent_key,
        conflicts: r.conflicts,
        inventory_counts: r.inventory_counts,
        recommendation: r.recommendation,
        serper: r.serper,
        semantic: r.semantic,
      };
      setAnalysis(a);
      if (autoOpen) setOpen(true);
    } catch (e) {
      setErr(`${t.intentGuard.analyzeFailed}: ${(e as Error).message}`);
    } finally {
      setBusyAnalyze(false);
    }
  }

  async function doRetarget(userHint?: string) {
    if (!props.article) { setErr(t.intentGuard.retargetFailed); return; }
    setBusyRetarget(true); setErr(null);
    try {
      const r = await api.cannibalizationRetarget(
        props.mode === 'draft'
          ? { source: 'draft', draftId: props.draftId, locale: props.locale, userHint }
          : { source: 'editor', article: props.article, draftId: props.draftId, userHint }
      );
      setRetarget({ proposal: r.proposal, risk_score_before: r.risk_score_before });
      setApplyResult(null);
      setOpen(true);
    } catch (e) {
      setErr(`${t.intentGuard.retargetFailed}: ${(e as Error).message}`);
    } finally {
      setBusyRetarget(false);
    }
  }

  async function doApply() {
    if (!retarget || !analysis) return;
    if (props.mode !== 'draft') { setErr(t.intentGuard.applyFailedEditor); return; }
    setBusyApply(true); setErr(null);
    try {
      const r = await api.cannibalizationApplyRetarget({
        draftId: props.draftId,
        locale: props.locale,
        optimized_article: retarget.proposal.optimized_article,
        decision: retarget.proposal.decision,
        strategy: retarget.proposal.strategy,
        model: retarget.proposal.model,
      });
      setApplyResult({
        risk_score_after: r.recheck.risk_score_after,
        risk_level_after: r.recheck.risk_level_after,
      });
      // Refresh the analysis snapshot to mirror what's now persisted.
      setAnalysis((cur) => cur ? ({
        ...cur,
        risk_score: r.recheck.risk_score_after,
        risk_level: r.recheck.risk_level_after,
        conflicts: r.recheck.conflicts,
        fingerprint: r.recheck.fingerprint,
      }) : cur);
      if (props.onDraftUpdated) props.onDraftUpdated(r.draft);
    } catch (e) {
      setErr(`${t.intentGuard.applyFailed}: ${(e as Error).message}`);
    } finally {
      setBusyApply(false);
    }
  }

  function statusBlock(level: IntentRiskLevel | 'unknown') {
    if (level === 'low') {
      return (
        <div className="flex items-start gap-2.5">
          <ShieldCheck size={16} className="text-emerald-300 mt-0.5"/>
          <div>
            <div className="text-emerald-200 font-medium text-sm" data-testid={`${prefix}-title`}>{t.intentGuard.statusUniqueTitle}</div>
            <div className="text-white/70 text-xs mt-0.5">{t.intentGuard.statusUniqueBody}</div>
          </div>
        </div>
      );
    }
    if (level === 'medium') {
      return (
        <div className="flex items-start gap-2.5">
          <AlertTriangle size={16} className="text-amber-300 mt-0.5"/>
          <div>
            <div className="text-amber-200 font-medium text-sm" data-testid={`${prefix}-title`}>{t.intentGuard.statusOverlapTitle}</div>
            <div className="text-white/70 text-xs mt-0.5">{t.intentGuard.statusOverlapBody}</div>
          </div>
        </div>
      );
    }
    if (level === 'high') {
      return (
        <div className="flex items-start gap-2.5">
          <ShieldAlert size={16} className="text-red-300 mt-0.5"/>
          <div>
            <div className="text-red-200 font-medium text-sm" data-testid={`${prefix}-title`}>{t.intentGuard.statusConflictTitle}</div>
            <div className="text-white/70 text-xs mt-0.5">{t.intentGuard.statusConflictBody}</div>
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-start gap-2.5">
        <ShieldAlert size={16} className="text-white/50 mt-0.5"/>
        <div>
          <div className="text-white/85 font-medium text-sm" data-testid={`${prefix}-title`}>{t.intentGuard.statusUnknownTitle}</div>
          <div className="text-white/60 text-xs mt-0.5">{t.intentGuard.statusUnknownBody}</div>
        </div>
      </div>
    );
  }

  const level: IntentRiskLevel | 'unknown' = analysis ? analysis.risk_level : 'unknown';
  const tone = analysis ?
    (level === 'low' ? 'border-emerald-500/30 bg-emerald-500/5'
     : level === 'medium' ? 'border-amber-500/30 bg-amber-500/5'
     : 'border-red-500/30 bg-red-500/5')
    : 'border-white/10';

  return (
    <>
      <Card className={`${tone} ${props.className || ''}`} data-testid={prefix}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">{statusBlock(level)}</div>
          {analysis && <IntentGuardBadge level={level} score={analysis.risk_score} testId={`${prefix}-badge`}/>}
        </div>
        {err && <div className="text-red-300 text-xs mt-3" data-testid={`${prefix}-error`}>{err}</div>}
        <div className="flex gap-2 flex-wrap mt-4">
          {!analysis && (
            <Button size="sm" variant="primary"
              disabled={busyAnalyze || !props.article}
              onClick={() => void doAnalyze()}
              data-testid={`${prefix}-check`}>
              {busyAnalyze ? <RefreshCw size={14} className="animate-spin"/> : <ShieldCheck size={14}/>}
              {t.intentGuard.btnCheckAndImprove}
            </Button>
          )}
          {analysis && (
            <>
              <Button size="sm" variant="secondary"
                disabled={busyAnalyze || !props.article}
                onClick={() => void doAnalyze()}
                data-testid={`${prefix}-recheck`}>
                {busyAnalyze ? <RefreshCw size={14} className="animate-spin"/> : <ShieldCheck size={14}/>}
                {t.intentGuard.btnCheckCannibalization}
              </Button>
              <Button size="sm" variant="ghost"
                onClick={() => setOpen(true)}
                data-testid={`${prefix}-open-analysis`}>
                {t.intentGuard.btnAnalyze}
              </Button>
              {level !== 'low' && props.mode === 'draft' && (
                <Button size="sm" variant="primary"
                  disabled={busyRetarget || !props.article}
                  onClick={() => void doRetarget()}
                  data-testid={`${prefix}-retarget`}>
                  {busyRetarget ? <RefreshCw size={14} className="animate-spin"/> : <Wand2 size={14}/>}
                  {level === 'medium' ? t.intentGuard.btnRefineWithAi : t.intentGuard.btnSeparateIntents}
                </Button>
              )}
            </>
          )}
        </div>
      </Card>

      <IntentGuardModal
        open={open && !!analysis}
        locale={props.locale}
        analysis={analysis}
        retarget={retarget}
        applyResult={applyResult}
        busyAnalyze={busyAnalyze}
        busyRetarget={busyRetarget}
        busyApply={busyApply}
        error={err}
        onRefineWithAi={() => void doRetarget()}
        onApply={() => void doApply()}
        onAnotherVariant={() => void doRetarget('Создай другой вариант разведения интентов.')}
        onCancel={() => { if (!busyApply) { setOpen(false); setApplyResult(null); } }}
      />
    </>
  );
}
