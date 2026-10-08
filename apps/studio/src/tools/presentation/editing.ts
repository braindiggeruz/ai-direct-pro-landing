import type { PresentationResult } from '../../embedded/artifact-store';

/** Commands are local document operations, never an authorization to buy or generate. */
export type PresentationEdit =
  | { kind: 'shorten'; index: number }
  | { kind: 'title'; index: number; title: string }
  | { kind: 'palette'; palette: number }
  | { kind: 'slide'; index: number; title: string; bullets: readonly string[]; notes?: string };

export function presentationTopic(input: string): string {
  if (/^(?:iltimos[,\s]+)?(?:taqdimot|prezentatsiya)(?:ni)?\s+(?:yarat|tayyorla)(?:ib|b)?(?:\s+ber)?[.!]?$/iu.test(input.trim())) return '';
  return input.trim().replace(/^(?:пожалуйста[,\s]+)?(?:создай|сделай|подготовь)\s+(?:мне\s+)?презентаци[юя]\s*(?:на тему|о|об|про)?\s*/iu, '')
    .replace(/\s+(?:taqdimot|prezentatsiya)(?:ni)?\s+(?:yarat|tayyorla)(?:b|ib)?[.!]?$/iu, '')
    .replace(/^(?:taqdimot|prezentatsiya)(?:ni)?\s+(?:yarat|tayyorla)\s*/iu, '').slice(0, 200);
}

/** A closed grammar; unrecognized requests never fall through to the text model. */
export function parsePresentationEdit(text: string, selected: number): PresentationEdit | null {
  const value = text.trim();
  const palette = /^(?:палитра|palitra)\s*([1-3])$/iu.exec(value);
  if (palette) return { kind: 'palette', palette: Number(palette[1]) };
  const short = /^(?:сократи|сократить)\s*(?:(?:слайд\s*)?(\d{1,2})(?:-?[йы]?[йи]?)?\s*(?:слайд)?)?[.!]?$/iu.exec(value)
    ?? /^(?:(\d{1,2})\s*[-.]?\s*)?slayd(?:ni)?\s+qisqartir[.!]?$/iu.exec(value);
  if (short) return { kind: 'shorten', index: short[1] ? Number(short[1]) : selected };
  const title = /^(?:переименуй|назови)\s+(?:слайд\s*)?(\d{1,2})?\s*(?:слайд)?\s*(?:в\s+|:\s*)?[«"]?(.+?)[»"]?$/iu.exec(value);
  if (title) return { kind: 'title', index: title[1] ? Number(title[1]) : selected, title: title[2].trim() };
  return null;
}

const clean = (text: string, max: number) => text.trim().normalize('NFC').replace(/\s+/gu, ' ').slice(0, max);
export function applyPresentationEdit(result: PresentationResult, command: PresentationEdit): PresentationResult | null {
  const revision = (result.revision ?? 0) + 1;
  if (revision > 9999) return null;
  if (command.kind === 'palette') {
    if (result.shape !== 'full' || ![1, 2, 3].includes(command.palette)) return null;
    return { ...result, exportPalette: command.palette, revision };
  }
  if (!Number.isInteger(command.index) || command.index < 0 || command.index > result.deck.slides.length) return null;
  if (command.index === 0) {
    if (command.kind !== 'title' && command.kind !== 'slide') return null;
    const title = clean(command.title, 90);
    return title ? { ...result, revision, deck: { ...result.deck, title } } : null;
  }
  const previous = result.deck.slides[command.index - 1];
  if (command.kind === 'shorten' && previous.bullets.length <= 2) return null;
  const patch = command.kind === 'shorten' ? { ...previous, bullets: previous.bullets.slice(0, 2) }
    : command.kind === 'title' ? { ...previous, title: clean(command.title, 70) }
    : { ...previous, title: clean(command.title, 70), bullets: command.bullets.map(b => clean(b, 110)).filter(Boolean), ...(result.shape === 'full' ? { notes: clean(command.notes ?? '', 600) } : {}) };
  if (!patch.title || patch.bullets.length < 2 || patch.bullets.length > 5) return null;
  return { ...result, revision, deck: { ...result.deck, slides: result.deck.slides.map(s => s.index === command.index ? patch : s) } };
}
