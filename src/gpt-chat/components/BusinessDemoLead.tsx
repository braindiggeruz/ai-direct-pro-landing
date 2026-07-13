import { useState } from 'react';
import type { Locale } from '../types';
import { sendLead } from '../api';
import { track, EV } from '../analytics';

export function BusinessDemoLead({ locale, apiBase, sessionId }: { locale: Locale; apiBase: string; sessionId: string | null }) {
  const [niche, setNiche] = useState('');
  const [channel, setChannel] = useState('telegram');
  const [automation, setAutomation] = useState('');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const ru = locale === 'ru';
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!niche.trim() || !automation.trim() || !contact.trim() || !consent) { setState('error'); return; }
    setState('sending');
    track(EV.businessDemoStarted, { channel });
    const result = await sendLead(apiBase, {
      name: name.trim() || undefined,
      contactValue: contact.trim(),
      consent,
      sessionId,
      intent: 'business_demo',
      pageUrl: typeof location !== 'undefined' ? location.pathname : undefined,
      utm: { niche: niche.trim().slice(0, 120), channel, automation: automation.trim().slice(0, 400) },
    });
    if (result.ok) { setState('done'); track(EV.businessLeadSubmitted, { channel }); }
    else setState('error');
  };
  if (state === 'done') return <div className="rounded-2xl border border-brand-cyan/30 bg-brand-cyan/[0.06] p-5 text-sm text-white/85" role="status">{ru ? 'Заявка принята. Мы изучим задачу и свяжемся с вами.' : 'Ariza qabul qilindi. Vazifani o‘rganib, siz bilan bog‘lanamiz.'}</div>;
  return (
    <form onSubmit={submit} className="mt-4 rounded-2xl border border-brand-cyan/20 bg-brand-cyan/[0.04] p-4 sm:p-5 space-y-3" data-testid="business-demo-lead">
      <div>
        <span className="text-[11px] uppercase tracking-wider text-brand-cyan">{ru ? 'B2B лидмагнит' : 'B2B taklif'}</span>
        <h3 className="mt-1 text-lg font-semibold text-white">{ru ? 'Получить план внедрения AI-бота' : 'AI-botni joriy etish rejasini olish'}</h3>
        <p className="mt-1 text-xs leading-relaxed text-white/50">{ru ? 'Опишите процесс — без обещаний окупаемости и без передачи секретных данных.' : 'Jarayonni tasvirlang — kafolat va maxfiy ma’lumotsiz.'}</p>
      </div>
      <Field label={ru ? 'Ниша бизнеса' : 'Biznes nishasi'} value={niche} onChange={setNiche} placeholder={ru ? 'Например, учебный центр' : 'Masalan, o‘quv markazi'} required />
      <label className="block text-xs text-white/65">{ru ? 'Где общаетесь с клиентами' : 'Mijozlar qayerda yozadi'}<select value={channel} onChange={(event) => setChannel(event.target.value)} className="mt-1.5 w-full min-h-12 rounded-xl border border-white/12 bg-[#0b101b] px-3 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"><option value="telegram">Telegram</option><option value="instagram">Instagram</option><option value="site">{ru ? 'Сайт' : 'Sayt'}</option><option value="whatsapp">WhatsApp</option><option value="multiple">{ru ? 'Несколько каналов' : 'Bir nechta kanal'}</option></select></label>
      <label className="block text-xs text-white/65">{ru ? 'Что нужно автоматизировать' : 'Nimani avtomatlashtirish kerak'}<textarea value={automation} onChange={(event) => setAutomation(event.target.value.slice(0, 500))} rows={3} required placeholder={ru ? 'Например: ответы на FAQ, запись и передача заявки в CRM' : 'Masalan: FAQ, yozilish va arizani CRMga uzatish'} className="mt-1.5 w-full rounded-xl border border-white/12 bg-[#0b101b] px-3 py-3 text-sm text-white placeholder:text-white/30 outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan resize-y" /></label>
      <div className="grid sm:grid-cols-2 gap-3"><Field label={ru ? 'Имя' : 'Ism'} value={name} onChange={setName} placeholder={ru ? 'Как к вам обращаться' : 'Sizga qanday murojaat qilamiz'} /><Field label={ru ? 'Телефон или Telegram' : 'Telefon yoki Telegram'} value={contact} onChange={setContact} placeholder="+998… / @username" required /></div>
      <label className="flex items-start gap-3 min-h-12 rounded-xl p-2 text-xs text-white/65 cursor-pointer"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 h-5 w-5 accent-cyan-400" /><span>{ru ? 'Согласен на обработку данных для связи по этой заявке' : 'Ushbu ariza bo‘yicha aloqa uchun ma’lumotlarni qayta ishlashga roziman'}</span></label>
      {state === 'error' && <p className="text-xs text-red-300" role="alert">{ru ? 'Заполните обязательные поля и подтвердите согласие.' : 'Majburiy maydonlarni to‘ldiring va rozilikni tasdiqlang.'}</p>}
      <button type="submit" disabled={state === 'sending'} className="btn-primary w-full min-h-12 disabled:opacity-50">{state === 'sending' ? (ru ? 'Отправляем…' : 'Yuborilmoqda…') : (ru ? 'Получить план внедрения' : 'Joriy etish rejasini olish')}</button>
    </form>
  );
}

function Field({ label, value, onChange, placeholder, required }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; required?: boolean }) {
  return <label className="block text-xs text-white/65">{label}<input type="text" value={value} onChange={(event) => onChange(event.target.value.slice(0, 200))} placeholder={placeholder} required={required} className="mt-1.5 w-full min-h-12 rounded-xl border border-white/12 bg-[#0b101b] px-3 text-sm text-white placeholder:text-white/30 outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan" /></label>;
}
