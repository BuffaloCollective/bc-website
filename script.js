/* =====================================================================
   Buffalo Collective — site interactions
   Modules:
     1. Reading indicator
     2. Nav scroll state + mobile hamburger
     3. IntersectionObserver reveals
        (.reveal, .reveal-stagger, .highlight-reveal, .buffalo-animate)
     4. Texture parallax (rAF, transform: translateY)
     5. Star scatter fade-ins
     6. Team grid star positioning + animation offsets
     7. Ticker DOM duplication (seamless loop)
     8. Home: logo intro sequence
   ===================================================================== */

(function () {
  "use strict";

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  // Touch-primary devices (phones/tablets). Their browser URL bars resize
  // the viewport on every scroll, which makes scroll-driven + reverse-on-
  // scroll animations thrash. On these devices we run reveals once (no
  // reverse), skip parallax, and render the highlight pre-filled.
  const isTouch = window.matchMedia(
    "(hover: none) and (pointer: coarse)"
  ).matches;

  /* ── 1. Reading indicator ─────────────────────────────────────── */
  function initReadingIndicator() {
    const bar = document.getElementById("reading-indicator");
    if (!bar) return;

    let ticking = false;
    function update() {
      const scrollTop = window.scrollY;
      const docHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      bar.style.width = pct + "%";
      ticking = false;
    }
    window.addEventListener(
      "scroll",
      () => {
        if (!ticking) {
          requestAnimationFrame(update);
          ticking = true;
        }
      },
      { passive: true }
    );
    update();
  }

  /* ── 2. Nav scroll state + mobile hamburger ───────────────────── */
  function initNav() {
    const nav = document.getElementById("site-nav");
    if (!nav) return;

    const toggle = nav.querySelector(".nav-toggle");
    const links = nav.querySelector(".nav-links");

    function setScrolled() {
      if (window.scrollY > 80) nav.classList.add("is-scrolled");
      else nav.classList.remove("is-scrolled");
    }
    window.addEventListener("scroll", setScrolled, { passive: true });
    setScrolled();

    if (toggle && links) {
      const focusables = () =>
        Array.from(links.querySelectorAll("a, button")).filter(
          (el) => !el.disabled && el.offsetParent !== null
        );

      function setMenu(open) {
        links.classList.toggle("is-open", open);
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
        toggle.setAttribute(
          "aria-label",
          open ? "Close navigation menu" : "Open navigation menu"
        );
        document.body.style.overflow = open ? "hidden" : "";
        if (open) {
          const first = focusables()[0];
          if (first) first.focus();
        }
      }

      toggle.addEventListener("click", () => {
        setMenu(!links.classList.contains("is-open"));
      });

      // Close on link click, returning focus to the toggle.
      links.querySelectorAll("a").forEach((a) => {
        a.addEventListener("click", () => setMenu(false));
      });

      // Keyboard: Esc closes and returns focus to the toggle;
      // Tab is trapped within the open full-screen menu.
      document.addEventListener("keydown", (e) => {
        if (!links.classList.contains("is-open")) return;
        if (e.key === "Escape") {
          setMenu(false);
          toggle.focus();
          return;
        }
        if (e.key === "Tab") {
          const items = focusables();
          if (!items.length) return;
          const first = items[0];
          const last = items[items.length - 1];
          const active = document.activeElement;
          if (e.shiftKey && (active === first || active === toggle)) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && active === last) {
            e.preventDefault();
            first.focus();
          }
        }
      });
    }

    // Mark active page link.
    // Normalize both sides: strip query/hash, drop trailing slash, drop
    // .html so /herds, /herds.html, and herds.html all match.
    const normalize = (s) =>
      (s || "")
        .split("?")[0]
        .split("#")[0]
        .replace(/\/$/, "")
        .split("/")
        .pop()
        .replace(/\.html$/, "")
        .toLowerCase() || "index";
    const currentPage = normalize(window.location.pathname);
    nav.querySelectorAll(".nav-links a").forEach((a) => {
      const href = a.getAttribute("href") || "";
      if (href.startsWith("#")) return; // skip anchor-only links like #footer-subscribe
      if (normalize(href) === currentPage) a.classList.add("is-active");
    });
  }

  /* ── 3. IntersectionObserver reveals ──────────────────────────── */
  /*  Note: .highlight-reveal is handled separately by initHighlights()
      as a scroll-progress animation, so it's excluded here. */
  function initReveals() {
    const SELECTOR =
      ".reveal, .reveal-left, .reveal-right, .reveal-scale, .reveal-emphasis, .reveal-stagger, .buffalo-animate";

    if (prefersReducedMotion) {
      document
        .querySelectorAll(SELECTOR)
        .forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            // Touch: fire once and stop watching — no reverse, no replay.
            if (isTouch) observer.unobserve(entry.target);
          } else if (!isTouch) {
            // Desktop only: reverse on scroll-up.
            entry.target.classList.remove("is-visible");
          }
        });
      },
      // Fires later — element must be ~25% in view and well above the
      // viewport bottom before reveal triggers.
      { threshold: 0.25, rootMargin: "0px 0px -18% 0px" }
    );

    document.querySelectorAll(SELECTOR).forEach((el) => observer.observe(el));
  }

  /* ── 3b. Scroll-driven highlight sweep ────────────────────────── */
  /*  For each .highlight-reveal: map the element's vertical position
      in the viewport to a 0–1 progress value, then update its
      background-size live. The fill grows L→R in step with how far
      the reader has scrolled through the element — not all at once. */
  function initHighlights() {
    const highlights = Array.from(document.querySelectorAll(".highlight-reveal"));
    if (!highlights.length) return;

    // Reduced-motion OR touch: render the highlight pre-filled instead of
    // recomputing the sweep on every (jittery, URL-bar-driven) scroll tick.
    if (prefersReducedMotion || isTouch) {
      highlights.forEach((el) => { el.style.backgroundSize = "100% 105%"; });
      return;
    }

    const REVEAL_SELECTOR =
      ".reveal, .reveal-left, .reveal-right, .reveal-scale, .reveal-emphasis";

    let ticking = false;
    function update() {
      const vh = window.innerHeight;
      highlights.forEach((el) => {
        // Don't start filling until the parent reveal animation has fired,
        // so the highlight visibly starts from 0 once the text appears.
        const revealAncestor = el.closest(REVEAL_SELECTOR);
        const parentVisible =
          !revealAncestor || revealAncestor.classList.contains("is-visible");

        if (!parentVisible) {
          el.style.backgroundSize = "0% 105%";
          el._fillStartTop = null;
          return;
        }

        const rect = el.getBoundingClientRect();
        // Cache the rect.top at the moment fill activates, then map
        // further scroll into progress. Reverses cleanly when the parent
        // leaves view (gate above resets _fillStartTop).
        if (el._fillStartTop == null) {
          el._fillStartTop = rect.top;
        }

        const traveled = el._fillStartTop - rect.top;
        // Wait until the user scrolls this much PAST the activation
        // point before fill begins — gives the text time to land first.
        const startDelay = vh * 0.125;
        // Tighter fillSpan so the fill completes before the element
        // can scroll off the top of the viewport.
        const fillSpan   = rect.height + vh * 0.1;
        const effective  = Math.max(0, traveled - startDelay);
        const progress   = Math.max(0, Math.min(1, effective / fillSpan));
        el.style.backgroundSize = (progress * 100).toFixed(2) + "% 105%";
      });
      ticking = false;
    }

    window.addEventListener(
      "scroll",
      () => {
        if (!ticking) { requestAnimationFrame(update); ticking = true; }
      },
      { passive: true }
    );
    window.addEventListener("resize", update);
    update();
  }

  /* ── 4. Texture parallax ──────────────────────────────────────── */
  function initParallax() {
    // Skip on reduced-motion and touch — on touch the texture sits static
    // (no transform), which is stable and visually fine.
    if (prefersReducedMotion || isTouch) return;

    const layers = Array.from(document.querySelectorAll(".texture-bg"));
    if (!layers.length) return;

    let ticking = false;
    function update() {
      layers.forEach((layer) => {
        const section = layer.parentElement;
        if (!section) return;
        const rect = section.getBoundingClientRect();
        // Skip if section is well outside the viewport
        if (rect.bottom < -200 || rect.top > window.innerHeight + 200) return;
        // Offset relative to section top so each parallaxes independently
        const offset = rect.top * -0.4;
        // Optional horizontal-axis flip (top becomes bottom).
        const flipY = layer.dataset.flipY === "true" ? " scaleY(-1)" : "";
        layer.style.transform = `translate3d(0, ${offset}px, 0)${flipY}`;
      });
      ticking = false;
    }
    window.addEventListener(
      "scroll",
      () => {
        if (!ticking) {
          requestAnimationFrame(update);
          ticking = true;
        }
      },
      { passive: true }
    );
    window.addEventListener("resize", update);
    update();
  }

  /* ── 5. Star scatter fade-ins ─────────────────────────────────── */
  /*  Each star gets a random transition-delay set inline so its
      pop-in is staggered. Toggling is-visible based on container
      intersection means stars also fade/move out on scroll up. */
  function initStarScatter() {
    document.querySelectorAll(".star-scatter img").forEach((img) => {
      img.style.transitionDelay = Math.round(Math.random() * 600) + "ms";
    });

    if (prefersReducedMotion) {
      document
        .querySelectorAll(".star-scatter img")
        .forEach((img) => img.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const stars = entry.target.querySelectorAll("img");
          if (entry.isIntersecting) {
            stars.forEach((img) => img.classList.add("is-visible"));
            if (isTouch) observer.unobserve(entry.target); // fire once
          } else if (!isTouch) {
            stars.forEach((img) => img.classList.remove("is-visible"));
          }
        });
      },
      { threshold: 0.2 }
    );

    document
      .querySelectorAll(".star-scatter")
      .forEach((s) => observer.observe(s));
  }

  /* ── 6. Team grid stars ───────────────────────────────────────── */
  /*  Scatters 8–12 stars around the grid, randomized within container
      bounds. Each gets an animation-delay so the pulse/spin reads as
      organic, not mechanical. Mobile: ~50% count, smaller sizes. */
  function initTeamStars() {
    const grid = document.querySelector("[data-team-stars]");
    if (!grid) return;

    const isMobile = window.innerWidth < 768;
    const count = isMobile ? 6 : 11;
    const colors = ["cream", "orange", "ltlteal", "medteal", "pink"];
    const shapes = ["02", "03", "04", "05", "06", "07", "08", "09", "10"];
    // Smaller max sizes so the star PNGs don't upscale and pixelate.
    const sizesDesktop = [24, 28, 32, 36, 40, 44, 48];
    const sizesMobile  = [18, 22, 26, 30, 34];
    const sizes = isMobile ? sizesMobile : sizesDesktop;

    for (let i = 0; i < count; i++) {
      const shape = shapes[Math.floor(Math.random() * shapes.length)];
      const color = colors[Math.floor(Math.random() * colors.length)];
      const size = sizes[Math.floor(Math.random() * sizes.length)];
      const img = document.createElement("img");
      img.src = `assets/stars/star-${shape}-${color}.png`;
      img.alt = "";
      img.className = "team-star";
      img.setAttribute("aria-hidden", "true");
      img.style.width = size + "px";
      img.style.height = "auto";
      // Scatter throughout the whole grid area. Cards have z-index: 2,
      // so any star that lands behind a headshot falls behind it; stars
      // in the gaps between cards show through.
      img.style.top  = (Math.random() * 92 + 2).toFixed(1) + "%";
      img.style.left = (Math.random() * 92 + 2).toFixed(1) + "%";
      // Use negative margin (not transform) to center on the point —
      // transform is owned by the pulse/spin keyframe.
      img.style.marginLeft = -(size / 2) + "px";
      img.style.marginTop  = -(size / 2) + "px";
      img.style.animationDelay = (i * 0.35).toFixed(2) + "s";
      img.style.animationDuration = (2.6 + Math.random() * 1.4).toFixed(2) + "s";
      grid.appendChild(img);
    }
  }

  /* ── 7. Ticker DOM duplication ────────────────────────────────── */
  /*  CSS animates to translateX(-50%), so the track must contain two
      identical copies of the list back-to-back for a seamless loop. */
  function initTicker() {
    document.querySelectorAll(".ticker-track").forEach((track) => {
      if (track.dataset.duplicated === "true") return;
      const clone = track.innerHTML;
      track.innerHTML = clone + clone;
      track.dataset.duplicated = "true";
    });
  }

  /* ── 7b. Snap-slide quote entrances ───────────────────────────── */
  /*  Each quote slide enters from a different direction (CSS handles
      the transforms via :nth-child). Observer adds .is-visible when
      a slide enters the viewport. */
  function initSnapSlides() {
    const slides = document.querySelectorAll(".snap-slide");
    if (!slides.length) return;

    if (prefersReducedMotion) {
      slides.forEach((s) => s.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            if (isTouch) observer.unobserve(e.target); // fire once on touch
          } else if (!isTouch) {
            // Desktop only: reverse the quote on scroll-back.
            e.target.classList.remove("is-visible");
          }
        });
      },
      // Higher threshold + negative bottom rootMargin so slides must be
      // well into the viewport before the quote enters — feels later.
      { threshold: 0.7, rootMargin: "0px 0px -10% 0px" }
    );
    slides.forEach((s) => observer.observe(s));
  }

  /* ── 7c. Snap-quote navigation indicator ──────────────────────── */
  /*  Vertical row of three star dots, fixed on the right edge.
      Visible only while the snap-container is in viewport. The dot
      whose slide center is closest to the container center is marked
      active. Click a dot to scroll the container to that slide. */
  function initSnapNav() {
    const nav = document.querySelector(".snap-nav");
    const container = document.querySelector(".snap-container");
    if (!nav || !container) return;

    const slides = Array.from(container.querySelectorAll(".snap-slide"));
    const dots = Array.from(nav.querySelectorAll(".snap-nav__dot"));
    if (!slides.length || !dots.length) return;

    // Show/hide based on container visibility
    const visObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) nav.classList.add("is-visible");
          else nav.classList.remove("is-visible");
        });
      },
      { threshold: 0.05 }
    );
    visObserver.observe(container);

    // Update active dot based on which slide center is closest to
    // the viewport center (slides are now in page scroll, not an
    // internal scroller).
    function updateActive() {
      const vCenter = window.innerHeight / 2;
      let closest = 0;
      let closestDist = Infinity;
      slides.forEach((slide, i) => {
        const r = slide.getBoundingClientRect();
        const center = r.top + r.height / 2;
        const dist = Math.abs(center - vCenter);
        if (dist < closestDist) {
          closestDist = dist;
          closest = i;
        }
      });
      dots.forEach((d, i) => d.classList.toggle("is-active", i === closest));
    }

    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        updateActive();
        ticking = false;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", updateActive);
    updateActive();

    // Click to jump to a slide
    dots.forEach((dot, i) => {
      dot.addEventListener("click", () => {
        slides[i].scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  /* ── 8. Home: logo intro sequence ─────────────────────────────── */
  /*  On home only. On first user scroll/wheel/touch:
        - hero-intro tagline fades and lifts
        - hero-intro logo scales/translates up and out
        - body gets .intro-done → nav-logo fades in
        - hero-intro section collapses out of the way so the
          scroll-snap quote sequence begins immediately after. */
  function initHomeIntro() {
    if (!document.body.classList.contains("home")) return;
    const hero = document.querySelector(".hero-intro");
    if (!hero) {
      document.body.classList.add("intro-done");
      return;
    }

    if (prefersReducedMotion) {
      hero.classList.add("is-leaving");
      document.body.classList.add("intro-done");
      return;
    }

    let triggered = false;
    function trigger() {
      if (triggered) return;
      triggered = true;
      hero.classList.add("is-leaving");
      document.body.classList.add("intro-done");

      // After fade-out, collapse the hero so the snap container takes over.
      setTimeout(() => {
        hero.style.display = "none";
        window.scrollTo({ top: 0, behavior: "auto" });
        // Trigger slide 1's drop-in immediately so it feels like a hand-off
        // from the logo/tagline that just lifted out — don't wait for the
        // observer to re-evaluate after the layout shift.
        const firstSlide = document.querySelector(".snap-slide:first-child");
        if (firstSlide) firstSlide.classList.add("is-visible");
      }, 650);

      window.removeEventListener("wheel", onIntent);
      window.removeEventListener("touchmove", onIntent);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
    }
    function onIntent() { trigger(); }
    function onKey(e) {
      if (
        ["ArrowDown", "PageDown", "Space", "Spacebar", " ", "End"].includes(e.key)
      ) trigger();
    }
    function onScroll() {
      if (window.scrollY > 4) trigger();
    }

    window.addEventListener("wheel", onIntent, { passive: true });
    window.addEventListener("touchmove", onIntent, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ── Init ─────────────────────────────────────────────────────── */
  function init() {
    initReadingIndicator();
    initNav();
    initReveals();
    initHighlights();
    initParallax();
    initStarScatter();
    initTeamStars();
    initTicker();
    initSnapSlides();
    initSnapNav();
    initHomeIntro();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
