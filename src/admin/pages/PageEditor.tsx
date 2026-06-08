import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Badge, Button, Card, Input, Label, ScoreBadge, Select, Textarea } from '../components/ui';
import { SerpPreview } from '../components/SerpPreview';
import { AiDraftBanner } from '../components/AiDraftBanner';
import { useAiDraftBridge } from '../hooks/useAiDraftBridge';
import { Save, Trash2, ExternalLink, Plus, X, AlertCircle, ChevronLeft, Sparkles, Upload, Wand2 } from 'lucide-react';
import type { Page, FaqItem, BodyBlock, InternalLink as InternalLinkT, SchemaType } from '../../shared/types';
import { auditPage } from '../../shared/audit';
import { SITE_URL, ANCHORS } from '../../shared/site-config';

const EMPTY_PAGE: Partial<Page> = {
  status: 'draft',
  locale: 'ru',
  pageType: 'money',
  url: '',
  slug: '',
  primaryKeyword: '',
  secondaryKeywords: [],
  h1: '',
  title: '',
  description: '',
  canonical: '',
  hreflangRu: '',
  hreflangUz: '',
  ogTitle: '',
  ogDescription: '',
  ogImage: '',
  robotsIndex: true,
  robotsFollow: true,
  bodyBlocks: [],
  faq: [],
  internalLinks: [],
  schemaTypes: ['Organization', 'WebSite', 'BreadcrumbList', 'Service', 'FAQPage'],
};

const SCHEMA_OPTIONS: SchemaType[] = ['Organization', 'WebSite', 'BreadcrumbList', 'Service', 'FAQPage', 'Article'];

export default function PageEditor() {
  const params = useParams();
  const nav = useNavigate();
  const isNew = !params.locale || !params.slug;

  const [allPages, setAllPages] = useState<Page[]>([]);
  const [page, setPage] = useState<Page>(EMPTY_PAGE as Page);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const c = await api.getContent();
      setAllPages(c.pages || []);
      if (!isNew) {
        const found = (c.pages || []).find((p: Page) => p.locale === params.locale && p.slug === params.slug);
        if (found) setPage(found);
        else setErr(`Page ${params.locale}/${params.slug} not found`);
      } else {
        // initialize new page with sensible defaults
        setPage({ ...(EMPTY_PAGE as Page), locale: 'ru' });
      }
      setLoaded(true);
    })();
  }, [params.locale, params.slug, isNew]);

  const auditResult = useMemo(() => loaded ? auditPage(page, { allPages }) : null, [page, allPages, loaded]);

  // AI SEO Editor Bridge — ?aiPatch=<runId> applies approved field snapshot.
  const aiDraft = useAiDraftBridge({
    currentUrl: page.url || (isNew ? '' : `/${params.locale}/${params.slug}/`),
    target: 'page',
    ready: loaded && !!page.url,
  });

  const applyAiDraft = () => {
    if (aiDraft.status !== 'ready') return;
    setPage((p) => {
      const next: Page = { ...p };
      for (const [k, v] of Object.entries(aiDraft.applied)) {
        // AI bridge only emits keys that exist in P0_BRIDGE_FIELDS.page; type
        // is checked at runtime by the backend validator, so a runtime cast
        // is safe here.
        (next as unknown as Record<string, unknown>)[k] = v;
      }
      return next;
    });
    aiDraft.markApplied();
  };

  const set = <K extends keyof Page>(k: K, v: Page[K]) => setPage((p) => ({ ...p, [k]: v }));

  // sync URL when slug/locale change in NEW mode
  useEffect(() => {
    if (isNew && page.slug && page.locale) {
      const url = `/${page.locale}/${page.slug}/`;
      if (url !== page.url) setPage((p) => ({ ...p, url, canonical: `${SITE_URL}${url}` }));
    }
  }, [isNew, page.slug, page.locale]);

  const save = async (newStatus?: 'draft' | 'published' | 'noindex') => {
    setBusy(true); setErr(null); setToast(null);
    try {
      const toSave: Page = { ...page, status: newStatus || page.status };
      if (!toSave.slug && toSave.url) toSave.slug = toSave.url.replace(/^\/(ru|uz)\//, '').replace(/\/$/, '');
      if (!toSave.canonical) toSave.canonical = `${SITE_URL}${toSave.url}`;
      await api.saveContent('page', toSave.locale, toSave.slug, toSave, `chore(seo): ${newStatus || toSave.status} ${toSave.locale}/${toSave.slug}`);
      setPage(toSave);
      setToast(newStatus === 'published' ? 'Published & committed' : 'Saved');
      if (isNew) nav(`/admin-tools/pages/${toSave.locale}/${toSave.slug}`, { replace: true });
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
    setTimeout(() => setToast(null), 3000);
  };

  const del = async () => {
    if (!confirm(`Delete ${page.locale}/${page.slug}? This will remove the JSON file from the repo.`)) return;
    await api.deleteContent('page', page.locale, page.slug);
    nav('/admin-tools/pages');
  };

  if (!loaded) return <div className="p-8 text-white/60">Loading…</div>;
  if (err && !page.slug) return <div className="p-8 text-red-300">{err}</div>;

  const errorsByField: Record<string, string[]> = {};
  auditResult?.issues.forEach((i) => {
    if (!i.field) return;
    errorsByField[i.field] = errorsByField[i.field] || [];
    errorsByField[i.field].push(i.message);
  });

  const FieldWarning = ({ field }: { field: string }) => {
    const msgs = errorsByField[field];
    if (!msgs) return null;
    return <div className="mt-1.5 text-xs text-amber-300 flex items-start gap-1.5"><AlertCircle size={12} className="mt-0.5"/> <span>{msgs.join(' · ')}</span></div>;
  };

  return (
    <div className="p-6 sm:p-8 max-w-5xl space-y-6" data-testid="page-editor">
      {/* Sticky top bar */}
      <div className="sticky top-0 -mx-6 sm:-mx-8 px-6 sm:px-8 py-4 bg-bg-base/80 backdrop-blur-md border-b border-white/5 z-30 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <button onClick={() => nav('/admin-tools/pages')} className="text-white/60 hover:text-white"><ChevronLeft size={20}/></button>
          <div>
            <div className="text-xs text-white/40">{isNew ? 'New page' : `Editing ${page.locale}/${page.slug}`}</div>
            <div className="font-display text-lg text-white">{page.title || page.h1 || '— untitled —'}</div>
          </div>
          {auditResult && <ScoreBadge score={auditResult.score}/>}
          <Badge tone={page.status === 'published' ? 'success' : page.status === 'noindex' ? 'warning' : 'neutral'}>{page.status}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {page.status === 'published' && (
            <a href={page.url} target="_blank" rel="noreferrer" className="text-white/60 hover:text-white inline-flex items-center gap-1 text-sm"><ExternalLink size={14}/> Open live</a>
          )}
          {!isNew && <Button variant="danger" size="sm" onClick={del} data-testid="delete-page-btn"><Trash2 size={14}/></Button>}
          <Button variant="secondary" size="sm" onClick={() => save('draft')} disabled={busy} data-testid="save-draft-btn">Save draft</Button>
          <Button onClick={() => save('published')} disabled={busy} data-testid="save-publish-btn"><Save size={14}/> {busy ? 'Saving…' : 'Publish'}</Button>
        </div>
      </div>

      {toast && <div data-testid="toast-success" className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 rounded-lg p-3 text-sm">{toast}</div>}
      {err && <div data-testid="toast-error" className="bg-red-500/15 border border-red-500/30 text-red-300 rounded-lg p-3 text-sm">{err}</div>}

      <AiDraftBanner state={aiDraft} onApply={applyAiDraft} />

      <AiFillPanel page={page} onApply={(patch) => setPage((p) => ({ ...p, ...patch }))} />

      {/* === Meta block === */}
      <Card>
        <h2 className="font-display text-lg text-white mb-4">Meta & search</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><Label>Locale</Label>
            <Select value={page.locale} onChange={(e) => set('locale', e.target.value as any)} data-testid="field-locale">
              <option value="ru">RU</option><option value="uz">UZ</option>
            </Select>
          </div>
          <div><Label>Page type</Label>
            <Select value={page.pageType} onChange={(e) => set('pageType', e.target.value as any)} data-testid="field-pageType">
              <option value="money">money</option><option value="homepage">homepage</option><option value="niche">niche</option>
              <option value="blog">blog</option><option value="faq">faq</option><option value="legal">legal</option>
            </Select>
          </div>
          <div className="sm:col-span-2"><Label>URL <span className="text-white/40 text-xs">(e.g. /ru/ai-bot-dlya-biznesa/)</span></Label>
            <Input value={page.url} onChange={(e) => set('url', e.target.value)} placeholder="/ru/slug/" data-testid="field-url"/>
          </div>
          <div><Label>Slug</Label>
            <Input value={page.slug} onChange={(e) => set('slug', e.target.value)} data-testid="field-slug"/>
          </div>
          <div><Label>Primary keyword</Label>
            <Input value={page.primaryKeyword} onChange={(e) => set('primaryKeyword', e.target.value)} data-testid="field-primaryKeyword"/>
          </div>
          <div className="sm:col-span-2"><Label>Secondary keywords <span className="text-white/40 text-xs">(comma-separated)</span></Label>
            <Input value={(page.secondaryKeywords || []).join(', ')} onChange={(e) => set('secondaryKeywords', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} data-testid="field-secondaryKeywords"/>
          </div>

          <div className="sm:col-span-2"><Label hint={`${page.title?.length || 0}/65`}>Title</Label>
            <Input value={page.title} onChange={(e) => set('title', e.target.value)} data-testid="field-title"/>
            <FieldWarning field="title"/>
          </div>
          <div className="sm:col-span-2"><Label hint={`${page.description?.length || 0}/160`}>Description</Label>
            <Textarea rows={2} value={page.description} onChange={(e) => set('description', e.target.value)} data-testid="field-description"/>
            <FieldWarning field="description"/>
          </div>
          <div className="sm:col-span-2"><Label>H1</Label>
            <Input value={page.h1} onChange={(e) => set('h1', e.target.value)} data-testid="field-h1"/>
            <FieldWarning field="h1"/>
          </div>
          <div className="sm:col-span-2"><Label>Canonical</Label>
            <Input value={page.canonical} onChange={(e) => set('canonical', e.target.value)} placeholder={`${SITE_URL}${page.url}`} data-testid="field-canonical"/>
            <FieldWarning field="canonical"/>
          </div>
          <div><Label>hreflang RU</Label>
            <Input value={page.hreflangRu || ''} onChange={(e) => set('hreflangRu', e.target.value)} placeholder="/ru/…/" data-testid="field-hreflangRu"/>
          </div>
          <div><Label>hreflang UZ</Label>
            <Input value={page.hreflangUz || ''} onChange={(e) => set('hreflangUz', e.target.value)} placeholder="/uz/…/" data-testid="field-hreflangUz"/>
          </div>
        </div>
      </Card>

      {/* === SERP preview === */}
      <SerpPreview title={page.title} description={page.description} url={page.url} primaryKeyword={page.primaryKeyword}/>

      {/* === OG === */}
      <Card>
        <h2 className="font-display text-lg text-white mb-4">Open Graph & robots</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2"><Label>OG title</Label><Input value={page.ogTitle || ''} onChange={(e) => set('ogTitle', e.target.value)} data-testid="field-ogTitle"/></div>
          <div className="sm:col-span-2"><Label>OG description</Label><Textarea rows={2} value={page.ogDescription || ''} onChange={(e) => set('ogDescription', e.target.value)} data-testid="field-ogDescription"/></div>
          <div className="sm:col-span-2"><Label>OG image URL</Label>
            <div className="flex gap-2">
              <Input value={page.ogImage || ''} onChange={(e) => set('ogImage', e.target.value)} data-testid="field-ogImage"/>
              <OgImageUploader currentUrl={page.ogImage || ''} onUploaded={(url) => set('ogImage', url)}/>
            </div>
          </div>
          <div><Label>robots index</Label>
            <Select value={page.robotsIndex ? 'index' : 'noindex'} onChange={(e) => set('robotsIndex', e.target.value === 'index')} data-testid="field-robotsIndex">
              <option value="index">index</option><option value="noindex">noindex</option>
            </Select>
          </div>
          <div><Label>robots follow</Label>
            <Select value={page.robotsFollow ? 'follow' : 'nofollow'} onChange={(e) => set('robotsFollow', e.target.value === 'follow')}>
              <option value="follow">follow</option><option value="nofollow">nofollow</option>
            </Select>
          </div>
        </div>
      </Card>

      {/* === Hero / CTA === */}
      <Card>
        <h2 className="font-display text-lg text-white mb-4">Hero & CTA</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2"><Label>Breadcrumb label</Label><Input value={page.breadcrumbLabel || ''} onChange={(e) => set('breadcrumbLabel', e.target.value)}/></div>
          <div className="sm:col-span-2"><Label>Hero title</Label><Input value={page.heroTitle || ''} onChange={(e) => set('heroTitle', e.target.value)}/></div>
          <div className="sm:col-span-2"><Label>Hero subtitle</Label><Textarea rows={2} value={page.heroSubtitle || ''} onChange={(e) => set('heroSubtitle', e.target.value)}/></div>
          <div><Label>CTA primary label</Label><Input value={page.ctaPrimaryLabel || ''} onChange={(e) => set('ctaPrimaryLabel', e.target.value)}/></div>
          <div><Label>CTA primary href</Label><Input value={page.ctaPrimaryHref || ''} onChange={(e) => set('ctaPrimaryHref', e.target.value)}/></div>
          <div><Label>CTA secondary label</Label><Input value={page.ctaSecondaryLabel || ''} onChange={(e) => set('ctaSecondaryLabel', e.target.value)}/></div>
          <div><Label>CTA secondary href</Label><Input value={page.ctaSecondaryHref || ''} onChange={(e) => set('ctaSecondaryHref', e.target.value)}/></div>
        </div>
      </Card>

      {/* === Body blocks === */}
      <BodyBlocksEditor blocks={page.bodyBlocks || []} onChange={(v) => set('bodyBlocks', v)}/>

      {/* === FAQ === */}
      <FaqEditor faq={page.faq || []} onChange={(v) => set('faq', v)}/>

      {/* === Internal links === */}
      <InternalLinksEditor links={page.internalLinks || []} onChange={(v) => set('internalLinks', v)} allPages={allPages} locale={page.locale} pageSlug={page.slug}/>

      {/* === JSON-LD === */}
      <Card>
        <h2 className="font-display text-lg text-white mb-4">JSON-LD schemas</h2>
        <div className="flex flex-wrap gap-2">
          {SCHEMA_OPTIONS.map((s) => {
            const on = page.schemaTypes?.includes(s);
            return (
              <button key={s} data-testid={`schema-${s}`}
                onClick={() => set('schemaTypes', on ? page.schemaTypes!.filter((x) => x !== s) : [...(page.schemaTypes || []), s])}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${on ? 'bg-brand-blue/15 text-brand-cyan border-brand-blue/40' : 'border-white/10 text-white/60 hover:bg-white/5'}`}>
                {s}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-white/40 mt-3">JSON-LD is generated automatically from these toggles + content fields at build time (prerender) and inserted into the &lt;head&gt;.</p>
      </Card>

      {/* === All issues === */}
      {auditResult && auditResult.issues.length > 0 && (
        <Card>
          <h2 className="font-display text-lg text-white mb-3">All SEO issues on this page</h2>
          <ul className="space-y-2 text-sm">
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

// --- FAQ editor ---
function FaqEditor({ faq, onChange }: { faq: FaqItem[]; onChange: (v: FaqItem[]) => void }) {
  const add = () => onChange([...faq, { q: '', a: '' }]);
  const update = (i: number, k: 'q' | 'a', v: string) => onChange(faq.map((f, idx) => (idx === i ? { ...f, [k]: v } : f)));
  const remove = (i: number) => onChange(faq.filter((_, idx) => idx !== i));
  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-lg text-white">FAQ</h2>
        <Button size="sm" variant="secondary" onClick={add} data-testid="faq-add"><Plus size={14}/> Add</Button>
      </div>
      {faq.length === 0 && <p className="text-white/40 text-sm">No FAQ items yet. Money pages should have at least 4.</p>}
      <div className="space-y-3">
        {faq.map((f, i) => (
          <div key={i} className="border border-white/10 rounded-lg p-3 space-y-2" data-testid={`faq-item-${i}`}>
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
function InternalLinksEditor({ links, onChange, allPages, locale, pageSlug }: { links: InternalLinkT[]; onChange: (v: InternalLinkT[]) => void; allPages: Page[]; locale: 'ru' | 'uz'; pageSlug?: string }) {
  const [suggestions, setSuggestions] = useState<{ target: string; anchor: string; reason: string; score: number }[]>([]);
  const [loadingSug, setLoadingSug] = useState(false);
  const add = () => onChange([...links, { target: '', anchor: '', locale, type: 'contextual' }]);
  const update = (i: number, patch: Partial<InternalLinkT>) => onChange(links.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const remove = (i: number) => onChange(links.filter((_, idx) => idx !== i));
  const sameLocalePages = allPages.filter((p) => p.locale === locale && p.status === 'published');
  const loadSuggestions = async () => {
    if (!pageSlug) return;
    setLoadingSug(true);
    try {
      const r = await api.suggestLinks(pageSlug, locale);
      const existing = new Set(links.map((l) => l.target));
      setSuggestions(r.suggestions.filter((s) => !existing.has(s.target)));
    } catch { /* ignore */ }
    setLoadingSug(false);
  };
  const applySuggestion = (s: { target: string; anchor: string }) => {
    onChange([...links, { target: s.target, anchor: s.anchor, locale, type: 'contextual' }]);
    setSuggestions((cur) => cur.filter((x) => x.target !== s.target));
  };
  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-lg text-white">Outgoing internal links</h2>
        <div className="flex gap-2">
          {pageSlug && <Button size="sm" variant="ghost" onClick={loadSuggestions} disabled={loadingSug} data-testid="link-suggest"><Wand2 size={14}/> {loadingSug ? 'Thinking…' : 'Suggest links'}</Button>}
          <Button size="sm" variant="secondary" onClick={add} data-testid="link-add"><Plus size={14}/> Add</Button>
        </div>
      </div>
      {links.length < 3 && <div className="text-amber-300 text-xs mb-3">Recommended: at least 3 outgoing internal links.</div>}
      {suggestions.length > 0 && (
        <div className="mb-4 border border-brand-cyan/30 rounded-lg p-3 bg-brand-blue/5">
          <div className="text-xs text-brand-cyan font-semibold mb-2">Suggested ({suggestions.length})</div>
          <ul className="space-y-1.5">
            {suggestions.map((s) => (
              <li key={s.target} className="flex items-center justify-between gap-2 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="text-white truncate">{s.anchor}</div>
                  <div className="text-white/40 text-xs truncate">{s.target} · score {s.score} · {s.reason}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => applySuggestion(s)}>Add</Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="space-y-2">
        {links.map((l, i) => (
          <div key={i} className="grid grid-cols-1 sm:grid-cols-[2fr_2fr_1fr_auto] gap-2 items-center" data-testid={`link-row-${i}`}>
            <Select value={l.target} onChange={(e) => update(i, { target: e.target.value })}>
              <option value="">— pick target page —</option>
              {sameLocalePages.map((p) => <option key={p.url} value={p.url}>{p.url}</option>)}
            </Select>
            <Input value={l.anchor} placeholder="Anchor text" onChange={(e) => update(i, { anchor: e.target.value })} list={`anchors-${locale}`}/>
            <datalist id={`anchors-${locale}`}>{ANCHORS[locale].map((a) => <option key={a} value={a}/>)}</datalist>
            <Select value={l.type} onChange={(e) => update(i, { type: e.target.value as any })}>
              <option value="contextual">contextual</option><option value="block">block</option><option value="footer">footer</option><option value="popular">popular</option><option value="breadcrumb">breadcrumb</option>
            </Select>
            <button onClick={() => remove(i)} className="text-white/40 hover:text-red-300"><X size={14}/></button>
          </div>
        ))}
      </div>
    </Card>
  );
}

// --- AI Fill panel ---
function AiFillPanel({ page, onApply }: { page: Page; onApply: (patch: Partial<Page>) => void }) {
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<null | { title?: string; description?: string; h1?: string; heroSubtitle?: string; faq?: FaqItem[]; anchors?: string[]; raw?: string }>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    if (!page.primaryKeyword) { setErr('Set a primary keyword first.'); return; }
    setBusy(true); setErr(null); setDraft(null);
    try {
      const r = await api.aiFill({ primaryKeyword: page.primaryKeyword, locale: page.locale, pageType: page.pageType, h1: page.h1 });
      setDraft(r.draft);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const apply = (field: keyof Page, value: any) => onApply({ [field]: value } as Partial<Page>);
  return (
    <Card>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="text-brand-cyan" size={18}/>
          <h2 className="font-display text-lg text-white">AI assistant <span className="text-white/40 text-xs font-normal">(review before applying — never auto-publishes)</span></h2>
        </div>
        <Button size="sm" variant="secondary" onClick={run} disabled={busy || !page.primaryKeyword} data-testid="ai-fill-btn">
          {busy ? 'Generating…' : 'Generate draft from primary keyword'}
        </Button>
      </div>
      {err && <div className="text-red-300 text-sm mb-2">{err}</div>}
      {draft && (
        <div className="space-y-3 text-sm">
          {draft.raw && <div className="text-amber-300 text-xs">AI did not return strict JSON. Raw: <pre className="whitespace-pre-wrap text-white/60 mt-1 text-xs">{draft.raw}</pre></div>}
          {draft.title && (
            <DraftRow label="Title" value={draft.title} onApply={() => apply('title', draft.title)}/>
          )}
          {draft.description && (
            <DraftRow label="Description" value={draft.description} onApply={() => apply('description', draft.description)}/>
          )}
          {draft.h1 && (
            <DraftRow label="H1" value={draft.h1} onApply={() => apply('h1', draft.h1)}/>
          )}
          {draft.heroSubtitle && (
            <DraftRow label="Hero subtitle" value={draft.heroSubtitle} onApply={() => apply('heroSubtitle', draft.heroSubtitle)}/>
          )}
          {draft.faq && draft.faq.length > 0 && (
            <div className="border-t border-white/5 pt-2 flex items-start gap-2">
              <div className="flex-1">
                <div className="text-white/40 text-xs uppercase tracking-widest">FAQ ({draft.faq.length})</div>
                <ul className="mt-1 text-white/70 list-disc list-inside text-sm">
                  {draft.faq.slice(0, 4).map((f, i) => <li key={i}>{f.q}</li>)}
                </ul>
              </div>
              <Button size="sm" variant="ghost" onClick={() => apply('faq', [...(page.faq || []), ...draft.faq!])}>Append all</Button>
            </div>
          )}
          {draft.anchors && draft.anchors.length > 0 && (
            <div className="border-t border-white/5 pt-2 text-xs text-white/60">
              Suggested anchors: {draft.anchors.join(' · ')}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
function DraftRow({ label, value, onApply }: { label: string; value: string; onApply: () => void }) {
  return (
    <div className="flex items-start gap-2 border-t border-white/5 pt-2">
      <div className="flex-1">
        <div className="text-white/40 text-xs uppercase tracking-widest">{label}</div>
        <div className="text-white/80 mt-1">{value}</div>
      </div>
      <Button size="sm" variant="ghost" onClick={onApply}>Use</Button>
    </div>
  );
}

// --- OG image uploader ---
function OgImageUploader({ currentUrl, onUploaded }: { currentUrl: string; onUploaded: (url: string) => void }) {
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
        const r = await api.uploadImage({ filename: safeName, base64: dataUrl, folder: 'seo' });
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
        <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={onChange} disabled={busy}/>
      </label>
      {err && <div className="text-red-300 text-xs mt-1">{err}</div>}
      {currentUrl && <div className="text-white/40 text-xs mt-1 truncate max-w-xs">{currentUrl}</div>}
    </div>
  );
}

// --- Body blocks editor ---
function BodyBlocksEditor({ blocks, onChange }: { blocks: BodyBlock[]; onChange: (v: BodyBlock[]) => void }) {
  const add = (type: BodyBlock['type']) => onChange([...blocks, { type, text: '', items: type === 'list' ? [''] : undefined }]);
  const update = (i: number, patch: Partial<BodyBlock>) => onChange(blocks.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  const remove = (i: number) => onChange(blocks.filter((_, idx) => idx !== i));
  const move = (i: number, d: -1 | 1) => {
    const next = [...blocks];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="font-display text-lg text-white">Body blocks</h2>
        <div className="flex flex-wrap gap-2">
          {(['h2', 'h3', 'p', 'list', 'cta', 'quote'] as const).map((t) => (
            <Button key={t} size="sm" variant="secondary" onClick={() => add(t)} data-testid={`add-block-${t}`}>+ {t}</Button>
          ))}
        </div>
      </div>
      {blocks.length === 0 && <p className="text-white/40 text-sm">No body blocks yet. Add H2, P, List, CTA blocks to build the page body.</p>}
      <div className="space-y-3">
        {blocks.map((b, i) => (
          <div key={i} className="border border-white/10 rounded-lg p-3" data-testid={`block-${i}`}>
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
