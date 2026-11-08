/** Reviewed 2026-11-08 cohort: exact URLs, never a wildcard layout opt-in. */
export const PSEO_DOCUMENT_SLUGS = [
  'tarjimai-hol-namuna', 'bayonnoma-namuna', 'dalolatnoma-namuna',
  'tavsiyanoma-namuna', 'amaliyot-kundaligi-namuna', 'amaliyot-hisoboti-namuna',
  'obyektivka-namuna', 'bildirishnoma-namuna', 'javob-xati-namuna', 'motivatsion-xat-namuna',
] as const;

export const PSEO_PRACTICE_PAGES = [
  { slug: 'karra-jadvali', set: 'uz-karra-jadvali', parent: '/uz/matematika-test/' },
  { slug: 'matematika-misollar-1-sinf', set: 'uz-matematika-1-sinf', parent: '/uz/matematika-test/' },
  { slug: 'matematika-misollar-2-sinf', set: 'uz-matematika-2-sinf', parent: '/uz/matematika-test/' },
  { slug: 'matematika-misollar-3-sinf', set: 'uz-matematika-3-sinf', parent: '/uz/matematika-test/' },
  { slug: 'tenglama-yechish', set: 'uz-tenglama', parent: '/uz/matematika-test/' },
  { slug: 'biologiya-test', set: 'uz-biologiya', parent: '/uz/onlayn-testlar/' },
  { slug: 'kimyo-test', set: 'uz-kimyo', parent: '/uz/onlayn-testlar/' },
  { slug: 'fizika-masalalar', set: 'uz-fizika-masalalar', parent: '/uz/fizika-test/' },
  { slug: 'kimyo-masalalar', set: 'uz-kimyo-masalalar', parent: '/uz/onlayn-testlar/' },
  { slug: 'geometriya-masalalar', set: 'uz-geometriya-masalalar', parent: '/uz/matematika-test/' },
] as const;

export const PSEO_DOWNLOAD_URLS = PSEO_DOCUMENT_SLUGS.flatMap((slug) => [
  `/downloads/pseo-20261108/${slug}.docx`, `/downloads/pseo-20261108/${slug}.pdf`,
]);
export const PSEO_PAGE_URLS = [
  ...PSEO_DOCUMENT_SLUGS.map((slug) => `/uz/blog/${slug}/`),
  ...PSEO_PRACTICE_PAGES.map(({ slug }) => `/uz/${slug}/`),
];
