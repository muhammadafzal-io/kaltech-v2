/* ==========================================================================
   KalTech motion.

   One classic script: no module, no imports, no dependencies. It is inlined
   into <head> so it runs before first paint and works from file:// as well as
   from a server.

   Everything this file touches is already in its final state in the markup and
   in the CSS. The script only ARMS starting states (by adding .m-armed to
   <html>) and then releases each element as it enters the viewport. With
   JavaScript off nothing is ever armed, so nothing is ever hidden. With
   prefers-reduced-motion the script never arms either: every element is shown
   in its final state and the transition is simply skipped.

   Six primitives, each a class the markup opts into:
     .m-reveal  opacity 0 -> 1, translateY 24px -> 0, 700ms
     .m-rule    the 3px rule draws 0 -> full width, 500ms
     .m-count   figures count from 0 over 1400ms, ease-out, then settle
     .m-draw    SVG paths draw via stroke-dashoffset, 1400ms, nodes fade in behind
     .m-band    full-bleed bands wipe in from the top via clip-path, 700ms
     .m-image   image slots reveal bottom-to-top over 1100ms, inner block 1.06 -> 1

   Durations and easings live in tokens.css / motion.css. This file only
   decides WHEN.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  var PRIMITIVES = '.m-reveal, .m-rule, .m-count, .m-draw, .m-band, .m-image';
  // Primitives whose starting state is a full clip-path. See watchClipped().
  var CLIPPED = '.m-band, .m-image';
  var THRESHOLD = 0.15;
  var STAGGER_MS = 90;
  // Caps the sibling stagger so every primitive settles within 2s of entering
  // the viewport: the longest is .m-draw at 1400ms + 4 x 90ms.
  var STAGGER_STEPS = 4;
  var COUNT_MS = 1400;
  var SETTLE_MS = { band: 760, image: 1160 };

  var reduce =
    !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canObserve = 'IntersectionObserver' in window && 'requestAnimationFrame' in window;

  /* ------------------------------------------------------------------------
     Theme. The homepage has a light and a dark theme, switched by data-theme
     on <html>. It is set here, in the head, before first paint, so there is no
     flash: the saved choice if there is one, otherwise the system setting.
     Without JavaScript no attribute is set and the page is the light theme.
     ------------------------------------------------------------------------ */
  var THEME_KEY = 'kaltech-theme';
  var themed = true;

  function readTheme() {
    var saved = null;
    try {
      saved = window.localStorage.getItem(THEME_KEY);
    } catch (e) {}
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  if (themed) root.setAttribute('data-theme', readTheme());

  root.classList.add('m-js');
  if (!reduce && canObserve) root.classList.add('m-armed');

  function disarm() {
    root.classList.remove('m-armed');
  }

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  function toArray(list) {
    return Array.prototype.slice.call(list);
  }

  /* ------------------------------------------------------------------------
     Header: compact after 40px of scroll, inverted while over a dark ground.
     ------------------------------------------------------------------------ */
  function header() {
    var hdr = document.querySelector('[data-hdr]');
    if (!hdr) return;

    var darks = toArray(document.querySelectorAll('.g-deep, .ftr'));
    var queued = false;

    function update() {
      queued = false;
      var y = window.pageYOffset || document.documentElement.scrollTop || 0;
      hdr.setAttribute('data-scrolled', y > 40 ? 'true' : 'false');

      var probe = hdr.getBoundingClientRect().height / 2;
      var over = false;
      for (var i = 0; i < darks.length; i++) {
        var r = darks[i].getBoundingClientRect();
        if (r.top <= probe && r.bottom >= probe) {
          over = true;
          break;
        }
      }
      hdr.setAttribute('data-over', over ? 'dark' : 'light');
    }

    function queue() {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(update);
    }

    update();
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
  }

  /* ------------------------------------------------------------------------
     Mobile menu. The <details> works without JavaScript; this only locks the
     page behind it, closes it on navigation, and closes it on Escape.
     ------------------------------------------------------------------------ */
  function menu() {
    var d = document.querySelector('[data-menu]');
    if (!d) return;
    d.addEventListener('toggle', function () {
      document.body.style.overflow = d.open ? 'hidden' : '';
    });
    d.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('a')) d.open = false;
    });
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && d.open) d.open = false;
    });
  }

  /* ------------------------------------------------------------------------
     Primitives
     ------------------------------------------------------------------------ */
  function format(n) {
    return Math.round(n).toLocaleString('en-US');
  }

  function runCount(el, delay) {
    var target = parseFloat(el.getAttribute('data-count'));
    var suffix = el.getAttribute('data-suffix') || '';
    var finalText = el.getAttribute('data-final') || el.textContent;
    if (!isFinite(target)) {
      el.classList.add('m-in', 'm-done');
      return;
    }

    window.setTimeout(function () {
      var start = null;
      el.textContent = '0' + suffix;
      el.classList.add('m-in');

      // The rule beneath a figure draws as its count completes.
      var fig = el.closest ? el.closest('.fig') : null;
      var rule = fig ? fig.querySelector('.fig-rule.m-rule') : null;
      if (rule) {
        window.setTimeout(function () {
          rule.classList.add('m-in');
        }, COUNT_MS * 0.7);
      }

      function frame(t) {
        if (start === null) start = t;
        var p = Math.min(1, (t - start) / COUNT_MS);
        var eased = 1 - Math.pow(1 - p, 3);
        if (p < 1) {
          el.textContent = format(target * eased) + suffix;
          window.requestAnimationFrame(frame);
        } else {
          // Settle on the exact authored value.
          el.textContent = finalText;
          el.classList.add('m-done');
        }
      }
      window.requestAnimationFrame(frame);
    }, delay);
  }

  function runDraw(svg, delay) {
    var lines = toArray(svg.querySelectorAll('path:not(.m-node), line, polyline'));
    lines.forEach(function (p, i) {
      p.style.setProperty('--m-delay', delay + Math.min(i, STAGGER_STEPS) * STAGGER_MS + 'ms');
    });
    svg.style.setProperty('--m-delay', delay + 'ms');
    svg.classList.add('m-in');
    window.setTimeout(function () {
      svg.classList.add('m-done');
    }, delay + 1400 + STAGGER_STEPS * STAGGER_MS + 60);
  }

  function release(el, delay) {
    el.style.setProperty('--m-delay', delay + 'ms');

    if (el.classList.contains('m-count')) return runCount(el, delay);
    if (el.classList.contains('m-draw')) return runDraw(el, delay);

    el.classList.add('m-in');

    // Clip-paths return to `none` once the wipe has finished, so focus rings
    // and overflowing children are never clipped by a finished animation.
    var settle = el.classList.contains('m-band')
      ? SETTLE_MS.band
      : el.classList.contains('m-image')
      ? SETTLE_MS.image
      : 0;
    if (settle) {
      window.setTimeout(function () {
        el.classList.add('m-done');
      }, delay + settle);
    }
  }

  function byDocumentOrder(a, b) {
    return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  }

  // Siblings that enter together stagger by 90ms, in document order.
  function releaseBatch(els) {
    var groups = new Map();
    els.forEach(function (el) {
      var key = el.parentElement;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(el);
    });
    groups.forEach(function (group) {
      group.sort(byDocumentOrder).forEach(function (el, i) {
        release(el, Math.min(i, STAGGER_STEPS) * STAGGER_MS);
      });
    });
  }

  // A clip-path that hides an element also hides it from IntersectionObserver:
  // a fully clipped box never reports as intersecting, so it would never be
  // released, and nor would anything inside it. Bands and image slots start
  // clipped, so for those two the same 15 percent rule is measured on scroll
  // from their unclipped box. Everything else is observed. Elements inside a
  // band are released by the observer as the band's wipe uncovers them.
  function watchClipped(els) {
    var queued = false;

    function check() {
      queued = false;
      var vh = window.innerHeight;
      var entered = [];
      els = els.filter(function (el) {
        var r = el.getBoundingClientRect();
        var visible = Math.min(r.bottom, vh) - Math.max(r.top, 0);
        var inView =
          r.height > 0 && visible > 0 && (visible / r.height >= THRESHOLD || visible >= vh * THRESHOLD);
        if (inView) entered.push(el);
        return !inView;
      });
      if (entered.length) releaseBatch(entered);
      if (!els.length) {
        window.removeEventListener('scroll', queue);
        window.removeEventListener('resize', queue);
      }
    }

    function queue() {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(check);
    }

    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    check();
  }

  // A figure's rule is released by its count (see runCount), not by the observer.
  function countBound(el) {
    if (!el.classList.contains('fig-rule')) return false;
    var fig = el.closest('.fig');
    return !!(fig && fig.querySelector('.m-count'));
  }

  /* ------------------------------------------------------------------------
     Contents index. The first entry is marked in the markup, so the index is
     right with JavaScript off; this keeps the mark on the block being read.
     State, not motion, so it runs under reduced motion too.
     ------------------------------------------------------------------------ */
  function contents() {
    var links = toArray(document.querySelectorAll('.idx-link[data-idx]'));
    if (!links.length || !('IntersectionObserver' in window)) return;

    function mark(id) {
      links.forEach(function (a) {
        if (a.getAttribute('data-idx') === id) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
    }

    // A thin reading line 35 to 40 percent down the viewport. The block that
    // crosses it is the one being read; between blocks the last mark stands.
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) mark(e.target.id);
        });
      },
      { rootMargin: '-35% 0px -60% 0px' }
    );
    links.forEach(function (a) {
      var block = document.getElementById(a.getAttribute('data-idx'));
      if (block) io.observe(block);
    });
  }

  function primitives() {
    var els = toArray(document.querySelectorAll(PRIMITIVES));
    if (!els.length) return;

    // Anything already scrolled past (a reload mid-page, an anchor link) is
    // shown immediately rather than waiting for a scroll back up.
    var pending = [];
    els.forEach(function (el) {
      if (el.getBoundingClientRect().bottom < 0) {
        el.classList.add('m-in', 'm-done');
      } else if (!countBound(el)) {
        pending.push(el);
      }
    });

    var io = new IntersectionObserver(
      function (entries) {
        var batch = [];
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var tallEnough = entry.intersectionRect.height >= window.innerHeight * THRESHOLD;
          if (entry.intersectionRatio >= THRESHOLD || tallEnough) {
            io.unobserve(entry.target);
            batch.push(entry.target);
          }
        });
        if (batch.length) releaseBatch(batch);
      },
      { threshold: [0, 0.05, 0.1, THRESHOLD, 0.3, 0.6, 1] }
    );

    var clipped = [];
    pending.forEach(function (el) {
      if (el.matches(CLIPPED)) clipped.push(el);
      else io.observe(el);
    });
    if (clipped.length) watchClipped(clipped);
  }

  /* ------------------------------------------------------------------------
     Fit check: a real checkbox per statement. The meter fills one segment per
     tick, the count reads "n of N", and the call to action opens once all but
     one are ticked. Interaction, not motion, so it runs with reduced motion
     too. Runs once on load as well, because a browser restores ticked boxes
     on back navigation.
     ------------------------------------------------------------------------ */
  function fitcheck() {
    toArray(document.querySelectorAll('[data-fit]')).forEach(function (fit) {
      var boxes = toArray(fit.querySelectorAll('[data-fit-box]'));
      var segs = toArray(fit.querySelectorAll('.mc-seg'));
      var count = fit.querySelector('[data-fit-n]');
      var cta = fit.querySelector('[data-fit-cta]');
      var need = parseInt(fit.getAttribute('data-fit-threshold'), 10);

      function update() {
        var n = boxes.filter(function (b) {
          return b.checked;
        }).length;
        segs.forEach(function (seg, i) {
          seg.classList.toggle('is-on', i < n);
        });
        if (count) count.textContent = String(n);
        if (cta) {
          var open = n >= need;
          cta.classList.toggle('is-open', open);
          // Out of the tab order the moment it closes, not when its fade ends.
          var link = cta.querySelector('a');
          if (link) link.tabIndex = open ? 0 : -1;
        }
      }

      boxes.forEach(function (b) {
        b.addEventListener('change', update);
      });
      update();
    });
  }

  /* ------------------------------------------------------------------------
     Pointer-aware depth, fine pointers only and never under reduced motion.
     Sets CSS variables; every visual consequence lives in home.css, and every
     element is already in its final state without it.
       [data-fx-hero]   --mx/--my, -0.5 to 0.5 across the hero
       [data-magnetic]  --tx/--ty, a pull toward the pointer
       [data-spotlight] --sx/--sy, the pointer's position inside the card
     ------------------------------------------------------------------------ */
  function themeToggle() {
    var btn = document.querySelector('[data-theme-toggle]');
    if (!btn || !themed) return;

    function sync() {
      var dark = root.getAttribute('data-theme') === 'dark';
      btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
      btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    }

    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try {
        window.localStorage.setItem(THEME_KEY, next);
      } catch (e) {}
      sync();
    });
    sync();
  }

  /* ------------------------------------------------------------------------
     Image wheel. CSS lays the ring out from --rot; this only turns it. It
     drifts on its own, follows a drag (and keeps its momentum on release), and
     speeds up while the page scrolls. It runs only while it is on screen. Under
     reduced motion there is no drift and no scroll speed-up: it turns only
     where the reader drags it.
     ------------------------------------------------------------------------ */
  function wheel() {
    toArray(document.querySelectorAll('[data-wheel]')).forEach(function (el) {
      var ring = el.querySelector('.iw-ring');
      if (!ring) return;

      var rot = 0; // degrees
      var vel = 0; // degrees per second, from a drag
      var boost = 0; // degrees per second, from scrolling
      var DRIFT = reduce ? 0 : 7;
      var dragging = false;
      var lastX = 0;
      var lastT = 0;
      var visible = false;
      var raf = 0;
      var last = 0;
      var lastScrollY = window.pageYOffset;
      var lastScrollT = 0;

      function paint() {
        ring.style.setProperty('--rot', rot.toFixed(2) + 'deg');
      }

      function frame(t) {
        raf = 0;
        if (!visible) return;
        var dt = Math.min(0.05, (t - (last || t)) / 1000);
        last = t;
        if (!dragging) {
          rot += (DRIFT + vel + boost) * dt;
          vel *= Math.pow(0.012, dt); // momentum fades in under a second
          boost *= Math.pow(0.12, dt); // the scroll speed-up fades faster
          if (Math.abs(vel) < 0.05) vel = 0;
          if (boost < 0.05) boost = 0;
        }
        paint();
        raf = window.requestAnimationFrame(frame);
      }

      function start() {
        if (raf || !visible) return;
        last = 0;
        raf = window.requestAnimationFrame(frame);
      }

      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (entries) {
          visible = entries[0].isIntersecting;
          if (visible) start();
        }).observe(el);
      } else {
        visible = true;
        start();
      }

      el.addEventListener('pointerdown', function (e) {
        dragging = true;
        lastX = e.clientX;
        lastT = e.timeStamp;
        vel = 0;
        el.classList.add('is-dragging');
        if (el.setPointerCapture) el.setPointerCapture(e.pointerId);
      });

      el.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        var dx = e.clientX - lastX;
        var dtm = Math.max(1, e.timeStamp - lastT);
        rot += dx * 0.32;
        vel = Math.max(-240, Math.min(240, ((dx * 0.32) / dtm) * 1000));
        lastX = e.clientX;
        lastT = e.timeStamp;
        paint();
      });

      function release() {
        if (!dragging) return;
        dragging = false;
        el.classList.remove('is-dragging');
        if (reduce) vel = 0;
        start();
      }

      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('lostpointercapture', release);

      if (!reduce) {
        window.addEventListener(
          'scroll',
          function () {
            var y = window.pageYOffset;
            var now = window.performance && performance.now ? performance.now() : Date.now();
            var dt = Math.max(16, now - lastScrollT);
            boost = Math.min(240, Math.max(boost, (Math.abs(y - lastScrollY) / dt) * 90));
            lastScrollY = y;
            lastScrollT = now;
          },
          { passive: true }
        );
      }

      paint();
    });
  }

  /* ------------------------------------------------------------------------
     Testimonial stage. Three cards sit in slots (--pos -1, 0, 1: left, centre,
     right); the arrows and dots turn which one is in the centre. Every card is
     in the page whatever the state, so this changes layout only. The cards'
     starting slots are in the markup, so with JavaScript off it is still a
     complete stage.
     ------------------------------------------------------------------------ */
  function testimonials() {
    toArray(document.querySelectorAll('[data-tc]')).forEach(function (tc) {
      var cards = toArray(tc.querySelectorAll('[data-tc-card]'));
      var dots = toArray(tc.querySelectorAll('[data-tc-dot]'));
      var live = tc.querySelector('[data-tc-live]');
      var n = cards.length;
      var active = 0;
      if (n < 2) return;

      function show(i, announce) {
        active = ((i % n) + n) % n;
        cards.forEach(function (card, k) {
          var d = (((k - active) % n) + n) % n;
          card.style.setProperty('--pos', d === 0 ? '0' : d === 1 ? '1' : '-1');
        });
        dots.forEach(function (dot, k) {
          if (k === active) dot.setAttribute('aria-current', 'true');
          else dot.removeAttribute('aria-current');
        });
        if (announce && live) {
          var co = cards[active].querySelector('.tc-co');
          live.textContent = co ? co.textContent : '';
        }
      }

      var prev = tc.querySelector('[data-tc-prev]');
      var next = tc.querySelector('[data-tc-next]');
      if (prev) prev.addEventListener('click', function () { show(active - 1, true); });
      if (next) next.addEventListener('click', function () { show(active + 1, true); });
      dots.forEach(function (dot, k) {
        dot.addEventListener('click', function () { show(k, true); });
      });

      // Clicking a side card brings it to the centre; the centre card's own link still works.
      cards.forEach(function (card, k) {
        card.addEventListener('click', function (e) {
          if (k === active || window.matchMedia('(max-width: 900px)').matches) return;
          e.preventDefault();
          show(k, true);
        });
      });

      tc.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowLeft') show(active - 1, true);
        else if (e.key === 'ArrowRight') show(active + 1, true);
      });

      show(0, false);
    });
  }

  function fx() {
    if (reduce || !window.matchMedia) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    var hero = document.querySelector('[data-fx-hero]');
    if (hero) {
      var raf = 0;
      var px = 0;
      var py = 0;
      var apply = function () {
        raf = 0;
        hero.style.setProperty('--mx', px.toFixed(3));
        hero.style.setProperty('--my', py.toFixed(3));
      };
      var queue = function () {
        if (!raf) raf = window.requestAnimationFrame(apply);
      };
      hero.addEventListener('pointermove', function (e) {
        var r = hero.getBoundingClientRect();
        px = (e.clientX - r.left) / r.width - 0.5;
        py = (e.clientY - r.top) / r.height - 0.5;
        queue();
      });
      hero.addEventListener('pointerleave', function () {
        px = 0;
        py = 0;
        queue();
      });
    }

    toArray(document.querySelectorAll('[data-magnetic]')).forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        el.style.setProperty('--tx', ((e.clientX - r.left - r.width / 2) * 0.18).toFixed(1) + 'px');
        el.style.setProperty('--ty', ((e.clientY - r.top - r.height / 2) * 0.3).toFixed(1) + 'px');
      });
      el.addEventListener('pointerleave', function () {
        el.style.removeProperty('--tx');
        el.style.removeProperty('--ty');
      });
    });

    toArray(document.querySelectorAll('[data-spotlight]')).forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        el.style.setProperty('--sx', (e.clientX - r.left).toFixed(0) + 'px');
        el.style.setProperty('--sy', (e.clientY - r.top).toFixed(0) + 'px');
      });
    });
  }

  ready(function () {
    try {
      themeToggle();
      testimonials();
      wheel();
      fx();
      header();
      menu();
      contents();
      fitcheck();
      if (root.classList.contains('m-armed')) primitives();
    } catch (err) {
      // A failure here must never leave content armed and invisible.
      disarm();
      if (window.console) window.console.error(err);
    }
  });
})();
