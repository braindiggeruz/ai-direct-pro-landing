// «Готовность»: what runs, in which mode, and the NAMES of what a live sale
// still lacks (liveReadiness() on the server). No value of any setting ever
// reaches this card: the server sends names and switches only.
import { useState } from 'react';
import { Badge, Button, Card } from '../ui';
import { CardHead, dateTime, modeLabel, PROVIDER_LABEL, SectionGap, usd } from './format';
import type {
  AiChatReadiness,
  AiChatRehearsalResult,
  AiChatSection,
} from '../../../shared/ai-chat-admin';

function Names({ names, empty }: { names: string[]; empty: string }) {
  if (!names.length) return <span className="text-emerald-300 text-sm">{empty}</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {names.map((name) => (
        <code key={name} className="rounded-md bg-white/5 border border-white/10 px-1.5 py-0.5 text-xs text-amber-200">
          {name}
        </code>
      ))}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[14rem_1fr] py-2 border-t border-white/5 text-sm">
      <div className="text-white/50">{label}</div>
      <div className="text-white/85 min-w-0">{children}</div>
    </div>
  );
}

export function RehearsalPanel({
  readiness,
  onOpen,
}: {
  readiness: AiChatReadiness;
  onOpen: (account: boolean) => Promise<AiChatRehearsalResult>;
}) {
  const [account, setAccount] = useState(true);
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState<AiChatRehearsalResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const { rehearsal } = readiness;
  const open = async () => {
    setBusy(true);
    setFailure(null);
    try {
      setOpened(await onOpen(account));
    } catch (error) {
      setFailure((error as { code?: string }).code ?? 'request_failed');
    }
    setBusy(false);
  };
  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-4" data-testid="ai-chat-rehearsal">
      <div className="text-sm text-white font-medium">Сессия репетиции</div>
      <p className="text-xs text-white/50 mt-1 max-w-3xl">
        Тёмный тест оплаты: этот браузер на 2 часа видит провайдеров в режиме «тест» и платит
        тестовыми картами. Посетители сайта ничего не видят. После нажатия откройте чат на сайте
        в этом же браузере.
      </p>
      {rehearsal.available ? (
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <label className="flex items-center gap-2 text-sm text-white/70">
            <input type="checkbox" checked={account} onChange={(e) => setAccount(e.target.checked)}/>
            Войти тестовым аккаунтом (без Telegram)
          </label>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void open()} data-testid="ai-chat-rehearsal-open">
            {busy ? 'Открываем…' : 'Открыть сессию репетиции'}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-white/40 mt-3">
          {rehearsal.testProviders.length
            ? 'Нужен GPT_IDENTITY_SECRET: без него сессию не подписать.'
            : 'Ни один провайдер не в режиме «тест» (GPT_BILLING_MODE_CLICK / GPT_BILLING_MODE_UZUM).'}
        </p>
      )}
      {opened && (
        <p className="text-sm text-emerald-300 mt-3" data-testid="ai-chat-rehearsal-opened">
          Сессия открыта до {dateTime(opened.expiresAt)}: {opened.providers.map((p) => PROVIDER_LABEL[p]).join(', ') || 'нет готовых тестовых провайдеров'}
          {opened.account ? ', вход тестовым аккаунтом.' : '.'}
        </p>
      )}
      {failure && <p className="text-sm text-red-300 mt-3">Не открылась: {failure}</p>}
    </div>
  );
}

export function ReadinessCard({
  section,
  onOpenRehearsal,
}: {
  section: AiChatSection<AiChatReadiness>;
  onOpenRehearsal: (account: boolean) => Promise<AiChatRehearsalResult>;
}) {
  return (
    <Card data-testid="ai-chat-readiness">
      <CardHead
        title="Готовность"
        hint="Только имена настроек: значения ключей и секретов сюда не попадают. Live включается, когда у провайдера список «не хватает» пуст."
      />
      {!section.ok ? <SectionGap error={section.error}/> : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-white/45 text-xs uppercase tracking-wide">
                  <th className="py-2 pr-4 font-medium">Провайдер</th>
                  <th className="py-2 pr-4 font-medium">Режим</th>
                  <th className="py-2 pr-4 font-medium">Ключи режима</th>
                  <th className="py-2 font-medium">Для live не хватает</th>
                </tr>
              </thead>
              <tbody>
                {section.data.providers.map((p) => (
                  <tr key={p.provider} className="border-t border-white/5 align-top" data-testid={`ai-chat-provider-${p.provider}`}>
                    <td className="py-2 pr-4 text-white">
                      {PROVIDER_LABEL[p.provider]}
                      {p.flow && <span className="text-white/40 text-xs ml-1">({p.flow === 'code' ? 'код в приложении' : 'страница оплаты'})</span>}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge tone={p.mode === 'live' ? 'success' : p.mode === 'test' ? 'info' : 'neutral'}>{modeLabel(p.mode)}</Badge>
                    </td>
                    <td className="py-2 pr-4 text-white/70">{p.mode ? (p.configured ? 'есть' : 'нет') : '—'}</td>
                    <td className="py-2"><Names names={p.liveMissing} empty="ничего, готов к live"/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4">
            <Row label="Условия (оферта)">
              {section.data.terms.version ?? <span className="text-amber-200">версия не задана</span>}
              {section.data.terms.approvedAt && <span className="text-white/45"> · одобрено {section.data.terms.approvedAt}</span>}
              <span className="block text-xs text-white/45 mt-0.5 break-all">
                {section.data.terms.ru ?? 'RU: нет ссылки'} · {section.data.terms.uz ?? 'UZ: нет ссылки'}
              </span>
            </Row>
            <Row label="Чеки (ОФД)"><Names names={section.data.fiscalMissing} empty="ИКПУ, упаковка, НДС и ИНН заданы"/></Row>
            <Row label="Соль хешей IP">
              {section.data.salt.set
                ? `задана${section.data.salt.active ? ', действует' : ', ещё не действует'}${section.data.salt.since ? ` с ${dateTime(Date.parse(section.data.salt.since))}` : ''}`
                : <span className="text-amber-200">нет (GPT_HASH_SALT)</span>}
            </Row>
            <Row label="Алерты владельцу">
              {section.data.alerts.enabled ? 'включены' : <span className="text-amber-200">выключены</span>}
              {' · канал: '}
              {section.data.alerts.channel === 'dedicated' ? 'отдельный бот' : section.data.alerts.channel === 'assistant' ? 'бот @gptbotuz_bot' : <span className="text-amber-200">не настроен</span>}
            </Row>
            <Row label="Хранение переписки">
              {section.data.retentionDays === null ? 'без срока (удаление выключено)' : `${section.data.retentionDays} дн.`}
            </Row>
            <Row label="Модели">
              {section.data.models.zaiMissing.length
                ? <>Z.ai выключен, не хватает: <Names names={section.data.models.zaiMissing} empty=""/></>
                : 'Z.ai отвечает первым, OpenRouter — запасной'}
              <span className="block text-xs text-white/45 mt-1 break-all">
                Бесплатно: {section.data.models.freeChain.join(' → ') || '—'}
              </span>
              <span className="block text-xs text-white/45 break-all">
                Пакет: {section.data.models.paidChain.join(' → ') || '—'}
              </span>
              <span className="block text-xs text-white/45">
                Платная модель первой у бесплатных: {section.data.models.freeTierPaidPrimary ? `да, до ${usd(section.data.models.freePaidDailyUsd)} в сутки` : 'нет'}
              </span>
            </Row>
          </div>
          <RehearsalPanel readiness={section.data} onOpen={onOpenRehearsal}/>
        </>
      )}
    </Card>
  );
}
