// Admin Blog editor — full CRUD for /content/blog/<locale>/<slug>.json.
// Mirrors src/admin/pages/PageEditor.tsx patterns (FAQ, body blocks, internal
// links editors are inlined here on purpose so PageEditor stays untouched).
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Badge, Button, Card, Input, Label, ScoreBadge, Select, Textarea } from '../components/ui';
import { SerpPreview } from '../components/SerpPreview';
import { AiDraftBanner } from '../components/AiDraftBanner';
import { useAiDraftBridge } from '../hooks/useAiDraftBridge';
import { Save, Trash2, ExternalLink, Plus, X, ChevronLeft, Upload, Copy, Sparkles } from 'lucide-react';
import type { BlogArticle, Page, FaqItem, BodyBlock, InternalLink as InternalLinkT, SchemaType, Locale } from '../../shared/types';
import { detectMojibake } from '../../shared/audit';
import { SITE_URL } from '../../shared/site-config';
import { clearAiDraftHandoff, readAiDraftHandoff } from '../lib/aiDraftImport';
import type { AiDraftArticle } from '../../shared/ai-drafts';
import { IntentGuardPanel } from '../components/IntentGuardPanel';
import { useT } from '../i18n';

const EMPTY: Partial<BlogArticle> = {
  status: 'draft',
  locale: 'ru',
  slug: '',
  url: '',
  title: '',
  description: '',
  h1: '',
  intro: '',
  targetMoneyPage: '',
  keywords: [],
  body: [],
  faq: [],
  internalLinks: [],
  schemaTypes: ['Article', 'FAQPage', 'BreadcrumbList'],
  robotsIndex: true,
  robotsFollow: true,
  author: 'GPTBot',
  ogTitle: '',
  ogDescription: '',
  ogImage: '',
  canonical: '',
};

const SCHEMA_OPTIONS: SchemaType[] = ['Article', 'FAQPage', 'BreadcrumbList', 'Organization', 'WebSite'];

// --- Blog validator (mirrors src/shared/audit.ts rules, adapted for BlogArticle) ---
interface BlogIssue { level: 'error' | 'warning' | 'info'; rule: string; message: string; field?: string }

function auditBlog(a: BlogArticle, others: BlogArticle[], moneyPages: Page[]): { issues: BlogIssue[]; score: number } {
  const issues: BlogIssue[] = [];
  const moji = detectMojibake({
    title: a.title, description: a.description, h1: a.h1, intro: a.intro,
    body: a.body, faq: a.faq, internalLinks: a.internalLinks,
  });
  if (moji) issues.push({ level: 'error', rule: 'mojibake', field: moji.field.split('.')[0].split('[')[0], message: `Encoding issue in "${moji.field}": ${moji.sample}…` });

  if (!a.title?.trim()) issues.push({ level: 'error', rule: 'missing-title', field: 'title', message: 'Title is empty.' });
  else {
    if (a.title.length < 45) issues.push({ level: 'warning', rule: 'short-title', field: 'title', message: `Title is ${a.title.length} chars (recommended 45–65).` });
    if (a.title.length > 65) issues.push({ level: 'warning', rule: 'long-title', field: 'title', message: `Title is ${a.title.length} chars (recommended 45–65).` });
    if (others.some((o) => o.slug !== a.slug && o.status === 'published' && o.title === a.title))
      issues.push({ level: 'error', rule: 'duplicate-title', field: 'title', message: 'Title duplicates another published article.' });
  }

  if (!a.description?.trim()) issues.push({ level: 'error', rule: 'missing-description', field: 'description', message: 'Description is empty.' });
  else {
    if (a.description.length < 120) issues.push({ level: 'warning', rule: 'short-description', field: 'description', message: `Description is ${a.description.length} chars (recommended 120–160).` });
    if (a.description.length > 160) issues.push({ level: 'warning', rule: 'long-description', field: 'description', message: `Description is ${a.description.length} chars (recommended 120–160).` });
    if (others.some((o) => o.slug !== a.slug && o.status === 'published' && o.description === a.description))
      issues.push({ level: 'error', rule: 'duplicate-description', field: 'description', message: 'Description duplicates another published article.' });
  }

  if (!a.h1?.trim()) issues.push({ level: 'error', rule: 'missing-h1', field: 'h1', message: 'H1 is empty.' });
  if (!a.slug?.trim()) issues.push({ level: 'error', rule: 'missing-slug', field: 'slug', message: 'Slug is empty.' });
  if (!a.canonical?.trim()) issues.push({ level: 'error', rule: 'missing-canonical', field: 'canonical', message: 'Canonical is empty.' });

  const faqCount = a.faq?.length || 0;
  if (faqCount < 5) issues.push({ level: 'warning', rule: 'too-few-faq', field: 'faq', message: `Only ${faqCount} FAQ items (published article should have at least 5).` });

  const linkCount = a.internalLinks?.filter((l) => l.target).length || 0;
  if (linkCount < 3) issues.push({ level: 'warning', rule: 'too-few-internal-links', field: 'internalLinks', message: `Only ${linkCount} outgoing internal links (recommended 3+).` });

  if (!a.targetMoneyPage) issues.push({ level: 'warning', rule: 'missing-target-money-page', field: 'targetMoneyPage', message: 'No target money page set — article will not be linked from any money page Related block.' });
  else if (moneyPages.length && !moneyPages.some((p) => p.url === a.targetMoneyPage))
    issues.push({ level: 'warning', rule: 'target-money-page-missing', field: 'targetMoneyPage', message: `Target money page "${a.targetMoneyPage}" not found among published pages.` });

  const required: SchemaType[] = ['Article', 'FAQPage', 'BreadcrumbList'];
  const missingSchema = required.filter((s) => !a.schemaTypes?.includes(s));
  if (missingSchema.length) issues.push({ level: 'warning', rule: 'missing-schema', field: 'schemaTypes', message: `Missing schema: ${missingSchema.join(', ')}.` });

  const bodyChars = (a.body || []).reduce((s, b) => s + (b.text?.length || 0) + (b.items?.reduce((x, i) => x + i.length, 0) || 0), 0);
  if (bodyChars < 1000) issues.push({ level: 'warning', rule: 'body-too-short', field: 'body', message: `Body has ${bodyChars} chars (recommended 2000+).` });

  const errors = issues.filter((i) => i.level === 'error').length;
  const warns = issues.filter((i) => i.level === 'warning').length;
  let score = 100 - errors * 15 - warns * 5;
  if (issues.some((i) => i.rule === 'mojibake')) score = 0;
  return { issues, score: Math.max(0, Math.min(100, score)) };
}

// ============================================================================
function articleFromAiDraft(d: AiDraftArticle, suggestedSlug?: string): BlogArticle {
  // Use suggestedSlug if provided (it comes from the inbox URL), otherwise
  // use the slug from the AI draft. Either way, the reviewer can still
  // change the slug in the editor before saving.
  const slug = (suggestedSlug || d.slug || '').replace(/[^a-z0-9-]/g, '').toLowerCase();
  const url = slug ? `/${d.locale}/blog/${slug}/` : '';
  return {
    status: 'draft',
    locale: d.locale,
    slug,
    url,
    title: d.meta_title || '',
    description: d.meta_description || '',
    h1: d.h1 || '',
    intro: d.excerpt || '',
    targetMoneyPage: d.target_money_page || '',
    topicCluster: d.target_keyword || '',
    keywords: Array.isArray(d.keywords) && d.keywords.length ? d.keywords : (d.target_keyword ? [d.target_keyword] : []),
    body: Array.isArray(d.body_blocks) ? d.body_blocks : [],
    faq: Array.isArray(d.faq) ? d.faq : [],
    internalLinks: Array.isArray(d.internal_links) ? d.internal_links : [],
    ogTitle: d.og_title || '',
    ogDescription: d.og_description || '',
    ogImage: d.og_image || '',
    canonical: slug ? `${SITE_URL}/${d.locale}/blog/${slug}/` : '',
    robotsIndex: true,
    robotsFollow: true,
    author: d.author || 'GPTBot',
    schemaTypes: (d.schemas && d.schemas.length > 0 ? d.schemas : ['Article', 'FAQPage', 'BreadcrumbList']) as SchemaType[],
  };
}

export default function BlogEditor() {
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const nav = useNavigate();
  const isNew = !params.locale || !params.slug;

  // AI Draft handoff (from /admin-tools/ai-drafts → here).
  const aiDraftImportId = searchParams.get('aiDraftImport');
  const aiDraftLocaleParam = searchParams.get('aiDraftLocale');
  const aiDraftSuggestedSlug = searchParams.get('aiDraftSlug') || undefined;
  const aiDraftLocale: 'ru' | 'uz' | null = aiDraftLocaleParam === 'ru' || aiDraftLocaleParam === 'uz' ? aiDraftLocaleParam : null;

  const [allArticles, setAllArticles] = useState<BlogArticle[]>([]);
  const [moneyPages, setMoneyPages] = useState<Page[]>([]);
  const [a, setA] = useState<BlogArticle>(EMPTY as BlogArticle);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // AI draft import banner state — separate from useAiDraftBridge (that hook
  // is for the existing per-field SEO Booster patches, which never apply to
  // brand-new articles).
  const [aiDraftImported, setAiDraftImported] = useState<null | { draftId: string; locale: 'ru' | 'uz'; conflict?: string }>(null);

  // ── Intent Guard (Publish Guard) ────────────────────────────────────────
  // Cached Intent Guard verdict for the article currently in the editor.
  // Drives the publish-guard inside save('published'). High risk blocks the
  // standard Publish click; the operator can override after an explicit
  // confirm — both choices write an audit event server-side.
  const [intentGuardRisk, setIntentGuardRisk] = useState<{ score: number; level: 'low' | 'medium' | 'high' } | null>(null);
  const [allowHighRiskPublish, setAllowHighRiskPublish] = useState(false);
  const { t: tI18n } = useT();

  useEffect(() => {
    void (async () => {
      const c = await api.getContent();
      setAllArticles((c.blog || []) as BlogArticle[]);
      setMoneyPages((c.pages || []) as Page[]);

      // AI Draft Inbox handoff — only applies to /admin-tools/blog/new?aiDraftImport=...
      if (isNew && aiDraftImportId && aiDraftLocale) {
        const handoff = readAiDraftHandoff(aiDraftImportId, aiDraftLocale);
        if (handoff) {
          const draft = articleFromAiDraft(handoff.article, aiDraftSuggestedSlug);
          // Detect a duplicate slug in the same locale.
          const dup = (c.blog || []).find((x: BlogArticle) => x.locale === draft.locale && x.slug === draft.slug);
          setA(draft);
          setAiDraftImported({
            draftId: aiDraftImportId,
            locale: aiDraftLocale,
            conflict: dup
              ? `An article with locale=${draft.locale} and slug=${draft.slug} already exists ("${dup.title}"). Change the slug before saving to avoid silently overwriting it.`
              : undefined,
          });
          // Keep the handoff in sessionStorage until the user saves or
          // clears, so an accidental reload doesn't wipe the data.
        } else {
          setErr(`AI draft handoff missing for ${aiDraftImportId}/${aiDraftLocale}. Open the inbox and click Import again.`);
          setA({ ...(EMPTY as BlogArticle), locale: aiDraftLocale });
        }
        setLoaded(true);
        return;
      }

      if (!isNew) {
        const found = (c.blog || []).find((x: BlogArticle) => x.locale === params.locale && x.slug === params.slug);
        if (found) setA(found);
        else setErr(`Article ${params.locale}/${params.slug} not found`);
      } else {
        setA({ ...(EMPTY as BlogArticle), locale: (params.locale === 'uz' ? 'uz' : 'ru') as Locale });
      }
      setLoaded(true);
    })();
  }, [params.locale, params.slug, isNew, aiDraftImportId, aiDraftLocale, aiDraftSuggestedSlug]);

  // auto-sync url + canonical when slug/locale change in NEW mode
  useEffect(() => {
    if (isNew && a.slug && a.locale) {
      const url = `/${a.locale}/blog/${a.slug}/`;
      if (url !== a.url) setA((cur) => ({ ...cur, url, canonical: cur.canonical || `${SITE_URL}${url}` }));
    }
  }, [isNew, a.slug, a.locale]);

  const others = useMemo(() => allArticles.filter((x) => !(x.locale === a.locale && x.slug === a.slug)), [allArticles, a.locale, a.slug]);
  const auditResult = useMemo(() => loaded ? auditBlog(a, others, moneyPages) : null, [a, others, moneyPages, loaded]);
  const set = <K extends keyof BlogArticle>(k: K, v: BlogArticle[K]) => setA((cur) => ({ ...cur, [k]: v }));

  // AI SEO Editor Bridge — ?aiPatch=<runId> applies approved field snapshot.
  const aiDraft = useAiDraftBridge({
    currentUrl: a.url || (isNew ? '' : `/${params.locale}/blog/${params.slug}/`),
    target: 'blog',
    ready: loaded && !!a.url,
  });

  const applyAiDraft = () => {
    if (aiDraft.status !== 'ready') return;
    setA((cur) => {
      const next: BlogArticle = { ...cur };
      for (const [k, v] of Object.entries(aiDraft.applied)) {
        (next as unknown as Record<string, unknown>)[k] = v;
      }
      return next;
    });
    aiDraft.markApplied();
  };

  const save = async (newStatus?: 'draft' | 'published' | 'noindex') => {
    setBusy(true); setErr(null); setToast(null);
    try {
      const toSave: BlogArticle = { ...a, status: newStatus || a.status };
      if (!toSave.slug?.trim()) throw new Error('Slug is required');
      if (!toSave.locale) throw new Error('Locale is required');
      if (!toSave.url) toSave.url = `/${toSave.locale}/blog/${toSave.slug}/`;
      if (!toSave.canonical) toSave.canonical = `${SITE_URL}${toSave.url}`;
      const now = new Date().toISOString();
      toSave.updatedAt = now;
      if (newStatus === 'published') {
        toSave.datePublished = toSave.datePublished || now.split('T')[0];
        toSave.dateModified = now.split('T')[0];
      }
      // Pre-flight publish guard (server also enforces).
      if (toSave.status === 'published') {
        const moji = detectMojibake(toSave as unknown);
        if (moji) throw new Error(`Cannot publish — mojibake in "${moji.field}". Fix encoding first.`);
        // Intent Guard publish guard. We MUST already have an analysis when
        // the article is in the editor; if not, run one now (server-side).
        try {
          const draftArticle = blogToAiDraftArticle(toSave);
          const r = await api.cannibalizationAnalyze({ source: 'editor', article: draftArticle });
          setIntentGuardRisk({ score: r.risk_score, level: r.risk_level });
          if (r.risk_level === 'high' && !allowHighRiskPublish) {
            setBusy(false);
            const overrideConfirmed = window.confirm(`${tI18n.intentGuard.publishGuardHigh}\n\n${tI18n.intentGuard.publishGuardConfirmHigh}`);
            if (!overrideConfirmed) {
              setErr(tI18n.intentGuard.publishGuardHigh);
              return;
            }
            setAllowHighRiskPublish(true);
            // Continue with publish — proceed below.
          } else if (r.risk_level === 'medium' && !allowHighRiskPublish) {
            const proceed = window.confirm(`${tI18n.intentGuard.publishGuardMedium}\n\n${tI18n.intentGuard.publishGuardConfirmMedium}`);
            if (!proceed) { setBusy(false); return; }
          }
        } catch (igErr) {
          // Intent Guard probe failure must not block legitimate publish —
          // log and continue (the server validators still enforce schema).
          console.warn('[Intent Guard] publish-time analyze failed:', igErr);
        }
      }
      await api.saveContent('blog', toSave.locale, toSave.slug, toSave,
        `chore(blog): ${newStatus || toSave.status} ${toSave.locale}/${toSave.slug} via admin`);
      setA(toSave);
      setAllowHighRiskPublish(false);
      setToast(newStatus === 'published' ? 'Published & committed' : 'Saved');
      // After a successful save, the AI-draft handoff is no longer needed.
      if (aiDraftImported) {
        clearAiDraftHandoff(aiDraftImported.draftId, aiDraftImported.locale);
        const next = new URLSearchParams(searchParams);
        next.delete('aiDraftImport'); next.delete('aiDraftLocale'); next.delete('aiDraftSlug');
        setSearchParams(next, { replace: true });
        setAiDraftImported(null);
      }
      if (isNew) nav(`/admin-tools/blog/${toSave.locale}/${toSave.slug}`, { replace: true });
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
    setTimeout(() => setToast(null), 3500);
  };

  // Builds an AiDraftArticle from the BlogArticle currently in the editor
  // so we can call /api/admin/seo/cannibalization/analyze with source='editor'.
  function blogToAiDraftArticle(b: BlogArticle): AiDraftArticle {
    return {
      locale: b.locale,
      slug: b.slug,
      meta_title: b.title || '',
      meta_description: b.description || '',
      h1: b.h1 || '',
      excerpt: b.intro || '',
      target_keyword: (b.keywords || [])[0] || b.topicCluster || b.title || '',
      target_money_page: b.targetMoneyPage || '',
      author: b.author || 'GPTBot',
      body_blocks: (b.body || []).map((blk) => ({ ...blk })),
      faq: (b.faq || []).map((f) => ({ q: f.q, a: f.a })),
      internal_links: (b.internalLinks || []).map((l) => ({ target: l.target, anchor: l.anchor, type: l.type, locale: l.locale })),
      schemas: (b.schemaTypes && b.schemaTypes.length > 0 ? b.schemaTypes : ['Article', 'FAQPage', 'BreadcrumbList']) as ('Article' | 'FAQPage' | 'BreadcrumbList' | 'Organization' | 'WebSite' | 'Service')[],
      keywords: b.keywords || [],
      og_title: b.ogTitle || '',
      og_description: b.ogDescription || '',
      og_image: b.ogImage || '',
    };
  }

  const del = async () => {
    if (!confirm(`Delete article ${a.locale}/${a.slug}? This will remove the JSON file from the repo.`)) return;
    try {
      await api.deleteContent('blog', a.locale, a.slug, `chore(blog): delete ${a.locale}/${a.slug} via admin`);
      nav('/admin-tools/blog');
    } catch (e) { setErr((e as Error).message); }
  };

  const duplicate = () => {
    const newSlug = `${a.slug}-copy`;
    nav(`/admin-tools/blog/new`, { state: null });
    // pre-fill by passing through URL? simplest path: copy fields into state then redirect.
    // We use a session-storage hand-off.
    sessionStorage.setItem('blog-duplicate', JSON.stringify({ ...a, slug: newSlug, status: 'draft', url: '', canonical: '', datePublished: '', dateModified: '', updatedAt: '' }));
  };

  // Restore duplicated draft if redirected here with sessionStorage hand-off.
  useEffect(() => {
    if (!isNew) return;
    const raw = sessionStorage.getItem('blog-duplicate');
    if (raw) {
      try { setA(JSON.parse(raw) as BlogArticle); } catch { /* ignore */ }
      sessionStorage.removeItem('blog-duplicate');
    }
  }, [isNew]);

  if (!loaded) return <div className="p-8 text-white/60">Loading…</div>;

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-5xl" data-testid="blog-editor">
      {/* === Header / actions === */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => nav('/admin-tools/blog')}><ChevronLeft size={14}/> Blog</Button>
          <div>
            <h1 className="font-display text-2xl text-white">{isNew ? 'New article' : `${a.locale}/${a.slug}`}</h1>
            <div className="text-white/50 text-xs flex items-center gap-2 mt-0.5">
              <Badge tone={a.status === 'published' ? 'success' : a.status === 'draft' ? 'warning' : 'neutral'}>{a.status}</Badge>
              {auditResult && <ScoreBadge score={auditResult.score}/>}
              {a.url && !isNew && <a href={a.url} target="_blank" rel="noopener" className="text-brand-cyan hover:underline inline-flex items-center gap-1" data-testid="blog-view-live">view live <ExternalLink size={11}/></a>}
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!isNew && <Button variant="secondary" size="sm" onClick={duplicate} data-testid="blog-duplicate"><Copy size={14}/> Duplicate</Button>}
          {!isNew && <Button variant="danger" size="sm" onClick={del} disabled={busy} data-testid="blog-delete"><Trash2 size={14}/> Delete</Button>}
          <Button variant="secondary" size="sm" onClick={() => save('draft')} disabled={busy} data-testid="blog-save-draft"><Save size={14}/> Save draft</Button>
          <Button variant="primary" size="sm" onClick={() => save('published')} disabled={busy} data-testid="blog-publish"><Save size={14}/> {busy ? 'Saving…' : 'Publish'}</Button>
        </div>
      </div>

      {err && <Card className="border-red-500/30 bg-red-500/5"><div className="text-red-300 text-sm" data-testid="blog-error">{err}</div></Card>}
      {toast && <Card className="border-emerald-500/30 bg-emerald-500/5"><div className="text-emerald-300 text-sm" data-testid="blog-toast">{toast}</div></Card>}

      {aiDraftImported && (
        <Card className="border-brand-blue/40 bg-brand-blue/10" data-testid="ai-draft-import-banner">
          <div className="flex items-start gap-3 flex-wrap">
            <Sparkles size={18} className="text-brand-cyan mt-0.5"/>
            <div className="min-w-0 flex-1">
              <div className="text-white font-medium">
                Imported <span className="text-brand-cyan">{aiDraftImported.locale.toUpperCase()}</span> from AI Draft Inbox.
                Review and click <strong>Save draft</strong>. Nothing is published yet.
              </div>
              <div className="text-white/60 text-xs mt-1">
                Source draft: <code className="text-white/80">{aiDraftImported.draftId}</code>
              </div>
              {aiDraftImported.conflict && (
                <div className="text-amber-200 text-sm mt-2 flex items-start gap-1.5" data-testid="ai-draft-slug-conflict">
                  ⚠ {aiDraftImported.conflict}
                </div>
              )}
            </div>
            <Button size="sm" variant="ghost" data-testid="ai-draft-import-clear" onClick={() => {
              if (!aiDraftImported) return;
              clearAiDraftHandoff(aiDraftImported.draftId, aiDraftImported.locale);
              const next = new URLSearchParams(searchParams);
              next.delete('aiDraftImport'); next.delete('aiDraftLocale'); next.delete('aiDraftSlug');
              setSearchParams(next, { replace: true });
              setAiDraftImported(null);
            }}>
              <X size={14}/> Clear
            </Button>
          </div>
        </Card>
      )}

      <AiDraftBanner state={aiDraft} onApply={applyAiDraft} />

      {/* Intent Guard for the article currently in the editor.
          - Analyses the in-memory form (no draft DB row needed).
          - On Apply we merge the optimised AiDraftArticle BACK into the
            BlogArticle form state so the operator can immediately Save +
            Publish without bouncing through AI Draft Detail.
          - The Publish Guard below still re-runs analyze right before
            publication (server-side enforced too). */}
      {loaded && (a.locale === 'ru' || a.locale === 'uz') && (
        <IntentGuardPanel
          mode="editor"
          locale={a.locale as 'ru' | 'uz'}
          article={blogToAiDraftArticle(a)}
          testIdPrefix="blog-intent-guard"
          onApplyToEditor={(optimised) => {
            // Merge the AI-optimised fields BACK into the BlogArticle form.
            // Slug + locale + URL + canonical + publication metadata are
            // INTENTIONALLY preserved — those belong to the editor / GitHub
            // commit pipeline, not to the AI optimiser.
            const next: BlogArticle = {
              ...a,
              title: optimised.meta_title || a.title,
              description: optimised.meta_description || a.description,
              h1: optimised.h1 || a.h1,
              intro: optimised.excerpt || a.intro,
              keywords: optimised.keywords && optimised.keywords.length > 0 ? optimised.keywords : a.keywords,
              body: optimised.body_blocks && optimised.body_blocks.length > 0
                ? optimised.body_blocks.map((blk) => ({ ...blk }))
                : a.body,
              faq: optimised.faq && optimised.faq.length > 0
                ? optimised.faq.map((f) => ({ q: f.q, a: f.a }))
                : a.faq,
              internalLinks: optimised.internal_links && optimised.internal_links.length > 0
                ? optimised.internal_links.map((l) => ({
                    target: l.target,
                    anchor: l.anchor,
                    type: (l.type || 'contextual'),
                    locale: l.locale || a.locale,
                  }))
                : a.internalLinks,
              targetMoneyPage: optimised.target_money_page || a.targetMoneyPage,
              ogTitle: optimised.og_title || a.ogTitle,
              ogDescription: optimised.og_description || a.ogDescription,
              schemaTypes: optimised.schemas && optimised.schemas.length > 0
                ? optimised.schemas as BlogArticle['schemaTypes']
                : a.schemaTypes,
            };
            setA(next);
            setToast('Статья оптимизирована и обновлена в редакторе. Можно сохранить и опубликовать.');
            setTimeout(() => setToast(null), 4500);
            return blogToAiDraftArticle(next);
          }}
        />
      )}
      {intentGuardRisk && (
        <Card className={
          intentGuardRisk.level === 'low' ? 'border-emerald-500/30 bg-emerald-500/5'
          : intentGuardRisk.level === 'medium' ? 'border-amber-500/30 bg-amber-500/5'
          : 'border-red-500/30 bg-red-500/5'
        } data-testid="blog-publish-guard">
          <div className="text-sm">
            <strong className="text-white">Publish Guard:</strong>{' '}
            {intentGuardRisk.level === 'low' ? tI18n.intentGuard.publishGuardLow
             : intentGuardRisk.level === 'medium' ? tI18n.intentGuard.publishGuardMedium
             : tI18n.intentGuard.publishGuardHigh}
            <span className="text-white/60 ml-2">({intentGuardRisk.score}/100)</span>
          </div>
        </Card>
      )}

      {/* === Core === */}
      <Card>
        <h2 className="font-display text-lg text-white mb-4">Article core</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><Label>Status</Label>
            <Select value={a.status} onChange={(e) => set('status', e.target.value as BlogArticle['status'])} data-testid="field-status">
              <option value="draft">draft</option><option value="published">published</option><option value="noindex">noindex</option>
            </Select>
          </div>
          <div><Label>Locale</Label>
            <Select value={a.locale} onChange={(e) => set('locale', e.target.value as Locale)} data-testid="field-locale" disabled={!isNew}>
              <option value="ru">ru</option><option value="uz">uz</option>
            </Select>
          </div>
          <div className="sm:col-span-2"><Label>Slug <span className="text-white/40">(e.g. <code>ai-bot-dlya-kliniki-zadachi</code>)</span></Label>
            <Input value={a.slug || ''} onChange={(e) => set('slug', e.target.value.replace(/[^a-z0-9-]/g, '').toLowerCase())} disabled={!isNew} data-testid="field-slug"/>
          </div>
          <div className="sm:col-span-2"><Label>URL <span className="text-white/40">(auto from locale + slug)</span></Label><Input value={a.url || ''} readOnly className="opacity-60" data-testid="field-url"/></div>
          <div className="sm:col-span-2"><Label hint={`${a.title?.length || 0}/65`}>Title</Label><Input value={a.title || ''} onChange={(e) => set('title', e.target.value)} data-testid="field-title"/></div>
          <div className="sm:col-span-2"><Label hint={`${a.description?.length || 0}/160`}>Description</Label><Textarea rows={3} value={a.description || ''} onChange={(e) => set('description', e.target.value)} data-testid="field-description"/></div>
          <div className="sm:col-span-2"><Label>H1</Label><Input value={a.h1 || ''} onChange={(e) => set('h1', e.target.value)} data-testid="field-h1"/></div>
          <div className="sm:col-span-2"><Label>Intro / excerpt</Label><Textarea rows={3} value={a.intro || ''} onChange={(e) => set('intro', e.target.value)} data-testid="field-intro"/></div>
          <div><Label>Author</Label><Input value={a.author || ''} onChange={(e) => set('author', e.target.value)}/></div>
          <div><Label>Target money page</Label>
            <Select value={a.targetMoneyPage || ''} onChange={(e) => set('targetMoneyPage', e.target.value)} data-testid="field-target-money-page">
              <option value="">— none —</option>
              {moneyPages.filter((p) => p.locale === a.locale && p.status === 'published').map((p) => <option key={p.url} value={p.url}>{p.url}</option>)}
            </Select>
          </div>
          <div><Label>Date published</Label><Input type="date" value={(a.datePublished || '').slice(0, 10)} onChange={(e) => set('datePublished', e.target.value)}/></div>
          <div><Label>Date modified</Label><Input type="date" value={(a.dateModified || '').slice(0, 10)} onChange={(e) => set('dateModified', e.target.value)}/></div>
          <div className="sm:col-span-2"><Label>Keywords <span className="text-white/40">(comma-separated)</span></Label>
            <Input value={(a.keywords || []).join(', ')} onChange={(e) => set('keywords', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} data-testid="field-keywords"/>
          </div>
        </div>
      </Card>

      {/* === SERP preview === */}
      <Card>
        <h2 className="font-display text-lg text-white mb-4">SERP preview</h2>
        <SerpPreview title={a.title || ''} description={a.description || ''} url={`${SITE_URL}${a.url || ''}`}/>
      </Card>

      {/* === SEO === */}
      <Card>
        <h2 className="font-display text-lg text-white mb-4">SEO & robots</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2"><Label>Canonical</Label><Input value={a.canonical || ''} onChange={(e) => set('canonical', e.target.value)} data-testid="field-canonical"/></div>
          <div><Label>robots index</Label>
            <Select value={a.robotsIndex ? 'index' : 'noindex'} onChange={(e) => set('robotsIndex', e.target.value === 'index')} data-testid="field-robotsIndex">
              <option value="index">index</option><option value="noindex">noindex</option>
            </Select>
          </div>
          <div><Label>robots follow</Label>
            <Select value={a.robotsFollow ? 'follow' : 'nofollow'} onChange={(e) => set('robotsFollow', e.target.value === 'follow')}>
              <option value="follow">follow</option><option value="nofollow">nofollow</option>
            </Select>
          </div>
          <div className="sm:col-span-2"><Label>OG title</Label><Input value={a.ogTitle || ''} onChange={(e) => set('ogTitle', e.target.value)}/></div>
          <div className="sm:col-span-2"><Label>OG description</Label><Textarea rows={2} value={a.ogDescription || ''} onChange={(e) => set('ogDescription', e.target.value)}/></div>
          <div className="sm:col-span-2"><Label>OG image URL</Label>
            <div className="flex gap-2">
              <Input value={a.ogImage || ''} onChange={(e) => set('ogImage', e.target.value)}/>
              <BlogOgUploader onUploaded={(url) => set('ogImage', url)}/>
            </div>
          </div>
        </div>
      </Card>

      {/* === Body === */}
      <BlogBodyEditor blocks={a.body || []} onChange={(v) => set('body', v)}/>

      {/* === FAQ === */}
      <BlogFaqEditor faq={a.faq || []} onChange={(v) => set('faq', v)}/>

      {/* === Internal links === */}
      <BlogLinksEditor links={a.internalLinks || []} onChange={(v) => set('internalLinks', v)} moneyPages={moneyPages} otherArticles={others} locale={a.locale}/>

      {/* === Schema === */}
      <Card>
        <h2 className="font-display text-lg text-white mb-4">JSON-LD schemas</h2>
        <div className="flex flex-wrap gap-2">
          {SCHEMA_OPTIONS.map((s) => {
            const on = a.schemaTypes?.includes(s);
            return (
              <button key={s} data-testid={`schema-${s}`}
                onClick={() => set('schemaTypes', on ? a.schemaTypes!.filter((x) => x !== s) : [...(a.schemaTypes || []), s])}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${on ? 'bg-brand-blue/15 text-brand-cyan border-brand-blue/40' : 'border-white/10 text-white/60 hover:bg-white/5'}`}>
                {s}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-white/40 mt-3">Recommended for articles: Article + FAQPage + BreadcrumbList.</p>
      </Card>

      {/* === Issues === */}
      {auditResult && auditResult.issues.length > 0 && (
        <Card>
          <h2 className="font-display text-lg text-white mb-3">SEO issues</h2>
          <ul className="space-y-2 text-sm" data-testid="blog-issues">
            {auditResult.issues.map((i, idx) => (
              <li key={idx} className={`flex gap-2 ${i.level === 'error' ? 'text-red-300' : i.level === 'warning' ? 'text-amber-300' : 'text-white/60'}`}>
                <span className="font-mono text-xs mt-0.5">[{i.level}]</span>
                <span className="text-white/80">{i.rule}:</span>
                <span>{i.message}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// --- Body editor ---
function BlogBodyEditor({ blocks, onChange }: { blocks: BodyBlock[]; onChange: (v: BodyBlock[]) => void }) {
  const add = (type: BodyBlock['type']) => onChange([...blocks, { type, text: '', items: type === 'list' ? [''] : undefined }]);
  const update = (i: number, patch: Partial<BodyBlock>) => onChange(blocks.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  const remove = (i: number) => onChange(blocks.filter((_, idx) => idx !== i));
  const move = (i: number, d: -1 | 1) => {
    const next = [...blocks]; const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="font-display text-lg text-white">Body</h2>
        <div className="flex flex-wrap gap-2">
          {(['h2', 'h3', 'p', 'list', 'cta', 'quote'] as const).map((t) => (
            <Button key={t} size="sm" variant="secondary" onClick={() => add(t)} data-testid={`blog-add-block-${t}`}>+ {t}</Button>
          ))}
        </div>
      </div>
      {blocks.length === 0 && <p className="text-white/40 text-sm">No body blocks yet. Add H2, P, List, CTA blocks.</p>}
      <div className="space-y-3">
        {blocks.map((b, i) => (
          <div key={i} className="border border-white/10 rounded-lg p-3" data-testid={`blog-block-${i}`}>
            <div className="flex justify-between items-center mb-2">
              <Badge>{b.type}</Badge>
              <div className="flex gap-1">
                <button onClick={() => move(i, -1)} className="text-white/40 hover:text-white text-sm">↑</button>
                <button onClick={() => move(i, 1)} className="text-white/40 hover:text-white text-sm">↓</button>
                <button onClick={() => remove(i)} className="text-white/40 hover:text-red-300"><X size={14}/></button>
              </div>
            </div>
            {b.type === 'list' ? (
              <div className="space-y-1">
                {(b.items || []).map((it, j) => (
                  <Input key={j} value={it} onChange={(e) => update(i, { items: (b.items || []).map((x, k) => (k === j ? e.target.value : x)) })}/>
                ))}
                <Button size="sm" variant="ghost" onClick={() => update(i, { items: [...(b.items || []), ''] })}><Plus size={14}/> Add item</Button>
              </div>
            ) : b.type === 'cta' ? (
              <div className="grid sm:grid-cols-2 gap-2">
                <Input placeholder="Button label" value={b.text || ''} onChange={(e) => update(i, { text: e.target.value })}/>
                <Input placeholder="Button href" value={b.href || ''} onChange={(e) => update(i, { href: e.target.value })}/>
              </div>
            ) : b.type === 'p' || b.type === 'quote' ? (
              <Textarea rows={3} value={b.text || ''} onChange={(e) => update(i, { text: e.target.value })}/>
            ) : (
              <Input value={b.text || ''} onChange={(e) => update(i, { text: e.target.value })}/>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

// --- FAQ editor ---
function BlogFaqEditor({ faq, onChange }: { faq: FaqItem[]; onChange: (v: FaqItem[]) => void }) {
  const add = () => onChange([...faq, { q: '', a: '' }]);
  const update = (i: number, k: 'q' | 'a', v: string) => onChange(faq.map((f, idx) => (idx === i ? { ...f, [k]: v } : f)));
  const remove = (i: number) => onChange(faq.filter((_, idx) => idx !== i));
  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-lg text-white">FAQ <span className="text-white/40 text-xs font-normal">(published articles need ≥ 5)</span></h2>
        <Button size="sm" variant="secondary" onClick={add} data-testid="blog-faq-add"><Plus size={14}/> Add</Button>
      </div>
      {faq.length === 0 && <p className="text-white/40 text-sm">No FAQ items yet.</p>}
      <div className="space-y-3">
        {faq.map((f, i) => (
          <div key={i} className="border border-white/10 rounded-lg p-3 space-y-2" data-testid={`blog-faq-item-${i}`}>
            <div className="flex justify-between items-center"><span className="text-xs text-white/40">Q&A #{i + 1}</span>
              <button onClick={() => remove(i)} className="text-white/40 hover:text-red-300"><X size={14}/></button></div>
            <Input value={f.q} placeholder="Question" onChange={(e) => update(i, 'q', e.target.value)}/>
            <Textarea rows={2} value={f.a} placeholder="Answer" onChange={(e) => update(i, 'a', e.target.value)}/>
          </div>
        ))}
      </div>
    </Card>
  );
}

// --- Internal links editor ---
function BlogLinksEditor({ links, onChange, moneyPages, otherArticles, locale }: { links: InternalLinkT[]; onChange: (v: InternalLinkT[]) => void; moneyPages: Page[]; otherArticles: BlogArticle[]; locale: Locale }) {
  const add = () => onChange([...links, { target: '', anchor: '', locale, type: 'contextual' }]);
  const update = (i: number, patch: Partial<InternalLinkT>) => onChange(links.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const remove = (i: number) => onChange(links.filter((_, idx) => idx !== i));
  const targets = [
    ...moneyPages.filter((p) => p.locale === locale && p.status === 'published').map((p) => ({ url: p.url, label: `[money] ${p.url}` })),
    ...otherArticles.filter((p) => p.locale === locale && p.status === 'published').map((p) => ({ url: p.url, label: `[blog]  ${p.url}` })),
  ];
  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-lg text-white">Outgoing internal links <span className="text-white/40 text-xs font-normal">(≥ 3)</span></h2>
        <Button size="sm" variant="secondary" onClick={add} data-testid="blog-link-add"><Plus size={14}/> Add</Button>
      </div>
      {links.length < 3 && <div className="text-amber-300 text-xs mb-3">Recommended: at least 3 outgoing internal links (1 must be the target money page).</div>}
      <div className="space-y-2">
        {links.map((l, i) => (
          <div key={i} className="grid grid-cols-1 sm:grid-cols-[2fr_2fr_1fr_auto] gap-2 items-center" data-testid={`blog-link-row-${i}`}>
            <Select value={l.target} onChange={(e) => update(i, { target: e.target.value })}>
              <option value="">— pick target —</option>
              {targets.map((p) => <option key={p.url} value={p.url}>{p.label}</option>)}
            </Select>
            <Input value={l.anchor} placeholder="Anchor text" onChange={(e) => update(i, { anchor: e.target.value })}/>
            <Select value={l.type} onChange={(e) => update(i, { type: e.target.value as InternalLinkT['type'] })}>
              <option value="contextual">contextual</option><option value="block">block</option><option value="footer">footer</option><option value="popular">popular</option>
            </Select>
            <button onClick={() => remove(i)} className="text-white/40 hover:text-red-300"><X size={14}/></button>
          </div>
        ))}
      </div>
    </Card>
  );
}

// --- OG image uploader (blog folder) ---
function BlogOgUploader({ onUploaded }: { onUploaded: (url: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { setErr('Max 4 MiB.'); return; }
    setBusy(true); setErr(null);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = reader.result as string;
        const safeName = file.name.replace(/[^a-z0-9._-]+/gi, '-').toLowerCase();
        const r = await api.uploadImage({ filename: safeName, base64: dataUrl, folder: 'blog' });
        onUploaded(r.url);
      } catch (ex) { setErr((ex as Error).message); }
      setBusy(false);
    };
    reader.readAsDataURL(file);
  };
  return (
    <div>
      <label className="inline-flex items-center gap-1.5 cursor-pointer text-white/70 hover:text-white text-sm border border-white/10 rounded-lg px-3 py-2 whitespace-nowrap">
        <Upload size={14}/> {busy ? 'Uploading…' : 'Upload'}
        <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onChange} disabled={busy}/>
      </label>
      {err && <div className="text-red-300 text-xs mt-1">{err}</div>}
    </div>
  );
}
