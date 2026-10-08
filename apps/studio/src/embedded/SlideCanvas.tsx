/** @jsxRuntime automatic @jsxImportSource react */
import type { CSSProperties } from 'react';
import type { PresentationResult } from './artifact-store';
import type { PictureState } from '../tools/presentation/Preview';
import { AI_LABEL, FONT_FACE, planSlides } from '../pptx/build';
import { LAYOUTS, SLIDE, type Frame } from '../pptx/layouts';
import { paletteFor } from '../pptx/palettes';
import { fitTitle } from '../pptx/fit';

/** Export geometry and font fitting, rendered as accessible SVG text. Readable text accompanies it. */
export function SlideCanvas({ result, index, pictures, locale }: { result: PresentationResult; index: number; pictures: ReadonlyMap<number, PictureState>; locale: 'ru' | 'uz' }) {
  const p = paletteFor(result.exportPalette ?? result.task.palette);
  const cover = index === 0;
  const label = index > result.deck.slides.length;
  const title = cover ? result.deck.title : label ? AI_LABEL[locale] : result.deck.slides[index - 1]?.title ?? '';
  const unit = 72;
  const frame = (box: Frame) => ({ x: box.x * unit, y: box.y * unit, width: box.w * unit, height: box.h * unit });
  const words = (text: string, size: number, width: number) => {
    const lines: string[] = []; let line = '';
    for (const word of text.split(/\s+/u)) {
      if (line && (line.length + word.length + 1) * size * .53 > width) { lines.push(line); line = word; }
      else line += (line ? ' ' : '') + word;
    }
    if (line) lines.push(line);
    return lines;
  };
  const text = (value: string, box: Frame, size: number, color: string, bold = false, centered = false) => {
    const lines = words(value, size, box.w * unit);
    return <text x={(box.x + (centered ? box.w / 2 : 0)) * unit} y={box.y * unit + size} fontSize={size} fill={'#' + color} fontWeight={bold ? 700 : 400} textAnchor={centered ? 'middle' : 'start'}>
      {lines.map((line, i) => <tspan key={i} x={(box.x + (centered ? box.w / 2 : 0)) * unit} dy={i ? size * 1.15 : 0}>{line}</tspan>)}
    </text>;
  };
  const ready = new Map([...pictures].filter(([,v]) => v.status === 'ready').map(([i,v]) => [i, v.status === 'ready' ? v.url : '']));
  const planned = !cover && !label ? planSlides(result.deck, ready)[index - 1] : null;
  const geometry = planned ? LAYOUTS[planned.layout] : null;
  const style: CSSProperties = { backgroundColor: '#' + p.background, fontFamily: FONT_FACE };
  return <svg className="gpt-slide-canvas" viewBox={`0 0 ${SLIDE.w * unit} ${SLIDE.h * unit}`} style={style} role="img" aria-label={title}>
    <title>{title}</title>
    {cover ? <>
      {text(result.deck.title, { x: .8, y: 1.35, w: 8.4, h: 1.75 }, fitTitle(result.deck.title, { w: 8.4, h: 1.75 }, 2, { max: 40, min: 24 }).size, p.title, true, true)}
      <rect x={4.4 * unit} y={3.25 * unit} width={1.2 * unit} height={.07 * unit} fill={'#' + p.accent}/>
      {text(result.deck.subtitle, { x: .8, y: 3.45, w: 8.4, h: 1 }, fitTitle(result.deck.subtitle, { w: 8.4, h: 1 }, 2, { max: 22, min: 14 }).size, p.text, false, true)}
    </> : label ? <>{text(AI_LABEL[locale], { x: .8, y: 1.9, w: 8.4, h: 1 }, 28, p.title, true, true)}{text('gptbot.uz', { x: .8, y: 2.95, w: 8.4, h: .6 }, 16, p.muted, false, true)}</> : planned && geometry ? <>
      {planned.picture && geometry.picture && <image href={planned.picture} {...frame(geometry.picture)} preserveAspectRatio="xMidYMid slice"/>}
      {geometry.panel && <rect {...frame(geometry.panel)} fill={'#' + p.panel} fillOpacity={.94}/>}
      {text(planned.slide.title, geometry.title, planned.titleSize, geometry.panel ? p.panelText : p.title, true)}
      <rect {...frame(geometry.rule)} fill={'#' + p.accent}/>
      {planned.columns.map((column, i) => {
        const box = geometry.body[i]; let offset = 0;
        return <g key={i}>{column.bullets.map((bullet, at) => {
          const height = words(bullet, column.size, box.w * unit - 16).length * column.size * 1.15 + column.size * .35;
          const y = box.y + offset / unit; offset += height;
          return <g key={at}><circle cx={box.x * unit + 3} cy={y * unit + column.size * .7} r={2.5} fill={'#' + (geometry.panel ? p.panelText : p.text)}/>{text(bullet, { ...box, x: box.x + .2, y, w: box.w - .2 }, column.size, geometry.panel ? p.panelText : p.text)}</g>;
        })}</g>;
      })}
    </> : null}
  </svg>;
}
