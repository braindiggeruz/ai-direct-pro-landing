import type { PromptChip } from '../i18n';

// The four tasks of the resting screen, by what people ask (REV-2, map 04
// U-04): a problem to solve first (maths is about 15% of first messages),
// then a text, a topic explained and a plan. Translation is not advertised
// until a blind check scores it 4/5 or better (SEO roadmap 2026-10-04 §5).
// A phone shows them as a 2×2 grid of tiles, all four in sight at 360px; from
// 640px they are one row of chips (chat design §5.2, premium.css).
// The icons are drawn here, one path each: no icon module on the start bundle.
const icons: Record<string, string> = {
  math: 'M18 5H6l6 7-6 7h12',
  text: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  explain: 'M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4zm16 0h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z',
  plan: 'M3 3h18v13H3zM12 16v5m-4 0h8M7 8h10M7 11h6',
};

// An AI tool page brings its own chips (Page.chatStarters, up to six, ids
// starter-N): no icons, its labels whole, one scrolling row on a phone and
// centred rows from 640px (.gpt-starters: scripts/tool-widgets.ts
// STARTERS_STYLE, in the head of a page with chips). They fill the composer
// the same way; none of them is the presentation tile.

export function AiPromptChips({ chips, onPick, disabled, label, presentation, own }: {
  chips: PromptChip[]; onPick: (chip: PromptChip) => void; disabled?: boolean; label: string;
  presentation?: { label: string; onOpen: () => void; disabled: boolean };
  /** `chips` are the page's own (Page.chatStarters). */
  own?: boolean;
}) {
  return (
    <ul className={own ? 'gpt-tasks gpt-starters' : 'gpt-tasks'} aria-label={label}>
      {chips.slice(0, own ? 6 : 4).map((chip) => {
        const tool = chip.id === 'plan' ? presentation : undefined;
        return (
        <li key={chip.id}>
          {/* Fills the composer and never sends: a task is a start, not a message. */}
          <button type="button" disabled={tool ? tool.disabled : disabled} onClick={() => tool ? tool.onOpen() : onPick(chip)} className="gpt-task" data-chat-presentation-open={tool ? '' : undefined}>
            {!own && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icons[chip.id]} /></svg>}
            <span>{tool ? tool.label : chip.label}</span>
          </button>
        </li>
        );
      })}
    </ul>
  );
}
