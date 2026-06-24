// scripts/jsonld-helpers.ts
//
// Build-time helpers that produce production-grade JSON-LD fragments
// reused by /scripts/prerender.ts, /scripts/prerender-blog.ts, and
// /scripts/prerender-home.ts. Centralising the entity layer here means:
//
//   * One canonical Organization across every page (same @id, same
//     description, same areaServed, same knowsAbout). AI assistants
//     and Knowledge Graph builders treat repeated equivalent triples
//     as a strong signal of entity stability.
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

export function buildOrganizationLd(global: GlobalSEO): Record<string, unknown> {
  const org: Record<string, unknown> = {
    '@type': ['Organization', 'ProfessionalService'],
    '@id': `${global.siteUrl}/#org`,
    name: global.organizationName,
    url: `${global.siteUrl}/`,
    logo: {
      '@type': 'ImageObject',
      url: global.logo,
      caption: `${global.organizationName} logo`,
    },
    image: global.defaultOgImage,
    inLanguage: global.availableLanguage && global.availableLanguage.length > 0 ? global.availableLanguage : ['ru', 'uz'],
  };
  if (global.organizationLegalName && global.organizationLegalName !== global.organizationName) {
    org.legalName = global.organizationLegalName;
    org.alternateName = global.organizationLegalName;
  }
  if (global.organizationDescription) org.description = global.organizationDescription;
  else if (global.organizationShortDescription) org.description = global.organizationShortDescription;
  if (global.organizationShortDescription) org.slogan = global.organizationShortDescription;
  if (global.knowsAbout && global.knowsAbout.length > 0) org.knowsAbout = global.knowsAbout;

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

  // contactPoint — Telegram-first since that is the published primary channel.
  if (global.telegram) {
    org.contactPoint = [
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        url: global.telegram,
        availableLanguage: global.availableLanguage && global.availableLanguage.length > 0 ? global.availableLanguage : ['ru', 'uz'],
        areaServed: 'UZ',
      },
    ];
  }

  // sameAs — every confirmed external profile.
  if (global.sameAs && global.sameAs.length > 0) org.sameAs = global.sameAs;

  // openingHoursSpecification — bots respond 24/7; the human handoff happens
  // at operator pace. We declare 24/7 against the AI-bot service only,
  // not the studio's office hours.

  return org;
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
  return obj;
}

export const TIMEZONE = TASHKENT_TIMEZONE;
