(() => {
  const scene = document.querySelector('.signal-scroll-scene');
  const viewport = scene?.querySelector('.signal-scroll-viewport');
  const cards = scene ? [...scene.querySelectorAll('.signal-card')] : [];
  const current = scene?.querySelector('[data-signal-current]');
  const label = scene?.querySelector('[data-signal-label]');
  if (!scene || !viewport || cards.length !== 3) return;

  const labels = ['o cliente cobrando', 'a equipe no telefone', 'a doca parada'];
  const colors = ['#87bb8e', '#a9cfc8', '#d2b883'];
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  let frame = 0;
  let active = -1;

  function apply(slide) {
    const index = Math.min(cards.length - 1, Math.max(0, Math.round(slide)));

    cards.forEach((card, i) => {
      const distance = i - slide;
      const absDistance = Math.abs(distance);
      const sideAmount = Math.min(1, absDistance);
      const compact = innerWidth < 768;
      const tiny = innerWidth < 370;
      const spread = compact ? 36 : 29;
      const shift = distance * spread;
      // Icons moving left drift gently up-left and fade quickly to avoid touching left copy
      const yoff = distance < 0 ? -Math.abs(distance) * 5.5 : sideAmount * (compact ? 8 : 4.5);
      const scale = Math.max(.4, 1.08 - absDistance * .62);

      // Asymmetric fade: when moving to the left (distance < 0), fade out swiftly
      // so the exiting icon never overlaps or clutters the copy on the left
      let iconOpacity;
      if (distance < 0) {
        iconOpacity = clamp(1 - Math.abs(distance) * 2.3);
      } else {
        iconOpacity = clamp(1 - Math.max(0, distance - 0.72) * 2.5);
      }
      if (tiny && absDistance > .62) iconOpacity = 0;

      const copyOpacity = clamp(1 - absDistance * 3.15);
      const ghostOpacity = 0;
      const blur = Math.min(1.8, absDistance * 1.4);
      const tilt = distance * -5.5;

      card.style.setProperty('--icon-shift', `${shift.toFixed(3)}vw`);
      card.style.setProperty('--icon-yoff', `${yoff.toFixed(3)}vh`);
      card.style.setProperty('--icon-scale', scale.toFixed(4));
      card.style.setProperty('--icon-opacity', iconOpacity.toFixed(3));
      card.style.setProperty('--icon-blur', `${blur.toFixed(2)}px`);
      card.style.setProperty('--icon-tilt', `${tilt.toFixed(2)}deg`);
      card.style.setProperty('--icon-z', String(absDistance < .48 ? 5 : 3));
      card.style.setProperty('--copy-opacity', copyOpacity.toFixed(3));
      card.style.setProperty('--copy-lift', `${((1 - copyOpacity) * 12).toFixed(2)}px`);
      card.style.setProperty('--ghost-opacity', (ghostOpacity * .96).toFixed(3));
      card.style.setProperty('--ghost-shift', `${(distance * 5).toFixed(3)}vw`);
      card.style.setProperty('--ghost-scale', Math.max(.9, 1 - absDistance * .06).toFixed(3));
      card.setAttribute('aria-hidden', String(i !== index));
    });

    viewport.style.backgroundColor = colors[index];
    if (index === active) return;
    active = index;
    scene.dataset.active = String(index);
    current.textContent = String(index + 1).padStart(2, '0');
    label.textContent = labels[index];
  }

  function readScroll() {
    const rect = scene.getBoundingClientRect();
    const stickyTop = parseFloat(getComputedStyle(viewport).top) || 0;
    const travel = Math.max(1, scene.offsetHeight - viewport.offsetHeight);
    const progress = clamp((stickyTop - rect.top) / travel);
    apply(progress * (cards.length - 1));
  }

  function queueRead() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(readScroll);
  }

  addEventListener('scroll', queueRead, { passive: true });
  addEventListener('resize', queueRead, { passive: true });
  scene.dataset.active = '0';
  apply(0);
  readScroll();
})();
