// JSON-LD, one @graph per page.
//
// Every node has a stable @id built from the canonical URL, so a node on one
// page can reference a node on another (every WebPage is part of the WebSite
// that is described on the homepage). Only what the page itself shows: no
// datePublished or dateModified anywhere, because the site states no dates.
// Not used, by decision: FAQPage, Review, AggregateRating, LocalBusiness,
// ProfessionalService.
import org from '../data/organization.json';

export const SITE = 'https://kaltech.online';
export const PLACEHOLDER = '[PLACEHOLDER]';

const abs = (path: string) => new URL(path, SITE).href;
const isReal = (v: unknown): v is string => typeof v === 'string' && v !== '' && v !== PLACEHOLDER;

export const ID = {
  organization: abs('/#organization'),
  website: abs('/#website'),
  logo: abs('/#logo'),
  person: (slug: string) => abs(`/#person-${slug}`),
};

export const OG_IMAGE = { url: abs('/og-card.png'), width: 1200, height: 630 };

/** The canonical URL of a route: apex, https, no trailing slash except the root. */
export const canonicalOf = (pathname: string) => {
  const path = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
  return abs(path);
};

export function organization() {
  const sameAs = [org.linkedin].filter(isReal);
  return {
    '@type': 'Organization',
    '@id': ID.organization,
    name: org.name,
    legalName: org.legalName,
    url: abs('/'),
    email: org.email,
    description: org.description,
    address: {
      '@type': 'PostalAddress',
      addressRegion: org.address.addressRegion,
      addressCountry: org.address.addressCountry,
    },
    logo: {
      '@type': 'ImageObject',
      '@id': ID.logo,
      url: abs(org.logo.path),
      contentUrl: abs(org.logo.path),
      width: org.logo.width,
      height: org.logo.height,
    },
    ...(sameAs.length ? { sameAs } : {}),
  };
}

export function website() {
  return {
    '@type': 'WebSite',
    '@id': ID.website,
    url: abs('/'),
    name: org.name,
    description: org.description,
    publisher: { '@id': ID.organization },
    inLanguage: 'en',
  };
}

export interface Crumb {
  name: string;
  path: string;
}

export function webPage(url: string, name: string, description: string, hasBreadcrumb: boolean) {
  return {
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name,
    description,
    isPartOf: { '@id': ID.website },
    publisher: { '@id': ID.organization },
    inLanguage: 'en',
    ...(hasBreadcrumb ? { breadcrumb: { '@id': `${url}#breadcrumb` } } : {}),
  };
}

/** Home is always the first crumb; `crumbs` are the steps below it. */
export function breadcrumbList(url: string, crumbs: Crumb[]) {
  const trail = [{ name: 'Home', path: '/' }, ...crumbs];
  return {
    '@type': 'BreadcrumbList',
    '@id': `${url}#breadcrumb`,
    itemListElement: trail.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: canonicalOf(c.path),
    })),
  };
}

export type Author = { organization: true } | { person: string; slug: string };

export function article(opts: {
  url: string;
  headline: string;
  description: string;
  author: Author;
  section?: string;
}) {
  const author =
    'person' in opts.author
      ? {
          '@type': 'Person',
          '@id': ID.person(opts.author.slug),
          name: opts.author.person,
          worksFor: { '@id': ID.organization },
        }
      : { '@id': ID.organization };
  return {
    '@type': 'Article',
    '@id': `${opts.url}#article`,
    headline: opts.headline,
    description: opts.description,
    ...(opts.section ? { articleSection: opts.section } : {}),
    inLanguage: 'en',
    image: { '@type': 'ImageObject', ...OG_IMAGE },
    author,
    publisher: { '@id': ID.organization },
    mainEntityOfPage: { '@id': `${opts.url}#webpage` },
    isPartOf: { '@id': ID.website },
  };
}

export function service(opts: { key: string; name: string; description: string }) {
  const url = canonicalOf('/services');
  return {
    '@type': 'Service',
    '@id': `${url}#${opts.key}`,
    name: opts.name,
    description: opts.description,
    url,
    provider: { '@id': ID.organization },
  };
}

/** Serialised for a <script> element: `<` is escaped so no string can close it. */
export function serialise(nodes: object[]) {
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes }).replace(/</g, '\\u003c');
}
