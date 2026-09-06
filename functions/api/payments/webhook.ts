// Retire the shared-secret/raw-payload event sink; use verified protocols.
import { fail } from "../../lib/gpt-chat/http";
export const onRequest: PagesFunction = async () =>
  fail("provider_endpoint_required", "Use the provider-specific endpoint", 410);
export const onRequestPost = onRequest;
