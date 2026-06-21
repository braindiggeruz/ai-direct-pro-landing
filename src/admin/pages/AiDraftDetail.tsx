// AI Draft Inbox — detail view for a single n8n bundle.
//
// Shows RU/UZ tabs with metadata, body, FAQ, internal links, validation.
// Lets the reviewer:
//   • Import RU into Blog Editor (status=draft, editor must save manually)
//   • Import UZ into Blog Editor
//   • Mark as needs revision (with note)
//   • Reject (with note)
//   • Delete (only when status != imported and no per-locale import yet)
//   • Copy raw JSON for debugging (secrets are never embedded; bundle only)
//
// Import flow:
//   1. Click "Import RU to Blog Editor" → call /import endpoint to record the
//      action in the audit log.
//   2. Stash the article JSON in sessionStorage under
//      `aiDraftImport:<draftId>:<locale>` keyed handoff.
//   3. Navigate to /admin-tools/blog/new?aiDraftImport=<id>&aiDraftLocale=<l>.
//   4. BlogEditor pulls the handoff, fills its local state, runs the existing
//      audit, and waits for the human to click "Save draft".
//
// IMPORTANT: This page never publishes, commits, or pings IndexNow.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Badge, Button, Card, Textarea } from '../components/ui';
import {
  AlertTriangle, ChevronLeft, ChevronRight, ClipboardCopy, Inbox, RefreshCw,
  ShieldCheck, ShieldAlert, Trash2, XCircle, ArrowDownToLine, FileText, GitBranch,
} from 'lucide-react';
import type {
  AiDraftArticle,
  AiDraftAuditEntry,
  AiDraftRecord,
} from '../../shared/ai-drafts';
import {
  AI_DRAFT_IMPORT_SESSION_PREFIX,
  buildBlogEditorImportUrl,
  storeAiDraftHandoff,
} from '../lib/aiDraftImport';

function statusTone(status: AiDraftRecord['status']): 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case 'pending_review': return 'info';
    case 'needs_revision': return 'warning';
    case 'imported':       return 'success';
    case 'rejected':       return 'danger';
  }
}

export default function AiDraftDetail() {
  const nav = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{ draft: AiDraftRecord; audit: AiDraftAuditEntry[] } | null>(null);
  const [tab, setTab] = useState<'ru' | 'uz'>('ru');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true); setErr(null);
    try {
      const r = await api.aiDraftsGet(id!);
      setData(r);
      // Default to a tab the bundle actually has.
      if (r.draft.has_ru) setTab('ru'); else if (r.draft.has_uz) setTab('uz');
    } catch (e) {
      setErr((e as Error).message);
    }
    setLoading(false);
  }
  useEffect(() => { if (id) void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const article: AiDraftArticle | null = useMemo(() => {
    if (!data) return null;
    return tab === 'ru' ? data.draft.ru_article : data.draft.uz_article;
  }, [data, tab]);

  if (loading) return <div className="p-8 text-white/60">Loading draft…</div>;
  if (err) return <div className="p-8 text-red-300">{err}</div>;
  if (!data) return null;
  const draft = data.draft;

  async function doStatus(next: 'needs_revision' | 'rejected' | 'pending_review') {
    if (!draft) return;
    setBusy(true); setErr(null); setToast(null);
    try {
      const r = await api.aiDraftsStatus(draft.id, next, note || undefined);
      setData((cur) => cur ? { draft: r.draft, audit: cur.audit } : cur);
      setToast(`Status changed to ${next.replace('_', ' ')}`);
      setNote('');
      // Refresh audit log.
      await load();
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  async function doImport(locale: 'ru' | 'uz') {
    if (!draft) return;
    const a = locale === 'ru' ? draft.ru_article : draft.uz_article;
    if (!a) return;
    setBusy(true); setErr(null); setToast(null);
    try {
      storeAiDraftHandoff(draft.id, locale, {
        draftId: draft.id,
        bundleId: draft.bundle_id,
        locale,
        article: a,
        seoBrief: draft.seo_brief,
      });
      await api.aiDraftsImport(draft.id, locale);
      const url = buildBlogEditorImportUrl(draft.id, locale, a.slug);
      setToast(`Importing ${locale.toUpperCase()} into Blog Editor…`);
      nav(url);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!draft) return;
    if (!confirm('Delete this AI draft? This removes the bundle from the inbox permanently. Audit log will keep the delete event.')) return;
    setBusy(true); setErr(null);
    try {
      await api.aiDraftsDelete(draft.id);
      nav('/admin-tools/ai-drafts');
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  async function copyJson() {
    const blob = JSON.stringify({
      id: draft.id,
      bundle_id: draft.bundle_id,
      schema_version: draft.schema_version,
      source: draft.source,
      execution_id: draft.execution_id,
      status: draft.status,
      validation: draft.validation,
      seo_brief: draft.seo_brief,
      articles: [draft.ru_article, draft.uz_article].filter(Boolean),
    }, null, 2);
    try {
      await navigator.clipboard.writeText(blob);
      setToast('Bundle JSON copied to clipboard (no secrets included).');
      setTimeout(() => setToast(null), 3000);
    } catch {
      setErr('Clipboard not available — open browser console to read.');
    }
  }

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-6xl" data-testid="ai-draft-detail">
      {/* Breadcrumb / actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => nav('/admin-tools/ai-drafts')} data-testid="ai-draft-back">
            <ChevronLeft size={14}/> Inbox
          </Button>
          <div>
            <div className="text-xs uppercase tracking-widest text-white/40 inline-flex items-center gap-1">
              <Inbox size={11}/> AI Draft · {draft.source}
            </div>
            <h1 className="font-display text-2xl text-white" data-testid="ai-draft-heading">
              {draft.primary_title || draft.bundle_id}
            </h1>
            <div className="text-white/40 text-xs mt-1 flex flex-wrap items-center gap-2">
              <Badge tone={statusTone(draft.status)}>{draft.status.replace('_', ' ')}</Badge>
              <span>bundle <code className="text-white/60">{draft.bundle_id}</code></span>
              {draft.execution_id && <span>· execution <code className="text-white/60">{draft.execution_id}</code></span>}
              <span>· created {new Date(draft.created_at).toLocaleString()}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Button variant="ghost" size="sm" onClick={() => load()} data-testid="ai-draft-refresh"><RefreshCw size={14}/> Refresh</Button>
          <Button variant="ghost" size="sm" onClick={copyJson} data-testid="ai-draft-copy-json"><ClipboardCopy size={14}/> Copy JSON</Button>
          {draft.status !== 'imported' && !draft.ru_imported_at && !draft.uz_imported_at && (
            <Button variant="danger" size="sm" onClick={doDelete} disabled={busy} data-testid="ai-draft-delete"><Trash2 size={14}/> Delete</Button>
          )}
        </div>
      </div>

      {toast && <Card className="border-emerald-500/30 bg-emerald-500/5"><div className="text-emerald-300 text-sm" data-testid="ai-draft-toast">{toast}</div></Card>}
      {err && <Card className="border-red-500/30 bg-red-500/5"><div className="text-red-300 text-sm" data-testid="ai-draft-error">{err}</div></Card>}

      {/* Validation banner */}
      <Card className={draft.validation_passed ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            {draft.validation_passed
              ? <ShieldCheck size={18} className="text-emerald-300 mt-0.5"/>
              : <ShieldAlert size={18} className="text-amber-300 mt-0.5"/>}
            <div>
              <div className={draft.validation_passed ? 'text-emerald-200 font-medium' : 'text-amber-200 font-medium'}>
                {draft.validation_passed ? 'Upstream validation passed' : `Upstream validation flagged ${draft.validation_issue_count} issue(s)`}
              </div>
              <div className="text-white/60 text-xs mt-1">
                Nothing here is live. The existing Blog Editor will re-run its full audit when you import.
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {draft.has_ru && <Badge tone="info">RU available</Badge>}
            {draft.has_uz && <Badge tone="info">UZ available</Badge>}
            {!draft.has_ru && <Badge tone="warning">RU missing</Badge>}
            {!draft.has_uz && <Badge tone="warning">UZ missing</Badge>}
          </div>
        </div>
        {!draft.validation_passed && draft.validation?.issues?.length ? (
          <ul className="mt-4 space-y-1 text-sm" data-testid="ai-draft-validation-issues">
            {draft.validation.issues.slice(0, 30).map((i, idx) => (
              <li key={idx} className="flex items-start gap-2 text-amber-200">
                <AlertTriangle size={12} className="mt-1 shrink-0"/>
                <span className="text-white/80 text-xs"><strong>{i.rule || 'issue'}</strong>{i.field ? ` · ${i.field}` : ''}: {i.message || 'unspecified'}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      {/* Locale tabs */}
      <Card>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex gap-2">
            <button
              data-testid="ai-draft-tab-ru"
              disabled={!draft.has_ru}
              onClick={() => setTab('ru')}
              className={`px-4 py-2 rounded-full text-sm border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${tab === 'ru' ? 'bg-brand-blue/15 text-brand-cyan border-brand-blue/40' : 'border-white/10 text-white/60 hover:bg-white/5'}`}>
              RU article{draft.ru_imported_at ? ' ✓' : ''}
            </button>
            <button
              data-testid="ai-draft-tab-uz"
              disabled={!draft.has_uz}
              onClick={() => setTab('uz')}
              className={`px-4 py-2 rounded-full text-sm border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${tab === 'uz' ? 'bg-brand-blue/15 text-brand-cyan border-brand-blue/40' : 'border-white/10 text-white/60 hover:bg-white/5'}`}>
              UZ article{draft.uz_imported_at ? ' ✓' : ''}
            </button>
          </div>
          <div className="flex gap-2 flex-wrap">
            {draft.has_ru && (
              <Button variant={tab === 'ru' ? 'primary' : 'secondary'} size="sm"
                      disabled={busy || draft.status === 'rejected'}
                      onClick={() => doImport('ru')} data-testid="ai-draft-import-ru">
                <ArrowDownToLine size={14}/> Import RU to Blog Editor
              </Button>
            )}
            {draft.has_uz && (
              <Button variant={tab === 'uz' ? 'primary' : 'secondary'} size="sm"
                      disabled={busy || draft.status === 'rejected'}
                      onClick={() => doImport('uz')} data-testid="ai-draft-import-uz">
                <ArrowDownToLine size={14}/> Import UZ to Blog Editor
              </Button>
            )}
          </div>
        </div>

        {article ? <ArticlePreview article={article}/> : (
          <div className="text-white/50 text-sm" data-testid="ai-draft-empty-article">
            Bundle does not include a {tab.toUpperCase()} article.
          </div>
        )}
      </Card>

      {/* SEO brief (if provided) */}
      {draft.seo_brief && Object.keys(draft.seo_brief).length > 0 && (
        <Card>
          <h2 className="font-display text-lg text-white mb-3 flex items-center gap-2"><FileText size={16}/> SEO Brief</h2>
          <pre className="text-xs text-white/70 bg-bg-base border border-white/10 rounded-lg p-3 overflow-x-auto max-h-72" data-testid="ai-draft-seo-brief">
{JSON.stringify(draft.seo_brief, null, 2)}
          </pre>
        </Card>
      )}

      {/* Review actions */}
      <Card>
        <h2 className="font-display text-lg text-white mb-3">Reviewer actions</h2>
        <div className="space-y-3">
          <Textarea
            rows={2}
            data-testid="ai-draft-note"
            placeholder="Optional note (visible only in the audit log) — e.g. why you reject or what needs revision."
            value={note}
            onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2 flex-wrap">
            {draft.status !== 'needs_revision' && draft.status !== 'imported' && draft.status !== 'rejected' && (
              <Button variant="secondary" size="sm" onClick={() => doStatus('needs_revision')} disabled={busy}
                      data-testid="ai-draft-mark-needs-revision">
                <AlertTriangle size={14}/> Mark as needs revision
              </Button>
            )}
            {draft.status !== 'rejected' && draft.status !== 'imported' && (
              <Button variant="danger" size="sm" onClick={() => doStatus('rejected')} disabled={busy}
                      data-testid="ai-draft-reject">
                <XCircle size={14}/> Reject
              </Button>
            )}
            {draft.status === 'rejected' && (
              <Button variant="secondary" size="sm" onClick={() => doStatus('pending_review')} disabled={busy}
                      data-testid="ai-draft-unreject">
                <ChevronRight size={14}/> Move back to pending review
              </Button>
            )}
            {draft.status === 'needs_revision' && (
              <Button variant="secondary" size="sm" onClick={() => doStatus('pending_review')} disabled={busy}
                      data-testid="ai-draft-mark-pending">
                <ChevronRight size={14}/> Move back to pending review
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Audit history */}
      <Card>
        <h2 className="font-display text-lg text-white mb-3 flex items-center gap-2"><GitBranch size={16}/> Audit history</h2>
        {data.audit.length === 0 ? <div className="text-white/50 text-sm">No audit entries.</div> : (
          <ul className="space-y-2 text-sm" data-testid="ai-draft-audit-list">
            {data.audit.map((a) => (
              <li key={a.id} className="border border-white/5 rounded-lg px-3 py-2 flex items-start gap-3"
                  data-testid={`ai-draft-audit-${a.id}`}>
                <Badge tone="neutral">{a.action}</Badge>
                <div className="flex-1 min-w-0">
                  <div className="text-white/70 text-xs">
                    <span className="text-white/40">{new Date(a.created_at).toLocaleString()}</span>
                    {' · '}
                    <code className="text-brand-cyan/80">{a.actor}</code>
                  </div>
                  {a.details && (
                    <pre className="text-white/40 text-[11px] mt-1 whitespace-pre-wrap break-words">
{JSON.stringify(a.details, null, 0)}
                    </pre>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="text-white/40 text-[11px] mt-4">
          Stored in <code>ai_draft_audit</code>. <em>Delete</em> writes an audit row, then removes the draft and (via FK ON DELETE CASCADE) its history — that path is only available for non-imported drafts.
        </div>
      </Card>

      {/* Session-storage handoff hint, useful when QA'ing the import flow. */}
      <div className="text-white/30 text-[11px]" data-testid="ai-draft-handoff-prefix">
        Handoff key prefix: <code>{AI_DRAFT_IMPORT_SESSION_PREFIX}</code>
      </div>
    </div>
  );
}

function ArticlePreview({ article }: { article: AiDraftArticle }) {
  return (
    <div className="space-y-5" data-testid={`ai-draft-article-${article.locale}`}>
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <Field label="Slug" value={article.slug} mono testId="ai-draft-field-slug"/>
        <Field label="Target keyword" value={article.target_keyword || '—'} testId="ai-draft-field-target-kw"/>
        <Field label="Target money page" value={article.target_money_page || '—'} mono testId="ai-draft-field-target-money"/>
        <Field label="Author" value={article.author || 'GPTBot'} testId="ai-draft-field-author"/>
        <Field label="Meta title"        value={`${article.meta_title} (${article.meta_title.length}c)`} testId="ai-draft-field-meta-title"/>
        <Field label="Meta description"  value={`${article.meta_description} (${article.meta_description.length}c)`} testId="ai-draft-field-meta-desc"/>
        <Field label="H1" value={article.h1} testId="ai-draft-field-h1"/>
        <Field label="Schemas" value={(article.schemas || []).join(', ')} testId="ai-draft-field-schemas"/>
      </div>
      <div>
        <SectionLabel>Excerpt</SectionLabel>
        <p className="text-white/85 text-sm whitespace-pre-line" data-testid="ai-draft-excerpt">{article.excerpt || '—'}</p>
      </div>
      <div>
        <SectionLabel>Body preview ({article.body_blocks.length} blocks)</SectionLabel>
        <div className="space-y-2" data-testid="ai-draft-body">
          {article.body_blocks.map((b, idx) => (
            <div key={idx} className="border border-white/5 rounded px-3 py-2 text-sm">
              <Badge>{b.type}</Badge>
              {b.text && <p className="text-white/80 mt-1 whitespace-pre-line text-sm">{b.text}</p>}
              {Array.isArray(b.items) && b.items.length > 0 && (
                <ul className="list-disc list-inside text-white/70 text-sm mt-1">
                  {b.items.map((it, j) => <li key={j}>{it}</li>)}
                </ul>
              )}
              {b.href && <div className="text-white/40 text-xs mt-1">href: <code>{b.href}</code></div>}
              {b.src && <div className="text-white/40 text-xs mt-1">src: <code>{b.src}</code></div>}
            </div>
          ))}
          {article.body_blocks.length === 0 && <div className="text-white/40 text-sm">No body blocks.</div>}
        </div>
      </div>
      <div>
        <SectionLabel>FAQ ({article.faq.length} item{article.faq.length === 1 ? '' : 's'})</SectionLabel>
        <div className="space-y-2" data-testid="ai-draft-faq">
          {article.faq.map((f, idx) => (
            <div key={idx} className="border border-white/5 rounded px-3 py-2">
              <div className="text-white/85 font-medium text-sm">Q: {f.q}</div>
              <div className="text-white/65 text-sm mt-0.5 whitespace-pre-line">A: {f.a}</div>
            </div>
          ))}
          {article.faq.length === 0 && <div className="text-white/40 text-sm">No FAQ items.</div>}
        </div>
      </div>
      <div>
        <SectionLabel>Internal links ({article.internal_links.length})</SectionLabel>
        <ul className="space-y-1 text-sm" data-testid="ai-draft-internal-links">
          {article.internal_links.map((l, idx) => (
            <li key={idx} className="flex items-center gap-2">
              <Badge>{l.type}</Badge>
              <code className="text-brand-cyan text-xs">{l.target}</code>
              <span className="text-white/40">→</span>
              <span className="text-white/80 text-xs">{l.anchor}</span>
            </li>
          ))}
          {article.internal_links.length === 0 && <div className="text-white/40 text-sm">No internal links.</div>}
        </ul>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-white/50 text-xs uppercase tracking-wide mb-1.5">{children}</div>;
}

function Field({ label, value, mono, testId }: { label: string; value: string; mono?: boolean; testId?: string }) {
  return (
    <div>
      <div className="text-white/45 text-xs">{label}</div>
      <div data-testid={testId} className={`text-white/90 ${mono ? 'font-mono text-xs' : 'text-sm'} mt-0.5 break-words`}>{value}</div>
    </div>
  );
}
