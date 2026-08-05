/**
 * Категории — whether the catalogue is actually browsable.
 *
 * This screen earns its place by answering something no other screen can: which
 * categories are empty, which hold only drafts, which are full of cards with no
 * photo, and how many products belong to no category at all. The Command Center
 * knows one number of that set; the listings table can be filtered to find each
 * one by hand. Here they are all visible at once.
 *
 * Read-only, and firmly so. Create, rename, merge, reorder and delete change
 * what buyers can browse and what a seller has already organised — they need a
 * domain and security stage of their own, not a button on a counting screen.
 */
import { Link } from 'react-router';
import { adminApi } from '../lib/api';
import { useQuery } from '../lib/useQuery';
import { count, exactTime, plural, UNCATEGORISED, when } from '../lib/text';
import type { CategoriesResponse, CategoryRow } from '../lib/contracts';
import {
  Badge,
  Card,
  CardTitle,
  EmptyState,
  ErrorState,
  Freshness,
  Metric,
  PageHeader,
  TableFrame,
  Td,
  Th,
} from '../components/ui';

/**
 * What is wrong with a category, from its own counts.
 *
 * Never "bad": a category with no products may be one a seller is about to
 * fill. The wording says what is true and leaves the judgement to the reader.
 */
function note(row: CategoryRow): { text: string; tone: 'warn' | 'neutral' } | null {
  if (row.total === 0) return { text: 'Пустая', tone: 'warn' };
  if (row.published === 0) return { text: 'Только черновики и архив', tone: 'warn' };
  if (row.no_photo > 0) {
    return {
      text: `${count(row.no_photo)} без фото`,
      tone: 'warn',
    };
  }
  return null;
}

export default function Categories() {
  const categories = useQuery<CategoriesResponse>(() => adminApi.categories(), []);

  if (categories.loading) {
    return (
      <>
        <PageHeader title="Категории" />
        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((index) => <div key={index} className="skeleton h-24 w-full" />)}
        </div>
        <div className="skeleton h-80 w-full" />
      </>
    );
  }
  if (categories.error || !categories.data) {
    return (
      <>
        <PageHeader title="Категории" />
        <Card><ErrorState code={categories.error ?? 'unknown'} onRetry={categories.reload} /></Card>
      </>
    );
  }

  const rows = categories.data.categories;
  const real = rows.filter((row) => !row.uncategorised);
  const orphans = rows.find((row) => row.uncategorised) ?? null;
  const empty = real.filter((row) => row.total === 0).length;

  return (
    <>
      <PageHeader
        eyebrow="Контент"
        title="Категории"
        subtitle="Только чтение. Создание и переименование выполняет продавец."
        actions={(
          <Freshness
            fetchedAt={categories.fetchedAt}
            refreshing={categories.refreshing}
            onRefresh={categories.reload}
          />
        )}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-3">
        <Metric label="Категорий" value={count(real.length)} />
        <Metric
          label="Пустых категорий"
          value={count(empty)}
          tone={empty > 0 ? 'warn' : 'good'}
          note={empty > 0 ? 'покупателю нечего смотреть' : undefined}
        />
        <Metric
          label="Карточек без категории"
          value={count(orphans?.total ?? 0)}
          tone={(orphans?.total ?? 0) > 0 ? 'warn' : 'good'}
          note={(orphans?.total ?? 0) > 0 ? 'не попадают в подборки' : undefined}
        />
      </div>

      <Card>
        <CardTitle hint="Счётчики считает сервер одним запросом, а не по одному на строку.">
          Категории магазина
        </CardTitle>
        {rows.length === 0 ? (
          <EmptyState
            title="Категорий пока нет"
            hint="Продавец ещё не разложил каталог по категориям."
          />
        ) : (
          <TableFrame>
            <caption className="sr-only">
              Категории: название, магазин, число карточек по статусам и карточки без фото
            </caption>
            <thead>
              <tr>
                <Th>Категория</Th>
                <Th>Магазин</Th>
                <Th>Состояние</Th>
                <Th align="right">Всего</Th>
                <Th align="right">Опубликовано</Th>
                <Th align="right">Черновики</Th>
                <Th align="right">Без фото</Th>
                <Th align="right">Изменена</Th>
                <Th align="right">Действие</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const mark = note(row);
                return (
                  <tr key={row.id}>
                    <Td>
                      <div className="font-medium">
                        {row.uncategorised ? UNCATEGORISED : row.name}
                      </div>
                      {row.uncategorised ? (
                        <div className="muted text-xs">
                          не категория, а карточки без неё
                        </div>
                      ) : (
                        <div className="muted text-xs">{row.slug}</div>
                      )}
                    </Td>
                    <Td>
                      <span className="muted">{row.uncategorised ? '—' : row.store_name}</span>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {!row.uncategorised ? (
                          <Badge tone={row.status === 'active' ? 'good' : 'neutral'}>
                            {row.status === 'active' ? 'Активна' : 'В архиве'}
                          </Badge>
                        ) : null}
                        {mark ? <Badge tone={mark.tone}>{mark.text}</Badge> : null}
                      </div>
                    </Td>
                    <Td align="right">{count(row.total)}</Td>
                    <Td align="right">{count(row.published)}</Td>
                    <Td align="right">{count(row.draft)}</Td>
                    <Td align="right">
                      <span className={row.no_photo > 0 ? 'text-[var(--tone-warn)]' : ''}>
                        {count(row.no_photo)}
                      </span>
                    </Td>
                    <Td align="right">
                      <span className="muted text-xs">
                        {row.updated_at ? when(row.updated_at) : '—'}
                      </span>
                    </Td>
                    <Td align="right">
                      <Link
                        to={`/listings?category=${encodeURIComponent(row.id)}`}
                        className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] px-2 underline"
                      >
                        Карточки
                      </Link>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableFrame>
        )}
        <p className="muted mt-4 text-xs">
          {real.length > 0
            ? `${count(real.length)} ${plural(real.length, 'категория', 'категории', 'категорий')} в каталоге.`
            : ''}{' '}
          Переименование, объединение и удаление категорий здесь недоступны: они меняют
          то, что видит покупатель, и требуют отдельного этапа с подтверждением и аудитом.
        </p>
      </Card>

      <p className="muted mt-4 text-xs">Данные на {exactTime(categories.data.generated_at)}</p>
    </>
  );
}
