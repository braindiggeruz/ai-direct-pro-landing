import { LoaderCircle, RefreshCw } from 'lucide-react';
import { Button } from '../ui';

export function TgSenderSwitchConfirmation({open,busy,disabled,onOpen,onCancel,onConfirm}:{open:boolean;busy:boolean;disabled:boolean;onOpen:()=>void;onCancel:()=>void;onConfirm:()=>void}) {
  return <div className="mt-4 rounded-xl border border-brand-cyan/20 bg-brand-cyan/[0.04] p-4">
    {open ? <div role="group" aria-label="Подтверждение перехода на TG Sender">
      <h4 className="text-sm font-semibold text-white">Переключить отправителя Lead Radar?</h4>
      <p className="mt-2 text-sm leading-6 text-white/70">Прежнюю привязку к Bridge архивируем. История компаний, кампаний и сообщений сохранится. Вместо неё подключим настроенный на сервере аккаунт TG Sender. Сначала сервер проверит, что прежние кампании завершены и незавершённых отправок нет.</p>
      <p className="mt-2 text-xs leading-5 text-white/60">Переход сам по себе не запускает рассылку. После него сверите нового отправителя.</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button type="button" disabled={disabled||busy} aria-busy={busy} onClick={onConfirm} className="min-h-12">{busy&&<LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}{busy?'Проверяем и переключаем…':'Подтвердить переход на TG Sender'}</Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={onCancel} className="min-h-12">Оставить текущую привязку</Button>
      </div>
    </div> : <>
      <p className="mb-3 text-xs leading-5 text-white/65">Сохранена прежняя привязка аккаунта. Перейти на TG Sender можно отдельным подтверждением; история останется на месте.</p>
      <Button type="button" disabled={disabled||busy} onClick={onOpen} className="min-h-12"><RefreshCw size={16} aria-hidden="true" />Переключить Lead Radar на TG Sender</Button>
    </>}
  </div>;
}
