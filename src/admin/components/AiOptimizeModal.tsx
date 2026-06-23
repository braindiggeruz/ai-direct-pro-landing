// AI Optimisation preview modal for the AI Draft Inbox.
//
// Shown after POST /api/admin/ai-drafts/:id/optimize returns. Lets the
// reviewer compare BEFORE vs AFTER per field/block, see the AI's change
// summary, and either Apply, Retry, or Cancel. Nothing here mutates the
// draft directly — Apply calls the dedicated /apply-optimization endpoint.

import { useMemo } from 'react';
import { X, CheckCircle2, AlertTriangle, RefreshCw, Sparkles } from 'lucide-react';
import { Badge, Button, Card } from './ui';
import { useT } from '../i18n';
import type { AiDraftArticle } from '../../shared/ai-drafts';
import type { BodyBlock, FaqItem, InternalLink } from '../../shared/types';

export interface OptimizeResult {
  locale: 'ru' | 'uz';
  model: string;
  original: AiDraftArticle;
  optimized_article: AiDraftArticle;
  changes: string[];
  kept: string[];
  validation_before: { passed: boolean; issues: { path: string; message: string }[] };
  validation_after:  { passed: boolean; issues: { path: string; message: string }[] };
  warnings: string[];
  // Sent by /optimize since the Llama → Gemini switch. Tells the reviewer
  // how deeply the body was actually rewritten (Jaccard distance over
  // trigrams of block text). Older API responses won't carry this field,
  // so the modal renders the badge defensively (only when present).
  rewrite_stats?: {
    overall_diff_ratio: number;
    unchanged_blocks: number;
    compared_blocks: number;
    retried: boolean;
    retry_reason: string | null;
  };
}

interface Props {
  open: boolean;
  result: OptimizeResult | null;
  busy: boolean;
  applyError: string | null;
  onApply: () => void;
  onRetry: () => void;
  onCancel: () => void;
}

export function AiOptimizeModal({ open, result, busy, applyError, onApply, onRetry, onCancel }: Props) {
  const { t } = useT();
  const diff = useMemo(() => result ? buildDiff(result.original, result.optimized_article) : null, [result]);
  if (!open || !result) return null;

  const localeLabel = result.locale.toUpperCase();
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      data-testid="ai-optimize-modal"
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
                {t.aiOptimize.modalTitle} · {localeLabel}
              </h2>
              <div className="text-white/40 text-xs mt-0.5 flex items-center gap-3 flex-wrap">
                <span>{t.aiOptimize.modelLabel}: <code className="text-white/70">{result.model}</code></span>
                {result.rewrite_stats && result.rewrite_stats.compared_blocks > 0 && (
                  <span
                    className={
                      result.rewrite_stats.overall_diff_ratio >= 0.55
                        ? 'text-emerald-300/90'
                        : result.rewrite_stats.overall_diff_ratio >= 0.35
                          ? 'text-amber-300/90'
                          : 'text-red-300/90'
                    }
                    data-testid="ai-optimize-rewrite-depth"
                    title={`${result.rewrite_stats.unchanged_blocks} of ${result.rewrite_stats.compared_blocks} blocks barely changed${result.rewrite_stats.retried ? ' · retried at higher temperature' : ''}`}
                  >
                    · Глубина переписывания: {Math.round(result.rewrite_stats.overall_diff_ratio * 100)}%
                    {result.rewrite_stats.retried ? ' · retry' : ''}
                  </span>
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
            data-testid="ai-optimize-close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {applyError && (
            <Card className="border-red-500/30 bg-red-500/5">
              <div className="text-red-300 text-sm" data-testid="ai-optimize-apply-error">{applyError}</div>
            </Card>
          )}

          {/* Change summary */}
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <h3 className="text-white font-medium flex items-center gap-2 mb-2">
              <CheckCircle2 size={14} className="text-emerald-300" /> {t.aiOptimize.changesHeading}
            </h3>
            {result.changes.length > 0 ? (
              <ul className="text-emerald-100/90 text-sm list-disc list-inside space-y-1" data-testid="ai-optimize-changes">
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
            <ValidationCol label={t.aiOptimize.validationBefore} status={result.validation_before} testId="ai-optimize-val-before" />
            <ValidationCol label={t.aiOptimize.validationAfter}  status={result.validation_after}  testId="ai-optimize-val-after" />
          </div>

          {result.warnings.length > 0 && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <div className="flex items-start gap-2">
                <AlertTriangle size={14} className="text-amber-300 mt-0.5" />
                <div className="flex-1">
                  <div className="text-amber-200 text-sm font-medium">{t.aiOptimize.warningsHeading}</div>
                  <ul className="text-amber-100/90 text-xs mt-1 list-disc list-inside space-y-0.5" data-testid="ai-optimize-warnings">
                    {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              </div>
            </Card>
          )}

          {/* Field diff */}
          {diff && (
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
          )}
        </div>

        {/* Footer actions */}
        <div className="border-t border-white/10 px-6 py-4 flex items-center justify-end gap-2 flex-wrap">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy} data-testid="ai-optimize-cancel">
            {t.aiOptimize.cancel}
          </Button>
          <Button variant="secondary" size="sm" onClick={onRetry} disabled={busy} data-testid="ai-optimize-retry">
            <RefreshCw size={14}/> {t.aiOptimize.retry}
          </Button>
          <Button variant="primary" size="sm" onClick={onApply} disabled={busy} data-testid="ai-optimize-apply">
            <CheckCircle2 size={14}/> {busy ? t.aiOptimize.applying : t.aiOptimize.apply}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ValidationCol({ label, status, testId }: {
  label: string;
  status: { passed: boolean; issues: { path: string; message: string }[] };
  testId: string;
}) {
  return (
    <Card className={status.passed ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-white/80 font-medium text-sm">{label}</div>
        <Badge tone={status.passed ? 'success' : 'warning'}>
          {status.passed ? 'OK' : `${status.issues.length}`}
        </Badge>
      </div>
      {status.issues.length === 0 ? (
        <div className="text-white/50 text-xs">No issues.</div>
      ) : (
        <ul className="text-xs space-y-1 max-h-40 overflow-auto" data-testid={testId}>
          {status.issues.slice(0, 20).map((i, idx) => (
            <li key={idx} className="text-white/70">
              <code className="text-white/50 text-[10px] mr-1">{i.path}</code>
              {i.message}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export interface FieldDiffEntry {
  label: string;
  before: string;
  after: string;
  changed: boolean;
}

export function buildDiff(a: AiDraftArticle, b: AiDraftArticle): {
  fields: FieldDiffEntry[];
  bodyChanged: boolean;
  faqChanged: boolean;
  linksChanged: boolean;
} {
  const f = (label: string, x: string | undefined, y: string | undefined): FieldDiffEntry => ({
    label,
    before: x || '',
    after:  y || '',
    changed: (x || '') !== (y || ''),
  });
  const fields = [
    f('meta_title', a.meta_title, b.meta_title),
    f('meta_description', a.meta_description, b.meta_description),
    f('h1', a.h1, b.h1),
    f('excerpt', a.excerpt, b.excerpt),
    f('target_keyword', a.target_keyword, b.target_keyword),
    f('target_money_page', a.target_money_page, b.target_money_page),
    f('slug', a.slug, b.slug),
  ];
  return {
    fields,
    bodyChanged: JSON.stringify(a.body_blocks) !== JSON.stringify(b.body_blocks),
    faqChanged: JSON.stringify(a.faq) !== JSON.stringify(b.faq),
    linksChanged: JSON.stringify(a.internal_links) !== JSON.stringify(b.internal_links),
  };
}

export function FieldDiff({ field }: { field: FieldDiffEntry }) {
  if (!field.changed) {
    return (
      <div className="border border-white/5 rounded-lg px-3 py-2 text-xs" data-testid={`ai-opt-field-${field.label}`}>
        <div className="flex items-center gap-2 mb-1">
          <code className="text-white/70">{field.label}</code>
          <Badge tone="neutral">unchanged</Badge>
        </div>
        <div className="text-white/60">{field.after || <em>(empty)</em>}</div>
      </div>
    );
  }
  return (
    <div className="border border-emerald-500/20 rounded-lg px-3 py-2 text-xs" data-testid={`ai-opt-field-${field.label}`}>
      <div className="flex items-center gap-2 mb-1">
        <code className="text-white">{field.label}</code>
        <Badge tone="success">changed</Badge>
        <span className="text-white/40 ml-auto">
          {field.before.length} → {field.after.length} ch
        </span>
      </div>
      <div className="grid sm:grid-cols-2 gap-2 mt-1">
        <div className="bg-red-500/10 border border-red-500/20 rounded p-2 text-red-100/90 whitespace-pre-wrap" data-testid={`ai-opt-field-${field.label}-before`}>
          {field.before || <em className="text-white/40">(empty)</em>}
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded p-2 text-emerald-100/90 whitespace-pre-wrap" data-testid={`ai-opt-field-${field.label}-after`}>
          {field.after || <em className="text-white/40">(empty)</em>}
        </div>
      </div>
    </div>
  );
}

export function BodyDiff({ before, after, labels }: {
  before: BodyBlock[];
  after: BodyBlock[];
  labels: { heading: string; blocksBefore: string; blocksAfter: string };
}) {
  return (
    <div className="border border-emerald-500/20 rounded-lg px-3 py-2 text-xs" data-testid="ai-opt-body">
      <div className="flex items-center gap-2 mb-2">
        <code className="text-white">body_blocks</code>
        <Badge tone="success">changed</Badge>
        <span className="text-white/40 ml-auto">{before.length} → {after.length} blocks</span>
      </div>
      <div className="text-white/60 mb-2">{labels.heading}</div>
      <div className="grid sm:grid-cols-2 gap-2">
        <BlockList label={labels.blocksBefore} blocks={before} tone="red" />
        <BlockList label={labels.blocksAfter} blocks={after} tone="emerald" />
      </div>
    </div>
  );
}

function BlockList({ label, blocks, tone }: { label: string; blocks: BodyBlock[]; tone: 'red' | 'emerald' }) {
  const bg = tone === 'red' ? 'bg-red-500/10 border-red-500/20 text-red-100/90' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-100/90';
  return (
    <div className={`rounded border ${bg} p-2 max-h-72 overflow-auto space-y-1`}>
      <div className="text-white/70 mb-1">{label}</div>
      {blocks.map((b, i) => (
        <div key={i} className="border border-white/10 rounded px-2 py-1">
          <Badge>{b.type}</Badge>
          {b.text && <div className="mt-1 whitespace-pre-wrap">{b.text}</div>}
          {Array.isArray(b.items) && b.items.length > 0 && (
            <ul className="list-disc list-inside text-white/70 mt-1">
              {b.items.map((it, j) => <li key={j}>{it}</li>)}
            </ul>
          )}
          {b.href && <div className="text-white/40 mt-0.5">href: {b.href}</div>}
        </div>
      ))}
    </div>
  );
}

export function FaqDiff({ before, after, labels }: {
  before: FaqItem[];
  after: FaqItem[];
  labels: { heading: string; before: string; after: string };
}) {
  return (
    <div className="border border-emerald-500/20 rounded-lg px-3 py-2 text-xs" data-testid="ai-opt-faq">
      <div className="flex items-center gap-2 mb-2">
        <code className="text-white">faq</code>
        <Badge tone="success">changed</Badge>
        <span className="text-white/40 ml-auto">{before.length} → {after.length} items</span>
      </div>
      <div className="text-white/60 mb-2">{labels.heading}</div>
      <div className="grid sm:grid-cols-2 gap-2">
        <FaqList label={labels.before} faq={before} tone="red" />
        <FaqList label={labels.after}  faq={after}  tone="emerald" />
      </div>
    </div>
  );
}

function FaqList({ label, faq, tone }: { label: string; faq: FaqItem[]; tone: 'red' | 'emerald' }) {
  const bg = tone === 'red' ? 'bg-red-500/10 border-red-500/20 text-red-100/90' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-100/90';
  return (
    <div className={`rounded border ${bg} p-2 max-h-72 overflow-auto space-y-2`}>
      <div className="text-white/70 mb-1">{label}</div>
      {faq.map((f, i) => (
        <div key={i} className="border border-white/10 rounded px-2 py-1">
          <div className="font-medium">Q: {f.q}</div>
          <div className="opacity-80 mt-1 whitespace-pre-wrap">A: {f.a}</div>
        </div>
      ))}
    </div>
  );
}

export function LinksDiff({ before, after, labels }: {
  before: InternalLink[];
  after: InternalLink[];
  labels: { heading: string; before: string; after: string };
}) {
  return (
    <div className="border border-emerald-500/20 rounded-lg px-3 py-2 text-xs" data-testid="ai-opt-links">
      <div className="flex items-center gap-2 mb-2">
        <code className="text-white">internal_links</code>
        <Badge tone="success">changed</Badge>
        <span className="text-white/40 ml-auto">{before.length} → {after.length}</span>
      </div>
      <div className="text-white/60 mb-2">{labels.heading}</div>
      <div className="grid sm:grid-cols-2 gap-2">
        <LinkList label={labels.before} links={before} tone="red" />
        <LinkList label={labels.after}  links={after}  tone="emerald" />
      </div>
    </div>
  );
}

function LinkList({ label, links, tone }: { label: string; links: InternalLink[]; tone: 'red' | 'emerald' }) {
  const bg = tone === 'red' ? 'bg-red-500/10 border-red-500/20 text-red-100/90' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-100/90';
  return (
    <div className={`rounded border ${bg} p-2 max-h-72 overflow-auto space-y-1`}>
      <div className="text-white/70 mb-1">{label}</div>
      {links.map((l, i) => (
        <div key={i} className="border border-white/10 rounded px-2 py-1">
          <Badge>{l.type}</Badge>
          <span className="ml-2"><code className="text-brand-cyan">{l.target}</code> → {l.anchor}</span>
        </div>
      ))}
    </div>
  );
}
