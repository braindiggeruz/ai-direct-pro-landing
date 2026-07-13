import type { Locale } from '../types';
import { getRoles, type RoleId } from '../roles';

export function RoleSelector({ locale, value, onChange, disabled }: { locale: Locale; value: RoleId; onChange: (role: RoleId) => void; disabled?: boolean }) {
  const roles = getRoles(locale);
  const selected = roles.find((role) => role.id === value) ?? roles[0];
  const label = locale === 'uz' ? 'AI roli' : 'Роль AI';
  return (
    <label className="block min-w-0 flex-1">
      <span className="block text-[11px] uppercase tracking-wider text-white/45 mb-1.5">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as RoleId)}
        disabled={disabled}
        className="w-full min-h-12 rounded-xl border border-white/12 bg-[#0b101b] px-3 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan disabled:opacity-50"
        aria-describedby="ai-role-description"
      >
        {roles.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}
      </select>
      <span id="ai-role-description" className="block mt-1.5 text-[11px] leading-snug text-white/40">{selected.description}</span>
    </label>
  );
}
