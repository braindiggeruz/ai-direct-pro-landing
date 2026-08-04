/**
 * One listing, read two ways: as the owner sees the record, and as the buyer
 * sees the card.
 *
 * The preview is not a lookalike. The server renders it with the buyer's own
 * presenter — the same price format, the same availability wording and the same
 * description bound the Mini App uses — so when the buyer's formatting changes
 * this changes with it. A second implementation that happened to agree today
 * would be a screen that quietly drifts out of agreement tomorrow.
 *
 * There are no actions. Not disabled ones either: publish, archive and edit
 * belong to the seller surface, and ADMIN-3A has no endpoint that would answer
 * them if the buttons existed.
 */
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { adminApi, fetchListingMedia, FIXTURE_MODE } from '../lib/api';
import { useQuery } from '../lib/useQuery';
import {
  AVAILABILITY,
  count,
  exactTime,
  label,
  LISTING_STATUS,
  money,
  QUALITY_REASON,
  QUALITY_STATE,
  UNCATEGORISED,
  when,
} from '../lib/text';
import type { ListingDetailResponse, ListingMedia } from '../lib/contracts';
import {
  Badge,
  Card,
  CardTitle,
  DataGap,
  ErrorState,
  Field,
  Freshness,
  PageHeader,
} from '../components/ui';

/**
 * One image.
 *
 * The bytes are fetched with the owner's bearer header and handed to the DOM as
 * an object URL, because a browser attaches no headers to an `<img src>` and
 * putting a signed capability in the address would leave a credential in
 * history. Everything that can fail — an image stored in Telegram, a missing
 * object, a preview environment with no bucket — lands on a labelled tile
 * rather than a broken-image icon.
 */
function MediaTile({ id, media }: { id: string; media: ListingMedia }) {
  const [source, setSource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Nothing to fetch under fixtures — there is no server holding bytes — and
    // nothing to fetch for an image this platform does not store.
    if (media.kind !== 'stored' || FIXTURE_MODE) return undefined;
    let url: string | null = null;
    let alive = true;
    void fetchListingMedia(id, media.index).then((value) => {
      if (!alive) {
        if (value) URL.revokeObjectURL(value);
        return;
      }
      if (value) { url = value; setSource(value); } else setFailed(true);
    });
    return () => {
      alive = false;
      // The object URL is this component's to release; leaving it attached
      // pins the blob for the lifetime of the tab.
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, media.index, media.kind]);

  // One caption, said once. Every branch here is a real state the tile can be
  // in, and none of them is a broken-image icon.
  const caption = FIXTURE_MODE
    ? 'SYNTHETIC · в фикстурах изображений нет'
    : media.kind === 'external'
      ? 'Хранится в Telegram, платформа не отдаёт файл'
      : (failed ? 'Файл недоступен' : 'Загрузка…');

  return (
    <li className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-line)]">
      <div className="flex aspect-square items-center justify-center bg-[var(--surface-canvas)]">
        {source ? (
          <img
            src={source}
            alt={`Изображение ${media.index + 1} карточки`}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="muted px-2 text-center text-xs">{caption}</span>
        )}
      </div>
    </li>
  );
}

export default function ListingDetail() {
  const { id = '' } = useParams();
  const location = useLocation();
  // The filters the reader arrived with, carried back so "Назад" returns to the
  // view they left rather than to an unfiltered first page.
  const back = { pathname: '/listings', search: location.search };

  const detail = useQuery<ListingDetailResponse>(() => adminApi.listing(id), [id]);

  if (detail.loading) {
    return (
      <>
        <PageHeader title="Карточка" />
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="skeleton h-80 w-full" />
          <div className="skeleton h-80 w-full xl:col-span-2" />
        </div>
      </>
    );
  }
  if (detail.error === 'listing_not_found') {
    return (
      <>
        <PageHeader title="Карточка не найдена" />
        <Card>
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium">Такой карточки нет</p>
            <p className="muted mx-auto mt-1 max-w-md text-xs">
              Возможно, её удалил продавец или ссылка устарела.
            </p>
            <Link
              to={back}
              className="mt-4 inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--border-line)] px-3 text-sm"
            >
              Вернуться к списку
            </Link>
          </div>
        </Card>
      </>
    );
  }
  if (detail.error || !detail.data) {
    return (
      <>
        <PageHeader title="Карточка" />
        <Card><ErrorState code={detail.error ?? 'unknown'} onRetry={detail.reload} /></Card>
      </>
    );
  }

  const listing = detail.data.listing;
  const preview = listing.preview;

  return (
    <>
      <PageHeader
        title={listing.name}
        subtitle="Только чтение. Изменения вносит продавец в своём кабинете."
        actions={(
          <Freshness
            fetchedAt={detail.fetchedAt}
            refreshing={detail.refreshing}
            onRefresh={detail.reload}
          />
        )}
      />

      <Link
        to={back}
        className="mb-4 inline-flex min-h-11 items-center rounded-[var(--radius-control)] px-2 text-sm underline"
      >
        ← К списку объявлений
      </Link>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardTitle hint="Собрано презентером покупателя, а не отдельной вёрсткой.">
            Как видит покупатель
          </CardTitle>
          <div className="rounded-[var(--radius-card)] border border-[var(--border-line)] p-3">
            <p className="text-sm font-medium">{preview.title}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{preview.price}</p>
            <p className="muted mt-1 text-xs">{preview.availability}</p>
            {preview.description ? (
              <p className="mt-3 text-sm">{preview.description}</p>
            ) : (
              <p className="muted mt-3 text-xs">Описание не заполнено.</p>
            )}
            <p className="muted mt-3 text-xs">
              {preview.category ?? UNCATEGORISED} · {preview.store}
            </p>
          </div>
          <div className="mt-4">
            <DataGap
              what="Просмотры, отклики и рейтинг не показаны"
              why="Bormi не собирает эти события, поэтому карточка покупателя их не содержит — ни здесь, ни в Mini App."
            />
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardTitle>Основные сведения</CardTitle>
          <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            <Field label="Статус" value={<Badge>{label(LISTING_STATUS, listing.status)}</Badge>} />
            <Field
              label="Наличие"
              value={<Badge>{label(AVAILABILITY, listing.availability)}</Badge>}
            />
            <Field label="Цена" value={money(listing.price_minor)} />
            <Field label="Валюта" value={listing.currency} />
            <Field label="Категория" value={listing.category_name ?? UNCATEGORISED} />
            <Field label="Магазин" value={listing.store_name} />
            <Field label="Артикул" value={listing.sku ?? '—'} />
            <Field label="Версия" value={String(listing.version)} />
            <Field label="Создано" value={exactTime(listing.created_at)} />
            <Field label="Изменено" value={`${when(listing.updated_at)} · ${exactTime(listing.updated_at)}`} />
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardTitle hint="Изображения отдаёт сервер по одному, по номеру внутри карточки.">
            Фотографии
          </CardTitle>
          {listing.media.length === 0 ? (
            <p className="muted text-sm">
              Фотографий нет. Карточка без фотографии почти не открывается покупателем.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {listing.media.map((media) => (
                <MediaTile key={media.index} id={listing.id} media={media} />
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle hint="Правила проверяют поля карточки, а не её продажи.">
            Качество карточки
          </CardTitle>
          <div className="mb-3">
            <Badge tone={listing.quality === 'good' ? 'good' : listing.quality === 'needs_attention' ? 'warn' : 'bad'}>
              {label(QUALITY_STATE, listing.quality)}
            </Badge>
          </div>
          {listing.quality_reasons.length === 0 ? (
            <p className="muted text-sm">Все проверяемые поля заполнены.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {listing.quality_reasons.map((reason) => (
                <li key={reason} className="flex items-start gap-2">
                  <span aria-hidden="true" className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--tone-warn)]" />
                  <span>{label(QUALITY_REASON, reason)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="muted mt-3 text-xs">
            Оценки в баллах нет: платформа не измеряет просмотры и продажи, поэтому
            любая цифра была бы догадкой.
          </p>
        </Card>
      </div>

      {listing.specifications.length > 0 || listing.description ? (
        <Card className="mt-4">
          <CardTitle>Описание и характеристики</CardTitle>
          {listing.description ? (
            <p className="whitespace-pre-line text-sm">{listing.description}</p>
          ) : (
            <p className="muted text-sm">Описание не заполнено.</p>
          )}
          {listing.specifications.length > 0 ? (
            <div className="mt-4 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {listing.specifications.map((specification) => (
                <Field
                  key={`${specification.key}-${specification.value}`}
                  label={specification.key}
                  value={specification.value}
                />
              ))}
            </div>
          ) : null}
        </Card>
      ) : null}

      <details className="mt-4 rounded-[var(--radius-card)] border border-[var(--border-line)] p-4">
        <summary className="cursor-pointer text-sm font-medium">Технические поля</summary>
        <div className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
          <Field label="Идентификатор карточки" value={<span className="font-mono text-xs">{listing.id}</span>} />
          <Field label="Организация" value={<span className="font-mono text-xs">{listing.org_id}</span>} />
          <Field label="Магазин" value={<span className="font-mono text-xs">{listing.store_id}</span>} />
          <Field
            label="Категория"
            value={<span className="font-mono text-xs">{listing.category_id ?? '—'}</span>}
          />
          <Field label="Поисковых синонимов" value={count(listing.search_terms.length)} />
        </div>
        <p className="muted mt-3 text-xs">
          Здесь только идентификаторы записей каталога. Данных покупателя, Telegram ID,
          телефонов и ключей хранилища в этой панели нет.
        </p>
      </details>

      <p className="muted mt-4 text-xs">Данные на {exactTime(detail.data.generated_at)}</p>
    </>
  );
}
