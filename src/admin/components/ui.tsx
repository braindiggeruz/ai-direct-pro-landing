// Small Tailwind primitives used across the admin (kept light to avoid pulling
// in shadcn into this Vite repo). Match the existing brand palette.
import React from 'react';
import { ArrowDown } from 'lucide-react';

export function Card({ children, className = '', ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`bg-bg-surface border border-white/10 rounded-2xl p-6 ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function Button({
  children, variant = 'primary', size = 'md', className = '', ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg' }) {
  const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base disabled:opacity-50 disabled:cursor-not-allowed';
  const sz = size === 'sm' ? 'px-3 py-1.5 text-sm' : size === 'lg' ? 'px-6 py-3' : 'px-4 py-2 text-sm';
  const v = variant === 'primary' ? 'bg-grad-cta text-bg-base hover:scale-105 shadow-glow'
    : variant === 'secondary' ? 'bg-white/5 border border-white/15 text-white hover:bg-white/10'
    : variant === 'danger' ? 'bg-red-500/15 border border-red-500/40 text-red-300 hover:bg-red-500/25'
    : 'text-white/70 hover:text-white hover:bg-white/5';
  return <button className={`${base} ${sz} ${v} ${className}`} {...rest}>{children}</button>;
}

export function Input({ className = '', ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full bg-bg-base border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-brand-cyan/60 focus-visible:ring-2 focus-visible:ring-brand-cyan/60 disabled:cursor-not-allowed disabled:opacity-55 ${className}`}
      {...rest}
    />
  );
}

export function Textarea({ className = '', ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full bg-bg-base border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-brand-cyan/60 focus-visible:ring-2 focus-visible:ring-brand-cyan/60 disabled:cursor-not-allowed disabled:opacity-55 ${className}`}
      {...rest}
    />
  );
}

export function Select({ className = '', children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full bg-bg-base border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-brand-cyan/60 focus-visible:ring-2 focus-visible:ring-brand-cyan/60 ${className}`}
      {...rest}
    >{children}</select>
  );
}

export function Label({ children, hint, className = '', ...rest }: React.LabelHTMLAttributes<HTMLLabelElement> & { hint?: string }) {
  return (
    <label className={`block text-sm font-medium text-white/80 mb-1.5 ${className}`} {...rest}>
      {children}
      {hint && <span className="text-white/40 font-normal ml-2">{hint}</span>}
    </label>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }) {
  const colors = {
    neutral: 'bg-white/5 text-white/70 border-white/10',
    success: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    warning: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    danger: 'bg-red-500/15 text-red-300 border-red-500/30',
    info: 'bg-brand-blue/15 text-brand-cyan border-brand-blue/30',
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs border ${colors[tone]}`}>{children}</span>;
}

export function ScoreBadge({ score }: { score: number }) {
  const tone = score >= 85 ? 'success' : score >= 65 ? 'info' : score >= 40 ? 'warning' : 'danger';
  return <Badge tone={tone}>{score}/100</Badge>;
}

/**
 * A tile that can also be a shortcut.
 *
 * `onOpen` turns the whole tile into a button that scrolls to the section the
 * number belongs to. A count the operator cannot reach is worse than no count
 * at all — the whole point of "1 заявка" is to get to that one заявка.
 */
export function StatTile({
  label, value, tone = 'neutral', testId, onOpen, hint,
}: {
  label: string;
  value: React.ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  testId?: string;
  onOpen?: () => void;
  hint?: string;
}) {
  const accent = tone === 'success' ? 'border-emerald-500/30' : tone === 'warning' ? 'border-amber-500/30' : tone === 'danger' ? 'border-red-500/30' : tone === 'info' ? 'border-brand-blue/30' : 'border-white/10';
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-xs uppercase tracking-wide text-white/50">{label}</div>
        {onOpen && <ArrowDown size={12} className="text-white/25 shrink-0" />}
      </div>
      <div className="font-display text-3xl text-white mt-1">{value}</div>
      {hint && <div className="text-[11px] text-white/40 mt-1">{hint}</div>}
    </>
  );

  if (!onOpen) {
    return (
      <div data-testid={testId} className={`bg-bg-surface border ${accent} rounded-2xl p-4`}>
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onOpen}
      aria-label={hint ? `${label}: ${hint}` : label}
      className={`w-full text-left bg-bg-surface border ${accent} rounded-2xl p-4 transition-all duration-150 hover:border-brand-cyan/40 hover:bg-white/[0.03] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan/50`}
    >
      {body}
    </button>
  );
}
