// scripts/jsonld-helpers.ts
//
// Build-time helpers that produce production-grade JSON-LD fragments
// reused by /scripts/prerender.ts, /scripts/prerender-blog.ts, and
// /scripts/prerender-home.ts. Centralising the entity layer here means:
//
//   * One canonical Organization across every page (same @id, same
//     description, same areaServed). AI assistants
//     and Knowledge Graph builders treat repeated equivalent triples
//     as a strong signal of entity stability.
//
//   * Only schema.org-valid properties are emitted for each type.
//     Organization must NOT carry inLanguage / slogan / knowsAbout
//     (SEMrush flags them as invalid structured data), and ContactPoint
//     must NOT carry url / areaServed.
//
//   * One canonical WebSite — same name, same inLanguage, same
//     publisher reference.
//
//   * No fake fields. We never emit founder, foundingDate, employee
//     counts, aggregate ratings, prices, or anything not literally
//     present on the public site.
//
// Output is JSON-serialisable plain objects; the caller embeds them
// inside <script type="application/ld+json">.

import type { GlobalSEO } from '../src/shared/types';

const TASHKENT_TIMEZONE = 'Asia/Tashkent';

// ContactPoint.availableLanguage reads better (and validates cleaner) as
// full language names rather than BCP-47 codes.
const LANGUAGE_NAMES: Record<string, string> = { ru: 'Russian', uz: 'Uzbek', en: 'English' };

export function buildOrganizationLd(global: GlobalSEO): Record<string, unknown> {
  // NOTE: inLanguage, legalName, alternateName, slogan and knowsAbout are
  // intentionally NOT emitted — they are not valid Organization properties
  // (inLanguage/slogan/knowsAbout) or are redundant (legalName/alternateName
  // duplicating name), and SEMrush marks them as invalid structured data.
  const org: Record<string, unknown> = {
    '@type': ['Organization', 'ProfessionalService'],
    '@id': `${global.siteUrl}/#org`,
    name: global.organizationName,
    url: `${global.siteUrl}/`,
    // logo must be an ImageObject with url + width/height to validate.
    logo: {
      '@type': 'ImageObject',
      url: global.logo,
      width: 1200,
      height: 630,
    },
    image: global.defaultOgImage,
  };
  if (global.organizationDescription) org.description = global.organizationDescription;
  else if (global.organizationShortDescription) org.description = global.organizationShortDescription;

  // areaServed — list of countries / cities. Falls back to Uzbekistan + Tashkent.
  const areas = (global.areaServed && global.areaServed.length > 0
    ? global.areaServed
    : [{ type: 'Country', name: 'Uzbekistan' }, { type: 'City', name: 'Tashkent' }]
  ).map((a) => ({ '@type': a.type, name: a.name }));
  org.areaServed = areas;

  // Address — city + country only. Street is intentionally omitted because
  // it is not published on the public site and we never invent location data.
  if (global.addressLocality || global.addressCountry) {
    org.address = {
      '@type': 'PostalAddress',
      ...(global.addressLocality ? { addressLocality: global.addressLocality } : {}),
      ...(global.addressCountry ? { addressCountry: global.addressCountry } : {}),
    };
  }

  // contactPoint — ContactPoint has no `url` or `areaServed` properties on
  // schema.org, so only contactType + telephone + availableLanguage are emitted.
  // telephone appears once global.phone is filled in content/global/site.json.
  const langCodes = global.availableLanguage && global.availableLanguage.length > 0 ? global.availableLanguage : ['ru', 'uz'];
  org.contactPoint = {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    ...(global.phone ? { telephone: global.phone } : {}),
    availableLanguage: langCodes.map((code) => LANGUAGE_NAMES[code] || code),
  };
  if (global.phone) org.telephone = global.phone;

  // sameAs — every confirmed external profile.
  if (global.sameAs && global.sameAs.length > 0) org.sameAs = global.sameAs;

  // openingHoursSpecification — bots respond 24/7; the human handoff happens
  // at operator pace. We declare 24/7 against the AI-bot service only,
  // not the studio's office hours.

  return org;
}

// Named expert Person node — E-E-A-T anchor for Article.author and the
// About/team pages. Only emitted when the author is configured in
// content/global/site.json (never invented).
export function buildAuthorPersonLd(global: GlobalSEO): Record<string, unknown> | null {
  if (!global.authorName) return null;
  return {
    '@type': 'Person',
    '@id': `${global.siteUrl}/#author`,
    name: global.authorName,
    ...(global.authorUrl ? { url: global.authorUrl } : {}),
    worksFor: { '@id': `${global.siteUrl}/#org` },
    jobTitle: 'Founder',
    knowsLanguage: ['ru', 'uz'],
  };
}

export function buildWebSiteLd(global: GlobalSEO): Record<string, unknown> {
  return {
    '@type': 'WebSite',
    '@id': `${global.siteUrl}/#site`,
    url: `${global.siteUrl}/`,
    name: global.siteName,
    publisher: { '@id': `${global.siteUrl}/#org` },
    inLanguage: global.availableLanguage && global.availableLanguage.length > 0 ? global.availableLanguage : ['ru', 'uz'],
    description: global.defaultDescription,
    // SearchAction enables the Google sitelinks searchbox and signals an
    // on-site search entry point to AI/search crawlers (fixes audit
    // schema-website-search warning). Target uses the blog search page.
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${global.siteUrl}/ru/blog/?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function buildBreadcrumbLd(items: Array<{ name: string; item: string }>): Record<string, unknown> {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: it.item,
    })),
  };
}

export function buildServiceLd(input: {
  global: GlobalSEO;
  url: string;
  name: string;
  description: string;
  serviceType: string;
  dateModified?: string;
  locale?: 'ru' | 'uz';
}): Record<string, unknown> {
  const areaServed = (input.global.areaServed && input.global.areaServed.length > 0
    ? input.global.areaServed
    : [{ type: 'Country', name: 'Uzbekistan' }, { type: 'City', name: 'Tashkent' }]
  ).map((a) => ({ '@type': a.type, name: a.name }));
  return {
    '@type': 'Service',
    name: input.name,
    description: input.description,
    provider: { '@id': `${input.global.siteUrl}/#org` },
    areaServed,
    serviceType: input.serviceType,
    availableLanguage: input.global.availableLanguage && input.global.availableLanguage.length > 0 ? input.global.availableLanguage : ['ru', 'uz'],
    audience: { '@type': 'BusinessAudience', audienceType: 'Small and medium business in Uzbekistan' },
    url: `${input.global.siteUrl}${input.url}`,
    inLanguage: input.locale || 'ru',
    ...(input.dateModified ? { dateModified: input.dateModified } : {}),
    // Bot itself is available 24/7. Declared against the Service so AI
    // engines can answer "is it 24/7?" with a structured value.
    hoursAvailable: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        opens: '00:00',
        closes: '23:59',
      },
    ],
  };
}

export function buildWebPageLd(input: {
  global: GlobalSEO;
  url: string;
  name: string;
  description: string;
  locale: 'ru' | 'uz';
  primaryImage?: string;
  dateModified?: string;
  datePublished?: string;
  breadcrumbId?: string;
  /** CSS selectors for SpeakableSpecification (voice/AI answer extraction). */
  speakableSelectors?: string[];
}): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    '@type': 'WebPage',
    '@id': `${input.global.siteUrl}${input.url}#webpage`,
    url: `${input.global.siteUrl}${input.url}`,
    name: input.name,
    description: input.description,
    inLanguage: input.locale,
    isPartOf: { '@id': `${input.global.siteUrl}/#site` },
    about: { '@id': `${input.global.siteUrl}/#org` },
    publisher: { '@id': `${input.global.siteUrl}/#org` },
  };
  if (input.primaryImage) {
    obj.primaryImageOfPage = {
      '@type': 'ImageObject',
      url: input.primaryImage,
    };
  }
  if (input.datePublished) obj.datePublished = input.datePublished;
  if (input.dateModified) obj.dateModified = input.dateModified;
  if (input.speakableSelectors && input.speakableSelectors.length > 0) {
    obj.speakable = {
      '@type': 'SpeakableSpecification',
      cssSelector: input.speakableSelectors,
    };
  }
  return obj;
}

export const TIMEZONE = TASHKENT_TIMEZONE;
