(() => {
  const stage = document.querySelector('#problema .dispatch-stage');
  if (!stage) return;

  const thread = stage.querySelector('.dispatch-messages');
  const draft = stage.querySelector('.dispatch-draft');
  const presence = stage.querySelector('.dispatch-presence');
  const pause = stage.querySelector('.dispatch-pause');
  if (!thread || !draft || !presence || !pause) return;

  const bubbles = [...thread.querySelectorAll(':scope > p')];
  if (!bubbles.length) return;

  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const emptyDraft = draft.textContent;
  const available = presence.textContent;
  const pauseLabel = pause.querySelector('[data-pause-label]');
  let nextStart = 0;
  const beats = bubbles.map(bubble => {
    const copy = bubble.cloneNode(true);
    copy.querySelectorAll('time, [aria-hidden="true"]').forEach(node => node.remove());
    const text = copy.textContent.trim();
    const sent = bubble.classList.contains('sent');
    const start = nextStart;
    const send = start + (sent ? Math.min(1800, Math.max(850, text.length * 26)) : 1250);
    nextStart = send + Math.min(2600, Math.max(1550, text.length * 36));
    return { bubble, text, sent, start, send };
  });
  const loopEnd = nextStart + 2200;
  // Show an opening message immediately, then replay its composition on later loops.
  let elapsed = beats[0].send;
  let previousTime = 0;
  let timer = null;
  let onScreen = false;
  let userPaused = false;

  function setText(element, value) {
    if (element.textContent !== value) element.textContent = value;
  }

  function render(animateEntry) {
    const instant = elapsed % loopEnd;
    const active = beats.findLast(beat => beat.start <= instant) || beats[0];
    const composing = instant < active.send;
    const tapping = active.sent && instant >= active.send - 150 && instant < active.send + 200;
    let newest = 0;
    let changed = false;
    beats.forEach(({ bubble, send }, index) => {
      const visible = send <= instant;
      if (visible) newest = index;
      if (bubble.hidden === !visible) return;
      bubble.hidden = !visible;
      changed = true;
      if (visible && animateEntry && bubble.animate) {
        bubble.animate([
          { opacity: 0, transform: 'translateY(7px) scale(.98)' },
          { opacity: 1, transform: 'none' }
        ], { duration: 260, easing: 'ease-out' });
      }
    });

    if (changed) thread.scrollTop = thread.scrollHeight;
    stage.dataset.beat = newest;
    stage.classList.toggle('is-tapping', tapping);
    const fraction = (instant - active.start) / (active.send - active.start);
    const typed = active.sent && composing ? active.text.slice(0, Math.ceil(fraction * active.text.length)) : '';
    setText(draft, typed || emptyDraft);
    setText(presence, !active.sent && composing ? 'digitando…' : available);
  }

  function tick() {
    const now = performance.now();
    elapsed += now - previousTime;
    previousTime = now;
    render(true);
    timer = setTimeout(tick, 50);
  }

  function sync() {
    if (timer !== null) {
      elapsed += performance.now() - previousTime;
      clearTimeout(timer);
      timer = null;
    }
    const reduced = preference.matches;
    pause.hidden = reduced;
    const buttonText = userPaused ? 'Retomar conversa' : 'Pausar conversa';
    pause.setAttribute('aria-label', buttonText);
    if (pauseLabel) setText(pauseLabel, buttonText);
    stage.classList.toggle('is-paused', userPaused);

    if (reduced) {
      bubbles.forEach(bubble => { bubble.hidden = false; });
      thread.scrollTop = 0;
      stage.dataset.beat = '0';
      stage.classList.remove('is-tapping');
      setText(draft, emptyDraft);
      setText(presence, available);
      return;
    }
    render(false);
    if (onScreen && !document.hidden && !userPaused) {
      previousTime = performance.now();
      timer = setTimeout(tick, 50);
    }
  }

  pause.addEventListener('click', () => {
    userPaused = !userPaused;
    sync();
  });
  document.addEventListener('visibilitychange', sync);
  preference.addEventListener('change', sync);
  const observer = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    sync();
  });
  observer.observe(stage);
  sync();
})();

(() => {
  const intro = document.querySelector('.dispatch-opening');
  const phone = document.querySelector('.dispatch-device');
  if (!intro || !phone) return;
  const stage = phone.offsetParent;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = value => Math.min(1, Math.max(0, value));
  // Build sidewalls from rounded cross sections in local (x, y, z) coordinates.
  function outline(width, height, radius, inset) {
    const points = [];
    const corners = [[width-radius,radius], [width-radius,height-radius],
      [radius,height-radius], [radius,radius]];
    corners.forEach(([cx,cy], corner) => {
      for (let i = 0; i <= 8; i++) {
        const angle = (corner - 1 + i / 8) * Math.PI / 2;
        points.push([cx + (radius-inset)*Math.cos(angle), cy + (radius-inset)*Math.sin(angle)]);
      }
    });
    return points;
  }

  function sidewalls(host, w, h, radius, layers) {
    host.replaceChildren();
    const fragment = document.createDocumentFragment();
    for (let ring=1; ring<layers.length; ring++) {
      const [inset,z,light] = layers[ring];
      const [previousInset,previousZ] = layers[ring-1];
      const near = outline(w,h,radius,previousInset);
      const far = outline(w,h,radius,inset);
      near.forEach(([x,y], i) => {
        const j = (i+1) % near.length;
        const dx=near[j][0]-x, dy=near[j][1]-y;
        const length=Math.hypot(dx,dy);
        if (length < .01) return;
        const ux=dx/length, uy=dy/length;
        const vx=far[i][0]-x, vy=far[i][1]-y, vz=z-previousZ;
        const depth=Math.hypot(vx,vy,vz);
        const face=document.createElement('b');
        const shade=Math.round(light+18*(uy*.6-ux*.8));
        face.style.cssText = `width:${length+.35}px;height:${depth+.12}px;background:rgb(${shade+6} ${shade+4} ${shade+8});transform:matrix3d(${ux},${uy},0,0,${vx/depth},${vy/depth},${vz/depth},0,0,0,1,0,${x},${y},${previousZ},1)`;
        fragment.append(face);
      });
    }
    host.append(fragment);
  }

  let modelWidth = 0;
  function buildModel() {
    const w=phone.offsetWidth, h=phone.offsetHeight;
    if (!w || w === modelWidth) return;
    modelWidth=w;
    const radius=w*.144, depth=w*.053;
    phone.style.setProperty('--face-radius',radius+'px');
    phone.style.setProperty('--half-depth',depth+'px');
    sidewalls(phone.querySelector('.dispatch-frame'),w,h,radius,[
      [0,-depth,75],[-1.8,-depth+2,158],[-1.8,depth-2,82],[0,depth,178]
    ]);
    phone.querySelectorAll('.camera-module i').forEach(lens=>{
      const diameter=lens.offsetWidth, lift=w*.018;
      lens.style.transform=`translateZ(${lift}px)`;
      sidewalls(lens,diameter,diameter,diameter/2,[[0,-lift,42],[0,0,67]]);
    });
  }

  const title=intro.querySelector('h2');
  const words=[];
  for (const node of [...title.childNodes]) {
    if (node.nodeType !== Node.TEXT_NODE) continue;
    const part=document.createDocumentFragment();
    for (const token of node.textContent.split(/(\s+)/)) {
      if (!token.trim()) { part.append(token); continue; }
      const word=document.createElement('span');
      word.textContent=token;
      part.append(word);
      words.push(word);
    }
    node.replaceWith(part);
  }
  let pending = false;
  function update() {
    pending = false;
    buildModel();
    const heading = intro.getBoundingClientRect();
    const landing = stage.getBoundingClientRect();
    const endX = landing.left + phone.offsetLeft;
    const endY = landing.top + phone.offsetTop;
    const startX = heading.left + heading.width / 2;
    const startY = heading.top + heading.height / 2;
    const distance = Math.max(1, endY - startY);
    const read = reduced.matches ? 1 : clamp((innerHeight*.98-startY)/(innerHeight*.46));
    words.forEach((word,i)=>{
      const opacity=clamp(read*1.5 - i/(words.length-1)*.5);
      word.style.setProperty('--word-opacity',opacity.toFixed(3));
    });
    const progress = reduced.matches ? 1 : clamp((innerHeight*.40-startY)/distance);
    const rest = 1 - progress*progress*(3-2*progress);
    const initialScale = Math.max(1.1, Math.min(heading.width*.98, heading.height*1.91, 1140)/phone.offsetHeight);
    phone.style.setProperty('--flight-x', (startX-endX)*rest+'px');
    phone.style.setProperty('--flight-y', -distance*rest+'px');
    phone.style.setProperty('--turn', 180*rest+'deg');
    phone.style.setProperty('--roll', -90*rest+'deg');
    phone.style.setProperty('--pitch', 8*Math.sin(progress*Math.PI)+'deg');
    phone.style.setProperty('--size', 1+(initialScale-1)*rest);
    phone.classList.toggle('in-flight', progress <= .91);
    phone.style.setProperty('--print-veil',(.84*rest).toFixed(3));
  }
  function schedule() {
    if (!pending) { pending = true; requestAnimationFrame(update); }
  }
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule);
  reduced.addEventListener('change', schedule);
  new ResizeObserver(schedule).observe(intro.closest('main') || document.body);
  update();
})();
