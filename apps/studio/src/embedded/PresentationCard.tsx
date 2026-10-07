/** @jsxRuntime automatic @jsxImportSource react */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { StudioLocale } from '../api';
import type { IslandSlots } from '../slots';
import { Form } from '../tools/presentation/Form';
import { loadArtifact, registerSnapshotFlusher, saveArtifact, type PresentationSnapshot } from './artifact-store';

export interface PresentationCardProps {
  readonly locale: StudioLocale;
  readonly artifactId: string;
  /** An opaque browser/account storage scope from the host, never a session token. */
  readonly ownerKey: string;
  readonly initialTopic?: string;
  readonly returning?: boolean;
  readonly slots?: IslandSlots;
}

/** Reuses the host's React root and Studio's existing flow, cookies and quota. */
export function PresentationCard(props: PresentationCardProps) {
  return <OwnedPresentationCard key={JSON.stringify([props.ownerKey, props.artifactId, props.locale])} {...props} />;
}

function OwnedPresentationCard({ locale, artifactId, ownerKey, initialTopic, returning, slots }: PresentationCardProps) {
  const [restored, setRestored] = useState<{ snapshot: PresentationSnapshot | null } | null>(null);
  const [persistent, setPersistent] = useState(true);
  const latest = useRef<PresentationSnapshot | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);
  const flush = useCallback(async (strict = false) => {
    if (timer.current !== null) { clearTimeout(timer.current); timer.current = null; }
    const snapshot = latest.current;
    if (!snapshot) {
      if (strict) throw new Error('studio_draft_not_ready');
      return;
    }
    try {
      const saved = await saveArtifact(ownerKey, artifactId, snapshot);
      if (mounted.current) setPersistent(saved.persistent);
      if (strict && !saved.persistent) throw new Error('studio_draft_not_persisted');
    } catch (error) {
      if (mounted.current) setPersistent(false);
      if (strict) throw error;
    }
  }, [ownerKey, artifactId]);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    void loadArtifact(ownerKey, artifactId).then((snapshot) => {
      if (!active) return;
      const matching = snapshot?.locale === locale ? snapshot : null;
      latest.current = matching;
      setRestored({ snapshot: matching });
    }).catch(() => {
      if (active) { setPersistent(false); setRestored({ snapshot: null }); }
    });
    const unregister = registerSnapshotFlusher(ownerKey, artifactId, () => flush(true));
    const save = () => { void flush(); };
    const hidden = () => { if (document.visibilityState === 'hidden') save(); };
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      active = false;
      mounted.current = false;
      unregister();
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', hidden);
      // Unmount keeps the draft/result, but Form aborts the in-flight client work.
      void flush();
    };
  }, [ownerKey, artifactId, locale, flush]);

  const snapshotChanged = useCallback((snapshot: PresentationSnapshot) => {
    if (!mounted.current) return;
    latest.current = snapshot;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, 150);
  }, [flush]);

  return (
    <section className="ym-hide-content" data-studio-embedded="presentation" aria-label={locale === 'ru' ? 'Презентация' : 'Taqdimot'}>
      {!persistent ? <p role="status" data-studio-storage="memory">{locale === 'ru'
        ? 'Браузер не сохранил презентацию на устройстве. Скачайте готовый файл: после перезагрузки данные могут пропасть.'
        : 'Brauzer taqdimotni qurilmada saqlamadi. Tayyor faylni yuklab oling: sahifa yangilansa, ma’lumot yo‘qolishi mumkin.'}</p> : null}
      {restored ? <Form locale={locale} slots={slots} embedding={{ initialTopic, initialSnapshot: restored.snapshot, returning, onSnapshot: snapshotChanged }} />
        : <p role="status">{locale === 'ru' ? 'Открываем презентацию…' : 'Taqdimot ochilmoqda…'}</p>}
    </section>
  );
}
