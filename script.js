/*
 * script.js 完全版（ヒーロー融合・最終）
 * — 当初のヒーロー演出を現在構成へ移植し、全体の動的要素を統合 —
 *  機能: アクセシブルなドロワー / スクロール進捗 / リビール(Intersection+WAAPI)
 *        カウンター(小数対応) / ヒーロー・パララックス(ポインター)
 *        デバイス・チルト / 粒子(フワフワ光) / Reduce Motion尊重
 */
(() => {
  "use strict";

  // ===================== utils =====================
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const on = (el, ev, fn, opt) => el && el.addEventListener(ev, fn, opt);
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const prefersReduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isTouch = matchMedia("(pointer: coarse)").matches;
  const rafThrottle = (fn) => {
    let ticking = false;
    return (...a) => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        fn(...a);
      });
    };
  };

  // ===================== 1) Header Drawer (A11y) =====================
  const hamb = $('[data-hamburger], .hamb, button[aria-controls="drawer"]');
  const drawer = $("[data-drawer], #drawer");
  const FOCUSABLE =
    'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
  let restoreFocus = null;

  const setDrawerState = (open) => {
    if (!hamb || !drawer) return;
    drawer.classList.toggle("open", open);
    drawer.hidden = !open;
    hamb.setAttribute("aria-expanded", String(open));
    if (open) {
      restoreFocus = document.activeElement;
      $(FOCUSABLE, drawer)?.focus({ preventScroll: true });
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      (restoreFocus || hamb)?.focus?.({ preventScroll: true });
    }
  };
  if (drawer) drawer.hidden = !drawer.classList.contains("open");
  if (hamb && drawer) {
    hamb.setAttribute("aria-controls", drawer.id || "drawer");
    hamb.setAttribute(
      "aria-expanded",
      String(drawer.classList.contains("open"))
    );
    on(hamb, "click", (e) => {
      e.preventDefault();
      setDrawerState(!drawer.classList.contains("open"));
    });
  }
  on(document, "keydown", (e) => {
    if (e.key === "Escape" && drawer?.classList.contains("open"))
      setDrawerState(false);
    if (e.key === "Tab" && drawer?.classList.contains("open")) {
      const f = $$(FOCUSABLE, drawer).filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0],
        last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  on(drawer, "click", (e) => {
    const t = e.target;
    if (
      t instanceof Element &&
      (t.matches('a[href^="#"]') || t.hasAttribute("data-close"))
    )
      setDrawerState(false);
  });

  // ===================== 2) Scroll Progress =====================
  const progressEl = $("#progress") || $(".scroll-progress span");
  const updateProgress = () => {
    const h = document.documentElement;
    const max = Math.max(1, h.scrollHeight - h.clientHeight);
    const ratio = clamp(h.scrollTop / max, 0, 1);
    if (progressEl) progressEl.style.width = (ratio * 100).toFixed(2) + "%";
    h.style.setProperty("--scroll-progress", String(ratio));
  };
  const onScroll = rafThrottle(updateProgress);
  on(document, "scroll", onScroll, { passive: true });
  on(window, "resize", onScroll);
  updateProgress();

  // ===================== 3) Reveal on Scroll (WAAPI) =====================
  // Heroの見出し群を対象化
  $$(".lead > *").forEach((n) => n.setAttribute("data-reveal", ""));
  const revealSel = [
    "[data-reveal]",
    ".card",
    ".reason-card",
    ".benefit-card",
    ".feature-card",
    ".cta-bar",
    "table",
    ".illus",
    ".fade-in",
  ].join(",");
  const revealNodes = $$(revealSel);
  if (revealNodes.length) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          if (el.__revealed) {
            io.unobserve(el);
            return;
          }
          el.__revealed = true;
          if (prefersReduced) {
            el.style.opacity = 1;
            el.style.transform = "none";
            io.unobserve(el);
            return;
          }
          const delay = Number(
            el.dataset.delay || el.style.getPropertyValue("--reveal-delay") || 0
          );
          el.animate(
            [
              {
                opacity: 0,
                transform: "translateY(12px)",
                filter: "blur(6px)",
              },
              { opacity: 1, transform: "translateY(0)", filter: "blur(0)" },
            ],
            {
              duration: 620,
              easing: "cubic-bezier(.2,.7,.2,1)",
              fill: "forwards",
              delay,
            }
          );
          io.unobserve(el);
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -10% 0px" }
    );

    // 親グリッド単位でスタッガー
    const groups = new Map();
    revealNodes.forEach((el) => {
      const parentKey =
        el.closest(
          ".reasons-grid, .benefit-cards, .cards, section, .container"
        ) || document.body;
      if (!groups.has(parentKey)) groups.set(parentKey, []);
      groups.get(parentKey).push(el);
    });
    groups.forEach((list) =>
      list.forEach((el, i) => {
        el.dataset.delay = String(Math.min(i * 80, 640));
        io.observe(el);
      })
    );
  }

  // ===================== 4) Counter (decimals) =====================
  const counters = $$("[data-count]");
  if (counters.length) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((ent) => {
          if (!ent.isIntersecting) return;
          const el = ent.target;
          if (el.dataset.counted === "true") return;
          el.dataset.counted = "true";
          const target = Number(el.dataset.count || "0");
          const duration = Number(el.dataset.duration || "1600");
          const decimals = Number(el.dataset.decimals || "0");
          const prefix = el.dataset.prefix || "";
          const suffix = el.dataset.suffix || "";
          const t0 = performance.now();
          const format = (n) =>
            Number(n).toLocaleString(undefined, {
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals,
            });
          const tick = (now) => {
            const t = clamp((now - t0) / duration, 0, 1);
            const raw = lerp(0, target, easeOutCubic(t));
            const val = decimals > 0 ? raw : Math.round(raw);
            el.textContent = `${prefix}${format(val)}${suffix}`;
            if (t < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          io.unobserve(el);
        });
      },
      { threshold: 0.5 }
    );
    counters.forEach((n) => io.observe(n));
  }

  // ===================== 5) Hero Parallax (pointer) =====================
  const hero = $(".hero");
  const parallaxEls = hero ? $$("[data-parallax]", hero) : [];
  const normDepth = (el) => {
    let d = Number(el.dataset.parallax || "10");
    // 当初: 10/18 のような整数px係数。小数(0.12)で渡された場合は *100 で人間感覚に合わせる
    if (Math.abs(d) <= 1) d = d * 100; // 0.12 -> 12
    return clamp(d, -40, 40);
  };
  const onPointerMove = (e) => {
    if (!hero || prefersReduced || !parallaxEls.length) return;
    const rect = hero.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5; // -0.5..0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    parallaxEls.forEach((el) => {
      const d = normDepth(el);
      el.style.transform = `translate(${(x * d).toFixed(2)}px, ${(
        y * d
      ).toFixed(2)}px)`;
    });
  };
  on(hero, "pointermove", onPointerMove);
  on(hero, "pointerleave", () =>
    parallaxEls.forEach((el) => {
      el.style.transform = "translate(0,0)";
    })
  );

  // ===================== 6) Tilt (device card) =====================
  const tiltTargets = $$("#tilt, [data-tilt]");
  if (!prefersReduced && tiltTargets.length && !isTouch) {
    tiltTargets.forEach((el) => {
      const maxTilt = Number(el.dataset.tilt || "10");
      const perspective = Number(el.dataset.perspective || "900");
      const reset = () => {
        el.style.transform = `perspective(${perspective}px) rotateX(0) rotateY(0)`;
      };
      reset();
      on(el, "pointermove", (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        const rx = (-py * maxTilt).toFixed(2);
        const ry = (px * maxTilt).toFixed(2);
        el.style.transform = `perspective(${perspective}px) rotateX(${rx}deg) rotateY(${ry}deg)`;
      });
      on(el, "pointerleave", reset);
    });
  }

  // ===================== 7) Particles (CSS animation) =====================
  const particleHost = $("#particles") || $("[data-particles]");
  const spawnParticles = () => {
    if (!particleHost || prefersReduced) return;
    // 二重生成を防止
    particleHost.querySelectorAll(".sparkle").forEach((n) => n.remove());
    const base = Number(
      particleHost.dataset.particles || (innerWidth <= 600 ? 18 : 28)
    );
    const total = clamp(base, 8, 64);
    for (let i = 0; i < total; i++) {
      const s = document.createElement("span");
      s.className = "sparkle";
      const size = 2 + Math.random() * 3; // 2-5px
      s.style.width = s.style.height = size + "px";
      s.style.left = (Math.random() * 100).toFixed(2) + "vw";
      s.style.bottom = (-20 + Math.random() * 140).toFixed(2) + "px";
      const dur = 10 + Math.random() * 16; // 10-26s
      s.style.animation = `float ${dur.toFixed(2)}s linear infinite`;
      s.style.animationDelay = (-Math.random() * dur).toFixed(2) + "s"; // ばらけさせる
      particleHost.appendChild(s);
    }
  };
  spawnParticles();
  let rt = 0;
  on(window, "resize", () => {
    clearTimeout(rt);
    rt = setTimeout(spawnParticles, 200);
  });
  // 画面外では一時停止（省電力）
  if (particleHost) {
    const pIO = new IntersectionObserver((ents) => {
      ents.forEach((e) => {
        const run = e.isIntersecting && !prefersReduced;
        particleHost.querySelectorAll(".sparkle").forEach((s) => {
          s.style.animationPlayState = run ? "running" : "paused";
        });
      });
    });
    pIO.observe(particleHost);
  }

  // ===================== 8) Reduced Motion Fallback =====================
  if (prefersReduced) {
    // 即時リビール
    revealNodes?.forEach?.((el) => {
      el.style.opacity = 1;
      el.style.transform = "none";
    });
    // カウントは即値
    counters?.forEach?.((el) => {
      const decimals = Number(el.dataset.decimals || "0");
      const prefix = el.dataset.prefix || "";
      const suffix = el.dataset.suffix || "";
      const target = Number(el.dataset.count || "0");
      el.textContent = `${prefix}${target.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}${suffix}`;
      el.dataset.counted = "true";
    });
  }

  // ===================== 9) First sync =====================
  onScroll();
})();
