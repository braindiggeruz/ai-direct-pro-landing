// Compact tri-state status badge used by AI Draft Detail / Blog Editor /
// Topic Plan rows. Colour-blind safe: each state carries an icon AND a
// distinct background tone.

import type { JSX } from 'react';
import { CircleCheck as CheckCircle2, TriangleAlert as AlertTriangle, ShieldAlert, Circle as HelpCircle } from 'lucide-react';
import type { IntentRiskLevel } from '../../shared/intent-guard';

type Tone = 'unknown' | IntentRiskLevel;

interface Props {
  level: Tone;
  score?: number | null;
  testId?: string;
  className?: string;
  size?: 'sm' | 'md';
}

const STYLE: Record<Tone, { wrap: string; icon: JSX.Element; text: string }> = {
  unknown: {
    wrap: 'bg-white/5 border-white/10 text-white/60',
    icon: <HelpCircle size={12}/>,
    text: 'нет анализа',
  },
  low: {
    wrap: 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200',
    icon: <CheckCircle2 size={12}/>,
    text: 'низкий',
  },
  medium: {
    wrap: 'bg-amber-500/10 border-amber-500/40 text-amber-200',
    icon: <AlertTriangle size={12}/>,
    text: 'средний',
  },
  high: {
    wrap: 'bg-red-500/10 border-red-500/40 text-red-200',
    icon: <ShieldAlert size={12}/>,
    text: 'высокий',
  },
};

export function IntentGuardBadge({ level, score, testId, className, size = 'sm' }: Props) {
  const style = STYLE[level];
  const padding = size === 'md' ? 'px-3 py-1.5 text-sm' : 'px-2 py-1 text-xs';
  return (
    <span
      data-testid={testId || `intent-guard-badge-${level}`}
      className={`inline-flex items-center gap-1.5 rounded-full border ${style.wrap} ${padding} ${className || ''}`}
      role="status"
      aria-label={`Intent Guard: риск ${style.text}${typeof score === 'number' ? `, оценка ${score}` : ''}`}
    >
      {style.icon}
      <span className="font-medium">{style.text}</span>
      {typeof score === 'number' && (
        <span className="text-white/70" data-testid={`intent-guard-score-${level}`}>· {score}</span>
      )}
    </span>
  );
}
