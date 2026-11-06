/** Static file examples. No client bundle, account, generation request or conversion event. */
export interface StudioExampleCard {
  id: string;
  title: string;
  description: string;
  language: string;
  downloadLabel: string;
  previewLabel: string;
  previewAlt: string;
  detailsLabel: string;
}
export interface StudioExamples {
  heading: string;
  intro: string;
  note: string;
  cards: StudioExampleCard[];
}
export const EXAMPLE_IDS = ['uz-oquv-reja-v1', 'ru-korotkoe-vystuplenie-v1'] as const;
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown) => typeof value === 'string' && value.length > 0 && value.trim() === value;

export function exampleProblems(value: unknown): string[] {
  if (value === undefined) return [];
  if (!object(value)) return ['examples must be an object'];
  const problems: string[] = [];
  const keys = new Set(['heading', 'intro', 'note', 'cards']);
  if (Object.keys(value).some((key) => !keys.has(key))) problems.push('examples: unknown field');
  for (const field of ['heading', 'intro', 'note']) if (!text(value[field])) problems.push(`examples.${field}: required text`);
  if (!Array.isArray(value.cards) || value.cards.length !== 2) return [...problems, 'examples.cards: exactly two curated examples'];
  const seen = new Set<string>();
  const fields = ['id', 'title', 'description', 'language', 'downloadLabel', 'previewLabel', 'previewAlt', 'detailsLabel'];
  for (const card of value.cards) {
    if (!object(card) || fields.some((field) => !text(card[field])) || Object.keys(card).some((key) => !fields.includes(key))) {
      problems.push('examples.cards: incomplete card or unknown field');
      continue;
    }
    const id = card.id as string;
    if (!(EXAMPLE_IDS as readonly string[]).includes(id) || seen.has(id)) problems.push('examples.cards: unknown or duplicate example');
    seen.add(id);
  }
  return problems;
}

export function exampleAssetPaths(): string[] {
  return EXAMPLE_IDS.flatMap((id) => [`/studio-examples/${id}.pptx`, ...Array.from({ length: 6 }, (_, i) => `/studio-examples/${id}-${i + 1}.png`)]);
}

// Studio's generated stylesheet is also imported by the chat presentation island.
// Keep gallery CSS page-local: adding utility candidates would change that protected graph.
const EXAMPLE_STYLES = `<style>
#presentation-examples{margin-top:3rem}
#presentation-examples h2{font-size:1.25rem;font-weight:600;line-height:1.375;color:#e6eef7}
#presentation-examples .example-intro{margin-top:1rem;font-size:1rem;line-height:1.625;color:#9fb0c3}
#presentation-examples .example-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:1rem;margin-top:1rem}
#presentation-examples article{min-width:0;border:1px solid #1f2b3d;border-radius:1rem;background:#08111f;padding:1rem;overflow-wrap:anywhere}
#presentation-examples .example-language{font-size:.875rem;line-height:1.5;color:#9fb0c3}
#presentation-examples h3{margin-top:.5rem;font-size:1.125rem;font-weight:600;line-height:1.5;color:#e6eef7}
#presentation-examples .example-description{margin-top:.5rem;font-size:1rem;line-height:1.625;color:#9fb0c3}
#presentation-examples .example-cover{display:block;margin-top:1rem}
#presentation-examples img{display:block;width:100%;height:auto;border-radius:.75rem}
#presentation-examples details{margin-top:1rem}
#presentation-examples summary{min-height:44px;padding:12px 0;cursor:pointer;font-size:.875rem;line-height:20px;color:#2fe6d1}
#presentation-examples .example-slides{margin-top:1rem}
#presentation-examples .example-slides img+img{margin-top:.75rem}
#presentation-examples .example-download{display:flex;min-height:44px;align-items:center;justify-content:center;margin-top:1rem;border:1px solid #2fe6d1;border-radius:.75rem;padding:.75rem 1rem;font-size:1rem;font-weight:600;line-height:1.5;text-align:center;color:#2fe6d1}
#presentation-examples .example-download:hover{background:#0c1828}
#presentation-examples a:focus-visible,#presentation-examples summary:focus-visible{outline:2px solid #2fe6d1;outline-offset:3px}
#presentation-examples .example-note{margin-top:1rem;font-size:.875rem;line-height:1.5;color:#9fb0c3}
@media(min-width:640px){#presentation-examples h2{font-size:1.5rem}#presentation-examples .example-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>`;

export function renderExamples(examples?: StudioExamples): string {
  if (!examples) return '';
  const cards = examples.cards.map((card) => {
    const image = (index: number) => `<img src="/studio-examples/${card.id}-${index}.png" alt="${escape(card.previewAlt)} ${index}/6" width="960" height="540" loading="lazy" decoding="async" />`;
    return `<article data-studio-example="${card.id}">
<p class="example-language">${escape(card.language)}</p>
<h3>${escape(card.title)}</h3>
<p class="example-description">${escape(card.description)}</p>
<a href="/studio-examples/${card.id}-1.png" class="example-cover" aria-label="${escape(card.previewLabel)}">${image(1)}</a>
<details><summary>${escape(card.detailsLabel)}</summary><div class="example-slides">${[2, 3, 4, 5, 6].map(image).join('')}</div></details>
<a href="/studio-examples/${card.id}.pptx" download="${card.id}.pptx" type="application/vnd.openxmlformats-officedocument.presentationml.presentation" class="example-download">${escape(card.downloadLabel)}</a>
</article>`;
  }).join('\n');
  return `<section id="presentation-examples" aria-labelledby="presentation-examples-title">
${EXAMPLE_STYLES}
<h2 id="presentation-examples-title">${escape(examples.heading)}</h2>
<p class="example-intro">${escape(examples.intro)}</p>
<div class="example-grid">${cards}</div>
<p class="example-note">${escape(examples.note)}</p>
</section>`;
}
