/**
 * Объявления — what exists in the catalogue, and what is wrong with it.
 *
 * The screen answers, in this order: how much is there, how much is published,
 * how much needs a person, and where is the one I am looking for. Everything
 * below the filter bar is one bounded page from the server.
 *
 * It reads. There is no publish, archive, unpublish or edit here — not even
 * disabled. A greyed-out command still tells the reader the capability is in
 * this screen and merely withheld, and the next session then only has to
 * remove an attribute. ADMIN-3A has no write path, so it shows no controls
 * that imply one.
 *
 * Every filter is applied by the server. None of them narrows the rows already
 * in the browser: a control that filtered twenty-five loaded rows while the
 * catalogue held six hundred would be lying about what it searched.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { adminApi } from '../lib/api';
import { useQuery } from '../lib/useQuery';
import {
  AVAILABILITY,
  count,
  exactTime,
  label,
  LISTING_SORT,
  LISTING_STATUS,
  MEDIA_FILTER,
  money,
  plural,
  QUALITY_REASON,
  QUALITY_STATE,
  UNCATEGORISED,
  when,
} from '../lib/text';
import type {
  CategoriesResponse,
  ListingFilters,
  ListingRow,
  ListingsResponse,
} from '../lib/contracts';
import {
  Badge,
  Card,
  CardTitle,
  EmptyState,
  ErrorState,
  FilterSelect,
  Freshness,
  TableFrame,
  Td,
  Th,
} from '../components/ui';
import {
  Bento,
  BentoCard,
  DiscreteTabs,
  ScreenHeader,
  TONE_SOFT,
  cn,
  type TabOption,
} from '../components/premium';

const PAGE_SIZE = 25;

/**
 * The four views of the catalogue, as tabs rather than a seventh dropdown.
 *
 * These are the same values the server's `status` filter takes - the tab bar
 * writes one of them into the URL and the next request carries it. A decorative
 * tab bar over a client-side slice would be lying about what it searched, which
 * is the rule the rest of this screen already follows.
 */
const STATUS_TABS: readonly { value: string; label: string; key: 'published' | 'draft' | 'archived' | null }[] = [
  { value: '', label: 'Все', key: null },
  { value: 'published', label: 'Опубликованные', key: 'published' },
  { value: 'draft', label: 'Черновики', key: 'draft' },
  { value: 'archived', label: 'В архиве', key: 'archived' },
];

/** Tone by status, so colour repeats the word rather than replacing it. */
function statusTone(status: string): 'good' | 'neutral' | 'warn' {
  if (status === 'published') return 'good';
  if (status === 'draft') return 'warn';
  return 'neutral';
}

function qualityTone(state: string): 'good' | 'warn' | 'bad' {
  if (state === 'good') return 'good';
  if (state === 'needs_attention') return 'warn';
  return 'bad';
}

/** The reasons, as a sentence. Never a score. */
function reasons(row: ListingRow): string {
  return row.quality_reasons.map((code) => label(QUALITY_REASON, code)).join(' · ');
}

export default function Listings() {
  const [params, setParams] = useSearchParams();

  // Filters live in the URL, so Back from a listing returns to the same view
  // and a link to a filtered screen is a link somebody else can open. The page
  // offset is here too, but only so Back works; nothing depends on sharing it.
  const filters: ListingFilters = useMemo(() => ({
    status: params.get('status') ?? undefined,
    availability: params.get('availability') ?? undefined,
    media: params.get('media') ?? undefined,
    quality: params.get('quality') ?? undefined,
    category: params.get('category') ?? undefined,
    q: params.get('q') ?? undefined,
    sort: params.get('sort') ?? undefined,
  }), [params]);
  const offset = Number(params.get('offset') ?? 0) || 0;

  // Read once, at mount: it decides whether the filter panel starts open, and
  // a panel that opened and closed itself while the reader resized the window
  // would be worse than one that simply stayed as they left it.
  const [wide] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
  ));

  // The text field is local until it settles: one request per keystroke would
  // be one query per keystroke against the catalogue.
  const [draft, setDraft] = useState(filters.q ?? '');
  // When the URL's term changes underneath the field — Back, Reset, a link —
  // the box has to follow it. Adjusted during render rather than in an effect:
  // an effect would render once with the stale text and then again with the
  // new one, and the reader would see the old term flash back.
  const [syncedQuery, setSyncedQuery] = useState(filters.q ?? '');
  if (syncedQuery !== (filters.q ?? '')) {
    setSyncedQuery(filters.q ?? '');
    setDraft(filters.q ?? '');
  }
  useEffect(() => {
    const term = draft.trim();
    if (term === (filters.q ?? '')) return undefined;
    const timer = window.setTimeout(() => {
      setParams((current) => {
        const next = new URLSearchParams(current);
        if (term) next.set('q', term); else next.delete('q');
        next.delete('offset');
        return next;
      }, { replace: true });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [draft, filters.q, setParams]);

  const key = JSON.stringify({ filters, offset });
  const listings = useQuery<ListingsResponse>(
    () => adminApi.listings(PAGE_SIZE, offset, filters),
    [key],
  );
  // Category names for the filter. Fetched from the categories endpoint rather
  // than collected from the current page, because a page of twenty-five rows
  // does not know which categories exist.
  const categories = useQuery<CategoriesResponse>(() => adminApi.categories(), []);

  function set(name: string, value: string): void {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(name, value); else next.delete(name);
      // Any change to what is being asked returns to the first page: staying on
      // page four of a different question shows an empty screen that looks like
      // "nothing found" when it means "no fourth page".
      next.delete('offset');
      return next;
    });
  }

  function move(next: number): void {
    setParams((current) => {
      const params_ = new URLSearchParams(current);
      if (next > 0) params_.set('offset', String(next)); else params_.delete('offset');
      return params_;
    });
  }

  const active = Object.entries(filters).filter(([name, value]) => value && name !== 'sort');
  const activeCount = active.length;

  if (listings.loading) {
    return (
      <>
        <ScreenHeader eyebrow="Контент" title="Объявления" />
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((index) => <div key={index} className="skeleton h-24 w-full" />)}
        </div>
        <div className="skeleton mb-4 h-20 w-full" />
        <div className="skeleton h-96 w-full" />
      </>
    );
  }
  if (listings.error || !listings.data) {
    return (
      <>
        <ScreenHeader eyebrow="Контент" title="Объявления" />
        <Card><ErrorState code={listings.error ?? 'unknown'} onRetry={listings.reload} /></Card>
      </>
    );
  }

  const data = listings.data;
  const summary = data.summary;
  const rows = data.listings;
  const shown = offset + rows.length;

  const categoryOptions = [
    { value: '', label: 'Все категории' },
    { value: 'uncategorised', label: UNCATEGORISED },
    ...(categories.data?.categories ?? [])
      .filter((entry) => !entry.uncategorised)
      .map((entry) => ({ value: entry.id, label: entry.name })),
  ];

  return (
    <>
      <ScreenHeader
        eyebrow="Контент"
        title="Объявления"
        subtitle="Только чтение. Публикация и правка остаются в кабинете продавца."
        actions={(
          <Freshness
            fetchedAt={listings.fetchedAt}
            refreshing={listings.refreshing}
            onRefresh={listings.reload}
          />
        )}
        filters={(
          <DiscreteTabs
            label="Фильтр по статусу"
            controls="listings-table"
            value={filters.status ?? ''}
            onChange={(value) => set('status', value)}
            options={STATUS_TABS.map((tab): TabOption<string> => ({
              value: tab.value,
              label: tab.label,
              // The count belongs to the whole catalogue, which is what the
              // server reports in `summary`; it does not change as the tab
              // changes, and that is the point of showing it on the tab.
              count: tab.key === null ? summary.total : summary.by_status[tab.key],
            }))}
          />
        )}
      />

      {/*
        Attention, as one line above the table rather than a strip plus four
        tiles. The tiles repeated numbers the tabs now carry, and the strip and
        the tiles together took the whole first screen - on the one page whose
        job is to show the catalogue.
      */}
      {summary.attention > 0 ? (
        <Bento className="mb-4">
          <BentoCard span={12} tone="warn" index={0}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="t-eyebrow">Качество карточек</p>
                <h2 className="t-section mt-1">Требуют внимания: {count(summary.attention)}</h2>
              </div>
              <ul className="flex flex-wrap gap-2">
                {([
                  ['без фото', summary.quality.no_photo],
                  ['без категории', summary.quality.no_category],
                  ['без описания', summary.quality.no_description],
                  ['нет в наличии', summary.quality.unavailable],
                ] as const)
                  .filter(([, value]) => value > 0)
                  .map(([text, value]) => (
                    <li
                      key={text}
                      className={cn('inline-flex items-center gap-1.5 rounded-[var(--admin-radius-pill)] px-2.5 py-1 text-xs', TONE_SOFT.warn)}
                    >
                      {text}
                      <span className="font-semibold tabular-nums">{count(value)}</span>
                    </li>
                  ))}
              </ul>
            </div>
          </BentoCard>
        </Bento>
      ) : null}

      <Card className="mb-4">
        {/*
          A disclosure rather than a drawer. On a phone seven stacked controls
          push the table below the fold, so the panel starts closed there and
          open on a wide screen. `<details>` is keyboard-operable and announced
          as expandable by the browser itself — a hand-built drawer would need a
          focus trap, an Escape handler and a restore, all to end up where this
          already is.
        */}
        <details open={wide} className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3">
            <span className="text-sm font-semibold tracking-tight">Поиск и фильтры</span>
            <span className="muted text-xs">
              {activeCount > 0
                ? `${count(activeCount)} ${plural(activeCount, 'фильтр', 'фильтра', 'фильтров')}`
                : 'все карточки'}
            </span>
          </summary>
          <p className="muted mt-1 mb-3 text-xs">
            Фильтрует сервер по всей базе, а не загруженную страницу.
          </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label className="muted text-xs font-medium" htmlFor="listing-search">
              Название
            </label>
            <input
              id="listing-search"
              type="search"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Начало названия"
              autoComplete="off"
              className="min-h-11 rounded-[var(--radius-control)] border border-[var(--border-line)] bg-[var(--surface-paper)] px-3 text-sm"
            />
          </div>
          {/* Status is the tab bar in the header now. Two controls writing the
              same parameter is two controls that can disagree on screen. */}
          <FilterSelect
            label="Категория"
            value={filters.category ?? ''}
            onChange={(value) => set('category', value)}
            options={categoryOptions}
          />
          <FilterSelect
            label="Наличие"
            value={filters.availability ?? ''}
            onChange={(value) => set('availability', value)}
            options={[
              { value: '', label: 'Любое наличие' },
              ...Object.entries(AVAILABILITY).map(([value, text]) => ({ value, label: text })),
            ]}
          />
          <FilterSelect
            label="Фото"
            value={filters.media ?? ''}
            onChange={(value) => set('media', value)}
            options={[
              { value: '', label: 'С фото и без' },
              ...Object.entries(MEDIA_FILTER).map(([value, text]) => ({ value, label: text })),
            ]}
          />
          <FilterSelect
            label="Качество"
            value={filters.quality ?? ''}
            onChange={(value) => set('quality', value)}
            options={[
              { value: '', label: 'Любое качество' },
              ...Object.entries(QUALITY_STATE).map(([value, text]) => ({ value, label: text })),
            ]}
          />
          <FilterSelect
            label="Порядок"
            value={filters.sort ?? 'name'}
            onChange={(value) => set('sort', value === 'name' ? '' : value)}
            options={Object.entries(LISTING_SORT).map(([value, text]) => ({ value, label: text }))}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="muted text-xs">
            {activeCount > 0
              ? `${count(activeCount)} ${plural(activeCount, 'фильтр', 'фильтра', 'фильтров')} · найдено ${count(data.total)}`
              : `Всего ${count(data.total)} ${plural(data.total, 'карточка', 'карточки', 'карточек')}`}
          </p>
          {activeCount > 0 ? (
            <button
              type="button"
              onClick={() => setParams(filters.sort ? new URLSearchParams({ sort: filters.sort }) : new URLSearchParams())}
              className="min-h-11 rounded-[var(--radius-control)] border border-[var(--border-line)] px-3 text-sm"
            >
              Сбросить фильтры
            </button>
          ) : null}
        </div>
        <p className="muted mt-3 text-xs">
          Сортировка по дате изменения не предлагается: её не покрывает ни один индекс,
          и запрос стал бы полным сканом таблицы. Дата показана в строке.
        </p>
        </details>
      </Card>

      {/* The region the status tabs point at, so a screen reader is told the
          two are connected rather than left to infer it from proximity. */}
      <Card>
        <div id="listings-table" role="tabpanel" tabIndex={-1} aria-label="Каталог">
        <CardTitle hint={`Страница по ${PAGE_SIZE} карточек. Нажмите «Открыть», чтобы посмотреть карточку.`}>
          Каталог
        </CardTitle>

        {rows.length === 0 ? (
          activeCount > 0 ? (
            <EmptyState
              title="По этим фильтрам ничего не найдено"
              hint="Сбросьте фильтры или измените запрос — в каталоге есть карточки, просто не эти."
            />
          ) : (
            <EmptyState
              title="Объявлений пока нет"
              hint="Ни один продавец ещё не создал карточку товара."
            />
          )
        ) : (
          <>
            {/* Desktop: the full table. */}
            <div className="hidden md:block">
              <TableFrame>
                <caption className="sr-only">
                  Объявления магазина: название, категория, цена, наличие, статус и качество карточки
                </caption>
                {/*
                  Widths are set on the header text rather than left to the
                  browser. Nine columns of automatic width give the longest
                  content the least room: the product name wrapped to three
                  lines while the quality column, whose reasons are the longest
                  strings on the row, took the space. The name is what a person
                  scans, so it gets the room and the table scrolls instead.
                */}
                <thead>
                  <tr>
                    <Th><span className="block min-w-[13rem]">Название</span></Th>
                    <Th><span className="block min-w-[9rem]">Категория</span></Th>
                    <Th><span className="block min-w-[7rem]">Магазин</span></Th>
                    <Th align="right"><span className="block min-w-[6rem]">Цена</span></Th>
                    <Th><span className="block min-w-[7rem]">Наличие</span></Th>
                    <Th><span className="block min-w-[7rem]">Статус</span></Th>
                    <Th><span className="block min-w-[11rem]">Качество</span></Th>
                    <Th align="right"><span className="block min-w-[6rem]">Изменено</span></Th>
                    <Th align="right"><span className="block min-w-[5rem]">Действие</span></Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <Td>
                        <div className="font-medium">{row.name}</div>
                        {row.media_count === 0 ? (
                          <div className="muted text-xs">без фотографии</div>
                        ) : (
                          <div className="muted text-xs">
                            {count(row.media_count)} {plural(row.media_count, 'фото', 'фото', 'фото')}
                          </div>
                        )}
                      </Td>
                      <Td>
                        {row.category_name
                          ? <span className="muted">{row.category_name}</span>
                          : <Badge tone="warn">{UNCATEGORISED}</Badge>}
                      </Td>
                      <Td><span className="muted">{row.store_name}</span></Td>
                      <Td align="right"><span className="whitespace-nowrap">{money(row.price_minor)}</span></Td>
                      <Td>
                        <Badge tone={row.availability === 'unavailable' ? 'warn' : 'neutral'}>
                          {label(AVAILABILITY, row.availability)}
                        </Badge>
                      </Td>
                      <Td>
                        <Badge tone={statusTone(row.status)}>{label(LISTING_STATUS, row.status)}</Badge>
                      </Td>
                      <Td>
                        <Badge tone={qualityTone(row.quality)}>{label(QUALITY_STATE, row.quality)}</Badge>
                        {row.quality_reasons.length > 0 ? (
                          <div className="muted mt-1 text-xs">{reasons(row)}</div>
                        ) : null}
                      </Td>
                      <Td align="right">
                        <span className="muted text-xs">{when(row.updated_at)}</span>
                      </Td>
                      <Td align="right">
                        {/* A link, always visible: an action that appears on
                            hover cannot be reached by touch or by keyboard
                            without first guessing that it is there. */}
                        <Link
                          to={{ pathname: `/listings/${row.id}`, search: params.toString() }}
                          className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] px-2 underline"
                        >
                          Открыть
                        </Link>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableFrame>
            </div>

            {/* Phone and small tablet: cards. A nine-column table at 320px is a
                table nobody reads, and horizontal scrolling to find the status
                of a row is worse than not showing the row at all. */}
            <ul className="space-y-3 md:hidden">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="rounded-[var(--radius-card)] border border-[var(--border-line)] p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium">{row.name}</p>
                    <Badge tone={statusTone(row.status)}>{label(LISTING_STATUS, row.status)}</Badge>
                  </div>
                  <p className="muted mt-1 text-xs">
                    {row.category_name ?? UNCATEGORISED} · {row.store_name}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="tabular-nums text-sm">{money(row.price_minor)}</span>
                    <Badge tone={row.availability === 'unavailable' ? 'warn' : 'neutral'}>
                      {label(AVAILABILITY, row.availability)}
                    </Badge>
                    <Badge tone={qualityTone(row.quality)}>{label(QUALITY_STATE, row.quality)}</Badge>
                  </div>
                  {row.quality_reasons.length > 0 ? (
                    <p className="muted mt-2 text-xs">{reasons(row)}</p>
                  ) : null}
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="muted text-xs">{when(row.updated_at)}</span>
                    <Link
                      to={{ pathname: `/listings/${row.id}`, search: params.toString() }}
                      className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--border-line)] px-3 text-sm"
                    >
                      Открыть
                    </Link>
                  </div>
                </li>
              ))}
            </ul>

            <nav
              className="mt-4 flex flex-wrap items-center justify-between gap-3"
              aria-label="Страницы каталога"
            >
              <p className="muted text-xs" aria-live="polite">
                Показано {count(offset + 1)}–{count(shown)} из {count(data.total)}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => move(Math.max(0, offset - PAGE_SIZE))}
                  disabled={offset === 0}
                  className="min-h-11 rounded-[var(--radius-control)] border border-[var(--border-line)] px-3 text-sm disabled:opacity-40"
                >
                  Назад
                </button>
                <button
                  type="button"
                  onClick={() => move(offset + PAGE_SIZE)}
                  disabled={shown >= data.total}
                  className="min-h-11 rounded-[var(--radius-control)] border border-[var(--border-line)] px-3 text-sm disabled:opacity-40"
                >
                  Дальше
                </button>
              </div>
            </nav>
          </>
        )}
        </div>
      </Card>

      <p className="muted mt-4 text-xs">Данные на {exactTime(data.generated_at)}</p>
    </>
  );
}
