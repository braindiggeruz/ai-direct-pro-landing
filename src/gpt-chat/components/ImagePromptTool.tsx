import { useState } from 'react';
import type { Locale } from '../types';
import { IMAGE_PRESETS, buildImagePromptRequest } from '../templates';

export function ImagePromptTool({ locale, onGenerate, disabled }: { locale: Locale; onGenerate: (prompt: string, presetId: string) => void; disabled?: boolean }) {
  const [description, setDescription] = useState('');
  const [preset, setPreset] = useState(IMAGE_PRESETS[0].id);
  const [showError, setShowError] = useState(false);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!description.trim()) { setShowError(true); return; }
    setShowError(false);
    onGenerate(buildImagePromptRequest(description, preset, locale), preset);
  };
  return (
    <form onSubmit={submit} className="rounded-2xl border border-brand-violet/25 bg-brand-violet/[0.05] p-4 sm:p-5">
      <span className="inline-flex rounded-full border border-brand-violet/35 px-2.5 py-1 text-[11px] text-brand-violet/95">{locale === 'uz' ? 'Prompt generator' : 'Генератор промтов'}</span>
      <h3 className="mt-3 text-lg font-semibold text-white">{locale === 'uz' ? 'Tasvir uchun professional prompt yarating' : 'Создайте профессиональный промт для изображения'}</h3>
      <p className="mt-1 text-sm leading-relaxed text-white/60">{locale === 'uz' ? 'AI tavsifingizni boshqa tasvir generatorida ishlatish mumkin bo‘lgan aniq promptga aylantiradi.' : 'AI превратит описание в точный промт, который можно скопировать в генератор изображений.'}</p>
      <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.05] px-3 py-2 text-xs leading-relaxed text-amber-100/80" role="note">{locale === 'uz' ? 'Haqiqiy tasvir generatsiyasi hali ishga tushmagan.' : 'Реальная генерация изображений ещё не запущена.'}</div>
      <label className="block mt-4 text-xs text-white/65">
        {locale === 'uz' ? 'Format' : 'Формат'}
        <select value={preset} onChange={(event) => setPreset(event.target.value)} className="mt-1.5 w-full min-h-12 rounded-xl border border-white/12 bg-[#0b101b] px-3 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan">
          {IMAGE_PRESETS.map((item) => <option key={item.id} value={item.id}>{item.label[locale]} · {item.ratio}</option>)}
        </select>
      </label>
      <label className="block mt-3 text-xs text-white/65">
        {locale === 'uz' ? 'Tasvir g‘oyasi' : 'Опишите идею'}
        <textarea value={description} onChange={(event) => setDescription(event.target.value.slice(0, 800))} rows={3} placeholder={locale === 'uz' ? 'Masalan: Toshkentdagi qahvaxona uchun yozgi aksiya…' : 'Например: летняя акция кофейни в Ташкенте…'} className="mt-1.5 w-full rounded-xl border border-white/12 bg-[#0b101b] px-3 py-3 text-sm text-white placeholder:text-white/30 outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan resize-y" />
      </label>
      {showError && <p className="mt-2 text-xs text-red-300" role="alert">{locale === 'uz' ? 'Avval tasvir g‘oyasini yozing.' : 'Сначала опишите идею изображения.'}</p>}
      <button type="submit" disabled={disabled} className="mt-4 btn-primary w-full sm:w-auto min-h-12 disabled:opacity-50">{locale === 'uz' ? 'Tasvir promptini yaratish' : 'Создать промт для изображения'}</button>
    </form>
  );
}
