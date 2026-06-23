// IndexNow Mass Submitter — /admin-tools/indexnow
//
// One-screen flow for bulk-pushing newly published URLs to all
// IndexNow participants (Bing, Yandex, Seznam, Naver, Yep) so they
// crawl as fast as possible.
//
// Flow:
//   1. Page mounts → GET /api/admin/indexnow/recent (gptbot.uz published
//      URLs joined with audit log).
//   2. Operator picks days filter, "only unsubmitted" checkbox, and
//      individually selects URLs.
//   3. Click "Отправить выбранное (N)" → POST /api/seo/indexnow with
//      selected URLs. The existing endpoint triple-validates against
//      the booster, probes the key file, hits api.indexnow.org, and
//      records every URL into D1.
//   4. After response, refresh recent + history.
//
// Hard rules:
//   * Operator must explicitly pick URLs — no implicit "submit all"
//     without an extra confirmation.
//   * Per-URL last-submitted badges so we don't spam the same URL.
//   * No automatic submission anywhere on the site.

import { useEffect, useMemo, useState } from 'react';
import { Send, RefreshCw, ShieldCheck, ShieldAlert, ExternalLink, Filter, Globe, History as HistoryIcon } from 'lucide-react';
import { Badge, Button, Card } from '../components/ui';
import { api } from '../lib/api';

interface RecentItem {
  url: string;
  locale: 'ru' | 'uz';
  type: 'money' | 'blog';
  title: string;
  published: boolean;
  last_modified: string | null;
  last_submitted_at: string | null;
  last_status: number | null;
  last_ok: boolean;
}

interface HistoryBatch {
  batch_id: string;
  submitted_at: string;
  actor_email: string;
  upstream_status: number;
  upstream_ok: boolean;
  duration_ms: number;
  url_count: number;
  error: string | null;
}

const DAY_OPTIONS = [7, 14, 30, 60, 90, 180, 365];
const ENGINES = ['Bing', 'Yandex', 'Seznam', 'Naver', 'Yep'];

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}м назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}ч назад`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}д назад`;
  return new Date(iso).toLocaleDateString();
}

export default function IndexNowPanel() {
  const [items, setItems] = useState<RecentItem[]>([]);
  const [history, setHistory] = useState<HistoryBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [onlyUnsubmitted, setOnlyUnsubmitted] = useState(false);
  const [filterLocale, setFilterLocale] = useState<'all' | 'ru' | 'uz'>('all');
  const [filterType, setFilterType] = useState<'all' | 'money' | 'blog'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ tone: 'ok' | 'err' | 'warn'; text: string } | null>(null);
  const [keyStatus, setKeyStatus] = useState<'unknown' | 'ok' | 'fail'>('unknown');

  async function load() {
    setLoading(true);
    try {
      const [r, h] = await Promise.all([
        api.indexnowRecent(days, onlyUnsubmitted),
        api.indexnowHistory(50),
      ]);
      setItems(r.items);
      setHistory(h.batches);
      // Clear selection of items that no longer match the filters.
      setSelected((cur) => {
        const next = new Set<string>();
        const live = new Set(r.items.map((i) => i.url));
        for (const u of cur) if (live.has(u)) next.add(u);
        return next;
      });
    } catch (e) {
      setToast({ tone: 'err', text: `Не удалось загрузить: ${(e as Error).message}` });
    }
    setLoading(false);
  }

  async function probeKey() {
    try {
      const res = await fetch('/api/indexnow/key', { method: 'GET' });
      setKeyStatus(res.ok ? 'ok' : 'fail');
    } catch {
      setKeyStatus('fail');
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [days, onlyUnsubmitted]);
  useEffect(() => { void probeKey(); }, []);

  const filtered = useMemo(() => items.filter((i) =>
    (filterLocale === 'all' || i.locale === filterLocale) &&
    (filterType === 'all' || i.type === filterType),
  ), [items, filterLocale, filterType]);

  const allSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.url));

  function toggleAll() {
    setSelected((cur) => {
      if (allSelected) {
        const next = new Set(cur);
        for (const i of filtered) next.delete(i.url);
        return next;
      }
      const next = new Set(cur);
      for (const i of filtered) next.add(i.url);
      return next;
    });
  }
  function toggleOne(u: string) {
    setSelected((cur) => {
      const n = new Set(cur);
      if (n.has(u)) n.delete(u); else n.add(u);
      return n;
    });
  }

  async function submit() {
    if (selected.size === 0) return;
    if (!confirm(`Отправить ${selected.size} URL в IndexNow?\nКлючевые поисковики (${ENGINES.join(', ')}) получат сигнал на индексацию.\n\nПовторная отправка не запрещена, но не делайте чаще 1 раза в день для одного и того же URL.`)) return;
    setSubmitting(true);
    setToast(null);
    try {
      const r = await api.indexnowSubmit(Array.from(selected));
      if (r.ok) {
        setToast({ tone: 'ok', text: `Отправлено: ${r.submitted}. HTTP ${r.upstreamStatus} · batch ${r.batchId.slice(0, 14)}…` });
        setSelected(new Set());
      } else {
        const detail = (r as unknown as { rejected?: Array<{ url: string; reason: string }> }).rejected
          ?.slice(0, 3).map((x) => `${x.url} (${x.reason})`).join('; ') || '';
        setToast({ tone: 'warn', text: `Частично: HTTP ${r.upstreamStatus}. Отказано в ${(r as unknown as { rejected?: unknown[] }).rejected?.length || 0}. ${detail}` });
      }
      await load();
    } catch (e) {
      setToast({ tone: 'err', text: `Ошибка: ${(e as Error).message}` });
    }
    setSubmitting(false);
  }

  const counts = useMemo(() => {
    const total = items.length;
    const submittedOk = items.filter((i) => i.last_ok).length;
    const never = items.filter((i) => !i.last_submitted_at).length;
    return { total, submittedOk, never };
  }, [items]);

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-6xl" data-testid="indexnow-panel">
      {/* Header */}
      <div>
        <div className="text-xs uppercase tracking-widest text-white/40 inline-flex items-center gap-1">
          <Send size={11} /> IndexNow · массовая отправка
        </div>
        <h1 className="font-display text-2xl text-white">Поисковики получают сигнал за секунды</h1>
        <p className="text-white/55 text-sm mt-1.5 max-w-3xl">
          Один POST на <code className="text-white/75">api.indexnow.org</code> распространяется на {ENGINES.join(', ')}. Ничего не отправляется автоматически — выбирай URL и жми «Отправить выбранное».
        </p>
      </div>

      {/* Status pills */}
      <Card>
        <div className="flex items-center gap-3 flex-wrap">
          {keyStatus === 'ok' ? (
            <Badge tone="success" data-testid="indexnow-key-status"><ShieldCheck size={11}/> KEY OK</Badge>
          ) : keyStatus === 'fail' ? (
            <Badge tone="danger" data-testid="indexnow-key-status"><ShieldAlert size={11}/> KEY FAIL — настрой INDEXNOW_KEY</Badge>
          ) : (
            <Badge tone="neutral" data-testid="indexnow-key-status">проверка ключа…</Badge>
          )}
          <Badge tone="info"><Globe size={11}/> {ENGINES.join(' · ')}</Badge>
          <Badge tone="neutral">всего published: {counts.total}</Badge>
          <Badge tone="success">отправлено OK: {counts.submittedOk}</Badge>
          <Badge tone="warning">никогда не отправлялось: {counts.never}</Badge>
          <Button variant="ghost" size="sm" onClick={() => { void load(); void probeKey(); }} data-testid="indexnow-refresh">
            <RefreshCw size={14}/> Обновить
          </Button>
        </div>
      </Card>

      {/* Filters */}
      <Card>
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <div className="text-white/50 text-xs uppercase tracking-wide mb-1 flex items-center gap-1"><Filter size={11}/> Период</div>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="bg-bg-base border border-white/10 rounded px-3 py-1.5 text-sm text-white/90"
              data-testid="indexnow-days"
            >
              {DAY_OPTIONS.map((d) => <option key={d} value={d}>последние {d} дн.</option>)}
            </select>
          </div>
          <div>
            <div className="text-white/50 text-xs uppercase tracking-wide mb-1">Локаль</div>
            <select
              value={filterLocale}
              onChange={(e) => setFilterLocale(e.target.value as 'all' | 'ru' | 'uz')}
              className="bg-bg-base border border-white/10 rounded px-3 py-1.5 text-sm text-white/90"
              data-testid="indexnow-locale"
            >
              <option value="all">все</option>
              <option value="ru">RU</option>
              <option value="uz">UZ</option>
            </select>
          </div>
          <div>
            <div className="text-white/50 text-xs uppercase tracking-wide mb-1">Тип</div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as 'all' | 'money' | 'blog')}
              className="bg-bg-base border border-white/10 rounded px-3 py-1.5 text-sm text-white/90"
              data-testid="indexnow-type"
            >
              <option value="all">все</option>
              <option value="blog">blog</option>
              <option value="money">money</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-white/80 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyUnsubmitted}
              onChange={(e) => setOnlyUnsubmitted(e.target.checked)}
              className="h-4 w-4 accent-emerald-400 cursor-pointer"
              data-testid="indexnow-only-unsubmitted"
            />
            только не отправленные
          </label>
        </div>
      </Card>

      {/* Submit bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-white/70 text-sm">
          Найдено: <strong className="text-white">{filtered.length}</strong> · Выбрано: <strong className="text-white" data-testid="indexnow-selected-count">{selected.size}</strong>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={toggleAll} disabled={filtered.length === 0} data-testid="indexnow-toggle-all">
            {allSelected ? 'Снять выделение' : `Выбрать все (${filtered.length})`}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void submit()}
            disabled={selected.size === 0 || submitting || keyStatus === 'fail'}
            data-testid="indexnow-submit"
          >
            <Send size={14}/> {submitting ? 'Отправляю…' : `Отправить выбранное (${selected.size})`}
          </Button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <Card
          className={
            toast.tone === 'ok' ? 'border-emerald-500/30 bg-emerald-500/5'
            : toast.tone === 'warn' ? 'border-amber-500/30 bg-amber-500/5'
            : 'border-red-500/30 bg-red-500/5'
          }
          data-testid="indexnow-toast"
        >
          <div className={
            toast.tone === 'ok' ? 'text-emerald-200 text-sm'
            : toast.tone === 'warn' ? 'text-amber-200 text-sm'
            : 'text-red-200 text-sm'
          }>{toast.text}</div>
        </Card>
      )}

      {/* Items table */}
      <Card>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="text-white/60 text-sm py-6 text-center">Загружаю опубликованные URL…</div>
          ) : filtered.length === 0 ? (
            <div className="text-white/60 text-sm py-6 text-center">Нет URL за выбранный период.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-white/50 text-xs uppercase tracking-wide">
                  <th className="py-2 px-2 w-8"></th>
                  <th className="py-2 px-2">URL</th>
                  <th className="py-2 px-2">Locale</th>
                  <th className="py-2 px-2">Type</th>
                  <th className="py-2 px-2">Изменён</th>
                  <th className="py-2 px-2">Последняя отправка</th>
                </tr>
              </thead>
              <tbody data-testid="indexnow-rows">
                {filtered.map((it) => {
                  const checked = selected.has(it.url);
                  return (
                    <tr key={it.url} className="border-t border-white/5 hover:bg-white/[0.02]">
                      <td className="py-2 px-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOne(it.url)}
                          className="h-4 w-4 accent-emerald-400 cursor-pointer"
                          data-testid={`indexnow-check-${it.url}`}
                        />
                      </td>
                      <td className="py-2 px-2">
                        <a href={it.url} target="_blank" rel="noreferrer" className="text-brand-cyan hover:underline inline-flex items-center gap-1 break-all" data-testid={`indexnow-url-${it.url}`}>
                          <ExternalLink size={11}/>{it.url.replace(/^https:\/\//, '')}
                        </a>
                        <div className="text-white/45 text-xs mt-0.5">{it.title}</div>
                      </td>
                      <td className="py-2 px-2"><Badge tone="neutral">{it.locale.toUpperCase()}</Badge></td>
                      <td className="py-2 px-2"><Badge tone={it.type === 'money' ? 'success' : 'info'}>{it.type}</Badge></td>
                      <td className="py-2 px-2 text-white/60 text-xs">{timeAgo(it.last_modified)}</td>
                      <td className="py-2 px-2 text-xs">
                        {it.last_submitted_at ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-white/70">{timeAgo(it.last_submitted_at)}</span>
                            <Badge tone={it.last_ok ? 'success' : 'danger'}>HTTP {it.last_status}</Badge>
                          </div>
                        ) : (
                          <Badge tone="warning">никогда</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* History */}
      <Card>
        <h2 className="font-display text-lg text-white mb-3 flex items-center gap-2">
          <HistoryIcon size={16}/> История отправок (последние {history.length})
        </h2>
        {history.length === 0 ? (
          <div className="text-white/50 text-sm">Пока ни одна группа URL не отправлялась.</div>
        ) : (
          <ul className="space-y-1.5 text-sm" data-testid="indexnow-history">
            {history.map((b) => (
              <li key={b.batch_id} className="border border-white/5 rounded-lg px-3 py-2 flex items-start gap-3 flex-wrap">
                <Badge tone={b.upstream_ok ? 'success' : 'danger'}>HTTP {b.upstream_status}</Badge>
                <span className="text-white/80">{b.url_count} URL</span>
                <span className="text-white/50">·</span>
                <span className="text-white/60">{timeAgo(b.submitted_at)}</span>
                <span className="text-white/50">·</span>
                <code className="text-white/40 text-xs">{b.actor_email}</code>
                <span className="text-white/50 ml-auto">{b.duration_ms}мс</span>
                {b.error && <div className="w-full text-red-300 text-xs">{b.error}</div>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
