// The sixteen sections marked bland in review round 1, as screenshot regions.
// Each region is found by the data-review anchors the pages carry, so the same
// definitions capture the before and the after state.
export const SECTIONS = [
  { id: 'home-01-clients', route: '/', parts: ['[data-review="home-01"]'] },
  { id: 'home-02-diagnostic', route: '/', parts: ['[data-review="home-02"]'] },
  { id: 'work-01-hero', route: '/work', parts: ['[data-review="work-01"]'] },
  { id: 'services-01-hero', route: '/services', parts: ['[data-review="services-01"]'] },
  { id: 'services-02-lines', route: '/services', parts: ['[data-review="services-02"]'] },
  { id: 'services-03-engage', route: '/services', parts: ['[data-review="services-03"]'] },
  { id: 'services-04-fit', route: '/services', parts: ['[data-review="services-04"]'] },
  { id: 'diagnostic-01-why', route: '/diagnostic', parts: ['[data-review="diagnostic-01"]'] },
  // The gate and the lens blocks share one section: the gate runs from the
  // section top to the end of its caption, the lens blocks are the .lens rows.
  { id: 'diagnostic-02-gate', route: '/diagnostic', top: '[data-review="diagnostic-02"]', bottom: '[data-review="diagnostic-02"] .dx-gate' },
  { id: 'diagnostic-03-lenses', route: '/diagnostic', parts: ['[data-review="diagnostic-02"] .lens'] },
  { id: 'diagnostic-04-runs', route: '/diagnostic', parts: ['[data-review="diagnostic-04"]'] },
  { id: 'diagnostic-05-returns', route: '/diagnostic', parts: ['[data-review="diagnostic-05"]'] },
  { id: 'diagnostic-06-not', route: '/diagnostic', parts: ['[data-review="diagnostic-06"]', '[data-review="diagnostic-06b"]'] },
  { id: 'about-01-delivery', route: '/about', parts: ['[data-review="about-01"]'] },
  { id: 'about-02-record', route: '/about', parts: ['[data-review="about-02"]'] },
  { id: 'about-03-locations-cta', route: '/about', parts: ['[data-review="about-03"]', '#cta'] },
];

// Runs in the page: the region's box in document coordinates, full width.
export function regionOf(spec) {
  const boxes = [];
  const add = (el) => {
    const r = el.getBoundingClientRect();
    if (r.height > 0) boxes.push({ top: r.top + scrollY, bottom: r.bottom + scrollY });
  };
  if (spec.parts) for (const sel of spec.parts) document.querySelectorAll(sel).forEach(add);
  if (spec.top) {
    const t = document.querySelector(spec.top).getBoundingClientRect().top + scrollY;
    const els = document.querySelectorAll(spec.bottom);
    const b = els[els.length - 1].getBoundingClientRect().bottom + scrollY;
    boxes.push({ top: t, bottom: b });
  }
  if (!boxes.length) return null;
  const top = Math.floor(Math.min(...boxes.map((b) => b.top)));
  const bottom = Math.ceil(Math.max(...boxes.map((b) => b.bottom)));
  return { x: 0, y: top, width: document.documentElement.clientWidth, height: bottom - top };
}
