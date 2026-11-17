// The AI reading of a chart or a pair: asked on a tap, shown by sections,
// each with the facts it explains; saved in this browser so it reopens the
// same. The free first readings and what comes after are said plainly.
import { useEffect, useState } from 'react';
import { cacheReading, cachedReading, report, requestReading, type ReadingSection } from './data';
import type { NatalStrings } from './strings';
import { ANGLE_NAME, ASPECT_NAME, BODY_NAME, ELEMENT_NAME, MODALITY_NAME, SIGN_NAME, houseName, type NatalLocale } from '../../shared/natal-names';
import { parseFact, type ReadingKind } from '../../shared/natal-facts';

type State = { at: 'idle' } | { at: 'loading' } | { at: 'done'; sections: ReadingSection[] } | { at: 'error'; code: string };

export function factChip(fact: string, locale: NatalLocale, s: NatalStrings): string {
  const p = parseFact(fact);
  const who = (person: 1 | 2) => `${person === 1 ? s.you : s.partner}: `;
  const point = (x: string) => (x === 'asc' || x === 'mc' ? ANGLE_NAME[locale][x] : BODY_NAME[locale][x as keyof typeof BODY_NAME['uz']]);
  switch (p.kind) {
    case 'sign': return `${BODY_NAME[locale][p.body]} — ${SIGN_NAME[locale][p.sign]}`;
    case 'house': return `${BODY_NAME[locale][p.body]} — ${houseName(locale, p.house)}`;
    case 'angle': return `${ANGLE_NAME[locale][p.angle]} — ${SIGN_NAME[locale][p.sign]}`;
    case 'aspect': return `${BODY_NAME[locale][p.a]} · ${BODY_NAME[locale][p.b]}: ${ASPECT_NAME[locale][p.aspect]}`;
    case 'elem': return `${s.elements}: ${ELEMENT_NAME[locale][p.element]}`;
    case 'mode': return `${s.modalities}: ${MODALITY_NAME[locale][p.modality]}`;
    case 'retro': return `${BODY_NAME[locale][p.body]} ${s.retro}`;
    case 'contact': return `${who(1)}${point(p.a)} · ${who(2)}${point(p.b)}: ${ASPECT_NAME[locale][p.aspect]}`;
  }
}

export function Reading({ kind, facts, cacheKey, locale, s }: { kind: ReadingKind; facts: string[]; cacheKey: string; locale: NatalLocale; s: NatalStrings }) {
  const [state, setState] = useState<State>(() => {
    const cached = cachedReading<ReadingSection[]>(cacheKey);
    return cached ? { at: 'done', sections: cached } : { at: 'idle' };
  });
  useEffect(() => {
    const cached = cachedReading<ReadingSection[]>(cacheKey);
    setState(cached ? { at: 'done', sections: cached } : { at: 'idle' });
  }, [cacheKey]);

  const ask = async () => {
    setState({ at: 'loading' });
    report('natal_reading_requested');
    const result = await requestReading(kind, locale, facts);
    if (result.ok) {
      cacheReading(cacheKey, result.sections);
      setState({ at: 'done', sections: result.sections });
      report('natal_reading_shown');
    } else {
      if (result.code === 'next_paid') report('natal_reading_next');
      setState({ at: 'error', code: result.code });
    }
  };

  const message = (code: string) =>
    code === 'next_paid' ? s.readingNext : code === 'rate_limited' ? s.readingLimited : code === 'busy' ? s.readingBusy : s.readingFailed;

  return (
    <section className="natal-reading" aria-live="polite">
      <h3 className="natal-h3">{s.reading}</h3>
      {state.at === 'idle' && (
        <div className="natal-reading-start">
          <p className="natal-note">{kind === 'natal' ? s.readingFree : s.readingPairFree}</p>
          <button type="button" className="natal-button" onClick={ask}>{s.readingStart}</button>
        </div>
      )}
      {state.at === 'loading' && <p className="natal-note natal-wait"><span className="natal-spinner" aria-hidden="true" />{s.readingWait}</p>}
      {state.at === 'error' && (
        <div className="natal-reading-error">
          <p className="natal-note">{message(state.code)}</p>
          {/* A day limit ends at midnight UTC: the same tab can ask again without a reload. */}
          {state.code !== 'next_paid' && <button type="button" className="natal-button natal-button--ghost" onClick={ask}>{s.readingRetry}</button>}
        </div>
      )}
      {state.at === 'done' && (
        <div className="natal-sections">
          {state.sections.map((section) => (
            <article key={section.id} className="natal-section">
              <h4>{s.sectionTitle[section.id] ?? section.id}</h4>
              <p>{section.text}</p>
              <ul className="natal-chips">{section.facts.map((fact) => <li key={fact}>{factChip(fact, locale, s)}</li>)}</ul>
            </article>
          ))}
          <p className="natal-label-ai">{s.readingLabel}</p>
        </div>
      )}
    </section>
  );
}
