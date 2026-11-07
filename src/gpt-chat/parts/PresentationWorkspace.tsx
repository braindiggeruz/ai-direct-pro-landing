import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PresentationSheet } from './PresentationSheets';
import type { PresentationSession } from '../../../apps/studio/src/tools/presentation/session';
import { Download } from '../../../apps/studio/src/tools/presentation/Download';
import { Progress, FULL_PROGRESS_STEPS } from '../../../apps/studio/src/tools/presentation/Progress';
import { PartsProgress } from '../../../apps/studio/src/tools/presentation/PartsProgress';
import { registerSession, unregisterSession, sessionKey } from './presentation-session';
import type { StudioPlanId } from '../../../apps/studio/src/api';
import { billingRuntime } from '../../../apps/studio/src/billing/runtime';

const PresentationSheets = lazy(() => import('./PresentationSheets').then(m => ({default:m.PresentationSheets})));
const SlideCanvas = lazy(() => import('../../../apps/studio/src/embedded/SlideCanvas').then(m => ({default:m.SlideCanvas})));
const StudioOffer = lazy(() => import('./StudioOffer').then(m => ({default:m.StudioOffer})));
const DocumentExport = lazy(() => import('../../../apps/studio/src/tools/presentation/DocumentExport'));

export interface WorkspaceProps {
  session: PresentationSession; artifactId: string; ownerKey: string; active: boolean;
  beforeNavigate: () => Promise<void>; reveal: () => void; onClose: () => void; focusInput: () => void;
  repeatProject?: boolean;
}

export function PresentationWorkspace({ session: s, artifactId, ownerKey, active, beforeNavigate, reveal, onClose, focusInput, repeatProject = false }: WorkspaceProps) {
  const ru = s.locale === 'ru';
  const [selected, setSelected] = useState(0);
  const [sheet, setSheet] = useState<PresentationSheet|null>(null);
  const [offerPlan, setOfferPlan] = useState<StudioPlanId|null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement|null>(null);
  const lastJob = useRef<string|null>(null);
  const key = sessionKey(ownerKey, artifactId);
  const total = s.result ? s.result.deck.slides.length + 1 + Number(s.result.aiLabel) : 0;
  const slide = s.result?.deck.slides[selected - 1];
  const closeSheet = () => { dialog.current?.close(); setSheet(null); };
  const openSheet = (next: NonNullable<typeof sheet>, plan: StudioPlanId|null = null) => { opener.current = document.activeElement as HTMLElement|null; setOfferPlan(plan); setSheet(next); };

  useLayoutEffect(() => { registerSession(key, { session: s, selected, reveal, purchase: () => { reveal(); openSheet(s.unitsLeft && s.unitsLeft > 0 ? 'pack' : 'billing'); } }); });
  useEffect(() => () => unregisterSession(key), [key]);
  useEffect(() => { if(active) billingRuntime().funnel.modeEntered(); },[active]);
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (sheet && active && !el.open) el.showModal();
    if ((!sheet || !active) && el.open) el.close();
  }, [sheet, active]);
  useEffect(() => {
    const job = s.result?.job.jobId ?? null;
    if (job && job !== lastJob.current) { lastJob.current = job; setSelected(0); if (active) reveal(); }
  }, [s.result?.job.jobId, active, reveal]);

  const openEditor = () => { if (s.result && selected < s.result.deck.slides.length + 1) openSheet('edit'); };
  const needPurchase = s.fullChosen && s.unitsLeft === 0;

  return <>
    {/* Remains mounted even when its workspace is hidden; no cancellation on layout changes. */}
    <div ref={s.turnstileBox} className="gpt-workspace-turnstile" data-studio-turnstile="" />
    <section className="gpt-presentation-workspace ym-hide-content" hidden={!active} data-chat-presentation={artifactId} data-studio-tool="presentation">
      <header className="gpt-workspace-header">
        <div><h2>{s.result?.deck.title || (ru ? 'Новая презентация' : 'Yangi taqdimot')}</h2><p>{s.result ? (ru ? `Версия ${(s.result.revision ?? 0) + 1} · ${total} слайдов в файле` : `${(s.result.revision ?? 0) + 1}-versiya · faylda ${total} slayd`) : (ru ? 'Тема и параметры · запуск после подтверждения' : 'Mavzu va parametrlar · tasdiqlagach boshlanadi')}</p></div>
        <button type="button" className="gpt-workspace-button" onClick={() => openSheet('settings')} disabled={s.working}>{ru ? 'Параметры' : 'Parametrlar'}</button>
        <button type="button" className="gpt-workspace-icon" onClick={onClose} aria-label={ru ? 'Закрыть редактор и вернуться в обычный чат' : 'Muharrirni yopib oddiy chatga qaytish'}>×</button>
      </header>
      <div className="gpt-workspace-scroll">
        {!s.result ? <div className="gpt-presentation-draft">
          <span className="gpt-artifact-mark" aria-hidden="true">▧</span><h3>{ru ? 'Начнём с вашей темы' : 'Mavzuingizdan boshlaymiz'}</h3>
          <p className="gpt-draft-topic">{s.topic || (ru ? 'Напишите тему в чате. Например: Шёлковый путь.' : 'Mavzuni chatga yozing. Masalan: Buyuk Ipak yo‘li.')}</p>
          <button type="button" className="gpt-workspace-link" onClick={focusInput}>{ru ? 'Изменить тему в чате' : 'Mavzuni chatda o‘zgartirish'}</button>
          <div className="gpt-draft-summary"><span>{s.texts.audience[s.audience]}</span><span>{ru ? `${s.slides} содержательных слайдов` : `${s.slides} mazmunli slayd`}</span><button type="button" onClick={() => openSheet('settings')}>{ru ? 'Настроить' : 'Sozlash'}</button></div>
          {s.fullOpen && <fieldset className="gpt-shape-segment"><legend className="sr-only">{ru ? 'Формат презентации' : 'Taqdimot formati'}</legend>{(['free','full'] as const).map(shape => <label key={shape} data-selected={s.shape === shape}><input type="radio" name={`shape-${artifactId}`} value={shape} checked={s.shape === shape} disabled={s.working} onChange={() => s.chooseShape(shape)}/><span>{shape === 'free' ? (ru ? 'Бесплатная' : 'Bepul') : (ru ? 'Полная' : 'To‘liq')}</span></label>)}</fieldset>}
          <p className="gpt-workspace-note">{s.fullChosen ? (s.unitsLeft === null ? s.full.unitNoteUnknown : s.full.unitNote(s.unitsLeft)) : s.texts.freeNote}</p>
          <p className="gpt-workspace-note">{ru ? 'К указанному числу добавятся обложка и, при включённой маркировке, слайд об использовании AI.' : 'Ko‘rsatilgan songa muqova va belgilash yoqilganida AI haqidagi slayd qo‘shiladi.'}</p>
        </div> : <>
          <div className="gpt-slide-stage"><Suspense fallback={<p role="status">{ru ? 'Открываем слайд…' : 'Slayd ochilmoqda…'}</p>}><SlideCanvas result={s.result} index={selected} pictures={s.pictures} locale={s.locale}/></Suspense></div>
          <div className="gpt-slide-navigation"><button type="button" className="gpt-workspace-icon" disabled={selected === 0} onClick={() => setSelected(i => i - 1)} aria-label={ru ? 'Предыдущий слайд' : 'Oldingi slayd'}>←</button><span aria-live="polite">{selected + 1} / {total}</span><button type="button" className="gpt-workspace-icon" disabled={selected >= total - 1} onClick={() => setSelected(i => i + 1)} aria-label={ru ? 'Следующий слайд' : 'Keyingi slayd'}>→</button><button type="button" className="gpt-workspace-button" onClick={openEditor} disabled={s.working || selected >= s.result.deck.slides.length + 1}>{ru ? 'Править' : 'Tahrirlash'}</button></div>
          <nav className="gpt-slide-filmstrip" aria-label={ru ? 'Слайды презентации' : 'Taqdimot slaydlari'}>{Array.from({length:total},(_,i) => <button type="button" key={i} aria-pressed={selected === i} onClick={() => setSelected(i)}><small>{String(i + 1).padStart(2,'0')}</small><span>{i === 0 ? (ru ? 'Обложка' : 'Muqova') : i > s.result!.deck.slides.length ? 'AI' : s.result!.deck.slides[i - 1].title}</span></button>)}</nav>
          <details className="gpt-slide-text" open><summary>{ru ? 'Читать текст слайда' : 'Slayd matnini o‘qish'}</summary><h3>{selected === 0 ? s.result.deck.title : slide?.title}</h3>{slide ? <><ul>{slide.bullets.map((b,i) => <li key={i}>{b}</li>)}</ul>{slide.notes && <div><strong>{s.full.notesLabel}</strong><p>{slide.notes}</p></div>}</> : <p>{selected === 0 ? s.result.deck.subtitle : (ru ? 'Подготовлено с помощью AI. Проверьте факты.' : 'AI yordamida tayyorlangan. Faktlarni tekshiring.')}</p>}</details>
          <p className="gpt-workspace-note">{s.texts.draftNote}</p>
        </>}
        <p className="gpt-workspace-message" role="status" data-studio-message={s.status.kind === 'message' ? s.status.code : s.status.kind === 'interrupted' ? 'interrupted' : ''}>{s.message}</p>
        <p className="sr-only" role="status">{s.announce}</p>
        {s.status.kind === 'working' && <Progress texts={s.texts} step={s.status.step} startedAt={s.status.startedAt} steps={s.status.full ? FULL_PROGRESS_STEPS : undefined} note={s.status.full ? s.full.progressNote : undefined} detail={s.parts ? <PartsProgress done={s.parts.partsDone} total={s.parts.parts} label={s.full.parts}/> : undefined}/>}
        {active && s.config && !s.working && s.result?.shape !== 'full' && <Suspense fallback={null}><StudioOffer config={s.config} locale={s.locale} result={!!s.result} repeat={repeatProject} units={s.unitsLeft} onChoose={plan => openSheet('billing',plan)}/></Suspense>}
        <p className="gpt-workspace-note">{ru ? 'Сохраняется в этом браузере. Скачайте PPTX перед очисткой данных.' : 'Shu brauzerda saqlanadi. Ma’lumotlarni tozalashdan oldin PPTXni yuklab oling.'}</p>
        {active && s.result && <Suspense fallback={null}><DocumentExport deck={s.result.deck} locale={s.locale}/></Suspense>}
      </div>
      <footer className="gpt-workspace-footer">
        {s.result ? <Download texts={s.texts} state={s.download} inApp={s.inApp} onDownload={() => void s.onDownload()}/> : <button type="button" className="gpt-workspace-primary" disabled={!s.hydrated || s.working || s.topic.trim().length < 3 || (s.fullChosen && s.unitsLeft === null)} onClick={() => needPurchase ? openSheet('billing') : void s.onSubmit()}>{s.working ? s.texts.submitBusy : needPurchase ? (ru ? 'Выбрать пакет презентаций' : 'Taqdimot paketini tanlash') : s.fullChosen ? s.full.submit : (ru ? 'Создать презентацию' : 'Taqdimot yaratish')}</button>}
        {(s.result?.shape === 'free' || (s.status.kind === 'message' && s.status.tone === 'limit')) && <button type="button" className="gpt-workspace-button" onClick={() => { if (s.unitsLeft && s.unitsLeft > 0 && s.result?.shape === 'free') { s.chooseShape('full'); openSheet('upgrade'); } else openSheet('billing'); }} disabled={s.working}>{ru ? 'Полная версия' : 'To‘liq versiya'}</button>}
        <button type="button" className="gpt-workspace-link gpt-workspace-purchases" onClick={() => openSheet('pack')}>{ru ? 'Мои покупки' : 'Xaridlarim'}</button>
      </footer>
      <dialog ref={dialog} className="gpt-presentation-sheet ym-hide-content" aria-labelledby={`${artifactId}-sheet-title`} onCancel={() => setSheet(null)} onClose={() => { opener.current?.focus(); }}>
        <div className="gpt-sheet-header"><h2 id={`${artifactId}-sheet-title`}>{sheet === 'upgrade' ? (ru ? 'Создать полную версию' : 'To‘liq versiyani yaratish') : sheet === 'billing' ? (ru ? 'Полные презентации' : 'To‘liq taqdimotlar') : sheet === 'pack' ? (ru ? 'Мои покупки' : 'Xaridlarim') : sheet === 'edit' ? (ru ? 'Править слайд' : 'Slaydni tahrirlash') : (ru ? 'Параметры' : 'Parametrlar')}</h2><button type="button" className="gpt-workspace-icon" aria-label={ru ? 'Закрыть' : 'Yopish'} onClick={closeSheet}>×</button></div>
        {sheet && <Suspense fallback={<p role="status">{ru ? 'Открываем…' : 'Ochilmoqda…'}</p>}><PresentationSheets key={`${sheet}:${selected}:${offerPlan}`} session={s} sheet={sheet} selected={selected} closeSheet={closeSheet} setSheet={setSheet} beforeNavigate={beforeNavigate} initialPlan={offerPlan} repeatProject={repeatProject}/></Suspense>}
      </dialog>
    </section>
  </>;
}
