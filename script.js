// mobile menu (with overlay, close on link & resize)
(function () {
  const toggle = document.querySelector(".menu-toggle");
  const menu = document.getElementById("menu");
  const overlay = document.querySelector(".nav-overlay");
  if (!toggle || !menu || !overlay) return;
  function openMenu() {
    menu.classList.add("open");
    toggle.setAttribute("aria-expanded", "true");
    overlay.hidden = false;
    overlay.classList.add("show");
    document.body.classList.add("no-scroll");
  }
  function closeMenu() {
    menu.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
    overlay.classList.remove("show");
    document.body.classList.remove("no-scroll");
    setTimeout(() => {
      if (!overlay.classList.contains("show")) overlay.hidden = true;
    }, 200);
  }
  toggle.addEventListener("click", () => {
    const isOpen = menu.classList.contains("open");
    isOpen ? closeMenu() : openMenu();
  });
  overlay.addEventListener("click", closeMenu);
  // close when clicking a link (mobile)
  menu
    .querySelectorAll("a")
    .forEach((a) => a.addEventListener("click", closeMenu));
  // reset on resize
  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) closeMenu();
  });
})();

// hero images auto cycle (respect reduced motion)
function cycleImages(id) {
  const reduce = window.matchMedia?.(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  if (reduce) return;
  const el = document.getElementById(id);
  if (!el) return;
  const imgs = el.querySelectorAll("img");
  let i = 0;
  if (imgs.length <= 1) return;
  setInterval(() => {
    imgs[i].classList.remove("active");
    i = (i + 1) % imgs.length;
    imgs[i].classList.add("active");
  }, 4000);
}
cycleImages("hero-left");

// Works horizontal scroller
(function () {
  const scroller = document.querySelector(".works-scroller");
  if (!scroller) return;
  const track = scroller.querySelector(".works-cards");
  const prev = scroller.querySelector(".scroll-btn.prev");
  const next = scroller.querySelector(".scroll-btn.next");
  const step = () => {
    const c = track.querySelector(".work-card");
    return c ? c.getBoundingClientRect().width + 16 : 300;
  };
  const update = () => {
    prev.disabled = track.scrollLeft <= 4;
    const max = track.scrollWidth - track.clientWidth - 4;
    next.disabled = track.scrollLeft >= max;
  };
  prev.addEventListener("click", () =>
    track.scrollBy({ left: -step(), behavior: "smooth" })
  );
  next.addEventListener("click", () =>
    track.scrollBy({ left: step(), behavior: "smooth" })
  );
  track.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  update();
})();

// Focus trap helper
function trapFocusWithin(container) {
  const focusable = container.querySelectorAll(
    'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
  );
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  function onKey(e) {
    if (e.key !== "Tab") return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  container.addEventListener("keydown", onKey);
  return () => container.removeEventListener("keydown", onKey);
}

// TV modal (lightbox)
(function () {
  const cards = document.querySelectorAll(".tv-card");
  const modal = document.getElementById("tv-modal");
  if (!cards.length || !modal) return;
  const img = modal.querySelector("#tv-modal-img");
  const title = modal.querySelector("#tv-modal-title");
  const date = modal.querySelector("#tv-modal-date");
  const desc = modal.querySelector("#tv-modal-desc");
  const closeBtn = modal.querySelector(".close");
  const panel = modal.querySelector(".panel");
  let restoreFocus = null,
    untrap = null;
  const open = (d) => {
    img.src = d.img;
    img.alt = d.title || "";
    title.textContent = d.title || "";
    date.textContent = d.date || "";
    desc.textContent = d.desc || "";
    restoreFocus = document.activeElement;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    untrap = trapFocusWithin(panel);
    closeBtn.focus();
  };
  const close = () => {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    untrap && untrap();
    if (restoreFocus && restoreFocus.focus) restoreFocus.focus();
  };
  cards.forEach((c) =>
    c.addEventListener("click", (e) => {
      e.preventDefault();
      open(c.dataset);
    })
  );
  closeBtn.addEventListener("click", close);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
})();

// Contact: min date (today + 21 days) for install dates
(function () {
  const ids = ["install-date-1", "install-date-2", "install-date-3"];
  const d = new Date();
  d.setDate(d.getDate() + 21);
  const pad = (n) => String(n).padStart(2, "0");
  const min = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.min = min;
  });
})();

// Agree checkbox & reCAPTCHA gate for submit + 簡易バリデーション
(function () {
  const agree = document.getElementById("agree-terms");
  const btn = document.querySelector(".contact-form .form-actions button");
  const form = document.querySelector(".contact-form");
  const errorBox = document.getElementById("form-error");
  function canSubmit() {
    const okAgree = agree ? agree.checked : true;
    const hasWidget =
      typeof grecaptcha !== "undefined" &&
      document.querySelector(".g-recaptcha");
    const okCaptcha = hasWidget ? grecaptcha.getResponse().length > 0 : true; // sitekey未設定時はスキップ
    if (btn) btn.disabled = !(okAgree && okCaptcha);
  }
  window.onRecaptchaSuccess = canSubmit;
  agree?.addEventListener("change", canSubmit);
  canSubmit();

  form?.addEventListener("submit", function (e) {
    errorBox.hidden = true;
    errorBox.textContent = "";
    if (btn && btn.disabled) {
      e.preventDefault();
      errorBox.hidden = false;
      errorBox.textContent =
        "送信前に規約へ同意し、reCAPTCHAを完了してください。";
      return;
    }
    const requiredFields = form.querySelectorAll("[required]");
    for (const f of requiredFields) {
      if (!f.value) {
        e.preventDefault();
        errorBox.hidden = false;
        errorBox.textContent = "未入力の必須項目があります。";
        f.focus();
        return;
      }
    }
  });
})();
