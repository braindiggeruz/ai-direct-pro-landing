// AI Optimisation modal (DUAL-LOCALE variant) — RU + UZ side by side.
//
// Shown after POST /api/admin/ai-drafts/:id/optimize-both returns. The
// owner asked for "one click → both versions optimised", so this modal
// renders the two locale previews under a tab switcher with a single
// «Применить обе версии» button in the footer.
//
// Why tabs and not side-by-side panes:
//   * Each locale's diff already needs side-by-side BEFORE / AFTER
//     panes (existing layout from AiOptimizeModal). Stacking two
//     locales next to that would be unreadable on anything under 27".
//   * Tabs make the depth-percentage badges immediately scannable:
//     the operator picks which locale needs attention first.
//
// Apply flow:
//   * "Применить обе версии" — calls /apply-optimization twice in
//     parallel (one per locale that succeeded). On any partial failure
//     the operator gets a clear error and the modal stays open so they
//     can keep the successful side or retry.
//   * "Применить только RU" / "Применить только UZ" — one-locale apply
//     (skips the failed/missing side).
//   * "Повторить для обеих" — re-runs /optimize-both.

import { useMemo, useState } from 'react';
import { X, CheckCircle2, AlertTriangle, RefreshCw, Sparkles, XCircle } from 'lucide-react';
import { Badge, Button, Card } from './ui';
import { useT } from '../i18n';
import type { AiDraftArticle } from '../../shared/ai-drafts';
import {
  ValidationCol,
  FieldDiff,
  BodyDiff,
  FaqDiff,
  LinksDiff,
  buildDiff,
} from './AiOptimizeModal';

export interface PerLocaleSuccess {
  ok: true;
  locale: 'ru' | 'uz';
  model: string;
  original: AiDraftArticle;
  optimized_article: AiDraftArticle;
  changes: string[];
  kept: string[];
  validation_before: { passed: boolean; issues: { path: string; message: string }[] };
  validation_after:  { passed: boolean; issues: { path: string; message: string }[] };
  warnings: string[];
  rewrite_stats?: {
    overall_diff_ratio: number;
    unchanged_blocks: number;
    compared_blocks: number;
    retried: boolean;
    retry_reason: string | null;
  };
}

export interface PerLocaleFailure {
  ok: false;
  locale: 'ru' | 'uz';
  status: 'upstream' | 'validation';
  error: string;
  detail?: string;
}

export type PerLocaleResult = PerLocaleSuccess | PerLocaleFailure;

export interface OptimizeBothResult {
  ok: boolean;
  ok_count: number;
  fail_count: number;
  attempted_locales: Array<'ru' | 'uz'>;
  results: { ru?: PerLocaleResult; uz?: PerLocaleResult };
}

interface Props {
  open: boolean;
  result: OptimizeBothResult | null;
  busy: boolean;
  applyError: string | null;
  /** Apply both locales that succeeded. */
  onApplyBoth: () => void;
  /** Apply only one locale (skips the other). */
  onApplyOne: (locale: 'ru' | 'uz') => void;
  onRetry: () => void;
  onCancel: () => void;
}

export function AiOptimizeBothModal({
  open,
  result,
  busy,
  applyError,
  onApplyBoth,
  onApplyOne,
  onRetry,
  onCancel,
}: Props) {
  const { t } = useT();
  const [activeTab, setActiveTab] = useState<'ru' | 'uz'>(() => {
    if (result?.results.ru?.ok) return 'ru';
    if (result?.results.uz?.ok) return 'uz';
    return 'ru';
  });
  if (!open || !result) return null;

  const ru = result.results.ru;
  const uz = result.results.uz;
  const okCount = result.ok_count;
  const successes: Array<'ru' | 'uz'> = [];
  if (ru?.ok) successes.push('ru');
  if (uz?.ok) successes.push('uz');

  const active = activeTab === 'ru' ? ru : uz;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      data-testid="ai-optimize-both-modal"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-bg-base border border-white/10 rounded-2xl w-full max-w-5xl shadow-2xl mb-12">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Sparkles size={18} className="text-brand-cyan" />
            <div>
              <h2 className="font-display text-lg text-white">
                {t.aiOptimize.modalTitleBoth}
              </h2>
              <div className="text-white/40 text-xs mt-0.5">
                {okCount > 0 && (
                  <span>
                    {t.aiOptimize.modelLabel}:{' '}
                    <code className="text-white/70">{ru?.ok ? ru.model : uz?.ok ? uz.model : '—'}</code>
                    {' · '}
                    {okCount}/{result.attempted_locales.length} OK
                  </span>
                )}
                {okCount === 0 && (
                  <span className="text-red-300/90">Обе версии не удалось переписать — нажмите «Повторить».</span>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="text-white/60 hover:text-white p-1 rounded"
            onClick={onCancel}
            disabled={busy}
            aria-label={t.aiOptimize.cancel}
            data-testid="ai-optimize-both-close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab bar: RU [56%] | UZ [48%] */}
        <div className="flex items-stretch gap-1 px-6 pt-4">
          <LocaleTab
            label="RU"
            isActive={activeTab === 'ru'}
            onClick={() => setActiveTab('ru')}
            result={ru}
            depthLabel={t.aiOptimize.depthBadge}
            testId="ai-optimize-both-tab-ru"
          />
          <LocaleTab
            label="UZ"
            isActive={activeTab === 'uz'}
            onClick={() => setActiveTab('uz')}
            result={uz}
            depthLabel={t.aiOptimize.depthBadge}
            testId="ai-optimize-both-tab-uz"
          />
        </div>

        <div className="p-6 space-y-6">
          {applyError && (
            <Card className="border-red-500/30 bg-red-500/5">
              <div className="text-red-300 text-sm" data-testid="ai-optimize-both-apply-error">{applyError}</div>
            </Card>
          )}

          {!active && (
            <div className="text-white/50 text-sm" data-testid="ai-optimize-both-missing-tab">
              У черновика нет статьи на этом языке.
            </div>
          )}

          {active && !active.ok && (
            <Card className="border-red-500/30 bg-red-500/5">
              <div className="flex items-start gap-2">
                <XCircle size={14} className="text-red-300 mt-0.5" />
                <div className="flex-1">
                  <div className="text-red-200 text-sm font-medium">{t.aiOptimize.perLocaleFailed} ({active.locale.toUpperCase()})</div>
                  <div className="text-red-100/80 text-xs mt-1">{active.error}</div>
                  {active.detail && (
                    <details className="mt-2 text-xs text-red-100/60">
                      <summary className="cursor-pointer">Детали</summary>
                      <pre className="mt-1 whitespace-pre-wrap break-words">{active.detail}</pre>
                    </details>
                  )}
                </div>
              </div>
            </Card>
          )}

          {active && active.ok && <LocalePane result={active} t={t} />}
        </div>

        {/* Footer actions */}
        <div className="border-t border-white/10 px-6 py-4 flex items-center justify-end gap-2 flex-wrap">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy} data-testid="ai-optimize-both-cancel">
            {t.aiOptimize.cancel}
          </Button>
          <Button variant="secondary" size="sm" onClick={onRetry} disabled={busy} data-testid="ai-optimize-both-retry">
            <RefreshCw size={14} /> {t.aiOptimize.retryBoth}
          </Button>
          {successes.length === 1 && successes[0] === 'ru' && (
            <Button variant="primary" size="sm" onClick={() => onApplyOne('ru')} disabled={busy} data-testid="ai-optimize-both-apply-ru">
              <CheckCircle2 size={14} /> {busy ? t.aiOptimize.applying : t.aiOptimize.applyOnlyRu}
            </Button>
          )}
          {successes.length === 1 && successes[0] === 'uz' && (
            <Button variant="primary" size="sm" onClick={() => onApplyOne('uz')} disabled={busy} data-testid="ai-optimize-both-apply-uz">
              <CheckCircle2 size={14} /> {busy ? t.aiOptimize.applying : t.aiOptimize.applyOnlyUz}
            </Button>
          )}
          {successes.length === 2 && (
            <>
              <Button variant="secondary" size="sm" onClick={() => onApplyOne('ru')} disabled={busy} data-testid="ai-optimize-both-apply-ru">
                {t.aiOptimize.applyOnlyRu}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => onApplyOne('uz')} disabled={busy} data-testid="ai-optimize-both-apply-uz">
                {t.aiOptimize.applyOnlyUz}
              </Button>
              <Button variant="primary" size="sm" onClick={onApplyBoth} disabled={busy} data-testid="ai-optimize-both-apply-both">
                <CheckCircle2 size={14} /> {busy ? t.aiOptimize.applyingBoth : t.aiOptimize.applyBoth}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function LocaleTab({ label, isActive, onClick, result, depthLabel, testId }: {
  label: string;
  isActive: boolean;
  onClick: () => void;
  result: PerLocaleResult | undefined;
  depthLabel: string;
  testId: string;
}) {
  const failed = result && !result.ok;
  const missing = !result;
  const depth = result?.ok ? result.rewrite_stats?.overall_diff_ratio : undefined;
  const depthPct = typeof depth === 'number' ? Math.round(depth * 100) : null;

  const baseCls = 'flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer';
  const activeCls = isActive
    ? 'border-brand-cyan text-white bg-white/5'
    : 'border-transparent text-white/60 hover:text-white/90 hover:bg-white/5';

  return (
    <button
      type="button"
      className={`${baseCls} ${activeCls}`}
      onClick={onClick}
      data-testid={testId}
      aria-pressed={isActive}
    >
      <span>{label}</span>
      {missing && <Badge tone="neutral">нет</Badge>}
      {failed && <Badge tone="danger">ошибка</Badge>}
      {result?.ok && depthPct !== null && (
        <Badge
          tone={depthPct >= 55 ? 'success' : depthPct >= 35 ? 'warning' : 'danger'}
          data-testid={`${testId}-depth`}
        >
          {depthLabel}: {depthPct}%
        </Badge>
      )}
    </button>
  );
}

function LocalePane({ result, t }: { result: PerLocaleSuccess; t: ReturnType<typeof useT>['t'] }) {
  const diff = useMemo(() => buildDiff(result.original, result.optimized_article), [result.original, result.optimized_article]);
  return (
    <div className="space-y-6">
      {/* Change summary */}
      <Card className="border-emerald-500/20 bg-emerald-500/5">
        <h3 className="text-white font-medium flex items-center gap-2 mb-2">
          <CheckCircle2 size={14} className="text-emerald-300" /> {t.aiOptimize.changesHeading} · {result.locale.toUpperCase()}
        </h3>
        {result.changes.length > 0 ? (
          <ul className="text-emerald-100/90 text-sm list-disc list-inside space-y-1" data-testid={`ai-optimize-both-changes-${result.locale}`}>
            {result.changes.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        ) : (
          <div className="text-white/50 text-sm">{t.aiOptimize.noChanges}</div>
        )}
        {result.kept.length > 0 && (
          <div className="mt-3 text-white/60 text-xs">
            <strong className="text-white/70">{t.aiOptimize.keptHeading}:</strong>{' '}
            {result.kept.join('; ')}
          </div>
        )}
      </Card>

      {/* Validation columns */}
      <div className="grid sm:grid-cols-2 gap-4">
        <ValidationCol label={t.aiOptimize.validationBefore} status={result.validation_before} testId={`ai-optimize-both-val-before-${result.locale}`} />
        <ValidationCol label={t.aiOptimize.validationAfter}  status={result.validation_after}  testId={`ai-optimize-both-val-after-${result.locale}`} />
      </div>

      {result.warnings.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="text-amber-300 mt-0.5" />
            <div className="flex-1">
              <div className="text-amber-200 text-sm font-medium">{t.aiOptimize.warningsHeading}</div>
              <ul className="text-amber-100/90 text-xs mt-1 list-disc list-inside space-y-0.5" data-testid={`ai-optimize-both-warnings-${result.locale}`}>
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          </div>
        </Card>
      )}

      {/* Field diff */}
      <div className="space-y-3">
        <h3 className="text-white font-medium">{t.aiOptimize.fieldDiffHeading}</h3>
        {diff.fields.map((f) => (
          <FieldDiff key={f.label} field={f} />
        ))}

        {diff.bodyChanged && (
          <BodyDiff
            before={result.original.body_blocks}
            after={result.optimized_article.body_blocks}
            labels={{
              heading: t.aiOptimize.bodyDiffHeading,
              blocksBefore: t.aiOptimize.bodyBlocksBefore,
              blocksAfter:  t.aiOptimize.bodyBlocksAfter,
            }}
          />
        )}

        {diff.faqChanged && (
          <FaqDiff
            before={result.original.faq}
            after={result.optimized_article.faq}
            labels={{ heading: t.aiOptimize.faqDiffHeading, before: t.aiOptimize.before, after: t.aiOptimize.after }}
          />
        )}

        {diff.linksChanged && (
          <LinksDiff
            before={result.original.internal_links}
            after={result.optimized_article.internal_links}
            labels={{ heading: t.aiOptimize.linksDiffHeading, before: t.aiOptimize.before, after: t.aiOptimize.after }}
          />
        )}
      </div>
    </div>
  );
}
