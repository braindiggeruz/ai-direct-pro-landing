/**
 * One listing, and the decision about it.
 *
 * Everything a person needs to rule is on this screen and nothing that would
 * make the ruling about a person: the seller appears as three public trust
 * facts, the reports appear as what was filed and why, and no reporter's words
 * or identity are in the projection to display in the first place.
 *
 * The four decisions are one command. The operator names a decision and the
 * server decides which states that implies — nothing here sends a target status,
 * so a screen cannot reach a fifth outcome or write `published` by itself.
 *
 * There is no "return to pending". The server's `allowedFrom` has no transition
 * back into the queue, and a button that always answered 409 would be a worse
 * lie than its absence.
 */
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import {
  adminApi,
  AdminApiError,
  fetchModerationMedia,
  FIXTURE_MODE,
  runModerationDecision,
} from '../lib/api';
import { useQuery } from '../lib/useQuery';
import {
  ANY_MODERATION_REASON,
  CONTACT_MODE,
  count,
  exactTime,
  label,
  LISTING_CONDITION,
  LISTING_STATUS,
  MODERATION_ACTION,
  MODERATION_ACTOR,
  MODERATION_ERROR,
  MODERATION_REASON,
  MODERATION_STATE,
  money,
  plural,
  REPORT_REASON,
  REPORT_STATUS,
  SELLER_TYPE,
  SELLER_VERIFICATION,
  when,
} from '../lib/text';
import type {
  ModerationDecision,
  ModerationDetail as ModerationDetailContract,
  ModerationDetailResponse,
} from '../lib/contracts';
import {
  Badge,
  Card,
  CardTitle,
  Drawer,
  ErrorState,
  Field,
  Freshness,
  PageHeader,
  StatusStrip,
} from '../components/ui';
import { DynamicToolbar, StatusButton, cn } from '../components/premium';
import { moderationTone } from './Moderation';

/** Mirrors `MAX_NOTE_LENGTH` in the moderation module. */
const MAX_NOTE = 500;

/**
 * One photograph.
 *
 * The bytes come through a moderation-scoped route with the console's bearer
 * header, because a browser attaches no headers to an `<img src>` and a signed
 * capability in the address would leave a credential in history. Every failure
 * — a Telegram-hosted image, a missing object, a preview with no bucket — is a
 * labelled tile rather than a broken-image icon.
 */
function MediaTile({ id, index }: { id: string; index: number }) {
  const [source, setSource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (FIXTURE_MODE) return undefined;
    let url: string | null = null;
    let alive = true;
    void fetchModerationMedia(id, index).then((value) => {
      if (!alive) {
        if (value) URL.revokeObjectURL(value);
        return;
      }
      if (value) { url = value; setSource(value); } else setFailed(true);
    });
    return () => {
      alive = false;
      // This component's object URL to release; leaving it attached pins the
      // blob for the lifetime of the tab.
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, index]);

  const caption = FIXTURE_MODE
    ? 'SYNTHETIC · в фикстурах изображений нет'
    : (failed ? 'Файл недоступен' : 'Загрузка…');

  return (
    <li className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-line)]">
      <div className="flex aspect-square items-center justify-center bg-[var(--surface-canvas)]">
        {source ? (
          <img
            src={source}
            alt={`Фотография ${index + 1} объявления`}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="muted px-2 text-center text-xs">{caption}</span>
        )}
      </div>
    </li>
  );
}

/**
 * The four decisions, with the states each one is reachable from.
 *
 * `from` mirrors `TRANSITIONS` on the server exactly. A decision whose
 * precondition is not met is not rendered disabled — it is not rendered at all,
 * because a greyed-out button invites a click that comes back 409 and tells the
 * reader to weigh an option that cannot happen.
 */
const DECISIONS: {
  key: ModerationDecision;
  label: string;
  from: readonly string[];
  question: string;
  detail: string;
  tone: 'accent' | 'bad';
  reasonRequired: boolean;
  becomes: string;
}[] = [
  {
    key: 'approve',
    label: 'Одобрить',
    from: ['pending'],
    question: 'Одобрить объявление?',
    detail: 'Оно станет видимым покупателям в глобальном поиске Bormi. Это единственное '
      + 'решение, которое публикует объявление.',
    tone: 'accent',
    reasonRequired: false,
    becomes: 'approved',
  },
  {
    key: 'reject',
    label: 'Отклонить',
    from: ['pending'],
    question: 'Отклонить объявление?',
    detail: 'Оно вернётся продавцу в черновики. Продавец увидит причину и сможет '
      + 'исправить объявление и подать его заново.',
    tone: 'accent',
    reasonRequired: true,
    becomes: 'rejected',
  },
  {
    key: 'restrict',
    label: 'Ограничить',
    from: ['pending', 'approved', 'restricted'],
    question: 'Ограничить объявление?',
    detail: 'Покупатели перестанут его видеть. Продавцу предлагается исправление — '
      + 'в отличие от снятия.',
    tone: 'bad',
    reasonRequired: true,
    becomes: 'restricted',
  },
  {
    key: 'remove',
    label: 'Снять',
    from: ['pending', 'approved', 'restricted', 'rejected'],
    question: 'Снять объявление?',
    detail: 'Покупатели перестанут его видеть, и исправление не предлагается. '
      + 'Вернуть объявление в очередь нельзя — переходов обратно в «На модерации» нет.',
    tone: 'bad',
    reasonRequired: true,
    becomes: 'removed',
  },
];

/**
 * The decision block.
 *
 * Nothing is optimistic: the state shown after a command is the state the
 * server reported, and the screen re-reads rather than patching what it held.
 */
function Decisions({
  listing,
  readOnly,
  onDone,
}: {
  listing: ModerationDetailContract;
  readOnly: boolean;
  onDone: () => void;
}) {
  const [open, setOpen] = useState<ModerationDecision | null>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<'applied' | 'duplicate' | null>(null);
  // One key per logical attempt. A retry after a network error reuses it, so
  // the server replays its first answer instead of ruling twice; choosing a
  // different decision mints a new one.
  const [attemptKey, setAttemptKey] = useState('');

  const available = DECISIONS.filter((decision) => decision.from.includes(listing.state));
  const active = DECISIONS.find((decision) => decision.key === open) ?? null;

  function start(decision: ModerationDecision): void {
    setOpen(decision);
    setReason('');
    setNote('');
    setError(null);
    setOutcome(null);
    setAttemptKey(`mod-${listing.listing_id}-${decision}-${listing.version}-${crypto.randomUUID()}`);
  }

  function close(): void {
    setOpen(null);
    setPending(false);
  }

  async function run(): Promise<void> {
    if (!active || pending) return;
    setPending(true);
    setError(null);
    try {
      const answer = await runModerationDecision(listing.listing_id, {
        decision: active.key,
        reasonCode: reason || null,
        note: note.trim() || null,
        idempotencyKey: attemptKey,
        expectedVersion: listing.version,
      });
      setOutcome(answer.outcome);
      setOpen(null);
      // Re-read rather than patch: the version moved, and the reports and the
      // history moved with it.
      onDone();
    } catch (failure) {
      setError(failure instanceof AdminApiError ? failure.code : 'network_error');
      // A conflict means somebody else ruled while this was open. The record on
      // screen is stale, so it is replaced rather than left to be decided again.
      if (failure instanceof AdminApiError && failure.status === 409) onDone();
    } finally {
      setPending(false);
    }
  }

  if (readOnly) {
    return (
      <Card className="mt-4">
        <CardTitle>Решение</CardTitle>
        <p className="muted text-sm">
          Решения принимает владелец платформы. У роли «Поддержка» доступ только на
          чтение — очередь и карточка видны полностью, кнопок решения нет.
        </p>
      </Card>
    );
  }

  return (
    <Card className="mt-4">
      {/*
        The contextual command surface for this one listing - useLayouts'
        dynamic toolbar (MIT, see THIRD_PARTY_NOTICES.md). It carries the
        outcome of the last decision underneath the buttons rather than as two
        separate strips above them, so the answer appears where the question
        was asked.

        Nothing here is a `StatusButton`: these open a confirmation, they do not
        run a command. A button that reported "Готово" for opening a dialog
        would be the exact dishonesty the status button exists to avoid. The one
        that does run the command is inside the drawer below.
      */}
      <DynamicToolbar
        title="Решение"
        hint="Решение выполняет сервер и в той же транзакции пишет его в аудит."
        status={
          error
            ? { tone: 'bad', text: `Решение не применено: ${label(MODERATION_ERROR, error)}` }
            : outcome
              ? {
                tone: 'good',
                text: outcome === 'applied'
                  ? 'Решение применено. Запись в аудите создана, экран перечитан с сервера.'
                  : 'Решение уже было применено. Экран перечитан с сервера.',
              }
              : null
        }
      >
        {available.length === 0 ? (
          <p className="muted text-sm">
            Для состояния «{label(MODERATION_STATE, listing.state)}» решений нет.
            Переходов обратно в очередь модерации не существует.
          </p>
        ) : (
          available.map((decision) => (
            <button
              key={decision.key}
              type="button"
              onClick={() => start(decision.key)}
              className={cn(
                'inline-flex min-h-11 items-center rounded-[var(--admin-radius-sm)] border px-4 text-sm font-medium transition-colors',
                decision.tone === 'bad'
                  ? 'border-[var(--admin-danger)] text-[var(--admin-danger)] hover:bg-[var(--admin-danger-soft)]'
                  : decision.key === 'approve'
                    ? 'border-transparent bg-[var(--admin-primary)] text-[var(--admin-primary-contrast)] hover:bg-[var(--admin-primary-hover)]'
                    : 'border-[var(--admin-border)] hover:border-[var(--admin-border-strong)]',
              )}
            >
              {decision.label}
            </button>
          ))
        )}
      </DynamicToolbar>

      <p className="muted mt-3 text-xs">
        Массовых решений нет: каждое принимается по одному объявлению, с причиной
        и записью в аудит.
      </p>

      {active ? (
        <Drawer title={active.question} onClose={close}>
          <p className="text-sm">{active.detail}</p>

          <div className="mt-4 flex flex-col gap-1">
            <label className="muted text-xs font-medium" htmlFor="moderation-reason">
              Причина{active.reasonRequired ? '' : ' (необязательно)'}
            </label>
            <select
              id="moderation-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="min-h-11 rounded-[var(--radius-control)] border border-[var(--border-line)] bg-[var(--surface-paper)] px-3 text-sm"
            >
              <option value="">
                {active.reasonRequired ? 'Выберите причину' : 'Без причины'}
              </option>
              {Object.entries(MODERATION_REASON).map(([value, text]) => (
                <option key={value} value={value}>{text}</option>
              ))}
            </select>
            <p className="muted mt-1 text-xs">
              {active.reasonRequired
                ? 'Причина попадает в аудит и продавцу. Отказ, по которому нельзя ничего сделать, — это тупик, а не решение.'
                : 'Одобрение — единственное решение, которому причина не нужна.'}
            </p>
          </div>

          <div className="mt-4 flex flex-col gap-1">
            <label className="muted text-xs font-medium" htmlFor="moderation-note">
              Внутренний комментарий (необязательно)
            </label>
            <textarea
              id="moderation-note"
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, MAX_NOTE))}
              rows={3}
              maxLength={MAX_NOTE}
              className="rounded-[var(--radius-control)] border border-[var(--border-line)] bg-[var(--surface-paper)] px-3 py-2 text-sm"
            />
            <p className="muted mt-1 text-xs">
              {count(note.length)} из {count(MAX_NOTE)}. Не пишите здесь телефоны, адреса
              и Telegram — это внутренняя запись, а не переписка с продавцом.
            </p>
          </div>

          <div className="mt-3 rounded-[var(--radius-control)] border border-[var(--border-line)] p-3">
            <p className="muted text-xs">Что изменится</p>
            <p className="mt-1 text-sm">
              {label(MODERATION_STATE, listing.state)} → {label(MODERATION_STATE, active.becomes)}
            </p>
            <p className="muted mt-1 text-xs">
              Версия {count(listing.version)} → {count(listing.version + 1)}
              {active.key === 'approve' ? ' · объявление станет опубликованным' : ''}
            </p>
          </div>

          {/*
            The one control that runs the command, so the one that reports its
            own state. `success` is reachable only from `outcome`, which is set
            after the server answered - never on a timer, which is what the
            useLayouts original does and what a moderation console must not.
          */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <StatusButton
              state={pending ? 'loading' : error ? 'error' : outcome ? 'success' : 'idle'}
              onClick={() => { void run(); }}
              disabled={active.reasonRequired && !reason}
              variant={active.tone === 'bad' ? 'secondary' : 'primary'}
              tone={active.tone === 'bad' ? 'bad' : undefined}
              labels={{ loading: 'Применяем…', success: 'Применено', error: 'Не применено' }}
            >
              {active.label}
            </StatusButton>
            <button
              type="button"
              onClick={close}
              disabled={pending}
              className="min-h-11 rounded-[var(--radius-control)] px-4 text-sm underline disabled:opacity-40"
            >
              Отмена
            </button>
          </div>
          {error ? (
            <p className="mt-3 text-sm text-[var(--tone-bad)]">
              {label(MODERATION_ERROR, error)}
            </p>
          ) : null}
        </Drawer>
      ) : null}
    </Card>
  );
}

export default function ModerationDetail() {
  const { id = '' } = useParams();
  const location = useLocation();
  // The queue the reader arrived from, carried back so «Назад» returns to the
  // state they were reviewing rather than to an unfiltered first page.
  const back = { pathname: '/moderation', search: location.search };

  const detail = useQuery<ModerationDetailResponse>(() => adminApi.moderationListing(id), [id]);

  if (detail.loading) {
    return (
      <>
        <PageHeader title="Объявление на модерации" />
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="skeleton h-80 w-full xl:col-span-2" />
          <div className="skeleton h-80 w-full" />
        </div>
      </>
    );
  }
  if (detail.error === 'listing_not_found') {
    return (
      <>
        <PageHeader title="Объявление не найдено" />
        <Card>
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium">Такого объявления нет</p>
            <p className="muted mx-auto mt-1 max-w-md text-xs">
              Возможно, продавец удалил его или ссылка устарела.
            </p>
            <Link
              to={back}
              className="mt-4 inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--border-line)] px-3 text-sm"
            >
              Вернуться к очереди
            </Link>
          </div>
        </Card>
      </>
    );
  }
  if (detail.error || !detail.data) {
    return (
      <>
        <PageHeader title="Объявление на модерации" />
        <Card><ErrorState code={detail.error ?? 'unknown'} onRetry={detail.reload} /></Card>
      </>
    );
  }

  const listing = detail.data.listing;
  const readOnly = detail.data.actor.role !== 'platform_owner';
  const openReports = listing.reports.filter((report) => report.status === 'open');

  return (
    <>
      <PageHeader
        eyebrow="Модерация"
        title={listing.name}
        subtitle="Объявление частного продавца. Решение публикует или скрывает его для покупателей."
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
        ← К очереди модерации
      </Link>

      {openReports.length > 0 ? (
        <StatusStrip
          tone="warn"
          title={`Открытых жалоб: ${count(openReports.length)}`}
          detail="Жалобы закрываются отдельно, на экране «Жалобы»: закрыть жалобу — не то же самое, что решить судьбу объявления."
        />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardTitle hint="Изображения отдаёт сервер по одному, по номеру внутри объявления.">
            Фотографии
          </CardTitle>
          {listing.media_refs.length === 0 ? (
            <p className="muted text-sm">
              Фотографий нет. Объявление без фотографии почти не открывается покупателем —
              это повод для решения, но не нарушение само по себе.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {listing.media_refs.map((_, index) => (
                <MediaTile
                  // The reference is opaque and may repeat across listings; the
                  // position is what addresses the object on the media route.
                  key={index}
                  id={listing.listing_id}
                  index={index}
                />
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle hint="То же, что видит покупатель. Ни телефона, ни Telegram, ни адреса здесь нет.">
            Продавец
          </CardTitle>
          <div className="grid gap-x-6 gap-y-1">
            <Field label="Имя в объявлении" value={listing.seller_display_name ?? '—'} />
            <Field
              label="Тип продавца"
              value={<Badge>{label(SELLER_TYPE, listing.seller_type ?? '')}</Badge>}
            />
            <Field
              label="Подтверждение"
              value={<Badge>{label(SELLER_VERIFICATION, listing.seller_verification ?? '')}</Badge>}
            />
            <Field
              label="Способ связи"
              value={label(CONTACT_MODE, listing.contact_mode ?? '')}
            />
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardTitle>Объявление</CardTitle>
          <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            <Field
              label="Состояние"
              value={(
                <Badge tone={moderationTone(listing.state)}>
                  {label(MODERATION_STATE, listing.state)}
                </Badge>
              )}
            />
            {/* `draft`, `published` and `archived` are how the products table
                talks. An operator should not have to learn that vocabulary to
                read the row, and this panel's rule is that a raw status key
                never reaches a screen. */}
            <Field
              label="Статус карточки"
              value={<Badge>{label(LISTING_STATUS, listing.product_status)}</Badge>}
            />
            <Field label="Цена" value={money(listing.price_minor)} />
            <Field label="Валюта" value={listing.currency} />
            <Field label="Состояние товара" value={label(LISTING_CONDITION, listing.condition ?? '')} />
            <Field label="Категория" value={listing.category_name_ru ?? '—'} />
            <Field
              label="Расположение"
              value={[listing.region_name_ru, listing.district_name_ru, listing.locality_text]
                .filter(Boolean).join(' · ') || '—'}
            />
            <Field
              label="Причина попадания в очередь"
              value={listing.reason_code ? label(ANY_MODERATION_REASON, listing.reason_code) : '—'}
            />
            <Field label="Версия" value={count(listing.version)} />
            <Field
              label="Подано"
              value={`${when(listing.submitted_at)} · ${exactTime(listing.submitted_at)}`}
            />
          </div>
          <div className="mt-4">
            <p className="muted text-xs">Описание</p>
            {listing.description ? (
              <p className="mt-1 text-sm whitespace-pre-line">{listing.description}</p>
            ) : (
              <p className="muted mt-1 text-sm">Описание не заполнено.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardTitle hint="Что было подано и почему. Слов подавшего жалобу здесь нет.">
            Жалобы
          </CardTitle>
          {listing.reports.length === 0 ? (
            <p className="muted text-sm">Жалоб на это объявление не поступало.</p>
          ) : (
            <ul className="space-y-2">
              {listing.reports.map((report) => (
                <li
                  key={report.id}
                  className="rounded-[var(--radius-control)] border border-[var(--border-line)] p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm">{label(REPORT_REASON, report.reason_code)}</span>
                    <Badge tone={report.status === 'open' ? 'warn' : 'neutral'}>
                      {label(REPORT_STATUS, report.status)}
                    </Badge>
                  </div>
                  <p className="muted mt-1 text-xs">{when(report.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
          {listing.reports.length > 0 ? (
            <Link
              to="/reports"
              className="mt-3 inline-flex min-h-11 items-center rounded-[var(--radius-control)] px-2 text-sm underline"
            >
              Открыть очередь жалоб
            </Link>
          ) : null}
        </Card>
      </div>

      <Decisions listing={listing} readOnly={readOnly} onDone={detail.reload} />

      <Card className="mt-4">
        <CardTitle hint="Журнал только пополняется: изменить или удалить запись нельзя ни отсюда, ни из базы.">
          История модерации
        </CardTitle>
        {listing.history.length === 0 ? (
          <p className="muted text-sm">Записей пока нет.</p>
        ) : (
          <ul className="space-y-2">
            {listing.history.map((entry) => (
              <li
                key={`${entry.created_at}-${entry.action}`}
                className="rounded-[var(--radius-control)] border border-[var(--border-line)] p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">{label(MODERATION_ACTION, entry.action)}</span>
                  <span className="muted text-xs">{when(entry.created_at)}</span>
                </div>
                <p className="muted mt-1 text-xs">
                  {label(MODERATION_ACTOR, entry.actor_type)}
                  {entry.reason_code ? ` · ${label(ANY_MODERATION_REASON, entry.reason_code)}` : ''}
                  {entry.from_state && entry.to_state
                    ? ` · ${label(MODERATION_STATE, entry.from_state)} → ${label(MODERATION_STATE, entry.to_state)}`
                    : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
        {/* "Показаны последние 1 запись" is what a count and a noun produce
            when the number is one, so the singular gets its own sentence. */}
        <p className="muted mt-3 text-xs">
          {listing.history.length === 1
            ? 'Записана одна операция.'
            : `Показаны последние ${count(listing.history.length)} `
              + `${plural(listing.history.length, 'запись', 'записи', 'записей')}.`}
        </p>
      </Card>

      <details className="mt-4 rounded-[var(--radius-card)] border border-[var(--border-line)] p-4">
        <summary className="cursor-pointer text-sm font-medium">Технические поля</summary>
        <div className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
          <Field
            label="Идентификатор объявления"
            value={<span className="font-mono text-xs">{listing.listing_id}</span>}
          />
          <Field label="Фотографий" value={count(listing.media_refs.length)} />
        </div>
        <p className="muted mt-3 text-xs">
          Идентификаторов продавца, покупателя и подавшего жалобу здесь нет — их не
          содержит и сам ответ сервера. Ключей хранилища тоже нет: фотография
          адресуется номером, а не путём в бакете.
        </p>
      </details>

      <p className="muted mt-4 text-xs">Данные на {exactTime(detail.data.generated_at)}</p>
    </>
  );
}
