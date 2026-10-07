import { Suspense, lazy, useState } from 'react';
import type { Locale } from '../types';
import { PresentationCard } from '../../../apps/studio/src/embedded/PresentationCard';
import { flushSnapshot } from '../../../apps/studio/src/embedded/artifact-store';
import '../../../apps/studio/src/styles.css';
import './presentation.css';
import type { ChatMessage } from '../types';

const RETURN_KEY = 'gpt_presentation_return';
function pendingReturn() {
  try {
    const pending = JSON.parse(sessionStorage.getItem(RETURN_KEY) || localStorage.getItem(RETURN_KEY) || 'null');
    return pending && Number.isFinite(pending.createdAt) && Date.now() - pending.createdAt >= 0 && Date.now() - pending.createdAt < 86_400_000 ? pending : null;
  } catch { return null; }
}

/** Payment references are hints only; server /me remains the source of rights. */
export function presentationEntry(ownerKey: string, messages: ChatMessage[]): string | null {
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
    return pending?.ownerKey === ownerKey && /^[a-zA-Z0-9_-]{16,80}$/.test(pending.artifactId) && !messages.some(m => m.kind === 'presentation' && m.artifactId === pending.artifactId) ? pending.artifactId : null;
  } catch { return null; }
}

const Tariffs = lazy(() => import('../../../apps/studio/src/billing/Tariffs').then(m => ({ default: m.Tariffs })));
const MyPack = lazy(() => import('../../../apps/studio/src/billing/MyPack').then(m => ({ default: m.MyPack })));
const PayReturn = lazy(() => import('../../../apps/studio/src/billing/PayReturn').then(m => ({ default: m.PayReturn })));

export function ChatPresentation({ locale, artifactId, ownerKey, topic }: { locale: Locale; artifactId: string; ownerKey: string; topic: string }) {
  const [packOpened, setPackOpened] = useState(false);
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
  return <section className="gpt-presentation ym-hide-content" data-chat-presentation={artifactId}>
    <h2>{locale === 'ru' ? 'Презентация в этом чате' : 'Shu chatda taqdimot'}</h2>
    <Suspense fallback={null}>{returning && <PayReturn locale={locale} />}</Suspense>
    <PresentationCard locale={locale} artifactId={artifactId} ownerKey={ownerKey} initialTopic={topic} returning={returning} slots={{
      tariffs: context => <Suspense fallback={null}><Tariffs locale={locale} context={context} returnPath={window.location.pathname} beforeNavigate={beforeNavigate} /></Suspense>,
      myPack: () => <details onToggle={event => { if (event.currentTarget.open) setPackOpened(true); }}><summary>{locale === 'ru' ? 'Мои презентации и покупки' : 'Taqdimotlarim va xaridlarim'}</summary>{packOpened && <Suspense fallback={null}><MyPack locale={locale} /></Suspense>}</details>,
    }} />
    <p className="gpt-dock-note">{locale === 'ru' ? 'Результат сохраняется в этом браузере. Скачайте PPTX перед очисткой данных.' : 'Natija shu brauzerda saqlanadi. Ma’lumotlarni tozalashdan oldin PPTXni yuklab oling.'}</p>
  </section>;
}
