// Small Tailwind primitives used across the admin (kept light to avoid pulling
// in shadcn into this Vite repo). Match the existing brand palette.
import React from 'react';

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
  const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed';
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
      className={`w-full bg-bg-base border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-brand-cyan/60 ${className}`}
      {...rest}
    />
  );
}

export function Textarea({ className = '', ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full bg-bg-base border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-brand-cyan/60 ${className}`}
      {...rest}
    />
  );
}

export function Select({ className = '', children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full bg-bg-base border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-brand-cyan/60 ${className}`}
      {...rest}
    >{children}</select>
  );
}

export function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <label className="block text-sm font-medium text-white/80 mb-1.5">
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

export function StatTile({ label, value, tone = 'neutral', testId }: { label: string; value: React.ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'; testId?: string }) {
  const accent = tone === 'success' ? 'border-emerald-500/30' : tone === 'warning' ? 'border-amber-500/30' : tone === 'danger' ? 'border-red-500/30' : tone === 'info' ? 'border-brand-blue/30' : 'border-white/10';
  return (
    <div data-testid={testId} className={`bg-bg-surface border ${accent} rounded-2xl p-4`}>
      <div className="text-xs uppercase tracking-wide text-white/50">{label}</div>
      <div className="font-display text-3xl text-white mt-1">{value}</div>
    </div>
  );
}
