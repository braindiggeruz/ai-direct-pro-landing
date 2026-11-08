import assert from 'node:assert/strict';
import fs from 'node:fs';

const file = 'content/seo/intent-manifest.json';
let text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const manifest = JSON.parse(text);
assert.ok(!manifest.pairs.some(p => p.id.startsWith('PSEO20-')));
const incoming = JSON.parse(fs.readFileSync('reports/pseo20-20261108/incoming-links.json', 'utf8'));
const keywords = p => p.keywords || [p.primaryKeyword, ...(p.secondaryKeywords || [])].filter(Boolean);
const seen = new Set();
const pairs = [];
for (const [src, entries] of Object.entries(incoming)) {
  const parent = JSON.parse(fs.readFileSync(`content/${src}.json`, 'utf8'));
  for (const [slug] of entries) {
    if (seen.has(slug)) continue;
    seen.add(slug);
    const child = JSON.parse(fs.readFileSync(`content/${src.startsWith('blog/') ? 'blog' : 'pages'}/uz/${slug}.json`, 'utf8'));
    assert.deepEqual(keywords(child).filter(k => keywords(parent).includes(k)), []);
    pairs.push({
      id: `PSEO20-${slug}`,
      commercial: { url: parent.url, owns: `Existing broader guide/tool: ${parent.h1}. Retain its current title, H1, declared keywords and useful examples. The legacy field name does not make this informational parent a commercial landing.`, mustNotTarget: keywords(child) },
      informational: { url: child.url, owns: child.description, mustNotTarget: keywords(parent) },
      decision: 'KEEP_DIFFERENT_INTENT', decidedAt: '2026-11-08',
      evidence: 'reports/pseo20-20261108/CANDIDATES.md; original files/questions and independent CONTENT_REVIEW.md',
      gscNote: 'New bounded cohort, no ranking claim. Historical exact and head demand are distinguished in CANDIDATES.md; assess query→URL distribution after recrawl. Each page has its own usable document or original exercises, no synonym/city Cartesian product.',
    });
  }
}
assert.equal(pairs.length, 20);
const marker = '\n  ],\n  "architectureDecisions": [';
assert.equal(text.split(marker).length, 2);
const serialized = pairs.map(p => JSON.stringify(p, null, 2).split('\n').map(l => '    ' + l).join('\n')).join(',\n');
text = text.replace(marker, ',\n' + serialized + marker);
text = text.replace('"updatedAt": "2026-10-26"', '"updatedAt": "2026-11-08"');
const before = JSON.parse(text);
const decision = {
  id: 'A12-pseo20-useful-documents-and-practice-2026-11-08',
  decision: 'ADD_20_DISTINCT_UZ_RESOURCES_WITH_EXISTING_PARENTS', decidedAt: '2026-11-08',
  pages: pairs.map(p => p.informational.url),
  evidence: 'reports/pseo20-20261108/CANDIDATES.md and CONTENT_REVIEW.md; explicit owner instruction to implement best 20 candidates',
  note: 'C32 remains the CV/chat ownership rule. Its older official-form prerequisite for an obyektivka page is superseded for this exact, explicitly nonofficial educational sample: a filled illustrative example and editable blank DOCX/PDF with privacy guidance, never a universal official employment form. The CV guide keeps its section, FAQ and keywords. All ten document pages supply original downloads. Ten practice pages supply 120 original questions, worked examples and source-grounded explanations. Biology/chemistry concepts differ from calculation exercises; grade 1–3 differ from the existing grade 5–9 mathematics pilot. No new RU equivalents or x-default to unrelated pages; shared bot/payment/chat logic stays unchanged. Review new/parent query overlap after 4–6 weeks; do not scale automatically.',
};
const end = text.lastIndexOf('\n  ]');
assert.ok(end > 0);
text = text.slice(0, end) + ',\n' + JSON.stringify(decision, null, 2).split('\n').map(l => '    ' + l).join('\n') + text.slice(end);
const after = JSON.parse(text);
assert.deepEqual(after.pairs.slice(0, manifest.pairs.length), manifest.pairs);
assert.deepEqual(after.architectureDecisions.slice(0, before.architectureDecisions.length), manifest.architectureDecisions);
fs.writeFileSync(file, text);
console.log('Registered 20 intent pairs and one explicit architectural decision; previous pairs remain intact.');
