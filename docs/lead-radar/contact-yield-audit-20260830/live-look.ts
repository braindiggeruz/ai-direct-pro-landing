// Historical diagnostic. The original five-request approval is EXHAUSTED.
// A new run requires a NEW owner approval: one category + two company cards.
// No D1, provider APIs, Telegram, member lists, cookies or contact reveal calls.
import { readPublicPageHtml, readPublicWebsiteRobots, robotsAllows } from '../../../functions/platform/lead-radar/sources';
import { publishedBusinessEntities } from '../../../functions/platform/lead-radar/business-contact-data';
const origin='https://top.uz';
async function main(){
  if (!process.argv.includes('--new-owner-approved-look')) throw new Error('new_owner_approval_required');
  const policy=await readPublicWebsiteRobots(new URL(origin));
  const read=async(path:string)=>{
    const url=new URL(path,origin);
    if(url.origin!==origin || (policy!==null && !robotsAllows(policy,url))) throw new Error('policy_denied');
    return readPublicPageHtml(url.toString(), { maxBytes:900000,sameOrigin:true,allowRedirects:false });
  };
  const html=await read('/section/stomatologii');
  if(!html){console.log(JSON.stringify({category:'unavailable_within_safe_reader'}));return;}
  const urls=[...new Set([...html.matchAll(/href\s*=\s*["'](\/company\/[a-z0-9-]+\/?)["']/gi)].map(m=>m[1]))];
  console.log(JSON.stringify({category:'stomatologii',bytes:Buffer.byteLength(html),listingLinks:urls.length,
    structuredEntities:publishedBusinessEntities(html).length,hasTelegramLinks:/t\.me\//i.test(html)}));
  for(const path of urls.slice(0,2)){
    const card=await read(path);if(!card){console.log(JSON.stringify({path,status:'unavailable'}));continue;}
    const entities=publishedBusinessEntities(card);
    console.log(JSON.stringify({path,bytes:Buffer.byteLength(card),entities:entities.map(e=>({name:e.name,
      phones:e.phones.length,address:!!e.address,links:e.links.map(l=>{try{return new URL(l.value).hostname;}catch{return 'invalid';}})})),
      contactBlock:!!card.match(/id=["']contacts["']/),telegramAnchors:[...card.matchAll(/<a\b[^>]*href=["']([^"']*(?:t\.me|telegram\.me)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)]
        .map(m=>({label:m[2].replace(/<[^>]*>/g,'').trim().slice(0,80),usernameKind:/bot\/?$/i.test(m[1])?'bot_suffix':'candidate'}))}));
  }
}
main().catch(()=>{console.error('bounded_look_unavailable');process.exitCode=1;});
