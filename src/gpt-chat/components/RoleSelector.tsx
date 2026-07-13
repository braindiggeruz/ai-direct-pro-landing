import { useEffect, useId, useRef, useState } from 'react';
import type { Locale } from '../types';
import { getRoles, type RoleId } from '../roles';

export function RoleSelector({ locale, value, onChange, disabled }: { locale: Locale; value: RoleId; onChange: (role: RoleId) => void; disabled?: boolean }) {
  const roles = getRoles(locale);
  const selectedIndex = Math.max(0, roles.findIndex((role) => role.id === value));
  const selected = roles[selectedIndex];
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();
  const descriptionId = useId();
  const label = locale === 'uz' ? 'AI roli' : 'Роль AI';

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  const choose = (index: number) => {
    onChange(roles[index].id);
    setOpen(false);
    buttonRef.current?.focus();
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    if (event.key === 'Escape') {
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => {
        if (event.key === 'Home') return 0;
        if (event.key === 'End') return roles.length - 1;
        return (current + (event.key === 'ArrowDown' ? 1 : -1) + roles.length) % roles.length;
      });
    } else if (open && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      choose(activeIndex);
    }
  };

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1" onKeyDown={onKeyDown}>
      <span className="block text-[11px] uppercase tracking-wider text-white/55 mb-1.5">{label}</span>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        disabled={disabled}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open ? `${listboxId}-${roles[activeIndex].id}` : undefined}
        aria-describedby={descriptionId}
        onClick={() => { setActiveIndex(selectedIndex); setOpen((current) => !current); }}
        className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-white/12 bg-[#0b101b] px-3 text-left text-sm text-white transition-colors hover:border-brand-cyan/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan disabled:opacity-50"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-brand-cyan/25 bg-brand-cyan/[0.08] text-brand-cyan" aria-hidden="true">✦</span>
        <span className="min-w-0 flex-1 truncate font-medium">{selected.label}</span>
        <svg className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      <span id={descriptionId} className="block mt-1.5 text-xs leading-snug text-white/55">{selected.description}</span>
      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={label}
          tabIndex={-1}
          className="absolute left-0 right-0 top-[76px] z-30 max-h-72 overflow-y-auto rounded-2xl border border-white/15 bg-[#0b101b] p-1.5 shadow-2xl shadow-black/60"
        >
          {roles.map((role, index) => {
            const isSelected = role.id === value;
            const isActive = index === activeIndex;
            return (
              <button
                id={`${listboxId}-${role.id}`}
                key={role.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onPointerMove={() => setActiveIndex(index)}
                onClick={() => choose(index)}
                className={`flex min-h-12 w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left focus-visible:outline-none ${isActive ? 'bg-white/[0.07]' : ''} ${isSelected ? 'text-brand-cyan' : 'text-white/85'}`}
              >
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{role.label}</span><span className="mt-0.5 block text-xs leading-snug text-white/50">{role.description}</span></span>
                {isSelected && <span aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
