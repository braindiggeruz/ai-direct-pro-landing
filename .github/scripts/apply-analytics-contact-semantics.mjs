import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const abs = (file) => path.join(ROOT, file);
const read = (file) => fs.readFileSync(abs(file), 'utf8');
const write = (file, value) => {
  fs.writeFileSync(abs(file), value, 'utf8');
  console.log(`[analytics-contact-semantics] updated ${file}`);
};

function replaceExactly(source, pattern, replacement, label) {
  const matches = source.match(pattern);
  if (!matches || matches.length !== 1) {
    throw new Error(`${label}: expected exactly one match, found ${matches ? matches.length : 0}`);
  }
  return source.replace(pattern, replacement);
}

function contactEventBlock(indent) {
  return `${indent}// A browser click only proves that the official contact link was activated.\n` +
    `${indent}// It does not prove Telegram opened, a message was sent, or a request was\n` +
    `${indent}// received. Keep this as a custom contact_click event; generate_lead is\n` +
    `${indent}// reserved for a future server, form or CRM acknowledgement.\n` +
    `${indent}if (isContactTg) {\n` +
    `${indent}  gtag('event','contact_click',{\n` +
    `${indent}    page_path: location.pathname,\n` +
    `${indent}    locale: seoLocale,\n` +
    `${indent}    page_kind: isArticle ? 'article' : 'landing',\n` +
    `${indent}    service_slug: serviceSlug,\n` +
    `${indent}    cta_text: label,\n` +
    `${indent}    cta_zone: ctaZone(el),\n` +
    `${indent}    target_url: href,\n` +
    `${indent}    contact_kind: 'contact',\n` +
    `${indent}    contact_method: 'telegram'\n` +
    `${indent}  });\n` +
    `${indent}}\n`;
}

function updateSharedSnippet() {
  const file = 'scripts/analytics-snippet.ts';
  let source = read(file);

  source = replaceExactly(
    source,
    /\/\/   - generate_lead when a visitor opens the studio's own Telegram contact\n\/\/\n\/\/ Lead semantics\.[\s\S]*?\/\/ does not exist yet\.\n\/\/\n\/\/ Privacy:/,
    `//   - contact_click when a visitor activates the studio's Telegram contact\n//\n// Contact semantics. A Telegram link click is observable; a sent message, a\n// received request and a qualified lead are not. Google defines generate_lead\n// for a lead that has actually been generated (for example, through a form),\n// so the browser must not emit it at click time. contact_click remains a custom\n// diagnostic event. generate_lead, working_lead, qualify_lead and\n// close_convert_lead belong to a future acknowledged form, bridge or CRM signal.\n//\n// Privacy:`,
    'shared analytics header semantics',
  );

  source = source.replace(
    /\/\/ Privacy: every event carries page path, page title, a truncated CTA label and\n\/\/ the outgoing URL\. No form values, no phone or email, no Telegram username, no\n\/\/ message text — nothing a visitor typed ever reaches the dataLayer\./,
    `// Privacy: every event carries page path, page title, a truncated CTA label and\n// the public destination URL. No form values, phone, email, message text or\n// visitor-supplied identifier reaches the dataLayer.`,
  );

  source = replaceExactly(
    source,
    /    \/\/ The one lead this site can honestly observe\.[\s\S]*?    }\n    \/\/ Any CTA on a service landing/,
    `${contactEventBlock('    ')}    // Any CTA on a service landing`,
    'shared contact event block',
  );

  write(file, source);
}

function updateIndexHtml() {
  const file = 'index.html';
  let source = read(file);
  source = replaceExactly(
    source,
    /          \/\/ The one lead this site can honestly observe\.[\s\S]*?          }\n          \/\/ Any CTA on a service landing/,
    `${contactEventBlock('          ')}          // Any CTA on a service landing`,
    'index contact event block',
  );
  write(file, source);
}

function updateAnalyticsTests() {
  const file = 'tests/seo-analytics-privacy.test.ts';
  let source = read(file);

  // The existing suite already pins event presence, contact-handle ownership,
  // payload dimensions, index/snippet parity, privacy and product-bot exclusion.
  // Repoint those assertions from the falsely elevated lead event to the honest
  // click-stage event, then add a separate negative assertion for generate_lead.
  source = source.replaceAll('generate_lead', 'contact_click');
  source = source
    .replaceAll(
      'A Telegram click proves an enquiry was started, nothing more.',
      'A Telegram click proves that a contact link was activated, nothing more.',
    )
    .replaceAll(
      'The lead event keys off the studio\'s own Telegram handle.',
      'The contact event keys off the studio\'s own Telegram handle.',
    )
    .replaceAll(
      'the low-count contact_click signal the funnel is measured',
      'the low-count contact_click signal the funnel is measured',
    );

  const marker = `test('no analytics payload carries a phone number or an email address', () => {`;
  const insertion = `test('a Telegram click never fabricates GA4 generate_lead', () => {\n  for (const source of [ANALYTICS_HEAD, indexHtmlAnalyticsBlock()]) {\n    assert.ok(\n      !source.includes("gtag('event','generate_lead'"),\n      'generate_lead must wait for an acknowledged form, bridge or CRM event',\n    );\n    const payload = eventPayload(source, 'contact_click');\n    assert.match(payload, /contact_kind:\\s*'contact'/);\n    assert.match(payload, /contact_method:\\s*'telegram'/);\n  }\n});\n\n`;
  if (!source.includes(marker)) throw new Error('analytics test insertion marker is missing');
  source = source.replace(marker, `${insertion}${marker}`);

  write(file, source);
}

function addMeasurementContract() {
  const file = 'docs/seo/MEASUREMENT_CONTRACT_2026-08-31.md';
  const body = `# GPTBot.uz — organic contact and lead measurement contract\n\nDate: 2026-08-31  \nScope: public website browser events and the future CRM hand-off.  \nProduction change: not included in this branch until a separate merge/deploy decision.\n\n## Why this contract exists\n\nA browser can observe a click on a Telegram URL. It cannot observe whether Telegram opened successfully, whether the visitor sent a message, whether GPTBot received it, whether the request was qualified or whether a sale occurred. Treating the click as \`generate_lead\` inflated the lead stage and made organic conversion reporting unreliable.\n\nGoogle's recommended-event reference defines \`generate_lead\` for a lead that has been generated, for example through a form. Later lead stages such as \`working_lead\`, \`qualify_lead\` and \`close_convert_lead\` require corresponding business-state evidence.\n\nPrimary references:\n\n- https://developers.google.com/analytics/devguides/collection/ga4/reference/events\n- https://support.google.com/analytics/answer/14239696\n\n## Event contract\n\n| Event | Trigger | What it proves | What it does not prove | Source |\n|---|---|---|---|---|\n| \`telegram_open_attempt\` | Click on any \`t.me\` or \`tg:\` destination | A Telegram destination was activated | Successful app open, message, contact or lead | Browser |\n| \`contact_click\` | Click on GPTBot's published contact handle | The official contact channel was activated | Message sent, request received, qualification or sale | Browser |\n| \`generate_lead\` | Future acknowledged form, contact bridge or CRM intake | A lead record/request was actually generated | Qualification or sale | Server/bridge/CRM only |\n| \`working_lead\` | Future CRM state showing a representative is working the request | The lead entered active handling | Qualification or sale | CRM only |\n| \`qualify_lead\` | Future CRM state meeting the documented qualification rule | The request meets the qualification rule | Closed sale | CRM only |\n| \`close_convert_lead\` | Future CRM state for a completed conversion | The documented conversion state was reached | Revenue unless separately reconciled | CRM only |\n\nThe current browser implementation emits only the first two events. It deliberately does not emit the four business-state events.\n\n## Browser payload\n\n\`contact_click\` carries only non-secret, non-input context:\n\n- \`page_path\`;\n- \`locale\`;\n- \`page_kind\`;\n- \`service_slug\`;\n- truncated \`cta_text\`;\n- \`cta_zone\`;\n- public \`target_url\`;\n- \`contact_kind=contact\`;\n- \`contact_method=telegram\`.\n\nIt reads no form value, phone, email, message text, cookie value, localStorage value or visitor-supplied identifier. Product-bot links remain \`telegram_open_attempt\` with \`contact_kind=product_bot\` and never become \`contact_click\`.\n\n## GA4 owner dependency\n\nTo report the custom parameters in standard reports or Explorations, an Editor/Administrator must create event-scoped custom dimensions for the parameters that are not already available as predefined dimensions. At minimum register \`service_slug\`, \`contact_kind\`, \`locale\`, \`page_kind\`, \`target_url\`, \`cta_zone\` and \`contact_method\`. Google notes that custom definitions are used to report custom event parameters and can take 24–48 hours to appear in reports.\n\nDo not mark \`contact_click\` as a qualified-lead or revenue key event. A separate key-event decision may be made for contact starts, but reports and dashboards must name the stage truthfully. Reserve \`generate_lead\` for the future acknowledged intake event.\n\n## Acceptance criteria\n\n1. Clicking a GPTBot Telegram contact queues both \`telegram_open_attempt\` and \`contact_click\`.\n2. Clicking a product bot queues \`telegram_open_attempt\` only.\n3. No public-page click handler emits \`generate_lead\`.\n4. \`contact_click\` includes \`contact_method=telegram\` and all commercial breakdown fields.\n5. The prerendered snippet and \`index.html\` stay equivalent.\n6. No analytics payload reads personal input.\n7. Yandex Metrika's existing \`telegram_cta_click\` goal remains unchanged.\n8. A future \`generate_lead\` implementation must have an acknowledgement source, idempotency rule and test fixture.\n`;
  write(file, body);
}

function updateReleaseNote() {
  const file = 'docs/seo/RELEASE_2026-08-31_HOT_TRAFFIC_FOUNDATION.md';
  let source = read(file);
  if (source.includes('## Contact and lead measurement correction')) return;
  source += `\n## Contact and lead measurement correction\n\nThe public browser previously emitted GA4 \`generate_lead\` immediately when a visitor clicked GPTBot's Telegram contact. That click proves only that the contact channel was activated; it cannot prove a sent message or an accepted lead. The click handler now emits the custom \`contact_click\` event with \`contact_method=telegram\`, while \`telegram_open_attempt\` remains the diagnostic event for all Telegram destinations. \`generate_lead\` is reserved for a future acknowledged form, bridge or CRM intake.\n\nThe contract and owner dependencies are documented in \`docs/seo/MEASUREMENT_CONTRACT_2026-08-31.md\`. The existing Yandex Metrika \`telegram_cta_click\` goal is unchanged.\n`;
  write(file, source);
}

updateSharedSnippet();
updateIndexHtml();
updateAnalyticsTests();
addMeasurementContract();
updateReleaseNote();
console.log('[analytics-contact-semantics] transformation complete');
