// One person's birth data: date in three fields (no system calendar: it is
// slow to scroll back to 1985), time or «not known», place with suggestions
// in Uzbek Latin, Cyrillic or Russian, an optional name. Nothing typed here is
// sent anywhere; the chart is computed in the browser.
import { useEffect, useId, useRef, useState } from 'react';
import { findPlaces, type BirthInput, type Place } from './data';
import type { NatalStrings } from './strings';
import type { NatalLocale } from '../../shared/natal-names';

export interface FormValue { day: string; month: string; year: string; time: string; timeUnknown: boolean; place: Place | null; placeText: string; name: string }

export const EMPTY_FORM: FormValue = { day: '', month: '', year: '', time: '', timeUnknown: false, place: null, placeText: '', name: '' };

export function formFromInput(input: BirthInput, locale: NatalLocale): FormValue {
  return {
    day: String(input.day), month: String(input.month), year: String(input.year),
    time: input.timeKnown ? `${String(input.hour).padStart(2, '0')}:${String(input.minute).padStart(2, '0')}` : '',
    timeUnknown: !input.timeKnown, place: input.place, placeText: placeLabel(input.place, locale), name: input.name,
  };
}

export function placeLabel(place: Place, locale: NatalLocale): string {
  const name = locale === 'ru' ? place.nameRu || place.nameUz : place.nameUz || place.nameRu;
  const region = locale === 'ru' ? place.regionRu || place.regionUz : place.regionUz || place.regionRu;
  return [name, region].filter(Boolean).join(', ');
}

/** The form as birth input, or the message of its first error. */
export function readForm(value: FormValue, s: NatalStrings): { ok: true; input: BirthInput } | { ok: false; error: string } {
  const day = Number(value.day);
  const month = Number(value.month);
  const year = Number(value.year);
  const valid = Number.isInteger(day) && Number.isInteger(month) && Number.isInteger(year) && year >= 1900 && year <= 2040 && month >= 1 && month <= 12
    && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (!valid) return { ok: false, error: s.errDate };
  let hour = 12;
  let minute = 0;
  if (!value.timeUnknown) {
    const m = /^([01]?\d|2[0-3])[:.\s]?([0-5]\d)$/.exec(value.time.trim());
    if (!m) return { ok: false, error: s.errTime };
    hour = Number(m[1]);
    minute = Number(m[2]);
  }
  if (!value.place) return { ok: false, error: s.errPlace };
  return { ok: true, input: { year, month, day, hour, minute, timeKnown: !value.timeUnknown, place: value.place, name: value.name.trim().slice(0, 40) } };
}

export function BirthForm({ title, value, onChange, s, locale }: { title?: string; value: FormValue; onChange: (value: FormValue) => void; s: NatalStrings; locale: NatalLocale }) {
  const id = useId();
  const [options, setOptions] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  const set = (patch: Partial<FormValue>) => onChange({ ...value, ...patch });

  useEffect(() => () => window.clearTimeout(timer.current), []);
  const search = (text: string) => {
    set({ placeText: text, place: null });
    window.clearTimeout(timer.current);
    if (text.trim().length < 2) { setOptions([]); setOpen(false); return; }
    setSearching(true);
    setOpen(true);
    timer.current = window.setTimeout(() => {
      findPlaces(text)
        .then((found) => { setOptions(found); setActive(0); })
        .catch(() => setOptions([]))
        .finally(() => setSearching(false));
    }, 180);
  };
  const choose = (place: Place) => {
    onChange({ ...value, place, placeText: placeLabel(place, locale) });
    setOpen(false);
  };
  const digits = (text: string, max: number) => text.replace(/\D/g, '').slice(0, max);

  return (
    <fieldset className="natal-form">
      {title && <legend className="natal-form-title">{title}</legend>}
      <div className="natal-field">
        <span className="natal-label" id={`${id}-date`}>{s.date}</span>
        <div className="natal-date" role="group" aria-labelledby={`${id}-date`}>
          <input inputMode="numeric" autoComplete="off" placeholder="DD" aria-label={s.day} value={value.day} onChange={(e) => set({ day: digits(e.target.value, 2) })} />
          <input inputMode="numeric" autoComplete="off" placeholder="MM" aria-label={s.month} value={value.month} onChange={(e) => set({ month: digits(e.target.value, 2) })} />
          <input inputMode="numeric" autoComplete="off" placeholder="YYYY" aria-label={s.year} value={value.year} onChange={(e) => set({ year: digits(e.target.value, 4) })} className="natal-year" />
        </div>
      </div>
      <div className="natal-field">
        <label className="natal-label" htmlFor={`${id}-time`}>{s.time}</label>
        <div className="natal-time-row">
          <input id={`${id}-time`} inputMode="numeric" autoComplete="off" placeholder="09:30" value={value.time} disabled={value.timeUnknown}
            onChange={(e) => set({ time: e.target.value.replace(/[^\d:.]/g, '').slice(0, 5) })} className="natal-time" />
          <label className="natal-check">
            <input type="checkbox" checked={value.timeUnknown} onChange={(e) => set({ timeUnknown: e.target.checked, time: e.target.checked ? '' : value.time })} />
            {s.timeUnknown}
          </label>
        </div>
        <p className="natal-hint">{s.timeHint}</p>
      </div>
      <div className="natal-field natal-place">
        <label className="natal-label" htmlFor={`${id}-place`}>{s.place}</label>
        <input id={`${id}-place`} role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list" autoComplete="off"
          placeholder={s.placeHint} value={value.placeText}
          onChange={(e) => search(e.target.value)}
          onFocus={() => { if (options.length && !value.place) setOpen(true); }}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (!open || !options.length) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, options.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === 'Enter') { e.preventDefault(); choose(options[active]); }
          }} />
        {open && (
          <ul className="natal-options" id={`${id}-list`} role="listbox">
            {searching && !options.length && <li className="natal-option natal-option--note">{s.placeLoading}</li>}
            {!searching && !options.length && <li className="natal-option natal-option--note">{s.placeNone}</li>}
            {options.map((place, i) => (
              <li key={place.id} role="option" aria-selected={i === active} className={i === active ? 'natal-option natal-option--active' : 'natal-option'}
                onMouseDown={(e) => { e.preventDefault(); choose(place); }}>
                <strong>{locale === 'ru' ? place.nameRu || place.nameUz : place.nameUz || place.nameRu}</strong>
                <span>{[locale === 'ru' ? place.regionRu || place.regionUz : place.regionUz || place.regionRu, place.country !== 'UZ' ? place.country : ''].filter(Boolean).join(', ')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="natal-field">
        <label className="natal-label" htmlFor={`${id}-name`}>{s.name}</label>
        <input id={`${id}-name`} autoComplete="off" maxLength={40} value={value.name} onChange={(e) => set({ name: e.target.value })} />
        <p className="natal-hint">{s.nameHint}</p>
      </div>
    </fieldset>
  );
}
