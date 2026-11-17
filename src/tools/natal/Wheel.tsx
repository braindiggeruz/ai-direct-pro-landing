// The chart wheel as SVG: the zodiac ring, the houses (time known), the bodies
// and the aspects inside. The Ascendant is on the left, as charts are read;
// with the birth time unknown 0° Aries is on the left and there are no houses.
import { ASPECT_TONE, SIGNS, norm360 } from './engine/zodiac';
import type { Chart } from './engine/chart';
import { BODY_GLYPH, BODY_NAME, SIGN_GLYPH, SIGN_NAME, type NatalLocale } from '../../shared/natal-names';

const SIZE = 360;
const C = SIZE / 2;
const R_OUT = 176;
const R_SIGN = 150;
const R_BODY = 122;
const R_IN = 92;

export function Wheel({ chart, locale, label, onPick }: { chart: Chart; locale: NatalLocale; label: string; onPick?: (body: string) => void }) {
  const asc = chart.houses ? chart.houses.ascendant : 0;
  const point = (longitude: number, r: number) => {
    const theta = ((180 + norm360(longitude - asc)) * Math.PI) / 180;
    return { x: C + r * Math.cos(theta), y: C - r * Math.sin(theta) };
  };
  // Bodies closer than 7° are spread so their glyphs do not overlap.
  const placed = [...chart.bodies].sort((a, b) => a.longitude - b.longitude).map((b) => ({ ...b, shown: b.longitude }));
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 1; i < placed.length; i++) {
      const gap = placed[i].shown - placed[i - 1].shown;
      if (gap < 7) placed[i].shown = placed[i - 1].shown + 7;
    }
  }
  const at = new Map(chart.bodies.map((b) => [b.body, b.longitude]));
  return (
    <svg className="natal-wheel" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={label}>
      <circle cx={C} cy={C} r={R_OUT} className="natal-ring" />
      <circle cx={C} cy={C} r={R_SIGN - 14} className="natal-ring" />
      <circle cx={C} cy={C} r={R_IN} className="natal-ring natal-ring--in" />
      {SIGNS.map((sign, i) => {
        const a = point(i * 30, R_OUT);
        const b = point(i * 30, R_SIGN - 14);
        const g = point(i * 30 + 15, R_SIGN + 6);
        return (
          <g key={sign}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="natal-tick" />
            <text x={g.x} y={g.y} className={`natal-sign natal-sign--${i % 4}`} textAnchor="middle" dominantBaseline="central">
              <title>{SIGN_NAME[locale][sign]}</title>
              {SIGN_GLYPH[sign]}
            </text>
          </g>
        );
      })}
      {chart.houses?.cusps.map((cusp, i) => {
        const a = point(cusp, R_SIGN - 14);
        const b = point(cusp, R_IN);
        const angle = i === 0 || i === 3 || i === 6 || i === 9;
        const n = point(cusp + norm360((chart.houses!.cusps[(i + 1) % 12] - cusp)) / 2, R_IN + 9);
        return (
          <g key={`h${i}`}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={angle ? 'natal-cusp natal-cusp--angle' : 'natal-cusp'} />
            <text x={n.x} y={n.y} className="natal-house-n" textAnchor="middle" dominantBaseline="central">{i + 1}</text>
          </g>
        );
      })}
      {chart.aspects.filter((a) => !a.uncertain).map((a) => {
        const p = point(at.get(a.a as never)!, R_IN - 4);
        const q = point(at.get(a.b as never)!, R_IN - 4);
        return <line key={`${a.a}-${a.b}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} className={`natal-aspect natal-aspect--${ASPECT_TONE[a.aspect]}`} />;
      })}
      {placed.map((b) => {
        const g = point(b.shown, R_BODY);
        const tick = point(b.longitude, R_SIGN - 14);
        const tick2 = point(b.longitude, R_SIGN - 22);
        return (
          <g key={b.body} className="natal-body" onClick={() => onPick?.(b.body)} role={onPick ? 'button' : undefined} tabIndex={onPick ? 0 : undefined}
            onKeyDown={(event) => { if (onPick && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onPick(b.body); } }}>
            <line x1={tick.x} y1={tick.y} x2={tick2.x} y2={tick2.y} className="natal-tick" />
            <circle cx={g.x} cy={g.y} r={12} className="natal-body-bg" />
            <text x={g.x} y={g.y} textAnchor="middle" dominantBaseline="central" className={b.signUncertain ? 'natal-glyph natal-glyph--uncertain' : 'natal-glyph'}>
              <title>{BODY_NAME[locale][b.body]}</title>
              {BODY_GLYPH[b.body]}
            </text>
          </g>
        );
      })}
      {chart.houses && (() => {
        const p = point(asc, R_OUT + 1);
        return <text x={p.x - 2} y={p.y - 8} className="natal-asc" textAnchor="end">ASC</text>;
      })()}
    </svg>
  );
}
