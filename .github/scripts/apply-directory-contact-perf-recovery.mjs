import fs from 'node:fs';

function read(file) {
  return fs.readFileSync(file, 'utf8');
}
function write(file, source) {
  fs.writeFileSync(file, source, 'utf8');
  console.log(`[directory-perf] updated ${file}`);
}
function replaceOnce(source, from, to, label) {
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one marker, got ${count}`);
  return source.replace(from, to);
}

{
  const file = 'functions/platform/lead-radar/recipient-directory.ts';
  let source = read(file);
  source = replaceOnce(
    source,
    `export interface DirectoryGroup {\n  key: string; companyId: string; members: DirectoryCompany[]; keys: string[];\n  blocked: boolean; conflict: boolean; contacted: boolean;\n}\nfunction parse<T>(value: string | null, fallback: T): T { try { return JSON.parse(value ?? 'null') ?? fallback; } catch { return fallback; } }\n`,
    `export interface DirectoryGroup {\n  key: string; companyId: string; members: DirectoryCompany[]; keys: string[];\n  blocked: boolean; conflict: boolean; contacted: boolean; hasBusinessContact: boolean;\n}\nconst MAX_DIRECTORY_CONTACT_CANDIDATES_PER_COMPANY = 256;\nconst MAX_DIRECTORY_PHONE_EVIDENCE_PER_COMPANY = 128;\nfunction parse<T>(value: string | null, fallback: T): T { try { return JSON.parse(value ?? 'null') ?? fallback; } catch { return fallback; } }\n`,
    'directory group contract',
  );
  source = replaceOnce(
    source,
    `  const keysById = new Map<string, string[]>();\n  for (const row of rows) {\n    const sources = parse<Array<{ candidates?: unknown[] }>>(row.sources_json, []);\n    const candidates = Array.isArray(sources) ? sources.flatMap((source) => Array.isArray(source?.candidates) ? source.candidates : []) : [];\n    const choices = recipientContactChoices({ phone: row.phone, country: row.country, telegramUrl: row.telegram_url,\n      telegramContact: parse<LeadRadarTelegramContact | null>(row.telegram_contact_json, null),\n      evidence: parse<string[]>(row.phones_json, []).filter((value) => typeof value === 'string').map((value) => ({\n        id: '', fieldPath: 'company_contacts.phone', value, sourceUrl: '', sourceType: 'openstreetmap', observedAt: '', confidence: 0, classification: 'fact',\n      })),\n      contactCandidates: candidates.filter((value): value is NonNullable<Parameters<typeof recipientContactChoices>[0]['contactCandidates']>[number] =>\n        Boolean(value) && typeof value === 'object' && typeof (value as {value?: unknown}).value === 'string'\n        && ['phone','telegram'].includes((value as {kind: string}).kind)),\n    });\n    keysById.set(row.id, choices.keys);\n    const identity = root(\`company:\${row.canonical_key}\`);\n    for (const key of choices.keys) parent.set(root(key), root(identity));\n  }\n`,
    `  const keysById = new Map<string, string[]>();\n  const businessById = new Map<string, boolean>();\n  for (const row of rows) {\n    // Parse each persisted contact representation once. Directory reads may scan\n    // thousands of rows, so status filters and sorting must reuse this projection.\n    const telegramContact = parse<LeadRadarTelegramContact | null>(row.telegram_contact_json, null);\n    const sources = parse<Array<{ candidates?: unknown[] }>>(row.sources_json, []);\n    const candidates: NonNullable<Parameters<typeof recipientContactChoices>[0]['contactCandidates']>[number][] = [];\n    sourceLoop: for (const source of Array.isArray(sources) ? sources : []) {\n      if (!Array.isArray(source?.candidates)) continue;\n      for (const candidate of source.candidates) {\n        if (!candidate || typeof candidate !== 'object' || typeof (candidate as { value?: unknown }).value !== 'string'\n          || !['phone','telegram'].includes((candidate as { kind?: unknown }).kind as string)) continue;\n        if (candidates.length >= MAX_DIRECTORY_CONTACT_CANDIDATES_PER_COMPANY) break sourceLoop;\n        candidates.push(candidate as NonNullable<Parameters<typeof recipientContactChoices>[0]['contactCandidates']>[number]);\n      }\n    }\n    const phoneEvidence = parse<unknown[]>(row.phones_json, [])\n      .filter((value): value is string => typeof value === 'string')\n      .slice(0, MAX_DIRECTORY_PHONE_EVIDENCE_PER_COMPANY);\n    const choices = recipientContactChoices({ phone: row.phone, country: row.country, telegramUrl: row.telegram_url,\n      telegramContact,\n      evidence: phoneEvidence.map((value) => ({\n        id: '', fieldPath: 'company_contacts.phone', value, sourceUrl: '', sourceType: 'openstreetmap', observedAt: '', confidence: 0, classification: 'fact',\n      })),\n      contactCandidates: candidates,\n    });\n    keysById.set(row.id, choices.keys);\n    businessById.set(row.id, telegramContact?.type === 'business');\n    const identity = root(\`company:\${row.canonical_key}\`);\n    for (const key of choices.keys) parent.set(root(key), root(identity));\n  }\n`,
    'bounded contact projection',
  );
  source = replaceOnce(
    source,
    `    const eligibleMembers = members.filter((row) => keysById.get(row.id)?.length);\n    eligibleMembers.sort((a,b) => Number(parse<LeadRadarTelegramContact | null>(b.telegram_contact_json,null)?.type==='business')\n      - Number(parse<LeadRadarTelegramContact | null>(a.telegram_contact_json,null)?.type==='business')\n      || b.last_verified_at.localeCompare(a.last_verified_at) || a.id.localeCompare(b.id));\n    return [{ key, keys, companyId: eligibleMembers[0].id, members,\n      blocked: members.some((row) => Boolean(row.blocked)), conflict: new Set(members.map((row) => row.canonical_key)).size>1,\n      contacted: members.some((row) => Boolean(row.contacted)) }];\n`,
    `    const eligibleMembers = members.filter((row) => keysById.get(row.id)?.length);\n    eligibleMembers.sort((a,b) => Number(businessById.get(b.id)) - Number(businessById.get(a.id))\n      || b.last_verified_at.localeCompare(a.last_verified_at) || a.id.localeCompare(b.id));\n    return [{ key, keys, companyId: eligibleMembers[0].id, members,\n      blocked: members.some((row) => Boolean(row.blocked)), conflict: new Set(members.map((row) => row.canonical_key)).size>1,\n      contacted: members.some((row) => Boolean(row.contacted)),\n      hasBusinessContact: members.some((row) => businessById.get(row.id) === true) }];\n`,
    'cached directory sorting',
  );
  write(file, source);
}

{
  const file = 'functions/platform/lead-radar/audiences.ts';
  let source = read(file);
  source = replaceOnce(
    source,
    `      const potential=matches.filter((group)=>group.members.some((member)=>{\n        try{return JSON.parse(member.telegram_contact_json ?? 'null')?.type==='business';}catch{return false;}\n      }));\n`,
    `      const potential=matches.filter((group)=>group.hasBusinessContact);\n`,
    'reuse parsed business-contact state',
  );
  write(file, source);
}

{
  const file = 'tests/lead-radar-crawler-contract.test.ts';
  let source = read(file);
  if (!source.includes("recipient directory contact parsing is bounded once")) {
    source += `\n\ntest('recipient directory contact parsing is bounded once and reused by status filters', () => {\n  const directory = read('functions/platform/lead-radar/recipient-directory.ts');\n  const audiences = read('functions/platform/lead-radar/audiences.ts');\n  assert.match(directory, /MAX_DIRECTORY_CONTACT_CANDIDATES_PER_COMPANY = 256/);\n  assert.match(directory, /MAX_DIRECTORY_PHONE_EVIDENCE_PER_COMPANY = 128/);\n  assert.match(directory, /const telegramContact = parse<LeadRadarTelegramContact \\| null>/);\n  assert.match(directory, /const businessById = new Map<string, boolean>/);\n  assert.match(directory, /hasBusinessContact: members\\.some/);\n  assert.equal((directory.match(/parse<LeadRadarTelegramContact \\| null>/g) ?? []).length, 1);\n  assert.match(audiences, /matches\\.filter\\(\\(group\\)=>group\\.hasBusinessContact\\)/);\n  assert.doesNotMatch(audiences, /JSON\\.parse\\(member\\.telegram_contact_json/);\n});\n`;
  }
  write(file, source);
}

console.log('[directory-perf] transformation complete');
