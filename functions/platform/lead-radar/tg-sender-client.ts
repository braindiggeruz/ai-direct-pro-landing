import type { TelegramCampaignProviderResult, TelegramCampaignSender } from './telegram-campaign';
import {
  TG_SENDER_SCHEMA, TG_SENDER_ORIGIN, TG_SENDER_PREFIX, isTgSenderBinding, isTgSenderAuthorization,
  sameTgSenderBinding, tgSenderCommandDigest,
  type TgSenderBinding, type TgSenderInput, type TgSenderAuthorization, type TgSenderEffectKey,
  type TgSenderCommand, type TgSenderReceipt,
} from './tg-sender-contract';

type Service = { fetch(input: string, init: RequestInit): Promise<Response> };
export interface TgSenderReadiness {
  ready: boolean;
  reason: string | null;
  checkedAt: string | null;
  retryAfterSeconds: number | null;
  maskedLabel: string | null;
  publicBusinessInquiry: boolean;
  providerVerifiedAt: string | null;
}
export interface TgSenderResolution {
  status: 'resolved' | 'blocked' | 'unresolved'; username: string;
  kind: 'user' | 'bot' | 'group' | 'channel' | 'unknown'; peerRef: string | null;
  verifiedAt: string | null; expiresAt: string | null; reason: string | null; retryAfterSeconds: number | null;
}
export interface TgSenderClientOptions {
  service: Service;
  token: string;
  binding: TgSenderBinding;
  enabled?: boolean;
  now?: () => number;
  timeoutMs?: number;
}
function record(value: unknown): value is Record<string,unknown> { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }
function exactKeys(value: Record<string,unknown>, required: string[], optional: string[] = []) {
  return required.every(key => Object.hasOwn(value,key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}
const REJECTION_CODES = new Set(['peer_invalid','privacy_restricted','flood_wait','flood_premium_wait','slow_mode','account_restricted','account_session_missing','paid_message_required','media_invalid','provider_rejected']);
function parseReceipt(value: unknown, key: TgSenderEffectKey): TgSenderReceipt | null {
  if (!record(value) || !exactKeys(value,['schema','binding','effect_id','payload_sha256','state'],['code','provider_message_id','retry_after_seconds'])
    || value.schema !== TG_SENDER_SCHEMA || !sameTgSenderBinding(value.binding,key.binding)
    || value.effect_id !== key.effect_id || value.payload_sha256 !== key.payload_sha256
    || !['accepted','rejected','unknown','inflight','cancelled','not_found'].includes(String(value.state))) return null;
  if (value.state === 'accepted' && (typeof value.provider_message_id !== 'string' || !/^[1-9][0-9]{0,19}$/u.test(value.provider_message_id))) return null;
  if (value.state !== 'accepted' && value.provider_message_id !== undefined) return null;
  if (value.state === 'rejected' && (typeof value.code !== 'string' || !REJECTION_CODES.has(value.code))) return null;
  if (value.state !== 'rejected' && (value.code !== undefined || value.retry_after_seconds !== undefined)) return null;
  if (value.retry_after_seconds !== undefined && (typeof value.retry_after_seconds !== 'number' || !Number.isSafeInteger(value.retry_after_seconds) || value.retry_after_seconds < 1 || value.retry_after_seconds > 2147483647)) return null;
  if (value.state === 'rejected' && ['flood_wait','flood_premium_wait','slow_mode'].includes(String(value.code)) && value.retry_after_seconds === undefined) return null;
  return value as unknown as TgSenderReceipt;
}

/** No retries or independent queue. Each uncertain dispatch stays ambiguous in the LR ledger. */
export class TgSenderCampaignSender implements TelegramCampaignSender {
  constructor(private readonly options: TgSenderClientOptions) {}
  private configured() { return this.options.enabled === true && /^[A-Za-z0-9_-]{43,128}$/u.test(this.options.token) && isTgSenderBinding(this.options.binding); }
  private now() { return this.options.now?.() ?? Date.now(); }
  private async request(path: string, method: 'GET' | 'POST', body?: unknown, headers?: Record<string,string>): Promise<unknown> {
    const controller = new AbortController();
    const deadline = Math.min(125000,Math.max(10,this.options.timeoutMs ?? (method === 'GET' ? 5000 : 40000)));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve,reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('tg_sender_timeout')); },deadline); });
    const operation = async () => {
      const response = await this.options.service.fetch(`${TG_SENDER_ORIGIN}${TG_SENDER_PREFIX}${path}`,{
        method, signal: controller.signal, redirect:'error', headers:{Authorization:`Bearer ${this.options.token}`,'Content-Type':'application/json; charset=utf-8',...headers},
        ...(body === undefined ? {} : {body:JSON.stringify(body)}),
      });
      if (!response.ok || !response.body) throw new Error('tg_sender_unavailable');
      const reader = response.body.getReader();
      let length = 0;
      const chunks: Uint8Array[] = [];
      try {
        while (true) { const chunk = await reader.read(); if (chunk.done) break; length += chunk.value.byteLength; if (length > 16384) { await reader.cancel(); throw new Error('tg_sender_response_invalid'); } chunks.push(chunk.value); }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
      return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown;
    };
    try { return await Promise.race([operation(),timeout]); }
    finally { clearTimeout(timer); controller.abort(); }
  }

  async readiness(): Promise<TgSenderReadiness> { return this.checkSession(false); }
  async probeSession(): Promise<TgSenderReadiness> { return this.checkSession(true); }
  private async checkSession(probe:boolean): Promise<TgSenderReadiness> {
    if (!this.configured()) return {ready:false,reason:'tg_sender_not_configured',checkedAt:null,retryAfterSeconds:null,maskedLabel:null,publicBusinessInquiry:false,providerVerifiedAt:null};
    try {
      const value = await this.request(probe?'/session/probe':'/status',probe?'POST':'GET',probe?{schema:TG_SENDER_SCHEMA,binding:this.options.binding}:undefined);
      if (!record(value) || !exactKeys(value,['schema','binding','ready','reason_code','checked_at','retry_after_seconds','masked_label','provider_verified_at','capabilities'])
        || value.schema !== TG_SENDER_SCHEMA || !sameTgSenderBinding(value.binding,this.options.binding)
        || typeof value.ready !== 'boolean' || typeof value.checked_at !== 'string'
        || !record(value.capabilities) || !exactKeys(value.capabilities,['text','media','durable_idempotency','sender_lock','persisted_cooldown','independent_scheduler','opaque_peer_refs','username_resolution','public_business_inquiry'])
        || value.capabilities.text !== true || value.capabilities.media !== false || value.capabilities.durable_idempotency !== true
        || value.capabilities.sender_lock !== true || value.capabilities.persisted_cooldown !== true
        || value.capabilities.independent_scheduler !== false || value.capabilities.opaque_peer_refs !== true
        || value.capabilities.username_resolution !== true || typeof value.capabilities.public_business_inquiry !== 'boolean'
        || typeof value.masked_label !== 'string' || value.masked_label.length > 80 || !value.masked_label.length
        || !Number.isFinite(Date.parse(value.checked_at)) || this.now()-Date.parse(value.checked_at) > 60000 || Date.parse(value.checked_at)-this.now() > 5000
        || (value.ready ? value.reason_code !== null : typeof value.reason_code !== 'string' || !/^[a-z][a-z0-9_]{1,79}$/u.test(value.reason_code))) throw new Error('invalid_status');
      if (value.provider_verified_at !== null && (typeof value.provider_verified_at !== 'string' || !Number.isFinite(Date.parse(value.provider_verified_at)) || this.now()-Date.parse(value.provider_verified_at)>86400000 || Date.parse(value.provider_verified_at)-this.now()>5000)) throw new Error('invalid_verification');
      if (value.retry_after_seconds !== null && (typeof value.retry_after_seconds !== 'number' || !Number.isSafeInteger(value.retry_after_seconds) || value.retry_after_seconds < 1 || value.retry_after_seconds > 2147483647)) throw new Error('invalid_wait');
      return {ready:value.ready,reason:value.reason_code as string|null,checkedAt:value.checked_at,retryAfterSeconds:value.retry_after_seconds as number|null,maskedLabel:value.masked_label as string,publicBusinessInquiry:value.capabilities.public_business_inquiry as boolean,providerVerifiedAt:value.provider_verified_at as string|null};
    } catch { return {ready:false,reason:'tg_sender_unavailable',checkedAt:null,retryAfterSeconds:null,maskedLabel:null,publicBusinessInquiry:false,providerVerifiedAt:null}; }
  }

  status(): Promise<TgSenderReadiness> { return this.readiness(); }

  async resolveContact(username: string): Promise<TgSenderResolution> {
    const clean = username.trim().replace(/^@/u,'').toLowerCase();
    const unavailable = (reason: string): TgSenderResolution => ({status:'blocked',username:clean,kind:'unknown',peerRef:null,verifiedAt:null,expiresAt:null,reason,retryAfterSeconds:null});
    if (!this.configured()) return unavailable('tg_sender_not_configured');
    if (!/^[a-z][a-z0-9_]{4,31}$/u.test(clean)) return unavailable('invalid_username');
    try {
      const value = await this.request('/contacts/resolve','POST',{schema:TG_SENDER_SCHEMA,binding:this.options.binding,username:clean});
      if (!record(value) || !exactKeys(value,['schema','binding','username','status','kind','peer_ref','verified_at','expires_at','reason_code','retry_after_seconds'])
        || value.schema !== TG_SENDER_SCHEMA || !sameTgSenderBinding(value.binding,this.options.binding) || value.username !== clean
        || !['resolved','blocked','unresolved'].includes(String(value.status)) || !['user','bot','group','channel','unknown'].includes(String(value.kind))) throw new Error('invalid_resolution');
      if (value.retry_after_seconds !== null && (typeof value.retry_after_seconds !== 'number' || !Number.isSafeInteger(value.retry_after_seconds) || value.retry_after_seconds < 1 || value.retry_after_seconds > 2147483647)) throw new Error('invalid_wait');
      if (value.status === 'resolved') {
        if (value.kind !== 'user' || typeof value.peer_ref !== 'string' || !/^lrpeer:[a-f0-9]{32}$/u.test(value.peer_ref)
          || typeof value.verified_at !== 'string' || !Number.isFinite(Date.parse(value.verified_at))
          || typeof value.expires_at !== 'string' || !Number.isFinite(Date.parse(value.expires_at))
          || this.now()-Date.parse(value.verified_at) > 60000 || Date.parse(value.verified_at)-this.now() > 5000
          || Date.parse(value.expires_at) <= this.now() || Date.parse(value.expires_at)-Date.parse(value.verified_at)>86400000
          || value.reason_code !== null || value.retry_after_seconds !== null) throw new Error('invalid_proof');
      } else if (value.peer_ref !== null || value.verified_at !== null || value.expires_at !== null
        || typeof value.reason_code !== 'string' || !/^[a-z][a-z0-9_]{1,79}$/u.test(value.reason_code)) throw new Error('invalid_resolution');
      return {status:value.status as TgSenderResolution['status'],username:clean,kind:value.kind as TgSenderResolution['kind'],peerRef:value.peer_ref as string|null,
        verifiedAt:value.verified_at as string|null,expiresAt:value.expires_at as string|null,reason:value.reason_code as string|null,retryAfterSeconds:value.retry_after_seconds as number|null};
    } catch { return unavailable('tg_sender_unavailable'); }
  }

  async prepare(input: TgSenderInput): Promise<TgSenderCommand | null> { return this.buildCommand(input,false); }

  /** Rebuild only from the original immutable input, including its authorization. Never sends. */
  async effectKey(input: TgSenderInput): Promise<TgSenderEffectKey | null> {
    const command=await this.buildCommand(input,true);
    return command ? {schema:command.schema,binding:command.binding,effect_id:command.effect_id,payload_sha256:command.payload_sha256} : null;
  }

  private async buildCommand(input: TgSenderInput, receiptOnly: boolean): Promise<TgSenderCommand | null> {
    const binding = this.options.binding;
    if (!this.configured() || input.orgId !== binding.org_id || input.accountId !== binding.account_id || input.gatewayAccountRef !== binding.account_ref
      || input.media || !/^lrpeer:[a-f0-9]{32}$/u.test(input.username)
      || !/^[A-Za-z0-9:_-]{8,160}$/u.test(input.randomId) || !input.text.length || input.text.length > 4096
      || input.text.includes('\0') || new TextEncoder().encode(input.text).byteLength > 16384) return null;
    const authorization: TgSenderAuthorization | null = input.authorization ? {
      basis: input.authorization.basis,
      reference: input.authorization.reference,
      expires_at: input.authorization.expiresAt,
      ...(input.authorization.publicInquiry ? {public_inquiry:{
        policy_version:input.authorization.publicInquiry.policyVersion,
        source_url_digest:input.authorization.publicInquiry.sourceUrlDigest,
        approval_id:input.authorization.publicInquiry.approvalId,
        selection_digest:input.authorization.publicInquiry.selectionDigest,
        content_digest:input.authorization.publicInquiry.contentDigest,
        recipient_id:input.authorization.publicInquiry.recipientId,
        first_contact_only:input.authorization.publicInquiry.firstContactOnly,
      }} : {}),
    } : null;
    if (!isTgSenderAuthorization(authorization,receiptOnly ? -Infinity : this.now())) return null;
    const draft: Omit<TgSenderCommand,'payload_sha256'> = {
      schema:TG_SENDER_SCHEMA,binding,effect_id:input.randomId,recipient:input.username,text:input.text,
      authorization,paid_message_policy:'reject',allow_paid_floodskip:false,parse_mode:'None',
    };
    return {...draft,payload_sha256:await tgSenderCommandDigest(draft)};
  }

  async send(input: TgSenderInput): Promise<TelegramCampaignProviderResult> {
    if (input.media) return {kind:'rejected',code:'media_invalid'};
    if (!/^lrpeer:[a-f0-9]{32}$/u.test(input.username)) return {kind:'rejected',code:'peer_invalid'};
    let command: TgSenderCommand | null;
    try { command = await this.prepare(input); } catch { return {kind:'ambiguous'}; }
    if (!command) return {kind:'rejected',code:'account_session_missing'};
    const status = await this.readiness();
    if (!status.ready) return status.retryAfterSeconds
      ? {kind:'rejected',code:'flood_wait',retryAfterSeconds:status.retryAfterSeconds}
      : {kind:'rejected',code:'account_session_missing'};
    try {
      const value = parseReceipt(await this.request('/effects','POST',command,{'Idempotency-Key':command.effect_id}),command);
      if (value?.state === 'accepted') return {kind:'sent',providerMessageId:value.provider_message_id!};
      if (value?.state === 'rejected') return {kind:'rejected',code:value.code as Extract<TelegramCampaignProviderResult,{kind:'rejected'}>['code'],...(value.retry_after_seconds ? {retryAfterSeconds:value.retry_after_seconds} : {})};
    } catch { /* The provider may already have accepted the message. Never resend here. */ }
    return {kind:'ambiguous'};
  }

  async receipt(key: TgSenderEffectKey): Promise<TgSenderReceipt | null> {
    if (!this.configured() || !sameTgSenderBinding(key.binding,this.options.binding) || !/^[A-Za-z0-9:_-]{8,160}$/u.test(key.effect_id) || !/^[a-f0-9]{64}$/u.test(key.payload_sha256)) return null;
    try { return parseReceipt(await this.request(`/effects/${encodeURIComponent(key.effect_id)}`,'GET',undefined,{'X-Payload-SHA256':key.payload_sha256}),key); } catch { return null; }
  }

  async cancel(key: TgSenderEffectKey): Promise<TgSenderReceipt | null> {
    if (!this.configured() || !sameTgSenderBinding(key.binding,this.options.binding) || !/^[A-Za-z0-9:_-]{8,160}$/u.test(key.effect_id) || !/^[a-f0-9]{64}$/u.test(key.payload_sha256)) return null;
    try { return parseReceipt(await this.request(`/effects/${encodeURIComponent(key.effect_id)}/cancel`,'POST',{schema:key.schema,binding:key.binding,effect_id:key.effect_id,payload_sha256:key.payload_sha256}),key); } catch { return null; }
  }
}
