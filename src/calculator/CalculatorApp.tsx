import { useMemo, useState, type FormEvent } from 'react';
import { track } from '../lib/cta';
import { reachYandexGoal, YANDEX_GOALS } from '../lib/analytics/yandexMetrika';
import {
  buildEstimateSummary,
  calculateEstimate,
  CONTENT_READINESS,
  DEFAULT_SELECTION,
  FEATURES,
  formatSum,
  GOALS,
  VOLUMES,
  type CalculatorSelection,
  type FeatureId,
} from './pricing';

const TELEGRAM_URL = 'https://t.me/XGame_changerx';

function safeUtm(): Record<string, string> {
  const params = new URLSearchParams(window.location.search);
  const result: Record<string, string> = { tool: 'telegram_cost_calculator' };
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    const value = params.get(key);
    if (value) result[key] = value.slice(0, 120);
  }
  return result;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const input = document.createElement('textarea');
    input.value = text;
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand('copy');
    input.remove();
    return copied;
  }
}

function ChoiceCard({
  checked,
  name,
  value,
  title,
  description,
  onChange,
}: {
  checked: boolean;
  name: string;
  value: string;
  title: string;
  description: string;
  onChange: () => void;
}) {
  return (
    <label className={`block cursor-pointer rounded-2xl border p-4 transition-colors focus-within:ring-2 focus-within:ring-brand-cyan focus-within:ring-offset-2 focus-within:ring-offset-[#05070D] ${
      checked
        ? 'border-brand-cyan/70 bg-brand-cyan/[0.09]'
        : 'border-white/10 bg-white/[0.025] hover:border-white/25'
    }`}>
      <input className="sr-only" type="radio" name={name} value={value} checked={checked} onChange={onChange} />
      <span className="flex items-start gap-3">
        <span aria-hidden="true" className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
          checked ? 'border-brand-cyan bg-brand-cyan text-[#04101A]' : 'border-white/30'
        }`}>{checked ? '✓' : ''}</span>
        <span>
          <span className="block text-base font-semibold text-white">{title}</span>
          <span className="mt-1 block text-sm leading-relaxed text-white/60">{description}</span>
        </span>
      </span>
    </label>
  );
}

export default function CalculatorApp() {
  const [step, setStep] = useState(0);
  const [selection, setSelection] = useState<CalculatorSelection>(DEFAULT_SELECTION);
  const [showResult, setShowResult] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [consent, setConsent] = useState(false);
  const [formStatus, setFormStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const result = useMemo(() => calculateEstimate(selection), [selection]);
  const summary = useMemo(() => buildEstimateSummary(result), [result]);

  const toggleFeature = (id: FeatureId) => {
    setSelection((current) => ({
      ...current,
      featureIds: current.featureIds.includes(id)
        ? current.featureIds.filter((item) => item !== id)
        : [...current.featureIds, id],
    }));
  };

  const next = () => {
    if (step < 2) {
      setStep((value) => value + 1);
      return;
    }
    setShowResult(true);
    track('calculator_completed', {
      goal: selection.goalId,
      feature_count: selection.featureIds.length,
      volume: selection.volumeId,
    });
    requestAnimationFrame(() => document.getElementById('calculator-result')?.focus());
  };

  const copySummary = async () => {
    const copied = await copyText(summary);
    setCopyStatus(copied ? 'Расчёт скопирован' : 'Не удалось скопировать');
    track('calculator_copy', { goal: selection.goalId });
  };

  const submitLead = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!contact.trim() || !consent) {
      setFormStatus('error');
      return;
    }
    setFormStatus('sending');
    try {
      const response = await fetch('/api/gpt/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || undefined,
          contactType: 'calculator_contact',
          contactValue: contact.trim(),
          consent: true,
          intent: summary.slice(0, 500),
          pageUrl: window.location.pathname,
          utm: {
            ...safeUtm(),
            goal: selection.goalId,
            features: selection.featureIds.join(','),
            volume: selection.volumeId,
            readiness: selection.readinessId,
            estimate_min: String(result.implementationMin),
            estimate_max: String(result.implementationMax),
          },
        }),
      });
      const body = await response.json() as { ok?: boolean };
      if (!body.ok) throw new Error('lead rejected');
      setFormStatus('success');
      track('calculator_lead_submitted', {
        goal: selection.goalId,
        feature_count: selection.featureIds.length,
      });
      // Only after the server accepted the lead — a submit click is not a lead.
      // The goal carries a name and no parameters, so nothing typed above it
      // can reach Metrika.
      reachYandexGoal(YANDEX_GOALS.leadFormSubmitSuccess);
    } catch {
      setFormStatus('error');
    }
  };

  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#09111f]/95 shadow-2xl shadow-brand-cyan/5">
      <div className="border-b border-white/10 px-5 py-5 sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-cyan">Telegram Bot Estimate</p>
            <p className="mt-1 text-sm text-white/55">Шаг {step + 1} из 3</p>
          </div>
          <p className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/65">Без регистрации</p>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
          <div className="h-full rounded-full bg-grad-cta transition-[width] duration-300" style={{ width: `${((step + 1) / 3) * 100}%` }} />
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]">
        <div className="px-5 py-6 sm:px-7 sm:py-8">
          {step === 0 && (
            <fieldset>
              <legend className="font-display text-2xl text-white">Что должен делать бот?</legend>
              <p className="mt-2 text-sm leading-relaxed text-white/60">Выберите основной результат первого релиза. Дополнительные функции добавим на следующем шаге.</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {GOALS.map((goal) => (
                  <ChoiceCard
                    key={goal.id}
                    checked={selection.goalId === goal.id}
                    name="goal"
                    value={goal.id}
                    title={goal.label}
                    description={goal.description}
                    onChange={() => setSelection((current) => ({ ...current, goalId: goal.id }))}
                  />
                ))}
              </div>
            </fieldset>
          )}

          {step === 1 && (
            <fieldset>
              <legend className="font-display text-2xl text-white">Какие модули нужны?</legend>
              <p className="mt-2 text-sm leading-relaxed text-white/60">Можно выбрать несколько. Если пока не уверены — пропустите: на брифе проверим необходимость каждого модуля.</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {FEATURES.map((feature) => {
                  const checked = selection.featureIds.includes(feature.id);
                  return (
                    <label key={feature.id} className={`block cursor-pointer rounded-2xl border p-4 transition-colors focus-within:ring-2 focus-within:ring-brand-cyan focus-within:ring-offset-2 focus-within:ring-offset-[#05070D] ${
                      checked
                        ? 'border-brand-violet/70 bg-brand-violet/[0.10]'
                        : 'border-white/10 bg-white/[0.025] hover:border-white/25'
                    }`}>
                      <input className="sr-only" type="checkbox" checked={checked} onChange={() => toggleFeature(feature.id)} />
                      <span className="flex items-start gap-3">
                        <span aria-hidden="true" className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
                          checked ? 'border-[#a78bfa] bg-[#8b5cf6] text-white' : 'border-white/30'
                        }`}>{checked ? '✓' : ''}</span>
                        <span>
                          <span className="block text-base font-semibold text-white">{feature.label}</span>
                          <span className="mt-1 block text-sm leading-relaxed text-white/60">{feature.description}</span>
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          {step === 2 && (
            <div className="space-y-8">
              <fieldset>
                <legend className="font-display text-2xl text-white">Ожидаемая нагрузка</legend>
                <div className="mt-5 grid gap-3">
                  {VOLUMES.map((volume) => (
                    <ChoiceCard
                      key={volume.id}
                      checked={selection.volumeId === volume.id}
                      name="volume"
                      value={volume.id}
                      title={volume.label}
                      description={volume.description}
                      onChange={() => setSelection((current) => ({ ...current, volumeId: volume.id }))}
                    />
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="font-display text-xl text-white">Насколько готовы материалы?</legend>
                <div className="mt-5 grid gap-3">
                  {CONTENT_READINESS.map((readiness) => (
                    <ChoiceCard
                      key={readiness.id}
                      checked={selection.readinessId === readiness.id}
                      name="readiness"
                      value={readiness.id}
                      title={readiness.label}
                      description={readiness.description}
                      onChange={() => setSelection((current) => ({ ...current, readinessId: readiness.id }))}
                    />
                  ))}
                </div>
              </fieldset>
            </div>
          )}

          <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <button
              type="button"
              onClick={() => setStep((value) => Math.max(0, value - 1))}
              disabled={step === 0}
              className="min-h-12 rounded-2xl border border-white/10 px-6 py-3 font-medium text-white transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Назад
            </button>
            <button type="button" onClick={next} className="btn-primary min-h-12 text-base">
              {step === 2 ? 'Показать расчёт' : 'Продолжить'}
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>

        <aside className="border-t border-white/10 bg-white/[0.025] px-5 py-6 sm:px-7 lg:border-l lg:border-t-0" aria-label="Текущий ориентир">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">Ориентир сейчас</p>
          <p className="mt-4 text-2xl font-bold text-white">
            {formatSum(result.implementationMin)}–{formatSum(result.implementationMax)}
            <span className="ml-1 text-base font-medium text-white/55">сум</span>
          </p>
          <p className="mt-2 text-sm text-white/60">{result.daysMin}–{result.daysMax} рабочих дней</p>
          <div className="my-5 h-px bg-white/10" />
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="text-white/45">Основная задача</dt>
              <dd className="mt-1 font-medium text-white/85">{result.goalLabel}</dd>
            </div>
            <div>
              <dt className="text-white/45">Дополнительные модули</dt>
              <dd className="mt-1 font-medium text-white/85">{result.featureLabels.length || 0}</dd>
            </div>
            <div>
              <dt className="text-white/45">Инфраструктура</dt>
              <dd className="mt-1 font-medium text-white/85">{formatSum(result.monthlyMin)}–{formatSum(result.monthlyMax)} сум/мес.</dd>
            </div>
          </dl>
          <p className="mt-6 rounded-xl border border-brand-cyan/15 bg-brand-cyan/[0.04] p-3 text-xs leading-relaxed text-white/55">
            Это предварительная оценка GPTBot.uz, а не публичная оферта. После брифа фиксируем состав, цену и срок.
          </p>
        </aside>
      </div>

      {showResult && (
        <section id="calculator-result" tabIndex={-1} className="border-t border-brand-cyan/20 bg-gradient-to-br from-brand-cyan/[0.07] to-brand-violet/[0.07] px-5 py-7 outline-none sm:px-7 sm:py-9" aria-live="polite">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(300px,.8fr)]">
            <div>
              <p className="text-sm font-semibold text-brand-cyan">Расчёт готов</p>
              <h3 className="mt-2 font-display text-3xl text-white">От {formatSum(result.implementationMin)} до {formatSum(result.implementationMax)} сум</h3>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/65">
                Ориентировочный срок — {result.daysMin}–{result.daysMax} рабочих дней. Поддержка инфраструктуры и внешние API считаются отдельно: сейчас ориентир {formatSum(result.monthlyMin)}–{formatSum(result.monthlyMax)} сум в месяц.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <button type="button" onClick={copySummary} className="min-h-12 rounded-2xl border border-white/15 px-5 py-3 font-semibold text-white transition-colors hover:border-brand-cyan/50 hover:bg-white/[0.05]">
                  Скопировать мини-ТЗ
                </button>
                <a
                  href={TELEGRAM_URL}
                  target="_blank"
                  rel="nofollow noopener noreferrer"
                  onClick={() => { void copyText(summary); track('calculator_telegram_click', { goal: selection.goalId }); }}
                  className="btn-primary min-h-12 text-center"
                >
                  Скопировать и открыть Telegram
                </a>
              </div>
              <p className="mt-3 min-h-5 text-sm text-brand-cyan" role="status">{copyStatus}</p>
            </div>

            {/* ym-disable-submit: the contact form's values must stay out of
                Metrika Form Analysis. The success goal is reported separately
                from submitLead, after the server confirms. */}
            <form onSubmit={submitLead} className="rounded-2xl border border-white/10 bg-[#07101d]/80 p-5 ym-disable-submit" noValidate>
              <h3 className="font-display text-xl text-white">Получить точную смету</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/55">Оставьте контакт — расчёт и выбранные параметры сохранятся вместе с заявкой.</p>
              {formStatus === 'success' ? (
                <div className="mt-5 rounded-xl border border-emerald-300/25 bg-emerald-300/[0.07] p-4 text-sm leading-relaxed text-emerald-100" role="status">
                  Заявка принята. Мы свяжемся с вами и уточним только то, что влияет на цену.
                </div>
              ) : (
                <>
                  <label className="mt-5 block text-sm font-medium text-white/80" htmlFor="calculator-name">Имя <span className="text-white/40">(необязательно)</span></label>
                  <input
                    id="calculator-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    // ym-disable-keys: a visitor's name is never recorded.
                    className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-base text-white outline-none placeholder:text-white/30 focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/30 ym-disable-keys"
                    placeholder="Как к вам обращаться"
                    maxLength={120}
                  />
                  <label className="mt-4 block text-sm font-medium text-white/80" htmlFor="calculator-contact">Телефон или Telegram <span aria-hidden="true" className="text-rose-300">*</span></label>
                  <input
                    id="calculator-contact"
                    value={contact}
                    onChange={(event) => { setContact(event.target.value); if (formStatus === 'error') setFormStatus('idle'); }}
                    autoComplete="tel"
                    // ym-disable-keys: phone / Telegram handle is never recorded.
                    className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-base text-white outline-none placeholder:text-white/30 focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/30 ym-disable-keys"
                    placeholder="+998… или @username"
                    maxLength={200}
                    aria-required="true"
                    aria-invalid={formStatus === 'error' && !contact.trim()}
                  />
                  <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-white/60">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(event) => { setConsent(event.target.checked); if (formStatus === 'error') setFormStatus('idle'); }}
                      className="mt-0.5 h-5 w-5 shrink-0 accent-[#2FE6D1]"
                    />
                    <span>Согласен на обработку данных для связи по расчёту. <a href="/ru/politika-konfidentsialnosti/" className="text-brand-cyan hover:underline">Политика конфиденциальности</a>.</span>
                  </label>
                  {formStatus === 'error' && (
                    <p className="mt-3 text-sm text-rose-200" role="alert">Укажите контакт и подтвердите согласие. Если форма недоступна, напишите нам в Telegram.</p>
                  )}
                  <button type="submit" disabled={formStatus === 'sending'} className="btn-primary mt-5 min-h-12 w-full text-base disabled:cursor-wait disabled:opacity-60">
                    {formStatus === 'sending' ? 'Отправляем…' : 'Отправить расчёт'}
                  </button>
                </>
              )}
            </form>
          </div>
        </section>
      )}
    </div>
  );
}
