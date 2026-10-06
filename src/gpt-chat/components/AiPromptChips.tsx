import type { PromptChip } from '../i18n';

// The four starters of the resting screen, by what people ask (REV-2, map 04
// U-04): a problem to solve first (maths is about 15% of first messages),
// then a text, a topic explained and a plan. Translation is not advertised
// until a blind check scores it 4/5 or better (SEO roadmap 2026-10-04 §5).
// The icons are drawn here, one path each: no icon module on the start bundle.
const icons: Record<string, string> = {
  math: 'M18 5H6l6 7-6 7h12',
  text: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  explain: 'M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4zm16 0h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z',
  plan: 'M4 6l1.5 1.5L8 5m3 1.5h9M4 12l1.5 1.5L8 11m3 1.5h9M4 18l1.5 1.5L8 17m3 1.5h9',
};

export function AiPromptChips({ chips, onPick, disabled, label }: {
  chips: PromptChip[]; onPick: (chip: PromptChip) => void; disabled?: boolean; label: string;
}) {
  return (
    <ul className="gpt-prompt-grid" aria-label={label}>
      {chips.slice(0, 4).map((chip, index) => (
        <li key={chip.id}>
          {/* Fills the composer and never sends: a chip is a start, not a message. */}
          <button type="button" disabled={disabled} onClick={() => onPick(chip)} className="gpt-prompt-card" data-tone={index}>
            <span className="gpt-prompt-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={icons[chip.id]} /></svg>
            </span>
            <span className="gpt-prompt-label">{chip.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
