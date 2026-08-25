/**
 * Service-binding deadlines. The platform caller owns a slightly larger
 * outer deadline so it can receive and classify the gateway response instead
 * of aborting at the same instant as the Durable Object request.
 */
export const GATEWAY_DO_HEALTH_TIMEOUT_MS = 15_000;
export const GATEWAY_DO_CONTROL_TIMEOUT_MS = 75_000;
export const GATEWAY_DO_RECONCILE_TIMEOUT_MS = 90_000;
export const GATEWAY_DO_SEND_TIMEOUT_MS = 120_000;
