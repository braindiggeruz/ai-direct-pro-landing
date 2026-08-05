/**
 * One buyer question, read-only and still without its words.
 *
 * The detail adds delivery bookkeeping rather than content: when the seller was
 * notified, how many attempts each direction took, whether the retention window
 * has already cleared the text. That is the difference between "the seller is
 * ignoring this" and "the notification never arrived", and an owner needs to
 * tell those apart — reading the conversation would not help them do it.
 */
import { Link, useLocation, useParams } from 'react-router';
import { adminApi } from '../lib/api';
import { useQuery } from '../lib/useQuery';
import {
  count,
  exactTime,
  HANDOFF_STATUS,
  label,
  OPERATIONS_ATTENTION,
  QUESTION_REASON,
  WAITING_SIDE,
  when,
} from '../lib/text';
import type { QuestionDetailResponse } from '../lib/contracts';
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

export default function QuestionDetail() {
  const { id = '' } = useParams();
  const location = useLocation();
  const back = { pathname: '/operations', search: location.search || '?tab=questions' };

  const detail = useQuery<QuestionDetailResponse>(() => adminApi.question(id), [id]);

  if (detail.loading) {
    return (
      <>
        <PageHeader title="Обращение" />
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="skeleton h-72 w-full" />
          <div className="skeleton h-72 w-full" />
        </div>
      </>
    );
  }
  if (detail.error === 'question_not_found') {
    return (
      <>
        <PageHeader title="Обращение не найдено" />
        <Card>
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium">Такого обращения нет</p>
            <p className="muted mx-auto mt-1 max-w-md text-xs">
              Возможно, ссылка устарела.
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
        <PageHeader title="Обращение" />
        <Card><ErrorState code={detail.error ?? 'unknown'} onRetry={detail.reload} /></Card>
      </>
    );
  }

  const question = detail.data.question;

  return (
    <>
      <PageHeader
        eyebrow="Операции"
        title="Обращение покупателя"
        subtitle="Только чтение. Отвечает и закрывает продавец."
        actions={(
          <Freshness
            fetchedAt={detail.fetchedAt}
            refreshing={detail.refreshing}
            onRefresh={detail.reload}
          />
        )}
      />

      <Link to={back} className="mb-4 inline-flex min-h-11 items-center text-sm underline">
        ← К очереди
      </Link>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardTitle>Состояние</CardTitle>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge>{label(HANDOFF_STATUS, question.status)}</Badge>
            <Badge tone={question.waiting_on === 'seller' ? 'warn' : 'neutral'}>
              {label(WAITING_SIDE, question.waiting_on)}
            </Badge>
            {question.attention !== 'none' ? (
              <Badge tone={question.attention === 'stalled' ? 'bad' : 'warn'}>
                {label(OPERATIONS_ATTENTION, question.attention)}
              </Badge>
            ) : null}
          </div>
          <dl>
            <Field label="Магазин" value={question.store_name} />
            <Field label="Почему передали человеку" value={label(QUESTION_REASON, question.reason)} />
            <Field label="Вопрос задан" value={question.has_question ? 'да' : 'нет'} />
            <Field label="Ответ написан" value={question.has_reply ? 'да' : 'нет'} />
            <Field
              label="Создано"
              value={`${when(question.created_at)} · ${exactTime(question.created_at)}`}
            />
            <Field
              label="Отвечено"
              value={question.answered_at ? exactTime(question.answered_at) : '—'}
            />
            <Field
              label="Закрыто"
              value={question.closed_at ? exactTime(question.closed_at) : '—'}
            />
          </dl>
        </Card>

        <Card>
          <CardTitle hint="Счётчики попыток объясняют, молчит продавец или не дошло уведомление.">
            Доставка
          </CardTitle>
          <dl>
            <Field
              label="Продавец уведомлён"
              value={question.seller_notified_at ? exactTime(question.seller_notified_at) : 'нет'}
            />
            <Field label="Попыток уведомить продавца" value={count(question.seller_notify_attempts)} />
            <Field
              label="Ответ доставлен покупателю"
              value={question.buyer_delivered_at ? exactTime(question.buyer_delivered_at) : 'нет'}
            />
            <Field label="Попыток доставить ответ" value={count(question.buyer_delivery_attempts)} />
            <Field
              label="Срок хранения текста"
              value={question.expires_at ? exactTime(question.expires_at) : '—'}
            />
            <Field
              label="Текст очищен"
              value={question.content_cleared_at ? exactTime(question.content_cleared_at) : 'нет'}
            />
          </dl>
        </Card>
      </div>

      <Card className="mt-4">
        <CardTitle>Переписка</CardTitle>
        <DataGap
          what="Текст вопроса и ответа здесь недоступен"
          why="Это единственное свободное содержимое, которое хранит маркетплейс, и сервер не выбирает его ни для списка, ни для карточки. Разговор остаётся между покупателем и продавцом; срок хранения ограничен самим доменом."
        />
      </Card>

      <details className="mt-4 rounded-[var(--radius-card)] border border-[var(--border-line)] p-4">
        <summary className="cursor-pointer text-sm font-medium">Технические поля</summary>
        <div className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
          <Field label="Идентификатор" value={<span className="font-mono text-xs">{question.id}</span>} />
          <Field label="Организация" value={<span className="font-mono text-xs">{question.org_id}</span>} />
          <Field label="Магазин" value={<span className="font-mono text-xs">{question.store_id}</span>} />
          <Field label="status" value={<span className="font-mono text-xs">{question.status}</span>} />
          <Field label="reason" value={<span className="font-mono text-xs">{question.reason}</span>} />
          <Field label="Обновлено" value={exactTime(question.updated_at)} />
        </div>
      </details>

      <p className="muted mt-4 text-xs">Данные на {exactTime(detail.data.generated_at)}</p>
    </>
  );
}
