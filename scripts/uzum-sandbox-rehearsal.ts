// Uzum Checkout sandbox rehearsal: the same client code the site uses
// (functions/lib/gpt-chat/uzum-checkout.ts), against Uzum's TEST terminal.
//
//   node --import tsx scripts/uzum-sandbox-rehearsal.ts --dry-run   # config check + request body, no network
//   node --import tsx scripts/uzum-sandbox-rehearsal.ts             # register, print the payment page, poll the status
//   node --import tsx scripts/uzum-sandbox-rehearsal.ts --refund    # ... then refund the full amount once COMPLETED
//
// Credentials come only from the shell environment, for this one command:
//   UZUM_CREDENTIALS_JSON='{"checkout":{"test":{"terminalId":"…","apiKey":"…"}}}'
//   UZUM_CHECKOUT_TEST_BASE_URL=https://…   (optional; the default host is UNVERIFIED)
//   UZUM_AUTOFISCAL / GPT_FISCAL_IKPU / GPT_FISCAL_PACKAGE_CODE / GPT_FISCAL_VAT_PERCENT (optional)
// They are never printed or written. Test cards are listed in the Uzum
// Checkout spec (docs/paid-chat/uzum-spec/en_checkout.yaml, "Testing").
// Nothing touches D1: this proves the protocol, not the ledger (the ledger is
// covered by tests/gpt-uzum-payments.test.ts).
// Source: https://developer.uzumbank.uz/redocusaurus/en_checkout.yaml (1.10.3).
import { randomBytes, randomUUID } from 'node:crypto';
import { uzumCheckoutConfig, type UzumEnv } from '../functions/lib/gpt-chat/uzum-config';
import {
  getOrderStatus,
  refund,
  registerBody,
  registerPayment,
  type UzumFailure,
} from '../functions/lib/gpt-chat/uzum-checkout';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const withRefund = args.has('--refund');
const POLL_MS = 5000;
const POLL_LIMIT = 72; // 6 minutes

function explain(step: string, failure: UzumFailure): never {
  // Codes only: never headers, keys or response bodies.
  console.error(`${step} failed: ${failure.error}${failure.code !== undefined ? ` (code ${failure.code})` : ''}`);
  process.exit(1);
}

async function main() {
  const env = { ...process.env, GPT_BILLING_MODE: 'test', UZUM_API: 'checkout' } as unknown as UzumEnv;
  const cfg = uzumCheckoutConfig(env, 'test');
  if (!cfg) {
    console.error(
      'Uzum test config incomplete: set UZUM_CREDENTIALS_JSON with checkout.test.{terminalId (uuid), apiKey}, ' +
        'an allowlisted https UZUM_CHECKOUT_TEST_BASE_URL (or the default), and complete fiscal values if UZUM_AUTOFISCAL=true.',
    );
    process.exit(dryRun ? 0 : 1);
  }
  const order = {
    id: `uzm_${randomBytes(16).toString('hex')}`,
    amount: 2_000_000,
    user_id: `acct_rehearsal_${randomBytes(4).toString('hex')}`,
  };
  const returnUrl = 'https://gptbot.uz/ru/gpt-chat/';
  console.log(`base: ${cfg.baseUrl}`);
  console.log(`auto-fiscalization: ${cfg.fiscal ? 'on' : 'off'}`);
  console.log('register body:', JSON.stringify(registerBody(cfg, order, returnUrl), null, 2));
  if (dryRun) return;

  const registered = await registerPayment(cfg, order, 'ru', returnUrl);
  if (!registered.ok) explain('register', registered);
  console.log(`Uzum orderId: ${registered.orderId}`);
  console.log(`Open and pay with a test card: ${registered.redirectUrl}`);

  let status = 'REGISTERED';
  for (let i = 0; i < POLL_LIMIT; i++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    const pulled = await getOrderStatus(cfg, registered.orderId);
    if (!pulled.ok) explain('getOrderStatus', pulled);
    if (pulled.status.status !== status) {
      status = pulled.status.status;
      console.log(
        `status: ${status} amount=${pulled.status.amount} completed=${pulled.status.completedAmount} ` +
          `refunded=${pulled.status.refundedAmount} merchantOrderId=${pulled.status.merchantOrderId === order.id ? 'matches' : 'MISMATCH'}`,
      );
    }
    if (['COMPLETED', 'DECLINED', 'REVERSED', 'REFUNDED'].includes(status)) break;
  }
  if (!withRefund || status !== 'COMPLETED') return;
  const operationId = randomUUID();
  console.log(`refund X-Operation-Id: ${operationId} (a retry must reuse it)`);
  const refunded = await refund(cfg, registered.orderId, order.amount, operationId);
  if (!refunded.ok) explain('refund', refunded);
  for (let i = 0; i < 12; i++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    const pulled = await getOrderStatus(cfg, registered.orderId);
    if (!pulled.ok) explain('getOrderStatus', pulled);
    if (pulled.status.status === 'REFUNDED') {
      console.log(`status: REFUNDED refunded=${pulled.status.refundedAmount}`);
      return;
    }
  }
  console.log('refund accepted; REFUNDED not reported yet — check again later');
}

void main();
