import { ArrowUpRight, BookOpen, Languages, PenLine, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PromptChip } from '../i18n';

const icons = [PenLine, Languages, Sparkles, BookOpen];

export function AiPromptChips({ chips, onPick, disabled, label }: {
  chips: PromptChip[]; onPick: (chip: PromptChip) => void; disabled?: boolean; label: string;
}) {
  return (
    <ul className="gpt-prompt-grid" aria-label={label}>
      {chips.slice(0, 4).map((chip, index) => {
        const Icon = icons[index];
        return (
          <li key={chip.id}>
            <Button variant="outline" disabled={disabled} onClick={() => onPick(chip)}
              className="gpt-prompt-card" data-tone={index}>
              <span className="gpt-prompt-icon"><Icon data-icon="inline-start" /></span>
              <span className="gpt-prompt-label">{chip.label}</span>
              <ArrowUpRight data-icon="inline-end" aria-hidden="true" />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}