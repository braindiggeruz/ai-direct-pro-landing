import fs from 'node:fs';
import path from 'node:path';
import {parseStudioConfig} from '../../functions/lib/studio/config';
import {TERMS_PLAN} from '../../functions/lib/studio/plans';
import {committedRuntimeConfig} from './live-gate';

/** Release gate for new Studio sales. Settlement callbacks never use it. */
export function assertStudioLiveGate(root:string,dist:string,production:ReadonlySet<string>|null):void {
  const toml=fs.readFileSync(path.join(root,'wrangler.toml'),'utf8');
  const raw=/STUDIO_RUNTIME_CONFIG_JSON\s*=\s*'''([^']+)'''/.exec(toml)?.[1];
  if(!raw)return;
  const config=parseStudioConfig(raw);
  if(config.payments!=='live')return; // Stopping new sales must remain possible.
  const issues:string[]=[];const chat=committedRuntimeConfig(toml);
  if(!config.api||!config.paidService||!config.fullDeck)issues.push('Studio paid delivery is off');
  if(!config.paymentProviders.length)issues.push('Studio has no payment provider');
  if(!TERMS_PLAN[config.terms.version]||config.terms.version!==chat.GPT_BILLING_TERMS_VERSION)issues.push('Studio/chat offer editions differ');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(config.terms.approvedAt)||Date.parse(config.terms.approvedAt)>Date.now())issues.push('Studio owner approval date missing/future');
  for(const locale of ['ru','uz'] as const){
    const file=`content/pages/${locale}/oferta.json`;const offer=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
    if(offer.termsVersion!==config.terms.version||offer.status!=='published'||!JSON.stringify(offer.bodyBlocks).includes('Studio'))issues.push(`${file}: published Studio terms missing`);
    const url=new URL(config.terms[locale]);
    if(url.origin!=='https://gptbot.uz'||url.pathname!==offer.url)issues.push(`${locale}: offer URL mismatch`);
    const built=path.join(dist,url.pathname,'index.html');
    if(!fs.existsSync(built)||!fs.readFileSync(built,'utf8').includes(config.terms.version))issues.push(`${locale}: built offer edition missing`);
  }
  for(const name of ['GPT_IDENTITY_SECRET','STUDIO_TURNSTILE_SECRET_KEY','ZAI_API_KEY',...(config.paymentProviders.includes('payme')?['GPT_PAYME_KEY','GPT_PAYME_MERCHANT_ID']:[]),...(config.paymentProviders.includes('click')?[config.clickUseChatService?'GPT_CLICK_CREDENTIALS_JSON':'STUDIO_CLICK_CREDENTIALS_JSON']:[])])if(production&&!production.has(name))issues.push(`missing production secret name ${name}`);
  if(config.paymentProviders.includes('payme')&&chat.GPT_BILLING_MODE_PAYME!=='live')issues.push('Payme cash desk is not live');
  if(config.paymentProviders.includes('click')&&config.clickUseChatService&&chat.GPT_BILLING_MODE_CLICK!=='live')issues.push('Shared Click cash desk is not live');
  if(config.paymentProviders.includes('click')&&!config.clickAmountsConfirmed)issues.push('Studio Click amounts not confirmed');
  for(const field of ['GPT_FISCAL_IKPU','GPT_FISCAL_PACKAGE_CODE','GPT_FISCAL_VAT_PERCENT','GPT_FISCAL_TIN'])if(!chat[field])issues.push(`missing ${field}`);
  if(config.freeTextFallback)issues.push('unreviewed Studio AI fallback');
  for(const page of ['uz/tariflar','uz/taqdimot-ai','ru/prezentatsiya-ai'])if(!fs.existsSync(path.join(dist,page,'index.html')))issues.push(`missing built ${page}`);
  if(issues.length)throw new Error(`Studio live gate: ${issues.join('; ')}`);
}
