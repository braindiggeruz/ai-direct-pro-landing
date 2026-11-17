// What the chat adds under an answer and beside the composer to bring a
// visitor to the next question (chat CRO 2026-11-17), in the lazy part
// chat-answer: follow-up chips that send at once, two rating buttons, and the
// trial's counter. None of it is on the start bundle. The rating sends one
// closed qualifier, the verdict and the page's role, to the server's counter
// (ui-events.ts): no text of the answer or of the question.
import { useState, type ComponentProps } from 'react';
import { MessageActions } from '../components/AiAnswer';
import { chatRolePreset, type ChatRolePreset } from '../../shared/types';
import type { Locale } from '../types';
import { recordUiEvent } from '../ui-events';
// The part's own styles come with it, as a separate request that fails quietly (the chips are usable unstyled).
void import('./cro.css').catch(() => undefined);

type Chip = readonly [label: string, text: string];

const GENERAL: Record<Locale, readonly Chip[]> = {
  uz: [['Qisqaroq yoz', 'Buni qisqaroq yoz'], ['Boshqa variant', 'Boshqa variant yoz'], ['Batafsilroq', 'Batafsilroq tushuntir']],
  ru: [['Короче', 'Сделай короче'], ['Другой вариант', 'Напиши другой вариант'], ['Подробнее', 'Расскажи подробнее']],
};
const BY_ROLE: Record<Locale, Partial<Record<ChatRolePreset, readonly Chip[]>>> = {
  uz: {
    writer: [['Qisqaroq yoz', 'Buni qisqaroq yoz'], ['Boshqa variant', 'Boshqa variant yoz'], ['Kirill yozuvida', 'Buni kirill yozuvida yoz']],
    teacher: [['Soddaroq tushuntir', 'Buni soddaroq tushuntir'], ['Misol keltir', 'Yana bitta misol keltir'], ['Mashq ber', 'Shu mavzuda bitta mashq ber']],
    translator: [['Rasmiyroq qil', 'Tarjimani rasmiyroq qil'], ['Boshqa variant', 'Tarjimaning boshqa variantini yoz'], ['Kirill yozuvida', 'Tarjimani kirill yozuvida yoz']],
    smm: [['Qisqaroq yoz', 'Postni qisqaroq yoz'], ['Boshqa variant', 'Postning boshqa variantini yoz'], ['Ruscha variant', 'Shu postning ruscha variantini yoz']],
  },
  ru: {
    teacher: [['Проще', 'Объясни проще'], ['Ещё пример', 'Приведи ещё один пример'], ['Дай задачу', 'Дай задачу по этой теме']],
    translator: [['Официальнее', 'Сделай перевод официальнее'], ['Другой вариант', 'Дай другой вариант перевода'], ['Кириллицей', 'Запиши перевод кириллицей']],
    smm: [['Короче', 'Сделай пост короче'], ['Другой вариант', 'Напиши другой вариант поста'], ['На узбекском', 'Напиши этот пост на узбекском латиницей']],
  },
};

const TEXT = {
  uz: { next: 'Davom ettirish', ask: 'Javob foydali bo‘ldimi?', up: 'Foydali', down: 'Foydasiz', thanks: 'Rahmat!', free: (n: number, of: number) => `Bepul javoblar: ${n} / ${of}` },
  ru: { next: 'Продолжить', ask: 'Ответ помог?', up: 'Помогло', down: 'Не помогло', thanks: 'Спасибо!', free: (n: number, of: number) => `Бесплатных ответов: ${n} из ${of}` },
} as const;

/**
 * Under a finished answer: up to three follow-ups of the page's role (only
 * under the last answer: `followUps` is the sender, absent elsewhere), and
 * «helpful / not helpful». A rating counts once per answer.
 */
export function AnswerFeedback({ locale, followUps }: { locale: Locale; followUps?: (text: string) => void }) {
  const s = TEXT[locale];
  // The page's role and API base are the mount point's own (data-chat-role, data-api-base).
  const root = typeof document === 'undefined' ? null : document.getElementById('gpt-chat-root');
  const role = chatRolePreset(root?.dataset.chatRole);
  const [rated, setRated] = useState(false);
  const chips = followUps ? (BY_ROLE[locale][role as ChatRolePreset] ?? GENERAL[locale]).slice(0, 3) : [];
  const rate = (verdict: 'up' | 'down') => {
    setRated(true);
    recordUiEvent(root?.dataset.apiBase ?? '', 'answer_rating', `${verdict}_${role ?? 'general'}`);
  };
  return (
    <div className="gpt-feedback">
      {followUps && chips.length > 0 && (
        <ul className="gpt-followups" aria-label={s.next}>
          {chips.map(([label, text]) => (
            <li key={label}><button type="button" className="gpt-followup" onClick={() => followUps(text)}>{label}</button></li>
          ))}
        </ul>
      )}
      {rated ? (
        <p className="gpt-rating-thanks" role="status">{s.thanks}</p>
      ) : (
        <div className="gpt-rating" role="group" aria-label={s.ask}>
          <span aria-hidden="true">{s.ask}</span>
          <button type="button" onClick={() => rate('up')} aria-label={`${s.ask} ${s.up}`}><span aria-hidden="true">{s.up}</span></button>
          <button type="button" onClick={() => rate('down')} aria-label={`${s.ask} ${s.down}`}><span aria-hidden="true">{s.down}</span></button>
        </div>
      )}
    </div>
  );
}

/**
 * The answer's foot (model, actions) and, under it, the follow-ups and the
 * rating. The chips only under the last answer once it is whole and sending
 * is possible; a cut or broken-off answer keeps «Continue» alone.
 */
export function MessageFoot({ onFollowUp, ...actions }: ComponentProps<typeof MessageActions> & { onFollowUp?: (text: string) => void }) {
  return (
    <>
      <MessageActions {...actions} />
      <AnswerFeedback locale={actions.locale}
        followUps={actions.isLast && !actions.locked && !actions.broken ? onFollowUp : undefined} />
    </>
  );
}

/** «Bepul javoblar: 2 / 3»: what is left of the trial, as the server counted it. */
export function TrialCounter({ left, locale }: { left: number; locale: Locale }) {
  return left < 0 || left > 2 ? null : <p className="gpt-trial-counter" data-testid="ai-trial-counter">{TEXT[locale].free(left, 3)}</p>;
}
