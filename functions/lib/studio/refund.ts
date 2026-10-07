import type { BillingEnv } from "../gpt-chat/billing-config";
import { internalAuthorized } from "../gpt-chat/internal-auth";
import { readJsonLimited } from "../gpt-chat/http";
import { clickMerchantAuth } from "../gpt-chat/fiscal-store";
import { findClickPaymentId, reversal } from "../gpt-chat/click-merchant";
import { recordServiceAlert } from "../gpt-chat/billing-maintenance-store";
import { fail, json, STUDIO_ERRORS, type StudioErrorCode } from "./http";
import { REQUEST_ID } from "./ledger";
import { StudioStore, ensureStudioPaidSchema } from "./store";
import { StudioOperationsStore } from "./operations-store";

export type StudioOperation = 'refund-record'|'click-reversal'|'unit-credit'|'extend'|'report';
export async function studioOperation(request:Request,env:BillingEnv,kind:StudioOperation):Promise<Response> {
  if(!internalAuthorized(request,env.GPT_BILLING_MAINTENANCE_SECRET)) return fail('unauthorized');
  const body=await readJsonLimited<Record<string,unknown>>(request,2048);
  if(!body.ok || !body.value || typeof body.value!=='object' || Array.isArray(body.value)) return fail('invalid');
  const p=body.value;
  const db=env.GPTBOT_DRAFTS_DB;
  if(!db) return fail('studio_not_configured');
  try {
    await ensureStudioPaidSchema(db);
    const ops=new StudioOperationsStore(db); const store=new StudioStore(db);
    if(kind==='extend') return json({ok:true,...await ops.extend(p.from as number,p.to as number)});
    if(kind==='report') return json({ok:true,...await ops.report(p.from as number,p.to as number)});
    if(typeof p.orderId!=='string'||!/^stu_[a-f0-9]{32}$/.test(p.orderId)) return fail('invalid');
    const order=await store.byId(p.orderId);
    if(!order) return fail('not_found');
    if(kind==='unit-credit') {
      if(typeof p.requestId!=='string'||!REQUEST_ID.test(p.requestId)||(p.unit!=='presentation_full'&&p.unit!=='photo_task')||typeof p.reason!=='string'||!/^[-a-z0-9_]{3,64}$/.test(p.reason)) return fail('invalid');
      return json({ok:true,...await ops.credit(order.id,p.requestId,p.unit,p.reason)});
    }
    if(kind==='refund-record') {
      if(order.state==='refunded') return fail('refund_exists');
      if(order.state!=='paid') return fail('job_state');
      if(p.action==='request') return json({ok:true,request:await ops.refundRequest(order.id)});
      if(p.confirmedRefund!==true||(p.method!=='transfer'&&p.method!=='click_cabinet')||typeof p.reference!=='string'||!/^\P{Cc}{3,128}$/u.test(p.reference)) return fail('invalid');
      if(p.amountTiyin!==undefined&&(!Number.isSafeInteger(p.amountTiyin)||(p.amountTiyin as number)<=0||(p.amountTiyin as number)>order.amount)) return fail('invalid');
      if(p.method==='click_cabinet'&&(order.provider!=='click'||(p.amountTiyin!==undefined&&p.amountTiyin!==order.amount))) return fail('invalid');
      if(p.method==='click_cabinet') {
        const result=await store.refundFull(order.id,{method:'click_cabinet',reference:p.reference});
        return json({ok:true,orderId:order.id,amountTiyin:result.refund.amount,receiptState:result.refund.receipt_state});
      }
      const snapshot=await ops.refundRequest(order.id);
      const result=await store.recordRefund(order.id,{method:p.method,reference:p.reference,amountTiyin:p.amountTiyin as number|undefined,requestedAt:snapshot.requested_at,unusedSnapshot:{presentations:snapshot.presentations_unused,photos:snapshot.photos_unused}});
      if(result.refund.receipt_state==='due') await recordServiceAlert(env,'studio_refund_receipt_due');
      return json({ok:true,orderId:order.id,amountTiyin:result.refund.amount,receiptState:result.refund.receipt_state});
    }
    // This endpoint performs a real provider reversal only on an explicit
    // operator action. Persist intent BEFORE DELETE: an uncertain response
    // is never blindly repeated; support reconciles the provider cabinet.
    if(p.confirmReversal!==true||typeof p.requestId!=='string'||!REQUEST_ID.test(p.requestId)) return fail('invalid');
    if(order.provider!=='click'||order.mode!=='live'||order.state!=='paid') return fail('job_state');
    const auth=clickMerchantAuth(env,'live',order.id);
    if(!auth) return fail('studio_not_configured');
    const found=await findClickPaymentId(auth,order);
    if(!found.ok) return fail('studio_busy');
    if(!await ops.beginReversal(order.id,p.requestId,found.paymentId,order.version)) return fail('in_progress');
    const reversed=await reversal(auth,found.paymentId);
    if(!reversed.ok) {
      await ops.reversalResult(order.id,'unknown');
      await recordServiceAlert(env,'studio_refund_receipt_due');
      return fail('in_progress');
    }
    await store.refundFull(order.id,{method:'click_reversal',reference:found.paymentId});
    await ops.reversalResult(order.id,'confirmed');
    return json({ok:true,orderId:order.id,amountTiyin:order.amount});
  } catch(e) {
    const code=e instanceof Error?e.message:'';
    if(Object.prototype.hasOwnProperty.call(STUDIO_ERRORS,code)) return fail(code as StudioErrorCode);
    if(['state','conflict','refund_amount','nothing_to_refund'].includes(code)) return fail('job_state');
    return fail('studio_busy');
  }
}
