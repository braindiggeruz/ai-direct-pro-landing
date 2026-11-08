// Reviewed, additive incoming links. Run once; reruns do not duplicate blocks.
import fs from 'node:fs';

const links = {
  'blog/uz/rezyume-tayyorlash': [
    ['tarjimai-hol-namuna', 'Tarjimai hol: xronologik namuna'],
    ['obyektivka-namuna', 'Obyektivka: qisqa ma’lumotnoma'],
    ['motivatsion-xat-namuna', 'O‘quv dasturiga motivatsion xat'],
  ],
  'blog/uz/rasmiy-xat-yozish': [
    ['bayonnoma-namuna', 'Yig‘ilish bayonnomasi namunasi'],
    ['dalolatnoma-namuna', 'Topshirish-qabul qilish dalolatnomasi'],
    ['bildirishnoma-namuna', 'Ichki bildirishnoma namunasi'],
    ['javob-xati-namuna', 'Murojaatga javob xati namunasi'],
  ],
  'blog/uz/tavsifnoma-namuna': [['tavsiyanoma-namuna', 'Tavsiyanoma: nomzodni tavsiya qilish xati']],
  'blog/uz/chatgpt-talabalar-uchun': [
    ['amaliyot-kundaligi-namuna', 'Amaliyot kundaligi: kunlik qaydlar'],
    ['amaliyot-hisoboti-namuna', 'Amaliyot hisoboti: yakuniy tuzilma'],
  ],
  'blog/uz/tushuntirish-xati-va-ariza-yozish': [['javob-xati-namuna', 'Arizaga javob yozish namunasi']],
  'pages/uz/matematika-test': [
    ['karra-jadvali', 'Karra jadvali va ko‘paytirish mashqlari'],
    ['matematika-misollar-1-sinf', '1-sinf: qo‘shish va ayirish'],
    ['matematika-misollar-2-sinf', '2-sinf: ikki xonali sonlar bilan misollar'],
    ['matematika-misollar-3-sinf', '3-sinf: ko‘paytirish va bo‘lish'],
    ['tenglama-yechish', 'Chiziqli tenglamani bosqichma-bosqich yechish'],
    ['geometriya-masalalar', 'Geometriya: perimetr va yuza masalalari'],
  ],
  'pages/uz/onlayn-testlar': [
    ['biologiya-test', 'Biologiya: tushunchalarni tekshirish'],
    ['kimyo-test', 'Kimyo: tushuncha va belgilar testi'],
    ['kimyo-masalalar', 'Kimyo: hisoblash masalalari'],
  ],
  'pages/uz/fizika-test': [['fizika-masalalar', 'Fizika masalalari: formula, birlik va yechim']],
};

for (const [source, entries] of Object.entries(links)) {
  const filename = `content/${source}.json`;
  const doc = JSON.parse(fs.readFileSync(filename, 'utf8'));
  const isBlog = source.startsWith('blog/');
  const selected = entries.map(([slug, anchor], i) => ({
    token: `pseo${i + 1}`, target: `/uz/${isBlog ? 'blog/' : ''}${slug}/`, anchor,
  }));
  const field = isBlog ? 'body' : 'bodyBlocks';
  if (doc[field].some(b => b.links?.some(l => l.token === 'pseo1'))) throw new Error(`Already integrated: ${source}`);
  const block = { type: 'linkp', text: `Alohida vazifa uchun amaliy materiallar: ${selected.map(l => `{${l.token}}`).join('; ')}.`, links: selected };
  const lastCta = doc[field].findLastIndex(b => b.type === 'cta');
  doc[field].splice(lastCta < 0 ? doc[field].length : lastCta, 0, block);
  for (const link of selected) if (!doc.internalLinks.some(l => l.target === link.target)) {
    doc.internalLinks.push({ target: link.target, anchor: link.anchor, locale: 'uz', type: 'contextual' });
  }
  doc.updatedAt = '2026-11-08T00:00:00.000Z';
  if (isBlog) doc.dateModified = '2026-11-08';
  fs.writeFileSync(filename, JSON.stringify(doc, null, 2) + '\n');
}
fs.writeFileSync('reports/pseo20-20261108/incoming-links.json', JSON.stringify(links, null, 2) + '\n');
console.log(`Added 21 contextual links from ${Object.keys(links).length} existing parents; search metadata retained.`);
