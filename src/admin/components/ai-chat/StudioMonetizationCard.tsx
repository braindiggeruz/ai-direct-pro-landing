import { useState } from 'react';
import { Card } from '../ui';
import { dateTime } from './format';
import { contribution, type StudioMonetizationReport } from '../../../shared/studio-admin';

const STEPS: Record<string,string> = {
  studio_mode_entered:'Открыли презентации', studio_tool_started:'Начали создание',
  studio_result_ready:'Получили результат', studio_upgrade_viewed:'Увидели предложение',
  studio_upgrade_selected:'Выбрали пакет', studio_tariffs_viewed:'Открыли тарифы',
  studio_checkout_started:'Перешли к оплате', studio_checkout_result:'Вернулись с оплаты',
  studio_download_clicked:'Нажали скачать',
};
const money = (n:number) => `${new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(n)} сум`;
const expense = (text:string) => text.trim()==='' ? null : Number(text.replace(',','.'));

export function StudioMonetizationCard({ report, days, onDays }: {
  report:StudioMonetizationReport|null; days:number; onDays:(days:number)=>void;
}) {
  const [ads,setAds]=useState(''), [fees,setFees]=useState(''), [fx,setFx]=useState('');
  const section=report?.studio, data=section?.ok ? section.data : null;
  const margin=data ? contribution(data,expense(ads),expense(fees),expense(fx)) : null;
  return <Card data-testid="studio-monetization">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold text-white">Презентации · продажи и расходы</h2>
      <label className="text-sm text-white/60">Период <select style={{minHeight:44}} className="bg-slate-900 rounded p-2 text-white" value={days} onChange={e=>{setAds('');setFees('');setFx('');onDays(Number(e.target.value));}}>{[7,14,30].map(n=><option key={n} value={n}>{n} дней</option>)}</select></label>
    </div>
    {!data ? <p className="text-sm text-white/60 mt-3" role="status">{section && !section.ok ? `Данные недоступны: ${section.error} · ${report?.request_id}` : 'Загрузка…'}</p> : <div className="space-y-5 mt-4">
      <p className="text-xs text-white/50">{dateTime(data.from)} — {dateTime(data.to)}. Реальные платежи; тестовые и owner-test исключены. События браузера показывают действия, не доказывают оплату или сохранение файла.</p>
      <dl className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
        {([['Поступления',money(data.money.grossUzs)],['Возвраты',money(data.money.refundsUzs)],['После возвратов',money(data.money.netReceiptsUzs)],['Оценка AI',`$${data.money.estimatedAiUsd.toFixed(4)}`]] as const).map(([label,value])=><div key={label}><dt className="text-white/50">{label}</dt><dd className="text-white font-semibold mt-1">{value}</dd></div>)}
      </dl>
      <div className="overflow-x-auto"><table className="w-full text-sm text-left"><caption className="text-left text-white/70 mb-2">Воронка · уникальные открытия страницы внутри каждой строки</caption><thead className="text-white/50"><tr><th className="p-2">Действие</th><th>Вариант</th><th>Открытия</th></tr></thead><tbody>{data.funnel.map(row=><tr key={`${row.event}:${row.detail}`} className="border-t border-white/10 text-white/80"><td className="p-2">{STEPS[row.event]??row.event}</td><td>{row.detail}</td><td>{row.views}</td></tr>)}</tbody></table>{!data.funnel.length && <p className="text-white/50 text-sm">Событий пока нет.</p>}</div>
      <div className="overflow-x-auto"><table className="w-full text-sm text-left"><caption className="text-left text-white/70 mb-2">Заказы, созданные за период · источник трафика</caption><thead className="text-white/50"><tr><th className="p-2">Источник</th><th>Заказы</th><th>Оплачены*</th><th>Сумма*</th></tr></thead><tbody>{data.sources.map(row=><tr key={row.source} className="border-t border-white/10 text-white/80"><td className="p-2">{row.source}</td><td>{row.count}</td><td>{row.paid}</td><td>{money(row.grossUzs)}</td></tr>)}</tbody></table><p className="text-xs text-white/50 mt-2">* Включает впоследствии возвращённые заказы. Это когорта заказов; поступления и возвраты выше учитываются по дате операции.</p></div>
      <div className="grid sm:grid-cols-2 gap-4 text-sm text-white/70"><div><h3 className="font-semibold text-white">Статусы заказов</h3>{data.orders.map(row=><p key={`${row.provider}:${row.plan}:${row.state}`}>{row.provider} · {row.plan} · {row.state}: {row.count}</p>)}</div><div><h3 className="font-semibold text-white">Генерации Studio</h3>{data.jobs.map(row=><p key={`${row.tool}:${row.source}:${row.state}`}>{row.tool} · {row.source} · {row.state}: {row.count}; полных презентаций с полученными частями: {row.fullDelivered}</p>)}</div></div>
      <fieldset className="border border-white/10 rounded-lg p-4"><legend className="text-white text-sm px-1">Расходы за тот же период · ввод владельца</legend><div className="grid sm:grid-cols-3 gap-3">{([['Расход на рекламу, сум',ads,setAds],['Комиссии, сум',fees,setFees],['Курс оплаты AI, сум / USD',fx,setFx]] as const).map(([label,value,set])=><label className="text-xs text-white/60" key={label}>{label}<input style={{minHeight:44}} className="block w-full bg-slate-900 text-white rounded p-2 mt-1" inputMode="decimal" type="number" min="0" step="any" placeholder="Не указано" value={value} onChange={e=>set(e.target.value)}/></label>)}</div><p className="text-sm text-white mt-3">Остаток после указанных расходов: {margin===null ? 'неизвестен — заполните расходы и положительный курс для AI' : money(margin)}</p><p className="text-xs text-white/50 mt-2">AI — оценка по внутреннему учёту, не счёт провайдера. Остальные расходы не включены. Ввод остаётся только на этой странице; пустое поле не считается нулём.</p></fieldset>
      <div role={data.fiscal.length ? 'status' : undefined}><h3 className="text-white font-semibold">Очередь фискальных чеков · все продукты</h3>{data.fiscal.length ? data.fiscal.map(row=><p className="text-sm text-amber-200 mt-2" key={`${row.product}:${row.provider}:${row.error}`}>{row.provider} / {row.product}: ожидают {row.queued}; {row.error}; максимум попыток {row.attempts}; самая ранняя оплата {dateTime(row.oldestPaidAt)}.</p>) : <p className="text-sm text-white/50 mt-2">Ожидающих в локальной очереди нет. Наличие чека подтверждается данными платёжного провайдера.</p>}</div>
    </div>}
  </Card>;
}
