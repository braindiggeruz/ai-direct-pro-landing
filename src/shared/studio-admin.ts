import type { AiChatSection } from './ai-chat-admin';
export interface StudioMonetizationData {
  from: number; to: number; days: number;
  funnel: { event:string; detail:string; count:number; views:number }[];
  orders: { provider:string; plan:string; state:string; count:number }[];
  sources: { source:string; count:number; paid:number; grossUzs:number }[];
  jobs: { tool:string; source:string; state:string; count:number; fullDelivered:number }[];
  money: { grossUzs:number; refundsUzs:number; netReceiptsUzs:number; estimatedAiUsd:number };
  fiscal: { product:'chat'|'studio'; provider:string; error:string; queued:number; attempts:number; oldestPaidAt:number }[];
}
export interface StudioMonetizationReport { request_id:string; studio:AiChatSection<StudioMonetizationData> }
/** Owner-entered period expenses, never guessed from visits or merchant tariffs. */
export function contribution(data:StudioMonetizationData, ads:number|null, fees:number|null, usdRate:number|null): number|null {
  if (ads===null||fees===null||(data.money.estimatedAiUsd>0&&usdRate===null)) return null;
  if (![ads,fees,usdRate??0].every(n=>Number.isFinite(n)&&n>=0)) return null;
  if (data.money.estimatedAiUsd>0 && !(usdRate!>0)) return null;
  return data.money.netReceiptsUzs-ads-fees-data.money.estimatedAiUsd*(usdRate??0);
}
