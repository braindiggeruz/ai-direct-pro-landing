// «Оплаты и возвраты»: the orders of the AI pack, newest first, and the one
// action of the section, «Отметить возврат». The admin never moves money: the
// owner returns it in the Click or Uzum cabinet first (decision L12).
import { useState } from 'react';
import { Badge, Button, Card, Input, Label, Select } from '../ui';
import { CardHead, count, dateTime, day, modeLabel, PROVIDER_LABEL, SectionGap, STATE_LABEL } from './format';
import type { AiChatPaymentsFilter } from '../../lib/ai-chat-api';
import {
  AI_CHAT_MODES,
  AI_CHAT_ORDER_STATES,
  AI_CHAT_PROVIDERS,
  ORDER_ID,
  REFUND_REFERENCE,
  RESTORE_QUERY,
  type AiChatRestoreLinkResult,
  type AiChatPaymentRow,
  type AiChatPaymentsPage,
  type AiChatRefundRecordInput,
  type AiChatRefundRecordResult,
  type AiChatSection,
} from '../../../shared/ai-chat-admin';

const STATE_TONE = {
  pending: 'neutral',
  prepared: 'info',
  paid: 'success',
  cancelled: 'neutral',
  refunded: 'warning',
} as const;

/** What the owner reads when a record is refused; codes from the server. */
const REFUSAL: Readonly<Record<string, string>> = {
  invalid_order:
    'В учёте нет оплаченного заказа с таким номером. Если деньги списались, а пакет не начал действовать, заказ уже закрыт: деньги возвращаются в кабинете провайдера, отмечать в учёте нечего.',
  not_refunded_at_uzum:
    'Uzum ещё не сообщает о полном возврате этого заказа. Сделайте возврат в кабинете Uzum и повторите позже.',
  upstream_unavailable: 'Uzum сейчас не отвечает. Повторите через несколько минут.',
  uzum_not_configured: 'Нет ключей Uzum Checkout для режима этого заказа: статус у Uzum не проверить.',
  invalid_order_id: 'Номер заказа выглядит как pay_… или uzm_… и 32 символа после.',
  invalid_reference: 'Номер возврата в кабинете: буквы, цифры и . _ : / # -, до 80 знаков.',
  confirmation_required: 'Подтвердите, что деньги уже вернулись.',
  record_failed: 'Запись не прошла. Проверьте заказ в списке и повторите.',
};

function receiptCell(receipt: AiChatPaymentRow['receipt'], label: string) {
  if (!receipt) return null;
  const status = receipt.status === 0 ? 'пробит' : receipt.status === -1 ? 'в очереди' : receipt.status === -2 ? 'не нужен' : `ошибка ${receipt.status}`;
  return (
    <span className="block">
      {label}: {receipt.url
        ? <a href={receipt.url} target="_blank" rel="noopener noreferrer" className="text-brand-cyan hover:underline">{status}</a>
        : status}
    </span>
  );
}

export function RefundRecordForm({
  rows,
  onRecord,
}: {
  rows: AiChatPaymentRow[];
  onRecord: (input: AiChatRefundRecordInput) => Promise<AiChatRefundRecordResult>;
}) {
  const [orderId, setOrderId] = useState('');
  const [reference, setReference] = useState('');
  const [returned, setReturned] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const id = orderId.trim();
  const ref = reference.trim();
  const valid = ORDER_ID.test(id) && REFUND_REFERENCE.test(ref) && returned;
  const known = rows.find((row) => row.id === id);
  const submit = async () => {
    setBusy(true);
    try {
      const result = await onRecord({ orderId: id, merchantRefundReference: ref, confirmedRefund: true });
      setMessage(result.recorded
        ? { tone: 'ok', text: `Возврат по заказу ${id} отмечен: пакет закрыт, владельцу уйдёт уведомление.` }
        : { tone: 'ok', text: `Заказ ${id} уже был отмечен как возврат, ничего не изменилось.` });
      setOrderId('');
      setReference('');
      setReturned(false);
    } catch (error) {
      const code = (error as { code?: string }).code ?? 'record_failed';
      setMessage({ tone: 'error', text: REFUSAL[code] ?? `Не удалось: ${code}` });
    }
    setConfirming(false);
    setBusy(false);
  };
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4" data-testid="ai-chat-refund-record">
      <div className="text-sm text-white font-medium">Отметить возврат</div>
      <p className="text-xs text-white/50 mt-1 max-w-3xl">
        Оплаченный пакет не возвращается. Отметка нужна только для исключений оферты: деньги списаны по
        ошибке (дважды за одну покупку) или возврат требует закон. Сначала верните деньги в кабинете
        Click или Uzum: админка деньги не двигает. Отметка закрывает пакет. У Uzum со страницей оплаты
        она пройдёт, только когда Uzum сам подтвердит полный возврат.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 mt-3">
        <div>
          <Label htmlFor="ai-chat-refund-order" hint="введите вручную">Номер заказа</Label>
          <Input
            id="ai-chat-refund-order"
            value={orderId}
            autoComplete="off"
            spellCheck={false}
            placeholder="pay_… или uzm_…"
            onChange={(e) => { setOrderId(e.target.value); setConfirming(false); }}
          />
        </div>
        <div>
          <Label htmlFor="ai-chat-refund-reference" hint="из кабинета провайдера">Номер возврата</Label>
          <Input
            id="ai-chat-refund-reference"
            value={reference}
            autoComplete="off"
            onChange={(e) => { setReference(e.target.value); setConfirming(false); }}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-white/70 mt-3">
        <input type="checkbox" checked={returned} onChange={(e) => { setReturned(e.target.checked); setConfirming(false); }}/>
        Деньги уже вернулись покупателю в кабинете Click или Uzum
      </label>
      {!confirming ? (
        <Button className="mt-3" size="sm" variant="secondary" disabled={!valid || busy} onClick={() => setConfirming(true)}>
          Отметить возврат…
        </Button>
      ) : (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm" role="alertdialog" aria-label="Подтверждение возврата">
          <p className="text-white">
            Отметить возврат заказа <code>{id}</code>?
            {known
              ? ` ${PROVIDER_LABEL[known.provider]}, ${modeLabel(known.mode)}, ${STATE_LABEL[known.state]}, ${count(known.amountUzs)} сум.`
              : ' Этого заказа нет на загруженных страницах списка — проверьте номер.'}
          </p>
          <div className="flex gap-2 mt-3">
            <Button size="sm" variant="danger" disabled={busy} onClick={() => void submit()} data-testid="ai-chat-refund-confirm">
              {busy ? 'Отмечаем…' : 'Да, отметить возврат'}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>Отмена</Button>
          </div>
        </div>
      )}
      {message && (
        <p className={`text-sm mt-3 ${message.tone === 'ok' ? 'text-emerald-300' : 'text-red-300'}`} role="status">{message.text}</p>
      )}
    </div>
  );
}

const RESTORE_REFUSAL: Readonly<Record<string, string>> = {
  invalid_query: 'Введите номер заказа pay_… или ID платежа Click (только цифры).',
  not_found: 'Заказа Click с таким номером или ID платежа нет.',
  identity_secret_missing: 'Не задан GPT_IDENTITY_SECRET: ссылку не подписать.',
};

/**
 * «Восстановить пакет гостя»: a buyer who paid without signing in and lost
 * the browser. Find the order by our number or Click's payment id; for a
 * paid guest order with a running pack, a one-time link for 24 hours. The
 * buyer opens it in the browser that should have the pack.
 */
export function RestoreLinkForm({ onFind }: { onFind: (query: string) => Promise<AiChatRestoreLinkResult> }) {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<AiChatRestoreLinkResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const q = query.trim();
  const submit = async () => {
    setBusy(true);
    setError(null);
    setFound(null);
    try {
      setFound(await onFind(q));
    } catch (cause) {
      const code = (cause as { code?: string }).code ?? 'query_failed';
      setError(RESTORE_REFUSAL[code] ?? `Не удалось: ${code}`);
    }
    setBusy(false);
  };
  const order = found?.order;
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4" data-testid="ai-chat-restore-link">
      <div className="text-sm text-white font-medium">Восстановить пакет гостя</div>
      <p className="text-xs text-white/50 mt-1 max-w-3xl">
        Покупатель платил через Click без входа и потерял браузер. Найдите заказ по номеру или ID платежа
        Click из его чека. Если пакет действует, появится одноразовая ссылка на 24 часа: отправьте её
        покупателю, он откроет её на своём телефоне и нажмёт кнопку. Пакет перейдёт в этот браузер.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 mt-3">
        <div>
          <Label htmlFor="ai-chat-restore-query" hint="pay_… или цифры">Номер заказа или ID платежа Click</Label>
          <Input
            id="ai-chat-restore-query"
            value={query}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => { setQuery(e.target.value); setFound(null); setError(null); }}
          />
        </div>
      </div>
      <Button className="mt-3" size="sm" variant="secondary" disabled={!RESTORE_QUERY.test(q) || busy} onClick={() => void submit()}>
        {busy ? 'Ищем…' : 'Найти заказ'}
      </Button>
      {order && (
        <div className="text-sm mt-3 text-white/70" role="status">
          <code className="text-xs text-white/85 select-all">{order.id}</code>
          <span className="block text-xs text-white/45">
            {STATE_LABEL[order.state as keyof typeof STATE_LABEL] ?? order.state}
            {order.paidAt ? `, оплачен ${dateTime(order.paidAt)}` : ''}
            {order.packEndsAt ? `, пакет до ${day(order.packEndsAt)}` : ', пакета нет'}
            {order.guest ? ', гость' : ', аккаунт Telegram: пакет и так на любом телефоне после входа'}
          </span>
          {found?.link ? (
            <span className="block mt-3">
              Ссылка до {dateTime(found.expiresAt ?? 0)}:{' '}
              <code className="text-xs text-white/85 select-all">{found.link}</code>
            </span>
          ) : (
            <span className="block text-xs text-white/45">Ссылку сделать нельзя: нужен оплаченный заказ гостя с действующим пакетом.</span>
          )}
        </div>
      )}
      {error && <p className="text-sm mt-3 text-red-300" role="status">{error}</p>}
    </div>
  );
}

export function PaymentsCard({
  page,
  requestId,
  filter,
  loadingMore,
  onFilter,
  onMore,
  onRecord,
  onRestore,
}: {
  /** null while the first page loads. */
  page: AiChatSection<AiChatPaymentsPage> | null;
  requestId?: string;
  filter: AiChatPaymentsFilter;
  loadingMore: boolean;
  onFilter: (filter: AiChatPaymentsFilter) => void;
  onMore: () => void;
  onRecord: (input: AiChatRefundRecordInput) => Promise<AiChatRefundRecordResult>;
  onRestore?: (query: string) => Promise<AiChatRestoreLinkResult>;
}) {
  const select = <K extends keyof AiChatPaymentsFilter>(key: K, name: string, values: readonly string[], label: (v: string) => string) => (
    <Select
      aria-label={name}
      className="!w-auto text-sm"
      value={filter[key] ?? ''}
      onChange={(e) => onFilter({ ...filter, [key]: e.target.value || null })}
    >
      <option value="">все</option>
      {values.map((v) => <option key={v} value={v}>{label(v)}</option>)}
    </Select>
  );
  const rows = page?.ok ? page.data.rows : [];
  return (
    <Card data-testid="ai-chat-payments">
      <CardHead
        title="Оплаты и возвраты"
        hint="Номер заказа — ключ поддержки: покупатель видит его в «Paketim». Покупатель показан псевдонимом, без аккаунта и Telegram."
      >
        <div className="flex flex-wrap gap-2">
          {select('provider', 'Провайдер', AI_CHAT_PROVIDERS, (v) => PROVIDER_LABEL[v as keyof typeof PROVIDER_LABEL])}
          {select('state', 'Состояние', AI_CHAT_ORDER_STATES, (v) => STATE_LABEL[v as keyof typeof STATE_LABEL])}
          {select('mode', 'Режим', AI_CHAT_MODES, (v) => modeLabel(v as 'test' | 'live'))}
        </div>
      </CardHead>
      {page === null ? <p className="text-sm text-white/40">Загрузка…</p>
        : !page.ok ? <SectionGap error={page.error} requestId={requestId}/>
        : rows.length === 0 ? <p className="text-sm text-white/40">Заказов нет.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-white/45 text-xs">
                  <th className="py-1.5 pr-3 font-medium">Заказ</th>
                  <th className="py-1.5 px-2 font-medium">Состояние</th>
                  <th className="py-1.5 px-2 font-medium text-right">Сумма</th>
                  <th className="py-1.5 px-2 font-medium">Создан / оплачен / закрыт</th>
                  <th className="py-1.5 px-2 font-medium">Пакет</th>
                  <th className="py-1.5 px-2 font-medium">Чеки</th>
                  <th className="py-1.5 pl-2 font-medium">Покупатель</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-white/5 align-top" data-testid="ai-chat-payment-row">
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      <code className="text-xs text-white/85 select-all">{row.id}</code>
                      <span className="block text-xs text-white/45">{PROVIDER_LABEL[row.provider]} · {modeLabel(row.mode)}</span>
                    </td>
                    <td className="py-1.5 px-2"><Badge tone={STATE_TONE[row.state]}>{STATE_LABEL[row.state]}</Badge></td>
                    <td className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap">{count(row.amountUzs)} сум</td>
                    <td className="py-1.5 px-2 whitespace-nowrap text-white/70">
                      {dateTime(row.createdAt)}
                      <span className="block text-xs text-white/45">{row.paidAt ? dateTime(row.paidAt) : '—'}</span>
                      {row.cancelledAt && (
                        <span className="block text-xs text-white/45">
                          {row.state === 'refunded' ? 'возврат' : 'закрыт'} {dateTime(row.cancelledAt)}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-2 whitespace-nowrap text-white/70">
                      {row.pack
                        ? row.pack.revokedAt
                          ? 'закрыт возвратом'
                          : `${count(row.pack.used)} / ${count(row.pack.limit)}, до ${day(row.pack.endsAt)}`
                        : '—'}
                    </td>
                    <td className="py-1.5 px-2 text-xs text-white/70 whitespace-nowrap">
                      {receiptCell(row.receipt, 'продажа')}
                      {receiptCell(row.refundReceipt, 'возврат')}
                      {!row.receipt && !row.refundReceipt && '—'}
                    </td>
                    <td className="py-1.5 pl-2 whitespace-nowrap">
                      <code className="text-xs text-white/70">{row.buyer ?? 'нет соли'}</code>
                      {row.rehearsal && <span className="ml-1"><Badge tone="info">репетиция</Badge></span>}
                      {row.guest && <span className="ml-1"><Badge tone="neutral">гость</Badge></span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      {page?.ok && page.data.next && (
        <Button className="mt-3" size="sm" variant="ghost" disabled={loadingMore} onClick={onMore}>
          {loadingMore ? 'Загружаем…' : 'Показать ещё'}
        </Button>
      )}
      <div className="mt-5">
        <RefundRecordForm rows={rows} onRecord={onRecord}/>
      </div>
      {onRestore && (
        <div className="mt-5">
          <RestoreLinkForm onFind={onRestore}/>
        </div>
      )}
    </Card>
  );
}
