/* Case slider controls (CaseSlider.astro). A plain file so the CSP's 'self' allows it. */
(function () {
document.querySelectorAll('[data-cs-nav]').forEach((nav) => {
    const track = nav.previousElementSibling;
    if (!track) return;
    const slides = Array.from(track.children);
    const dots = Array.from(nav.querySelectorAll('[data-cs-dot]'));
    const n = nav.querySelector('[data-cs-n]');
    const prev = nav.querySelector('[data-cs-prev]');
    const next = nav.querySelector('[data-cs-next]');
    nav.classList.add('is-ready');
    track.classList.add('is-slider');

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const go = (i) => {
      const k = Math.max(0, Math.min(slides.length - 1, i));
      track.scrollTo({ left: slides[k].offsetLeft - slides[0].offsetLeft, behavior: reduce ? 'auto' : 'smooth' });
    };
    const current = () => {
      const x = track.scrollLeft;
      let best = 0;
      slides.forEach((s, i) => { if (Math.abs(s.offsetLeft - slides[0].offsetLeft - x) < Math.abs(slides[best].offsetLeft - slides[0].offsetLeft - x)) best = i; });
      return best;
    };
    const paint = () => {
      const i = current();
      if (n) n.textContent = String(i + 1).padStart(2, '0');
      dots.forEach((d, k) => d.toggleAttribute('aria-current', k === i));
      if (prev) prev.disabled = i === 0;
      if (next) next.disabled = i === slides.length - 1;
    };
    prev?.addEventListener('click', () => go(current() - 1));
    next?.addEventListener('click', () => go(current() + 1));
    dots.forEach((d, k) => d.addEventListener('click', () => go(k)));
    track.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(current() + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(current() - 1); }
    });
    let raf = 0;
    track.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(paint); }, { passive: true });
    paint();
  });
})();
