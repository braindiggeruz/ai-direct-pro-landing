// The natal chart and compatibility widget (roadmap ROADMAP-NATAL-RU.md v2,
// section 5). Everything is computed in the browser: positions, houses,
// aspects, contacts. Only closed fact ids go to the AI reading.
import { useMemo, useState } from 'react';
import { BirthForm, EMPTY_FORM, formFromInput, placeLabel, readForm, type FormValue } from './BirthForm';
import { Reading } from './Reading';
import { Wheel } from './Wheel';
import { removeChart, report, saveChart, savedCharts, zoneTable, type BirthInput, type SavedChart } from './data';
import { buildChart, contactsBetween, type Chart, type Contact } from './engine/chart';
import type { HouseSystem } from './engine/houses';
import { localDay, offsetLabel, resolveLocal } from './engine/time';
import { ENGINE_VERSION } from './engine/version';
import { signOf } from './engine/zodiac';
import { factsOfChart, factsOfPair } from './facts';
import { STRINGS, type NatalStrings } from './strings';
import { ANGLE_NAME, ASPECT_NAME, BODY_GLYPH, BODY_NAME, ELEMENT_NAME, MODALITY_NAME, SIGN_NAME, type NatalLocale } from '../../shared/natal-names';

interface Computed { chart: Chart; input: BirthInput; zone: string; tz: string; label: string; summer: boolean }
type Ask = { kind: 'twice'; options: Array<{ offset: number; summer: boolean }>; who: 1 | 2 } | null;

function hash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

async function compute(input: BirthInput, system: HouseSystem, s: NatalStrings): Promise<{ ok: true; value: Computed } | { ok: false; error: string; ask?: Ask }> {
  const table = await zoneTable(input.place.zone);
  let utc: Date;
  let offset: number;
  let summer: boolean;
  let dayStart: Date | undefined;
  let dayEnd: Date | undefined;
  if (input.timeKnown) {
    const r = resolveLocal(table, input);
    if (r.status === 'nonexistent') return { ok: false, error: s.gap(offsetLabel(r.before), offsetLabel(r.after)) };
    if (r.status === 'ambiguous') {
      const chosen = r.options.find((o) => o.offset === input.offsetChoice);
      if (!chosen) return { ok: false, error: s.twice, ask: { kind: 'twice', options: r.options, who: 1 } };
      ({ utc, offset, summer } = chosen);
    } else ({ utc, offset, summer } = r);
  } else {
    const day = localDay(table, input.year, input.month, input.day);
    ({ start: dayStart, end: dayEnd } = day);
    utc = day.noon;
    const r = resolveLocal(table, { ...input, hour: 12, minute: 0 });
    offset = r.status === 'ok' ? r.offset : 0;
    summer = r.status === 'ok' && r.summer;
  }
  const chart = buildChart({ utc, timeKnown: input.timeKnown, dayStart, dayEnd, latitude: input.place.lat, longitude: input.place.lon, houseSystem: system });
  return { ok: true, value: { chart, input, zone: input.place.zone, tz: table.tz, label: offsetLabel(offset), summer } };
}

const deg = (longitude: number) => {
  const inSign = longitude - Math.floor(longitude / 30) * 30;
  const d = Math.floor(inSign);
  const m = Math.floor((inSign - d) * 60);
  return `${d}°${String(m).padStart(2, '0')}′`;
};

export default function NatalApp({ locale, mode }: { locale: NatalLocale; mode: 'natal' | 'pair' }) {
  const s = STRINGS[locale];
  const [forms, setForms] = useState<[FormValue, FormValue]>([EMPTY_FORM, EMPTY_FORM]);
  const [pairOpen, setPairOpen] = useState(mode === 'pair');
  const [system, setSystem] = useState<HouseSystem>('placidus');
  const [result, setResult] = useState<{ first: Computed; second: Computed | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState<Ask>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<SavedChart[]>(() => savedCharts());
  const [picked, setPicked] = useState<string | null>(null);

  const build = async (choice?: { who: 1 | 2; offset: number }, houseSystem = system) => {
    setError(null);
    setAsk(null);
    const first = readForm(forms[0], s);
    if (!first.ok) return setError(first.error);
    const second = pairOpen ? readForm(forms[1], s) : null;
    if (second && !second.ok) return setError(second.error);
    setBusy(true);
    try {
      const inputs = [first.input, second?.ok ? second.input : null] as const;
      const withChoice = (input: BirthInput, who: 1 | 2) => (choice && choice.who === who ? { ...input, offsetChoice: choice.offset } : input);
      const a = await compute(withChoice(inputs[0], 1), houseSystem, s);
      if (!a.ok) { setError(a.error); if (a.ask) setAsk({ ...a.ask, who: 1 }); return; }
      let b: Computed | null = null;
      if (inputs[1]) {
        const r = await compute(withChoice(inputs[1], 2), houseSystem, s);
        if (!r.ok) { setError(r.error); if (r.ask) setAsk({ ...r.ask, who: 2 }); return; }
        b = r.value;
      }
      saveChart(a.value.input);
      if (b) saveChart(b.input);
      setSaved(savedCharts());
      setResult({ first: a.value, second: b });
      report(b ? 'natal_pair_built' : 'natal_chart_built');
      window.requestAnimationFrame(() => document.getElementById('natal-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch {
      setError(s.errEngine);
    } finally {
      setBusy(false);
    }
  };

  const natalFacts = useMemo(() => (result ? factsOfChart(result.first.chart, 1) : []), [result]);
  const contacts: Contact[] = useMemo(() => (result?.second ? contactsBetween(result.first.chart, result.second.chart) : []), [result]);
  const pairFacts = useMemo(() => (result?.second ? factsOfPair(result.first.chart, result.second.chart, contacts) : []), [result, contacts]);

  return (
    // ym-hide-content: Webvisor (Yandex Metrika on every page) records nothing typed or shown here: birth data stays private.
    <div className="natal ym-hide-content" lang={locale}>
      {saved.length > 0 && !result && (
        <details className="natal-saved">
          <summary>{s.saved} ({saved.length})</summary>
          <ul>
            {saved.map((c) => (
              <li key={c.id}>
                <span>{c.input.name || placeLabel(c.input.place, locale)} · {String(c.input.day).padStart(2, '0')}.{String(c.input.month).padStart(2, '0')}.{c.input.year}{c.input.timeKnown ? ` ${String(c.input.hour).padStart(2, '0')}:${String(c.input.minute).padStart(2, '0')}` : ''}</span>
                <button type="button" className="natal-link" onClick={() => setForms(([, b]) => [formFromInput(c.input, locale), b])}>{s.open}</button>
                <button type="button" className="natal-link" onClick={() => { removeChart(c.id); setSaved(savedCharts()); }}>{s.remove}</button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className={pairOpen ? 'natal-forms natal-forms--two' : 'natal-forms'}>
        <BirthForm title={pairOpen ? s.you : undefined} value={forms[0]} onChange={(v) => setForms(([, b]) => [v, b])} s={s} locale={locale} />
        {pairOpen && <BirthForm title={s.partner} value={forms[1]} onChange={(v) => setForms(([a]) => [a, v])} s={s} locale={locale} />}
      </div>
      {error && <p className="natal-error" role="alert">{error}</p>}
      {ask && (
        <div className="natal-ask">
          {ask.options.map((o) => (
            <button key={o.offset} type="button" className="natal-button natal-button--ghost" onClick={() => build({ who: ask.who, offset: o.offset })}>
              {o.summer ? s.twiceSummer : s.twiceWinter} · {offsetLabel(o.offset)}
            </button>
          ))}
        </div>
      )}
      <div className="natal-actions">
        <button type="button" className="natal-button" disabled={busy} onClick={() => build()}>{pairOpen ? s.buildPair : s.build}</button>
        {!pairOpen && result && <button type="button" className="natal-button natal-button--ghost" onClick={() => setPairOpen(true)}>{s.addPartner}</button>}
      </div>
      <p className="natal-hint natal-privacy">{s.privacy}</p>

      {result && (
        <div id="natal-result" className="natal-result">
          {[result.first, result.second].filter((x): x is Computed => !!x).map((c, i) => (
            <ChartView key={i} c={c} who={result.second ? (i === 0 ? s.you : s.partner) : null} locale={locale} s={s} system={system}
              picked={picked} onPick={setPicked}
              onSystem={(next) => { setSystem(next); void build(undefined, next); }} />
          ))}
          {result.second ? (
            <>
              <PairView contacts={contacts} locale={locale} s={s} />
              <Reading kind="pair" facts={pairFacts} cacheKey={`pair:${locale}:${hash(pairFacts.slice().sort().join(','))}`} locale={locale} s={s} />
            </>
          ) : (
            <Reading kind="natal" facts={natalFacts} cacheKey={`natal:${locale}:${hash(natalFacts.slice().sort().join(','))}`} locale={locale} s={s} />
          )}
          <div className="natal-actions natal-actions--end">
            <button type="button" className="natal-button natal-button--ghost" onClick={() => window.print()}>{s.print}</button>
          </div>
        </div>
      )}
      <p className="natal-disclaimer">{s.disclaimer}</p>
      <p className="natal-hint">{s.attribution}</p>
    </div>
  );
}

function ChartView({ c, who, locale, s, system, picked, onPick, onSystem }: {
  c: Computed; who: string | null; locale: NatalLocale; s: NatalStrings; system: HouseSystem; picked: string | null;
  onPick: (body: string) => void; onSystem: (system: HouseSystem) => void;
}) {
  const { chart, input } = c;
  const body = (id: string) => chart.bodies.find((b) => b.body === id)!;
  const sun = body('sun');
  const moon = body('moon');
  const title = [who, input.name].filter(Boolean).join(' · ');
  return (
    <section className="natal-chart-view">
      {title && <h3 className="natal-h3">{title}</h3>}
      <h4 className="natal-h4">{s.bigThree}</h4>
      <div className="natal-big3">
        <div><span>{s.sun}</span><SignLines name={SIGN_NAME[locale][sun.sign]} /></div>
        <div><span>{s.moon}</span><SignLines name={SIGN_NAME[locale][moon.sign]} note={moon.signUncertain ? s.uncertain : undefined} /></div>
        <div><span>{s.asc}</span>{chart.houses ? <SignLines name={SIGN_NAME[locale][signOf(chart.houses.ascendant)]} /> : <strong>{s.ascUnknown}</strong>}</div>
      </div>
      <div className="natal-wheel-box">
        <Wheel chart={chart} locale={locale} label={`${s.wheel}${title ? `: ${title}` : ''}`} onPick={onPick} />
      </div>
      <h4 className="natal-h4">{s.table}</h4>
      <div className="natal-table-wrap">
        <table className="natal-table">
          <thead><tr><th>{s.body}</th><th>{s.sign}</th><th>{s.degree}</th>{chart.houses && <th>{s.house}</th>}</tr></thead>
          <tbody>
            {chart.bodies.map((b) => (
              <tr key={b.body} className={picked === b.body ? 'natal-row--picked' : undefined}>
                <td><span className="natal-glyph-inline" aria-hidden="true">{BODY_GLYPH[b.body]}</span>{BODY_NAME[locale][b.body]}{b.retrograde ? ` ℞` : ''}</td>
                <td>{SIGN_NAME[locale][b.sign]}{b.signUncertain ? ` · ${s.uncertain}` : ''}</td>
                <td>{deg(b.longitude)}</td>
                {chart.houses && <td>{b.house}</td>}
              </tr>
            ))}
            {chart.houses && (
              <>
                <tr><td>{ANGLE_NAME[locale].asc}</td><td>{SIGN_NAME[locale][signOf(chart.houses.ascendant)]}</td><td>{deg(chart.houses.ascendant)}</td><td>1</td></tr>
                <tr><td>{ANGLE_NAME[locale].mc}</td><td>{SIGN_NAME[locale][signOf(chart.houses.midheaven)]}</td><td>{deg(chart.houses.midheaven)}</td><td>10</td></tr>
              </>
            )}
          </tbody>
        </table>
      </div>
      {chart.aspects.length > 0 && (
        <>
          <h4 className="natal-h4">{s.aspects}</h4>
          <ul className="natal-list">
            {chart.aspects.map((a) => (
              <li key={`${a.a}-${a.b}`}>{BODY_NAME[locale][a.a as never]} · {BODY_NAME[locale][a.b as never]}: {ASPECT_NAME[locale][a.aspect]}{a.uncertain ? ` (${s.uncertain})` : ''}</li>
            ))}
          </ul>
        </>
      )}
      <h4 className="natal-h4">{s.balance}</h4>
      <div className="natal-balance">
        <p>{s.elements}: {(Object.keys(chart.elements) as Array<keyof typeof chart.elements>).map((k) => `${ELEMENT_NAME[locale][k]} ${chart.elements[k]}`).join(' · ')}</p>
        <p>{s.modalities}: {(Object.keys(chart.modalities) as Array<keyof typeof chart.modalities>).map((k) => `${MODALITY_NAME[locale][k]} ${chart.modalities[k]}`).join(' · ')}</p>
      </div>
      <details className="natal-how">
        <summary>{s.how}</summary>
        <p>{s.howZone(c.zone, c.label, c.summer)}</p>
        <p>{s.howCoords(input.place.lat.toFixed(4), input.place.lon.toFixed(4))}</p>
        {chart.houses ? (
          <p>
            {s.howHouses(s.systems[chart.houses.system], chart.houses.fellBack)}{' '}
            <select aria-label={s.howHouses('', false)} value={system} onChange={(e) => onSystem(e.target.value as HouseSystem)}>
              {(['placidus', 'equal', 'whole'] as const).map((x) => <option key={x} value={x}>{s.systems[x]}</option>)}
            </select>
          </p>
        ) : <p>{s.howNoTime}</p>}
        <p>{s.howVersion(ENGINE_VERSION, c.tz)}</p>
        {input.year < 1970 && <p>{s.howOld}</p>}
      </details>
      <p className="natal-hint">{placeLabel(input.place, locale)}</p>
    </section>
  );
}

/** «Saraton (Qisqichbaqa)»: the traditional name, and the everyday one on its own line. */
function SignLines({ name, note }: { name: string; note?: string }) {
  const m = /^(.*?) \((.*)\)$/.exec(name);
  return (
    <>
      <strong>{m ? m[1] : name}</strong>
      {m && <em className="natal-big3-sub">{m[2]}</em>}
      {note && <em className="natal-big3-sub">{note}</em>}
    </>
  );
}

function PairView({ contacts, locale, s }: { contacts: Contact[]; locale: NatalLocale; s: NatalStrings }) {
  const count = (tone: Contact['tone']) => contacts.filter((c) => c.tone === tone).length;
  const point = (x: string) => (x === 'asc' || x === 'mc' ? ANGLE_NAME[locale][x] : BODY_NAME[locale][x as never]);
  return (
    <section className="natal-pair">
      <h3 className="natal-h3">{s.pairTitle}</h3>
      <p className="natal-pair-counts">
        <span className="natal-tone natal-tone--harmony">{s.pairHarmony(count('harmony'))}</span>
        <span className="natal-tone natal-tone--tension">{s.pairTension(count('tension'))}</span>
        <span className="natal-tone natal-tone--blend">{s.pairBlend(count('blend'))}</span>
      </p>
      <h4 className="natal-h4">{s.pairContacts}</h4>
      {contacts.length === 0 ? <p className="natal-note">{s.pairNone}</p> : (
        <ul className="natal-list natal-contacts">
          {contacts.map((c) => (
            <li key={`${c.a}-${c.b}`} className={`natal-contact natal-contact--${c.tone}`}>
              <span>{s.you}: {point(c.a)} · {s.partner}: {point(c.b)}</span>
              <em>{ASPECT_NAME[locale][c.aspect]} · {s.tone[c.tone]}{c.uncertain ? ` · ${s.uncertain}` : ''}</em>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
