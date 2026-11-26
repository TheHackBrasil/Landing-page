(() => {
  "use strict";

  const canvas = document.querySelector("#logistics-canvas");
  const stage = canvas.closest(".hero-landscape");
  const unavailable = document.querySelector("#logistics-unavailable");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const radians = Math.PI / 180;
  const baseYaw = 32 * radians;
  const basePitch = 31 * radians;
  const referenceCenter = [623, 627];
  const unitsPerPixel = .024;
  const interval = 14.1;
  const truckScale = 1.22;

  const modules = {
    factory: {
      heading: 0,
      mask: { x:330, y:708, width:292, height:730, slopes:[.60,.694] },
      dock: { x: .91, z: 1.57, gate: 12.9, lamp: [1.31, 1.14, .793], phase: 5.6, vehicle: "violetTruck" },
    },
    warehouse: {
      heading: 0,
      mask: { x:643.5, y:635.5, width:295, height:1050, slopes:[.584,.646] },
      dock: { x: .87, z: 1.24, gate: 15.8, lamp: [1.23, 1.13, .479], phase: 1.8, vehicle: "tealTruck" },
    },
    highway: {
      heading: baseYaw-8*radians,
      mask: { x:934.5, y:626, width:252, height:755, slopes:[.58,.716] },
    },
  };

  const roadLanes = [
    {
      x: -.72, phase: .035, direction: 1, duration: 54,
      vehicles: [
        "tealTruck", "ivoryCar", "blueCar", "brickCar", "ivoryCar",
        "violetTruck", "brickCar", "blueCar", "ivoryCar", "brickCar",
        "blueCar", "ivoryCar", "blueCar", "brickCar", "ivoryCar", "blueCar",
      ],
    },
    {
      x: .72, phase: .11, direction: -1, duration: 49,
      vehicles: [
        "violetTruck", "brickCar", "ivoryCar", "blueCar", "ivoryCar",
        "brickCar", "blueCar", "tealTruck", "ivoryCar", "blueCar",
        "brickCar", "ivoryCar", "blueCar", "ivoryCar", "brickCar",
      ],
    },
  ];
  const roadEnd = 25.5;
  const carScale = 1.15;
  const forkliftRuns = [
    { near:-3.15, far:-8.85, phase:.15, duration:23, lift:.61, scale:1.22 },
    { near:-11.31, far:-16.73, phase:.62, duration:26, lift:.54, scale:1.14 },
  ];

  let renderer = null;
  let cameraNeedsUpdate = true;
  let camera = null;
  let frame = 0;
  let elapsed = 0;
  let previousTime = null;
  let cursor = null;
  const cardAngles = {};
  let inView = true;
  const moduleNames = Object.keys(modules);

  function clamp(value, min = 0, max = 1) {
    return Math.max(min, Math.min(max, value));
  }

  function fittedCamera(aspect) {
    const sinYaw = Math.sin(baseYaw);
    const cosYaw = Math.cos(baseYaw);
    const sinPitch = Math.sin(basePitch);
    const cosPitch = Math.cos(basePitch);
    const right = [cosYaw, 0, -sinYaw];
    const up = [-sinYaw*sinPitch, cosPitch, -cosYaw*sinPitch];
    const front = [sinYaw*cosPitch, sinPitch, cosYaw*cosPitch];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    moduleNames.forEach((name) => {
      const mask = modules[name].mask;
      const half = mask.width*.5;
      minX = Math.min(minX,mask.x-half-61);
      maxX = Math.max(maxX,mask.x+half+61);
      const headroom = name === "warehouse" ? 78 : 54;
      minY = Math.min(minY,mask.y-mask.height*.5-mask.slopes[1]*half-headroom);
      maxY = Math.max(maxY,mask.y+mask.height*.5+mask.slopes[0]*half+38);
    });
    const ref = referenceCenter;
    let height = Math.max(
      (ref[1]-minY)*unitsPerPixel,
      (maxY-ref[1])*unitsPerPixel,
      (ref[0]-minX)*unitsPerPixel/aspect,
      (maxX-ref[0])*unitsPerPixel/aspect,
      13.58/aspect, // Reserve room for the orbit around the three cards.
    );
    height *= .93;
    return { right,up,front,target:[0,0,0],referenceCenter:ref,unitsPerPixel,halfSize:[height*aspect,height] };
  }

  function siteTransform(module, view) {
    const x = (module.mask.x-view.referenceCenter[0])*unitsPerPixel;
    const y = (view.referenceCenter[1]-module.mask.y)*unitsPerPixel;
    const origin = view.right.map((axis,index) => axis*x+view.up[index]*y);
    return { origin, angle:module.heading, cos:Math.cos(module.heading), sin:Math.sin(module.heading) };
  }

  function cardAngle(name,delta) {
    const influence = name === "warehouse" ? 1 : .93;
    const x = !reduced.matches && cursor ? cursor.x : 0;
    const y = !reduced.matches && cursor ? cursor.y : 0;
    const pitch = -y*.18*influence;
    const yaw = x*.235*influence;
    const angles = cardAngles[name] ??= [0,0];
    const settle = reduced.matches ? 1 : 1-Math.exp(-delta/.15);
    angles[0] += (pitch-angles[0])*settle;
    angles[1] += (yaw-angles[1])*settle;
    const moving = Math.max(Math.abs(pitch-angles[0]),Math.abs(yaw-angles[1])) > .00035;
    if (!moving) {
      angles[0] = pitch;
      angles[1] = yaw;
    }
    return { angles,moving };
  }

  function pointAtSite(site, x, y, z) {
    return [site.origin[0]+site.cos*x+site.sin*z,site.origin[1]+y,site.origin[2]-site.sin*x+site.cos*z];
  }

  function pose(model, x, y, z, yaw = 0, opacity = 1) {
    return { model, x, y, z, yaw, opacity };
  }

  function appendVehicle(objects, shadows, vehicle, module, site, x, z, yaw, opacity) {
    if (opacity <= 0) return;
    const car = vehicle.endsWith("Car");
    const scale = car ? carScale : truckScale;
    const position = pointAtSite(site,x,car ? -.010 : .023,z);
    const cast = pointAtSite(site,x+.05,.065,z-.045);
    objects.push({ ...pose(vehicle,...position,yaw+site.angle,opacity), module, scale });
    shadows.push({
      ...pose(null,...cast,yaw+site.angle,opacity*.40), module,
      rx:(car ? .54 : .66)*scale, rz:(car ? .86 : 1.24)*scale,
    });
  }

  function appendRoadTraffic(objects,shadows,site) {
    for (const {x,phase,direction,duration,vehicles} of roadLanes) {
      const yaw = direction === 1 ? 0 : Math.PI;
      vehicles.forEach((vehicle,index) => {
        const t = (elapsed/duration+phase+index/vehicles.length)%1;
        const progress = t-.038*Math.sin(2*Math.PI*t);
        const z = roadEnd*(2*progress-1)*direction;
        const opacity = clamp(Math.min(t,1-t)/.036);
        appendVehicle(objects,shadows,vehicle,"highway",site,x,z,yaw,opacity);
      });
    }
  }

  function forkliftPosition(run) {
    const t = (elapsed/run.duration+run.phase)%1;
    const moving = Math.min(1,t/.81);
    const work = clamp((t-.81)/.19);
    const lift = run.lift*Math.sin(Math.PI*work)**2;
    const progress = moving-Math.sin(2*Math.PI*moving)/(2*Math.PI);
    const radius = .64;
    const straight = run.near-run.far;
    const bend = Math.PI*radius;
    // Start and stop next to a rack. Turns are tangent to the two straight aisles.
    let distance = (progress*(2*straight+2*bend)+2.20)%(2*straight+2*bend);
    if (distance < straight) return {x:-radius,z:run.near-distance,yaw:Math.PI,lift};
    distance -= straight;
    if (distance < bend) {
      const angle = Math.PI+distance/radius;
      return {x:radius*Math.cos(angle),z:run.far+radius*Math.sin(angle),yaw:-angle,lift};
    }
    distance -= bend;
    if (distance < straight) return {x:radius,z:run.far+distance,yaw:0,lift};
    const angle = (distance-straight)/radius;
    return {x:radius*Math.cos(angle),z:run.near+radius*Math.sin(angle),yaw:-angle,lift};
  }

  function appendForklifts(objects,shadows,site,axis) {
    const c = Math.cos(axis);
    const s = Math.sin(axis);
    for (const run of forkliftRuns) {
      const {x,z,yaw,lift} = forkliftPosition(run);
      const {scale} = run;
      const position = pointAtSite(site,c*x+s*z,.155,-s*x+c*z);
      const direction = site.angle+axis+yaw;
      const cargo = [position[0],position[1]+lift,position[2]];
      objects.push({ ...pose("forklift",...position,direction), module:"warehouse", scale });
      objects.push({ ...pose("forkliftForks",...cargo,direction), module:"warehouse", scale });
      objects.push({ ...pose("forkliftLoad",...cargo,direction), module:"warehouse", scale });
      shadows.push({
        ...pose(null,position[0],position[1]+.008,position[2],direction,.39),
        module:"warehouse",rx:.61,rz:.83,
      });
    }
  }

  function dockPosition(spec) {
    const time = (elapsed + spec.phase) % interval;
    const gate = spec.gate;
    const bay = spec.z + .83*(truckScale-1);
    const ease = (progress) => progress * progress * (3-2*progress);
    if (time < 3.1) {
      return { z: gate + (bay-gate)*ease(time/3.1), lights: "amber" };
    }
    if (time < 7.2) return { z: bay, lights: "amber" };
    if (time < 10.0) {
      return { z: bay + (gate-bay)*ease((time-7.2)/2.8), lights: "amber" };
    }
    return { z: gate, lights: "green" };
  }

  function servicePath(z) {
    const {start,bend,lean} = window.ForsetiLogisticsData.serviceDrive;
    const distance = Math.max(0,z-start);
    const shift = distance < bend ? lean*distance*distance/(2*bend) : lean*(distance-bend*.5);
    return { shift,heading:Math.atan(lean*Math.min(1,distance/bend)) };
  }

  function draw(delta) {
    const data = window.ForsetiLogisticsData;
    if (cameraNeedsUpdate) {
      camera = fittedCamera(renderer.aspect);
      cameraNeedsUpdate = false;
    }
    const objects = [];
    const shadows = [];
    const frames = [];
    const chimneys = [];
    let frameInMotion = false;
    for (const name of moduleNames) {
      const module = modules[name];
      const site = siteTransform(module,camera);
      const tilt = cardAngle(name,delta);
      frameInMotion ||= tilt.moving;
      frames.push({ ...module.mask,name,angles:tilt.angles });
      objects.push({ ...pose(name,...site.origin,site.angle), module:name });
      objects.push({ ...pose(name+"Upper",...site.origin,site.angle), module:name, raised:true });
      if (name === "factory") {
        for (const origin of data.chimneys) chimneys.push(pointAtSite(site,...origin));
      }
      if (name === "warehouse") appendForklifts(objects,shadows,site,data.warehouseAxis);
      if (name === "highway") appendRoadTraffic(objects,shadows,site);
      if (!module.dock) continue;
      const dock = module.dock;
      const position = dockPosition(dock);
      const opacity = clamp((dock.gate-position.z)/.66);
      const path = servicePath(position.z);
      appendVehicle(objects,shadows,dock.vehicle,name,site,dock.x+path.shift,position.z,path.heading,opacity);
      const [lampX, lampY, lampZ] = dock.lamp;
      const lamp = pointAtSite(site,lampX,lampY,lampZ);
      objects.push({ ...pose(position.lights,...lamp,site.angle), module:name });
    }

    renderer.render(camera, frames, objects, shadows, elapsed, true, chimneys);
    return frameInMotion;
  }

  function stopFrames() {
    cancelAnimationFrame(frame);
    frame = 0;
    previousTime = null;
  }

  function renderFrame(time) {
    frame = 0;
    if (!renderer || canvas.hidden || document.hidden) return;
    const delta = previousTime === null ? 1/60 : Math.min((time-previousTime)/1000,.07);
    if (previousTime !== null && !reduced.matches && inView) {
      elapsed += delta;
    }
    let frameInMotion;
    try {
      frameInMotion = draw(delta);
    } catch (error) {
      console.error("Forseti · cena 3D", error);
      showUnavailable("A cena 3D encontrou um erro de renderização.", true);
      return;
    }
    if (inView && (!reduced.matches || frameInMotion)) {
      previousTime = time;
      requestDraw();
    } else {
      previousTime = null;
    }
  }

  function requestDraw() {
    if (renderer && !canvas.hidden && !document.hidden && !frame) frame = requestAnimationFrame(renderFrame);
  }

  function resize() {
    if (!renderer || canvas.hidden) return;
    renderer.resize(Math.max(1, stage.clientWidth),Math.max(1, stage.clientHeight));
    cameraNeedsUpdate = true;
    requestDraw();
  }

  function syncPlayback() {
    if (reduced.matches || !inView || document.hidden) stopFrames();
    if (inView) requestDraw();
  }

  function showUnavailable(message, release = false) {
    stopFrames();
    if (release && renderer) {
      renderer.dispose();
      renderer = null;
    }
    canvas.hidden = true;
    unavailable.textContent = message;
    unavailable.hidden = false;
  }

  function showScene() {
    unavailable.hidden = true;
    canvas.hidden = false;
    resize();
    syncPlayback();
  }

  function initialize() {
    try {
      const sceneData = window.ForsetiLogisticsData;
      if (!sceneData?.chimneys || !sceneData.serviceDrive || !Number.isFinite(sceneData.warehouseAxis)
          || !window.THREE || !window.ForsetiLogistics3D) {
        showUnavailable("Os arquivos da cena 3D estão indisponíveis.");
        return;
      }
      renderer = window.ForsetiLogistics3D.create(canvas,sceneData);
      if (!renderer) {
        showUnavailable("A cena 3D precisa de um navegador com WebGL 2.");
        return;
      }
    } catch (error) {
      console.error("Forseti · cena 3D:", error);
      showUnavailable("Houve uma falha na inicialização da cena 3D.", true);
      return;
    }
    showScene();
  }

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    showUnavailable("A conexão gráfica foi interrompida.");
  });
  canvas.addEventListener("webglcontextrestored", () => {
    requestAnimationFrame(() => {
      if (renderer) showScene();
      else initialize();
    });
  });

  window.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse" || reduced.matches) return;
    cursor = {
      x: clamp(2*event.clientX/window.innerWidth-1,-1,1),
      y: clamp(1-2*event.clientY/window.innerHeight,-1,1),
    };
    if (inView) requestDraw();
  }, { passive:true });

  function resetPointer() {
    cursor = null;
    if (inView) requestDraw();
  }

  document.documentElement.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "mouse") resetPointer();
  });
  window.addEventListener("blur", resetPointer);

  reduced.addEventListener("change", () => {
    cursor = null;
    syncPlayback();
  });
  document.addEventListener("visibilitychange", syncPlayback);
  window.addEventListener("pagehide", (event) => {
    stopFrames();
    if (!event.persisted && renderer) renderer.dispose();
  });
  window.addEventListener("pageshow", syncPlayback);
  new ResizeObserver(resize).observe(stage);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      if (!inView) stopFrames();
      else requestDraw();
    }).observe(stage);
  }

  initialize();
})();
