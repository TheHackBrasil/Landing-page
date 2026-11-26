(() => {
  "use strict";

  const section = document.querySelector(".connection");
  const stage = section.querySelector(".connection-stage");
  const reveal = section.querySelector(".connection-reveal");
  const header = document.querySelector(".site-header");
  const motion = matchMedia("(prefers-reduced-motion: no-preference) and (min-height: 34rem)");
  let frame = 0;
  let stickyTop = 0;
  let openingDistance = 0;

  const clamp = (value) => Math.max(0, Math.min(1, value));
  const smooth = (value) => value * value * (3 - 2 * value);

  function update() {
    frame = 0;
    if (!motion.matches) return;

    const top = section.getBoundingClientRect().top;
    const approachStart = Math.max(stickyTop + 120, innerHeight * .59);
    const touch = smooth(clamp((approachStart - top) / (approachStart - stickyTop)));
    // The fingers meet at the pin point. The screenshot expands from that point
    // during the short remainder of the scroll, and reverses with the same path.
    const opening = clamp((stickyTop - top) / openingDistance);
    const screenOpen = 1 - (1 - opening) ** 2;

    section.style.setProperty("--touch", touch);
    section.style.setProperty("--hands-opacity", 1 - smooth(clamp(opening / .69)));
    section.style.setProperty("--contact-glow", Math.sin(Math.PI * clamp(opening / .78)) * .77);
    section.style.setProperty("--screen-open", screenOpen);
    section.style.setProperty("--screen-opacity", smooth(clamp(opening / .8)));
    section.style.setProperty("--ui-opacity", smooth(clamp((opening - .24) / .72)));
    reveal.inert = opening < .65 && !reveal.contains(document.activeElement);
  }

  function scheduleUpdate() {
    if (!frame && motion.matches) frame = requestAnimationFrame(update);
  }

  function measure() {
    section.classList.toggle("is-ready", motion.matches);
    if (!motion.matches) {
      reveal.inert = false;
      return;
    }
    const headerHeight = header.offsetHeight;
    const stageHeight = stage.offsetHeight;
    stickyTop = Math.max(headerHeight, (innerHeight + headerHeight - stageHeight) / 2);
    openingDistance = Math.max(1, (section.offsetHeight - stageHeight) * .93);
    section.style.setProperty("--stage-top", stickyTop + "px");
    scheduleUpdate();
  }

  motion.addEventListener("change", measure);
  window.addEventListener("resize", measure, { passive: true });
  window.addEventListener("scroll", scheduleUpdate, { passive: true });
  window.addEventListener("pageshow", measure);
  new ResizeObserver(measure).observe(header);
  measure();
})();
