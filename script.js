(() => {
  ("use strict");

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* -----------------------------
   * 1) モバイルメニュー
   * ----------------------------- */
  (function mobileMenu() {
    const toggle = $(".menu-toggle");
    const menu = $("#menu");
    const overlay = $(".nav-overlay");

    if (!toggle || !menu || !overlay) return;

    const focusableSel =
      'a[href], area[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    function openMenu() {
      menu.classList.add("open");
      toggle.setAttribute("aria-expanded", "true");
      overlay.hidden = false;
      overlay.classList.add("show");
      document.body.classList.add("no-scroll");
      // フォーカストラップのため、最初のリンクへ
      const first = menu.querySelector(focusableSel);
      (first || toggle).focus({ preventScroll: true });
      document.addEventListener("keydown", onKeydown);
    }

    function closeMenu() {
      menu.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
      overlay.classList.remove("show");
      document.body.classList.remove("no-scroll");
      // 非表示（トランジション後にhiddenを戻す）
      setTimeout(() => {
        if (!overlay.classList.contains("show")) overlay.hidden = true;
      }, 200);
      toggle.focus({ preventScroll: true });
      document.removeEventListener("keydown", onKeydown);
    }

    function onKeydown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu();
        return;
      }
      if (e.key === "Tab" && menu.classList.contains("open")) {
        // フォーカストラップ
        const focusables = $$(focusableSel, menu);
        if (!focusables.length) return;
        const firstEl = focusables[0];
        const lastEl = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          lastEl.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          firstEl.focus();
          e.preventDefault();
        }
      }
    }

    toggle.addEventListener("click", () => {
      const isOpen = menu.classList.contains("open");
      isOpen ? closeMenu() : openMenu();
    });
    overlay.addEventListener("click", closeMenu);
    // メニュー内リンクで自動クローズ
    $$("#menu a").forEach((a) => a.addEventListener("click", closeMenu));
    // 幅が戻ったら状態リセット
    window.addEventListener("resize", () => {
      if (window.innerWidth > 900) closeMenu();
    });
  })();

  /* ===== Hero Enhancement (UI / Sync / Swipe / Tilt) ===== */
  (() => {
    const wrap = document.querySelector("#hero-left");
    if (!wrap) return;

    const imgs = Array.from(wrap.querySelectorAll("img"));
    if (imgs.length === 0) return;

    // UI生成
    const ui = wrap.querySelector(".hero-ui");
    const dotsWrap = wrap.querySelector(".hero-dots");
    const prevBtn = wrap.querySelector(".hero-prev");
    const nextBtn = wrap.querySelector(".hero-next");
    const progress = wrap.querySelector(".hero-progress span");

    // 角丸内での3Dチルト用ラッパ
    wrap.classList.add("hero-tilt");

    // ドット生成
    dotsWrap.innerHTML = imgs
      .map(
        (_, i) =>
          `<button type="button" role="tab" aria-label="画像${
            i + 1
          }" aria-selected="false"></button>`
      )
      .join("");
    const dots = Array.from(dotsWrap.querySelectorAll("button"));

    const getIndex = () =>
      imgs.findIndex((el) => el.classList.contains("active"));
    const clamp = (i) => (i + imgs.length) % imgs.length;

    let lastIndex = Math.max(0, getIndex());
    let lastSwitchAt = performance.now();
    const AUTO_MS = 4000; // あなたの旧スライダーに合わせる

    function setActive(idx, { user = false } = {}) {
      const cur = getIndex();
      if (cur === idx) return;
      imgs[cur]?.classList.remove("active");
      imgs[idx]?.classList.add("active");
      syncUI(); // 表示を揃える
      if (user) lastSwitchAt = performance.now(); // 進捗リセット
    }

    function syncUI() {
      const i = getIndex();
      if (i < 0) return;
      dots.forEach((d, k) => d.setAttribute("aria-selected", String(k === i)));
      lastIndex = i;
      // 進捗バー：0%→100%（旧スライダー周期に“見かけ上”同期）
      if (progress) {
        progress.style.transition = "none";
        progress.style.width = "0%";
        // 次フレームで伸ばす
        requestAnimationFrame(() => {
          progress.style.transition = `width ${AUTO_MS}ms linear`;
          progress.style.width = "100%";
        });
      }
    }

    // 初期同期
    syncUI();

    // ドット/矢印操作
    dots.forEach((d, k) =>
      d.addEventListener("click", () => setActive(k, { user: true }))
    );
    prevBtn?.addEventListener("click", () =>
      setActive(clamp(getIndex() - 1), { user: true })
    );
    nextBtn?.addEventListener("click", () =>
      setActive(clamp(getIndex() + 1), { user: true })
    );

    // スワイプ（モバイル/トラックパッド）
    let startX = 0,
      startY = 0,
      dragging = false;
    const THRESH = 40;
    wrap.addEventListener(
      "touchstart",
      (e) => {
        const t = e.changedTouches[0];
        startX = t.clientX;
        startY = t.clientY;
        dragging = true;
      },
      { passive: true }
    );
    wrap.addEventListener(
      "touchend",
      (e) => {
        if (!dragging) return;
        dragging = false;
        const t = e.changedTouches[0];
        const dx = t.clientX - startX,
          dy = t.clientY - startY;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > THRESH) {
          dx < 0 ? nextBtn?.click() : prevBtn?.click();
        }
      },
      { passive: true }
    );

    // 旧スライダーによる .active 変更を監視して同期
    const mo = new MutationObserver((muts) => {
      // activeの増減があれば同期
      if (
        muts.some((m) => m.type === "attributes" && m.attributeName === "class")
      ) {
        syncUI();
        lastSwitchAt = performance.now();
      }
    });
    mo.observe(wrap, {
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });

    // マウスホバーの3Dチルト
    const canTilt = matchMedia("(hover:hover) and (pointer:fine)").matches;
    if (canTilt) {
      const MAX = 8; // deg
      wrap.addEventListener("pointermove", (e) => {
        const rect = wrap.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const nx = (e.clientX - cx) / (rect.width / 2);
        const ny = (e.clientY - cy) / (rect.height / 2);
        wrap.style.transform = `perspective(900px) rotateY(${(nx * MAX).toFixed(
          2
        )}deg) rotateX(${(-ny * MAX).toFixed(2)}deg)`;
      });
      wrap.addEventListener("pointerleave", () => {
        wrap.style.transform = "perspective(900px) rotateY(0) rotateX(0)";
      });
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const bar = wrap.querySelector(".hero-progress span");
          if (!bar) return;
          if (!entry.isIntersecting) {
            bar.style.transition = "none";
          } else {
            const elapsed = performance.now() - lastSwitchAt;
            const rest = Math.max(0, AUTO_MS - elapsed);
            bar.style.transition = "none";
            bar.style.width = "0%";
            requestAnimationFrame(() => {
              bar.style.transition = `width ${rest}ms linear`;
              bar.style.width = "100%";
            });
          }
        });
      },
      { threshold: 0.2 }
    );
    io.observe(wrap);
  })();

  (() => {
    const card = document.querySelector("[data-catch]");
    if (!card) return;

    const lines = card.querySelectorAll(".fx-line");
    lines.forEach((el, i) => {
      el.style.transitionDelay = `${i * 120}ms`;
    });

    requestAnimationFrame(() => {
      card.classList.add("ready");
    });
  })();

  /* -----------------------------
   * 3) CSSライトボックスの補助
   *    - :target運用をESC/背景クリックで閉じやすく
   * ----------------------------- */
  (function lightboxAssist() {
    const boxes = $$(".lightbox");
    if (!boxes.length) return;

    function closeByHash() {
      // #close へ退避（存在不要）
      if (location.hash && location.hash.startsWith("#tv-")) {
        history.pushState(
          "",
          document.title,
          window.location.pathname + window.location.search
        );
      }
    }

    // 背景クリックで閉じる
    boxes.forEach((box) => {
      box.addEventListener("click", (e) => {
        if (e.target === box) {
          e.preventDefault();
          closeByHash();
        }
      });
    });

    // ESCで閉じる
    document.addEventListener("keydown", (e) => {
      if (
        e.key === "Escape" &&
        location.hash &&
        location.hash.startsWith("#tv-")
      ) {
        e.preventDefault();
        closeByHash();
      }
    });

    // 開いたら閉じるボタンへフォーカス
    window.addEventListener("hashchange", () => {
      if (location.hash && location.hash.startsWith("#tv-")) {
        const panel = $(location.hash + " .panel");
        const closeBtn = panel && $(".close", panel);
        closeBtn && closeBtn.focus({ preventScroll: true });
      }
    });
  })();

  /* -----------------------------
   * 4) お問い合わせフォームの振る舞い
   *    - 工事希望日(min: 今日+21日)
   *    - 同意/recaptchaで送信可否
   *    - 送信時のバリデーション
   * ----------------------------- */
  (function contactForm() {
    const form = $(".contact-form");
    if (!form) return;

    // (a) 工事希望日の min=今日+21日
    (function setInstallMinDates() {
      const ids = ["install-date-1", "install-date-2", "install-date-3"];
      const d = new Date();
      d.setDate(d.getDate() + 21);
      const pad = (n) => String(n).padStart(2, "0");
      const min = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
        d.getDate()
      )}`;
      ids.forEach((id) => {
        const el = $("#" + id);
        if (el) el.min = min;
      });
    })();

    (function setInstallMinDates() {
      const ids = ["survey-date-1", "survey-date-2", "survey-date-3"];
      const d = new Date();
      d.setDate(d.getDate() + 21);
      const pad = (n) => String(n).padStart(2, "0");
      const min = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
        d.getDate()
      )}`;
      ids.forEach((id) => {
        const el = $("#" + id);
        if (el) el.min = min;
      });
    })();

    // (b) 同意&reCAPTCHAで送信可否
    const agree = $("#agree-terms");
    const submitBtn = $('button[type="submit"]', form);
    const captchaElm = $(".g-recaptcha", form);

    function hasCaptchaOK() {
      try {
        return typeof grecaptcha !== "undefined"
          ? grecaptcha.getResponse().length > 0
          : true; // sitekey未設定や未読込時は通す
      } catch {
        return true;
      }
    }
    function canSubmit() {
      const okAgree = agree ? agree.checked : true;
      const okCaptcha = hasCaptchaOK();
      const enabled = okAgree && okCaptcha;
      if (submitBtn) submitBtn.disabled = !enabled;
      return enabled;
    }

    // reCAPTCHAコールバック（HTMLに data-callback="onRecaptchaSuccess" を付けていなくても監視で拾う）
    window.onRecaptchaSuccess = canSubmit;

    // reCAPTCHA応答の変化を監視（安全策）
    if (captchaElm) {
      const mo = new MutationObserver(canSubmit);
      mo.observe(captchaElm, {
        subtree: true,
        childList: true,
        attributes: true,
      });
      // 2秒おきの保険チェック（環境依存を吸収）
      setInterval(canSubmit, 2000);
    }

    agree && agree.addEventListener("change", canSubmit);
    canSubmit();

    // (c) 送信時バリデーション
    form.addEventListener("submit", (e) => {
      // 同意/recaptchaで制御
      if (!canSubmit()) {
        e.preventDefault();
        alert("送信前に規約へ同意し、reCAPTCHAを完了してください。");
        return;
      }
      // ネイティブ検証
      if (!form.reportValidity()) {
        e.preventDefault();
        // 最初の不正要素へスクロール
        const invalid = form.querySelector(":invalid");
        invalid &&
          invalid.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  })();

  /* -----------------------------
   * 5) 横スクロール防止の保険（ヒーローのみ）
   *    ※ CSSで対策済みだが、念のためJSでも検知して調整
   * ----------------------------- */
  (function heroOverflowGuard() {
    const hero = $(".hero");
    if (!hero) return;
    const check = () => {
      // ほんのわずかなサブピクセルはCSSでclip/hidden済み
      // ここでは大きなはみ出しのデバッグに使える
      // （必要なら hero.style.overflowX = 'hidden' を強制）
    };
    window.addEventListener("resize", check, { passive: true });
    check();
  })();
})();
