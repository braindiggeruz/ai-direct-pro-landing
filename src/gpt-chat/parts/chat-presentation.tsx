import { Suspense, lazy, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { Locale } from '../types';
import { PresentationCard } from '../../../apps/studio/src/embedded/PresentationCard';
import { flushSnapshot } from '../../../apps/studio/src/embedded/artifact-store';
import { presentationTopic } from '../../../apps/studio/src/tools/presentation/editing';
import { PresentationWorkspace } from './PresentationWorkspace';
import { artifactSummary, purchasePresentation, sessionKey, subscribeArtifacts } from './presentation-session';
export { presentationTurn } from './presentation-session';
export { wantsPresentation } from '../presentation';
import '../../../apps/studio/src/styles.css';
import './presentation.css';
import './presentation-workspace.css';
import type { ChatMessage } from '../types';

const RETURN_KEY = 'gpt_presentation_return';
function pendingReturn() {
  try {
    const pending = JSON.parse(sessionStorage.getItem(RETURN_KEY) || localStorage.getItem(RETURN_KEY) || 'null');
    return pending && Number.isFinite(pending.createdAt) && Date.now() - pending.createdAt >= 0 && Date.now() - pending.createdAt < 86_400_000 ? pending : null;
  } catch { return null; }
}

/** Payment references are hints only; server /me remains the source of rights. */
export function presentationEntry(ownerKey: string): string | null {
  const query = new URLSearchParams(window.location.search);
  if (query.get('tool') === 'presentation') {
    query.delete('tool');
    const search = query.toString();
    window.history.replaceState(window.history.state, '', window.location.pathname + (search ? '?' + search : '') + window.location.hash);
    return crypto.randomUUID();
  }
  if (query.get('pay') !== 'return' || query.get('product') !== 'studio') return null;
  try {
    const pending = pendingReturn();
    return pending?.ownerKey === ownerKey && /^[a-zA-Z0-9_-]{16,80}$/.test(pending.artifactId) ? pending.artifactId : null;
  } catch { return null; }
}

const PayReturn = lazy(() => import('../../../apps/studio/src/billing/PayReturn').then(m => ({ default: m.PayReturn })));

const getServerSnapshot = () => null;
function useSummary(ownerKey: string, artifactId: string) {
  return useSyncExternalStore(subscribeArtifacts, () => artifactSummary(sessionKey(ownerKey, artifactId)), getServerSnapshot);
}

/** A reference in the conversation, never a second generator or billing instance. */
export function ChatPresentation({ locale, artifactId, ownerKey, topic, onOpen }: { locale: Locale; artifactId: string; ownerKey: string; topic: string; onOpen?: (id: string) => void }) {
  const summary = useSummary(ownerKey, artifactId), ru = locale === 'ru';
  return <button type="button" className="gpt-artifact-card ym-hide-content" data-chat-artifact={artifactId} onClick={() => onOpen?.(artifactId)}>
    <span className="gpt-artifact-mark" aria-hidden="true">▧</span><span><strong>{summary?.title || presentationTopic(topic) || (ru ? 'Новая презентация' : 'Yangi taqdimot')}</strong><small>{summary?.working ? (ru ? 'Создание продолжается…' : 'Yaratish davom etmoqda…') : summary?.ready ? (ru ? `${summary.slides} содержательных слайдов · версия ${summary.revision + 1}` : `${summary.slides} mazmunli slayd · ${summary.revision + 1}-versiya`) : (ru ? 'Черновик · запуск после подтверждения' : 'Qoralama · tasdiqlagach boshlanadi')}</small><b>{ru ? 'Открыть презентацию →' : 'Taqdimotni ochish →'}</b></span>
  </button>;
}

interface HostProps { locale: Locale; ownerKey: string; activeId: string | null; artifacts: ChatMessage[]; onClose: () => void; focusInput: () => void }
export function PresentationWorkspaceHost({ locale, ownerKey, activeId, artifacts, onClose, focusInput }: HostProps) {
  const [view, setView] = useState<'chat' | 'slides'>('chat');
  const summary = useSummary(ownerKey, activeId ?? '');
  useLayoutEffect(() => { const root = document.querySelector<HTMLElement>('[data-testid="ai-console"]'); if (root) root.dataset.presentationView = view; }, [view]);
  const header = document.getElementById('gpt-presentation-header'), tabs = document.getElementById('gpt-presentation-tabs'), scope = document.getElementById('gpt-presentation-scope');
  const ru = locale === 'ru', reveal = () => setView('slides');
  return <>
    {activeId && scope && createPortal(<div className="gpt-presentation-scope"><span>{ru ? 'Презентация · команды для этого файла' : 'Taqdimot · shu fayl uchun'}</span><button type="button" onClick={onClose}>{ru ? 'Обычный чат' : 'Oddiy chat'}</button></div>, scope)}
    {activeId && header && createPortal(<button type="button" className="gpt-studio-header-cta" data-testid="studio-account-trigger" onClick={() => purchasePresentation(sessionKey(ownerKey, activeId))}>{summary?.units != null && summary.units > 0 ? (ru ? `Презентации: ${summary.units}` : `Taqdimotlar: ${summary.units}`) : (ru ? 'Пакет презентаций' : 'Taqdimot paketi')}</button>, header)}
    {activeId && tabs && createPortal(<nav className="gpt-presentation-tabs" aria-label={ru ? 'Представление задачи' : 'Vazifa ko‘rinishi'}>{(['chat', 'slides'] as const).map(v => <button type="button" key={v} aria-pressed={view === v} onClick={() => setView(v)}>{v === 'chat' ? (ru ? 'Чат' : 'Chat') : (ru ? 'Слайды' : 'Slaydlar')}</button>)}</nav>, tabs)}
    <aside className="gpt-presentation-host" hidden={!activeId} aria-label={ru ? 'Редактор презентации' : 'Taqdimot muharriri'}>
      {artifacts.filter((m,i) => i >= artifacts.length - 12 || m.artifactId === activeId || (m.artifactId && artifactSummary(sessionKey(ownerKey,m.artifactId))?.working)).map(m => m.artifactId && <OwnedWorkspace key={`${ownerKey}:${m.artifactId}`} locale={locale} artifactId={m.artifactId} ownerKey={ownerKey} topic={m.content} active={activeId === m.artifactId} reveal={reveal} onClose={onClose} focusInput={() => { setView('chat'); focusInput(); }} />)}
    </aside>
  </>;
}

function OwnedWorkspace({ locale, artifactId, ownerKey, topic, active, reveal, onClose, focusInput }: { locale: Locale; artifactId: string; ownerKey: string; topic: string; active: boolean; reveal: () => void; onClose: () => void; focusInput: () => void }) {
  const [returning] = useState(() => {
    try {
      const query = new URLSearchParams(window.location.search);
      const pending = pendingReturn();
      return query.get('pay') === 'return' && query.get('product') === 'studio' && pending?.artifactId === artifactId && pending?.ownerKey === ownerKey;
    } catch { return false; }
  });
  const beforeNavigate = async () => {
    await flushSnapshot(ownerKey, artifactId);
    const reference = JSON.stringify({ artifactId, ownerKey, locale, createdAt: Date.now() });
    localStorage.setItem(RETURN_KEY, reference);
    // Same-tab return survives another tab's purchase; localStorage is the
    // fallback for payment apps that bring the visitor back into a new tab.
    try { sessionStorage.setItem(RETURN_KEY, reference); } catch { /* Durable fallback is already stored. */ }
  };
  return <div hidden={!active} className="gpt-owned-workspace">
    <Suspense fallback={null}>{returning && <PayReturn locale={locale} />}</Suspense>
    <PresentationCard locale={locale} artifactId={artifactId} ownerKey={ownerKey} initialTopic={presentationTopic(topic)} returning={returning} render={session => <PresentationWorkspace session={session} ownerKey={ownerKey} artifactId={artifactId} active={active} beforeNavigate={beforeNavigate} reveal={reveal} onClose={onClose} focusInput={focusInput} />} />
  </div>;
}
