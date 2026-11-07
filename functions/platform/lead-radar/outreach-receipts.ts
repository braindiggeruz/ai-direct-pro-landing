import type { TelegramCampaignSender } from './telegram-campaign';
import { getTelegramCampaignDataKeyIdentityState } from './telegram-campaign';
import { telegramIdentifierDigest } from './telegram-business';
import type { TgSenderCampaignSender } from './tg-sender-client';
import { TG_SENDER_SCHEMA, sameTgSenderBinding } from './tg-sender-contract';
import { hasOutreachReceiptSchema, OutreachReceiptStore, outreachReceiptKey } from './outreach-receipts-store';
export { hasOutreachReceiptSchema } from './outreach-receipts-store';

type ReceiptSender=Pick<TgSenderCampaignSender,'prepare'|'send'|'receipt'>;

/** Persists an immutable receipt key before crossing any provider boundary. */
export function createDurableOutreachSender(input: {db:D1Database;sender:ReceiptSender;now?:()=>Date}): TelegramCampaignSender {
  return {send:async(payload)=>{
    try {
      if (!await hasOutreachReceiptSchema(input.db)) return {kind:'rejected',code:'account_session_missing'};
      const command=await input.sender.prepare(payload);
      if (!command || !await new OutreachReceiptStore(input.db).reserve(command,(input.now?.()??new Date()).toISOString())) {
        return {kind:'rejected',code:'account_session_missing'};
      }
    } catch { return {kind:'rejected',code:'account_session_missing'}; }
    // Once entered, every exception belongs to the domain's ambiguous path.
    return input.sender.send(payload);
  }};
}

/** Receipt lookup only. Never calls send, resolves a peer, or releases no-repeat guards. */
export async function reconcileOutreachReceipts(input: {
  db:D1Database; dataKey:string; orgId:string; sender:Pick<ReceiptSender,'receipt'>; now?:Date; limit?:number;
}): Promise<{checked:number;accepted:number}> {
  const result={checked:0,accepted:0};
  if (!await hasOutreachReceiptSchema(input.db)
    || await getTelegramCampaignDataKeyIdentityState(input)!=='ready') return result;
  const now=(input.now??new Date()).toISOString(),store=new OutreachReceiptStore(input.db);
  for(const row of await store.due(input.orgId,now,input.limit??1)) {
    result.checked++;
    const key=outreachReceiptKey(row);
    let accepted=false;
    try {
      const receipt=await input.sender.receipt(key);
      if (receipt?.schema===TG_SENDER_SCHEMA && sameTgSenderBinding(receipt.binding,key.binding)
        && receipt.effect_id===key.effect_id && receipt.payload_sha256===key.payload_sha256
        && receipt.state==='accepted' && typeof receipt.provider_message_id==='string'
        && /^[1-9][0-9]{0,19}$/u.test(receipt.provider_message_id)) {
        const digest=await telegramIdentifierDigest(input.dataKey,'campaign-provider-message',
          JSON.stringify([input.orgId,receipt.provider_message_id]));
        accepted=await store.accept(key,digest,now,crypto.randomUUID().replaceAll('-',''));
      }
    } catch { /* A lookup failure never changes delivery truth or permits resend. */ }
    if(accepted)result.accepted++;else await store.defer(row,now);
  }
  return result;
}
