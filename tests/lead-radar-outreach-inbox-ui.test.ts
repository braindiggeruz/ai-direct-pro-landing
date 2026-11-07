import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TelegramAccountCampaignPanel } from '../src/admin/components/lead-radar/TelegramAccountCampaignPanel';
import { OutreachWorkflow } from '../src/admin/components/lead-radar/OutreachWorkflow';
import { isValidCampaignRecipientAuthorization } from '../src/admin/lib/lead-radar-campaign';
import { TgSenderSwitchConfirmation } from '../src/admin/components/lead-radar/TgSenderSwitchConfirmation';
import { api } from '../src/admin/lib/api';

(globalThis as typeof globalThis & {React:typeof React}).React=React;

const props={searchId:'fixture_search',leads:[],initialTemplate:'Здравствуйте, {company_name}.',telegramAccountEnabled:true,
  campaignOutreachEnabled:true,campaignAutoSendEnabled:false,telegramCampaignDailyLimit:10,telegramCampaignMinimumIntervalSeconds:120};

test('remote Sender mode never renders local enrollment, session login or unsupported image composer',()=>{
  const html=renderToStaticMarkup(createElement(TelegramAccountCampaignPanel,{...props,telegramTransportMode:'tg_sender'}));
  assert.ok(!html.includes('Привязка локального Telegram Bridge'));
  assert.ok(!html.includes('Выбор изображения для Telegram-кампании'));
  assert.ok(!html.includes('Нажмите «Подключить аккаунт», затем введите номер'));
  assert.ok(html.includes('В TG Sender доступна текстовая кампания'));
});

test('legacy Bridge retains enrollment and media; public inquiry is shown only when server enabled',()=>{
  const legacy=renderToStaticMarkup(createElement(TelegramAccountCampaignPanel,props));
  assert.ok(legacy.includes('Привязка локального Telegram Bridge'));
  assert.ok(legacy.includes('Выбор изображения для Telegram-кампании'));
  assert.ok(!legacy.includes('value="public_business_inquiry"'));
  const enabled=renderToStaticMarkup(createElement(TelegramAccountCampaignPanel,{...props,publicBusinessInquiryEnabled:true}));
  assert.ok(enabled.includes('value="public_business_inquiry"'));
});

test('inbox is a real workflow destination without completed steps or delivery counters',()=>{
  const html=renderToStaticMarkup(createElement(OutreachWorkflow,{currentStep:'inbox',onSearch:()=>{},onAudience:()=>{},onInbox:()=>{}}));
  assert.ok(html.includes('Ответы компаний'));assert.equal((html.match(/aria-current="step"/gu)??[]).length,1);
});

test('public inquiry preview accepts only its evidence version and bounded 30-day approval',()=>{
  const now=Date.parse('2026-11-07T10:00:00.000Z');
  const approval={basis:'public_business_inquiry' as const,reviewer:'owner_verified' as const,evidenceVersion:'public-business-inquiry-v1',verifiedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+86_400_000).toISOString()};
  assert.equal(isValidCampaignRecipientAuthorization(approval,'public_business_inquiry',now),true);
  assert.equal(isValidCampaignRecipientAuthorization({...approval,evidenceVersion:'campaign-contact-eligibility-v1'},'public_business_inquiry',now),false);
  assert.equal(isValidCampaignRecipientAuthorization({...approval,expiresAt:new Date(now+31*86_400_000).toISOString()},'public_business_inquiry',now),false);
  assert.equal(isValidCampaignRecipientAuthorization(approval,'documented_consent',now),false);
});

test('switch confirmation preserves history and exposes no confirm action before explicit review',()=>{
  let actions=0;
  const props={busy:false,disabled:false,onOpen:()=>{actions++;},onCancel:()=>{actions++;},onConfirm:()=>{actions++;}};
  const closed=renderToStaticMarkup(createElement(TgSenderSwitchConfirmation,{...props,open:false}));
  assert.ok(closed.includes('Переключить Lead Radar на TG Sender'));
  assert.ok(!closed.includes('Подтвердить переход на TG Sender'));
  const open=renderToStaticMarkup(createElement(TgSenderSwitchConfirmation,{...props,open:true}));
  assert.ok(open.includes('История компаний, кампаний и сообщений сохранится'));
  assert.ok(open.includes('Переход сам по себе не запускает рассылку'));
  assert.ok(open.includes('Подтвердить переход на TG Sender'));
  assert.ok(open.includes('Оставить текущую привязку'));
  assert.equal(actions,0,'neither opening nor rendering automatically authorizes a transition');
  const busy=renderToStaticMarkup(createElement(TgSenderSwitchConfirmation,{...props,open:true,busy:true}));
  assert.equal((busy.match(/disabled=""/gu)??[]).length,2);
  assert.ok(busy.includes('aria-busy="true"'));
});

test('remote connect client sends replacement only with exact explicit target and never retries a failed mutation',async(context)=>{
  const oldStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>null}});
  const calls:{body:unknown;key:string|null}[]=[];let fail=false;
  context.mock.method(globalThis,'fetch',async(url:RequestInfo|URL,init?:RequestInit)=>{
    assert.equal(String(url),'/api/admin/lead-radar/telegram-account/tg-sender/connect');
    assert.equal(init?.method,'POST');
    calls.push({body:JSON.parse(String(init?.body)),key:new Headers(init?.headers).get('Idempotency-Key')});
    return fail?Response.json({error:'tg_sender_active_campaign'},{status:409}):Response.json({status:'connected'});
  });
  try {
    await api.leadRadarConnectTgSender('fixture_default_connect');
    const accountId='lrtgua_'+'a'.repeat(32);
    await api.leadRadarConnectTgSender('fixture_explicit_cutover',accountId);
    fail=true;
    await assert.rejects(api.leadRadarConnectTgSender('fixture_explicit_cutover',accountId),/tg_sender_active_campaign/);
    assert.deepEqual(calls,[{body:{},key:'fixture_default_connect'},
      {body:{replaceAccountId:accountId},key:'fixture_explicit_cutover'},
      {body:{replaceAccountId:accountId},key:'fixture_explicit_cutover'}]);
  } finally {
    if(oldStorage)Object.defineProperty(globalThis,'localStorage',oldStorage);
    else Reflect.deleteProperty(globalThis,'localStorage');
  }
});
