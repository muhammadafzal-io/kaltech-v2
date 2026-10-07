// The eleven public routes plus the two legal stubs.
export const ROUTES = [
  '/',
  '/work',
  '/work/kalpay',
  '/work/ahw-global',
  '/work/becs',
  '/services',
  '/diagnostic',
  '/insights',
  '/insights/retrieval-versus-fine-tuning',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
];

export const slugOf = (route) => (route === '/' ? 'home' : route.slice(1).replace(/\//g, '-'));
