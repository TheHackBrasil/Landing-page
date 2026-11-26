(() => {
  "use strict";

  const page = document.documentElement;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const mobileNav = matchMedia("(max-width: 39rem)");
  const staticArt = matchMedia("(max-width: 52rem)");
  page.classList.add("js");

  const menu = document.querySelector("#menu-toggle");
  const nav = document.querySelector("#navegacao");
  const menuIcon = menu.querySelector("use");

  function setMenu(open) {
    menu.hidden = !mobileNav.matches;
    nav.hidden = mobileNav.matches && !open;
    menu.setAttribute("aria-expanded", String(mobileNav.matches && open));
    menuIcon.setAttribute("href", open ? "#i-close" : "#i-menu");
  }

  menu.addEventListener("click", () => setMenu(menu.getAttribute("aria-expanded") !== "true"));
  nav.addEventListener("click", (event) => {
    if (event.target.closest("a") && mobileNav.matches) {
      const section = document.querySelector(event.target.closest("a").hash);
      setMenu(false);
      if (section) {
        section.setAttribute("tabindex", "-1");
        section.focus({ preventScroll: true });
      }
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.getAttribute("aria-expanded") === "true") {
      setMenu(false);
      menu.focus();
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (menu.getAttribute("aria-expanded") === "true" && !nav.contains(event.target) && !menu.contains(event.target)) {
      setMenu(false);
    }
  });
  mobileNav.addEventListener("change", () => setMenu(false));
  setMenu(false);

  const form = document.querySelector("#contact-form");
  const formButton = form.querySelector("#form-send");
  const formStatus = form.querySelector("#form-status");
  const mandatory = Array.from(form.querySelectorAll("input[required]"));
  let attempted = false;

  function validateField(field) {
    const missing = {
      nome: "Informe seu nome.",
      email: "Informe seu e-mail corporativo.",
      empresa: "Informe o nome da empresa.",
    };
    let message = "";
    if (!field.value.trim()) message = missing[field.id];
    else if (field.validity.typeMismatch) message = "Use o formato nome@empresa.com.";

    const feedback = document.getElementById(field.getAttribute("aria-describedby"));
    feedback.textContent = message;
    feedback.hidden = !message;
    if (message) field.setAttribute("aria-invalid", "true");
    else field.removeAttribute("aria-invalid");
    return !message;
  }

  function showFormStatus(state, message) {
    formStatus.dataset.result = state;
    formStatus.textContent = message;
    formStatus.hidden = false;
  }

  function tryForm() {
    attempted = true;
    const invalid = mandatory.filter((field) => !validateField(field));
    if (invalid.length) {
      showFormStatus("error", "Revise os campos sinalizados para continuar.");
      invalid[0].focus();
      return;
    }
    form.reset();
    attempted = false;
    showFormStatus("success", "Teste concluído. Os campos passaram pela validação da demonstração.");
  }

  mandatory.forEach((field) => {
    field.addEventListener("blur", () => {
      if (attempted || field.value.trim()) validateField(field);
    });
  });
  form.addEventListener("input", (event) => {
    formStatus.hidden = true;
    if (mandatory.includes(event.target) && event.target.hasAttribute("aria-invalid")) {
      validateField(event.target);
    }
  });
  form.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing && mandatory.includes(event.target)) {
      event.preventDefault();
      tryForm();
    }
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    tryForm();
  });
  formButton.addEventListener("click", tryForm);
  formButton.disabled = false;

  const hero = document.querySelector(".hero-stage");
  const clamp = (value) => Math.max(0, Math.min(1, value));

  const header = document.querySelector(".site-header");
  const progressBar = header.querySelector(".reading-progress");
  const navLinks = Array.from(document.querySelectorAll(".site-nav a, .chapter-nav a"));
  const anchors = Array.from(new Set(navLinks.map((link) => link.hash)))
    .map((hash) => document.querySelector(hash));
  let scheduled = false;
  let active = "";

  function updateScroll() {
    scheduled = false;
    const height = window.innerHeight;
    const maxScroll = Math.max(1, page.scrollHeight - height);
    progressBar.style.setProperty("--progress", clamp(window.scrollY / maxScroll));

    const readingLine = Math.max(header.offsetHeight + 12, height * 0.34);
    const section = anchors.reduce((latest, anchor) => {
      if (anchor.getBoundingClientRect().top >= readingLine) return latest;
      if (!latest || anchor.offsetTop > latest.offsetTop) return anchor;
      return latest;
    }, null);
    const hash = section ? "#" + section.id : "";
    if (hash !== active) {
      active = hash;
      navLinks.forEach((link) => {
        if (link.hash === hash) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
    }

    const heroBounds = hero.getBoundingClientRect();
    // Let the whole scene enter the viewport on tall, stacked phone layouts.
    const leadIn = Math.max(0, heroBounds.height - height);
    const exit = clamp((header.offsetHeight - heroBounds.top - leadIn) / Math.min(heroBounds.height, height));
    hero.style.setProperty("--cloud-rise", (reducedMotion.matches ? 0 : exit * heroBounds.height * .92) + "px");
  }

  function scheduleScroll() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(updateScroll);
  }

  window.addEventListener("scroll", scheduleScroll, { passive: true });
  window.addEventListener("resize", scheduleScroll, { passive: true });
  reducedMotion.addEventListener("change", scheduleScroll);
  staticArt.addEventListener("change", scheduleScroll);
  scheduleScroll();
})();
