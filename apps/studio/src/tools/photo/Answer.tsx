/** @jsxRuntime automatic @jsxImportSource react */
/**
 * The explanation (spec §8.3): what is given, the steps, the answer and how
 * to check it, the subject and the model's confidence, the «sinov rejimi
 * (beta)» mark and, under everything, «Bu tushuntirish — ko‘chirish uchun
 * emas. Javobni tekshiring.» Formulas are plain Unicode text.
 *
 * The whole block carries `ym-hide-content`: Webvisor records nothing of a
 * child's homework. The heading takes the focus when the answer arrives.
 */
import { useEffect, useRef } from 'react';
import type { PhotoAnswerView } from './api';
import type { PhotoTexts } from './texts';

export interface AnswerProps {
  readonly texts: PhotoTexts;
  readonly answer: PhotoAnswerView;
  readonly source: 'free' | 'entitlement' | 'regen';
  /** The paid unit may be explained once more with the same photo. */
  readonly regenAvailable: boolean;
  readonly regenerating: boolean;
  readonly onRegenerate: () => void;
  readonly onAnother: () => void;
}

const PART = 'st:mt-4 st:text-sm st:font-semibold st:uppercase st:tracking-wide st:text-studio-muted';
const TEXT = 'st:mt-1 st:text-base st:leading-relaxed st:text-studio-text st:whitespace-pre-wrap';
const BUTTON =
  'st:rounded-xl st:px-4 st:py-2.5 st:text-sm st:font-semibold st:focus-visible:outline-2 st:focus-visible:outline-offset-2 st:focus-visible:outline-studio-cyan st:disabled:opacity-60';

export function Answer({ texts, answer, source, regenAvailable, regenerating, onRegenerate, onAnother }: AnswerProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [answer]);
  return (
    <section className="ym-hide-content st:mt-6 st:rounded-2xl st:border st:border-studio-line st:bg-studio-bg st:p-4" data-studio-answer={source} aria-labelledby="studio-photo-result-title">
      <div className="st:flex st:flex-wrap st:items-center st:justify-between st:gap-2">
        <h2 id="studio-photo-result-title" ref={heading} tabIndex={-1} className="st:text-xl st:font-semibold st:text-studio-text st:outline-none">
          {texts.resultTitle}
        </h2>
        <span className="st:rounded-full st:border st:border-studio-saffron/60 st:px-2.5 st:py-0.5 st:text-xs st:font-semibold st:text-studio-saffron" data-studio-beta="">
          {texts.beta}
        </span>
      </div>
      <p className="st:mt-1 st:text-xs st:text-studio-muted">
        {texts.subjects[answer.subject]} · {texts.confidence[answer.confidence]}
      </p>
      <h3 className={PART}>{texts.given}</h3>
      <p className={TEXT}>{answer.given}</p>
      <h3 className={PART}>{texts.solution}</h3>
      <ol className="st:mt-1 st:list-decimal st:space-y-2 st:pl-5 st:text-base st:leading-relaxed st:text-studio-text st:marker:text-studio-cyan">
        {answer.steps.map((step, i) => (
          <li key={i} className="st:whitespace-pre-wrap">
            {step}
          </li>
        ))}
      </ol>
      <h3 className={PART}>{texts.answer}</h3>
      <p className={`${TEXT} st:font-semibold`} data-studio-final="">
        {answer.answer}
      </p>
      <h3 className={PART}>{texts.check}</h3>
      <p className={TEXT}>{answer.check}</p>
      <p className="st:mt-4 st:rounded-lg st:border st:border-studio-saffron/40 st:bg-studio-saffron/10 st:px-3 st:py-2 st:text-sm st:text-studio-text" data-studio-disclaimer="">
        {texts.disclaimer}
      </p>
      <div className="st:mt-4 st:flex st:flex-wrap st:items-center st:gap-3">
        {regenAvailable ? (
          <button type="button" onClick={onRegenerate} disabled={regenerating} data-studio-regenerate="" className={`${BUTTON} st:border st:border-studio-cyan st:text-studio-cyan`}>
            {regenerating ? texts.regenerating : texts.regenerate}
          </button>
        ) : null}
        <button type="button" onClick={onAnother} disabled={regenerating} className={`${BUTTON} st:border st:border-studio-line st:text-studio-muted st:hover:text-studio-text`}>
          {texts.another}
        </button>
        {regenAvailable ? <span className="st:basis-full st:text-xs st:text-studio-muted">{texts.regenNote}</span> : null}
      </div>
    </section>
  );
}
