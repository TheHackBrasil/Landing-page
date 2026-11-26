(() => {
  "use strict";

  const T = window.THREE;
  const vertexPreamble = `
    precision highp float;
    uniform mat4 modelMatrix;
    uniform mat4 modelViewMatrix;
    uniform mat4 projectionMatrix;
    in vec3 position;
  `;
  const fragments = `
    precision highp float;
    out vec4 fragColor;
  `;
  const apertureCode = `
    uniform vec4 uFrame;
    uniform vec2 uSlopes;
    uniform vec3 uCardX;
    uniform vec3 uCardY;

    vec2 cardPoint(vec2 pixel) {
      vec2 offset = pixel-uFrame.xy;
      float distance = uFrame.w*3.8;
      vec3 direction = vec3(offset,-distance);
      vec3 normal = cross(uCardX,uCardY);
      float along = -distance*normal.z/min(-0.001,dot(direction,normal));
      vec3 point = vec3(0.0,0.0,distance)+direction*along;
      return vec2(dot(point,uCardX),dot(point,uCardY));
    }

    float apertureDistance(vec2 p) {
      float incline = mix(uSlopes.x,uSlopes.y,smoothstep(-uFrame.w*.60,uFrame.w*.60,p.y));
      p.y -= p.x*incline;
      float top = p.x < 0.0 ? 0.32 : 0.105;
      float bottom = p.x < 0.0 ? 0.145 : 0.34;
      float radius = uFrame.z*(p.y < 0.0 ? bottom : top);
      vec2 edge = abs(p)-uFrame.zw+radius;
      return length(max(edge,0.0))+min(max(edge.x,edge.y),0.0)-radius;
    }

    float lowerLip(vec2 local) {
      float height = local.y/uFrame.w;
      return clamp(-height,0.0,0.84)*max(1.8,uFrame.z*0.026);
    }
  `;
  const solidVertex = vertexPreamble + `
    in vec3 normal;
    in float aSurface;
    out vec3 vLocal;
    flat out vec3 vNormal;
    flat out int vSurface;
    void main() {
      vLocal = position;
      vNormal = normalize(mat3(modelMatrix) * normal);
      vSurface = int(aSurface + 0.5);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;
  const splatVertex = vertexPreamble + `
    uniform vec3 uView;
    in vec3 aCenter;
    in vec3 aNormal;
    in float aSurface;
    in vec2 aRadius;
    in float aSeed;
    out vec2 vCorner;
    flat out vec3 vLocal;
    flat out vec3 vNormal;
    flat out int vSurface;
    flat out float vSeed;
    void main() {
      vec3 n = normalize(aNormal);
      vCorner = position.xy;
      vNormal = normalize(mat3(modelMatrix) * n);
      vLocal = aCenter;
      vSurface = int(aSurface + 0.5);
      vSeed = aSeed;
      vec3 tangent = normalize(cross(n, abs(n.y) > 0.80 ? vec3(1,0,0) : vec3(0,1,0)));
      float a = aSeed * 6.2831853;
      vec3 b = cos(a) * tangent + sin(a) * cross(n,tangent);
      vec3 c = cross(n,b);
      vec3 pointOnSurface = aCenter + n * 0.0022 +
        b * vCorner.x * aRadius.x + c * vCorner.y * aRadius.y;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pointOnSurface, 1);
      if (dot(vNormal, uView) < 0.055) gl_Position = vec4(2, 2, 2, 1);
    }
  `;

  function surfaceFragment(total, splat) {
    return fragments + "precision highp int;\n#define MATERIAL_COUNT " + total + "\n" + apertureCode + `
      uniform vec3 uDark[MATERIAL_COUNT];
      uniform vec3 uLight[MATERIAL_COUNT];
      uniform float uGrain[MATERIAL_COUNT];
      uniform float uFade;
      uniform float uRaised;
      flat in vec3 vNormal;
      flat in int vSurface;
      float hash(vec3 point) {
        vec3 p = fract(point * 0.1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      vec3 surface(vec3 local, float softGrain) {
        vec3 sun = normalize(vec3(-0.65, 0.85, 0.64));
        vec3 fill = normalize(vec3(0.80, 0.62, -0.35));
        int material = vSurface;
        float key = max(0.0, dot(vNormal, sun));
        float rim = max(0.0, dot(vNormal, fill));
        float pores = hash(floor(local * 48.0)) - 0.5;
        float mottling = hash(floor(local * 11.0)) - 0.5;
        float grain = pores * 0.46 + mottling * 0.34 + softGrain;
        float lum = 0.21 + 0.60*key + 0.21*rim + clamp(local.y*0.034,0.0,0.12);
        lum += uGrain[material] * grain;
        lum = floor(clamp(lum,0.07,1.0)*22.0 + 0.5) / 22.0;
        vec3 hue = mix(uDark[material],uLight[material],lum);
        return clamp(hue + key*vec3(0.029,0.022,0.009) + rim*vec3(0.002,0.015,0.028), 0.0, 1.0);
      }
      bool fading() {
        return uFade < 0.999 && uFade < hash(vec3(floor(gl_FragCoord.xy),0.5));
      }
      bool outsideAperture() {
        if (uRaised>0.5) return false;
        vec2 local = cardPoint(gl_FragCoord.xy);
        return apertureDistance(local)+lowerLip(local)>0.0;
      }
    ` + (splat ? `
      in vec2 vCorner;
      flat in vec3 vLocal;
      flat in float vSeed;
      void main() {
        float coverage = exp(-4.45 * dot(vCorner, vCorner));
        if (coverage < 0.115 || fading() || outsideAperture()) discard;
        float alpha = floor(coverage * 6.0 + 0.5) * 0.112;
        fragColor = vec4(surface(vLocal, (vSeed-0.49)*2.25), alpha);
      }
    ` : `
      in vec3 vLocal;
      void main() {
        if (fading() || outsideAperture()) discard;
        fragColor = vec4(surface(vLocal, 0.0), 1);
      }
    `);
  }

  const uvVertex = vertexPreamble + `
    in vec2 uv;
    out vec2 vUV;
    void main() {
      vUV = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1);
    }
  `;

  function raw(vertexShader, fragmentShader, uniforms, options = {}) {
    return new T.RawShaderMaterial({
      glslVersion: T.GLSL3, vertexShader, fragmentShader, uniforms,
      toneMapped: false, ...options,
    });
  }

  function unpack(encoded, stride, positionScale) {
    const str = atob(encoded);
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
    const binary = new DataView(bytes.buffer);
    const values = new Float32Array(str.length / 2);
    for (let i = 0; i < values.length; i++) {
      const value = binary.getInt16(i * 2, true);
      const attribute = i % stride;
      values[i] = value / (attribute < 3 ? positionScale : attribute === 6 ? 1 : 2048);
    }
    return values;
  }

  function splitAttribute(values, stride, offset, count) {
    const channel = new Float32Array(values.length / stride * count);
    for (let start = offset, out = 0; start < values.length; start += stride) {
      for (let component = 0; component < count; component++) channel[out++] = values[start+component];
    }
    return channel;
  }

  function makeVertices(encoded, positionScale) {
    const values = unpack(encoded,7,positionScale);
    const geometry = new T.BufferGeometry();
    for (const [name,start,count] of [["position",0,3],["normal",3,3],["aSurface",6,1]]) {
      geometry.setAttribute(name, new T.BufferAttribute(splitAttribute(values,7,start,count),count));
    }
    return geometry;
  }

  function makeSplats(encoded, positionScale) {
    if (!encoded) return null;
    const values = unpack(encoded,10,positionScale);
    const geometry = new T.InstancedBufferGeometry();
    geometry.setAttribute("position", new T.Float32BufferAttribute([
      -1,-1,0, 1,-1,0, -1,1,0, -1,1,0, 1,-1,0, 1,1,0,
    ],3));
    for (const [name,start,count] of [["aCenter",0,3],["aNormal",3,3],["aSurface",6,1],["aRadius",7,2],["aSeed",9,1]]) {
      geometry.setAttribute(name, new T.InstancedBufferAttribute(splitAttribute(values,10,start,count),count));
    }
    geometry.instanceCount = values.length / 10;
    return geometry;
  }

  function makeApertures() {
    const scene = new T.Scene();
    const foreground = new T.Scene();
    const plane = new T.PlaneGeometry(2,2);
    const pool = new Map();
    const frameUniforms = { uViewport: { value:[1,1] } };
    const paneVertex = `
      precision highp float;
      in vec3 position;
      uniform vec4 uFrame;
      uniform vec2 uViewport;
      uniform vec2 uSlopes;
      void main() {
        vec2 reach = uFrame.zw + vec2(uFrame.z*0.46,uFrame.z*(max(uSlopes.x,uSlopes.y)+0.53));
        vec2 pixel = uFrame.xy + position.xy*reach;
        gl_Position = vec4(pixel/uViewport*2.0-1.0,0.0,1.0);
      }
    `;
    const paneFragment = fragments + apertureCode + `
      uniform float uForeground;
      void main() {
        vec2 p = gl_FragCoord.xy;
        vec2 card = cardPoint(p);
        vec2 local = card/uFrame.zw;
        float d = apertureDistance(card);
        float edge = max(1.0,uFrame.z*0.011);
        if (uForeground>0.5) {
          float slope = mix(uSlopes.x,uSlopes.y,smoothstep(-.60,.60,local.y));
          float altitude = (card.y-card.x*slope)/uFrame.w;
          float reveal = 1.0-smoothstep(-.34,.48,altitude);
          float bevel = max(2.3,uFrame.z*0.037);
          float inside = smoothstep(-bevel-.7,-bevel*.59,d);
          float outside = 1.0-smoothstep(.62,1.55,d);
          float gleam = 1.0-smoothstep(.12,edge+.7,abs(d-.11));
          vec3 lacquer = mix(vec3(.31,.27,.37),vec3(.85,.76,.76),gleam);
          fragColor = vec4(lacquer,inside*outside*reveal*.84);
          return;
        }
        float panel = 1.0-smoothstep(-1.0,1.0,d);
        float line = 1.0-smoothstep(edge,edge+1.0,abs(d));
        vec3 normal = cross(uCardX,uCardY);
        vec2 shadowShift = vec2(0.065,-0.098)+normal.xy*0.19;
        float shadowDistance = apertureDistance(cardPoint(p-uFrame.z*shadowShift));
        float shadowSpan = uFrame.z*0.19;
        float shadow = 0.27*(1.0-smoothstep(0.0,shadowSpan,max(0.0,shadowDistance)));
        float height = clamp(0.50+local.y*0.26,0.0,1.0);
        vec3 glass = mix(vec3(0.36,0.24,0.47),vec3(0.82,0.70,0.88),height);
        glass += 0.095*(1.0-smoothstep(0.13,1.6,length(local-vec2(0.1,0.37))));
        float recede = smoothstep(-edge*5.2,-edge, d)*0.24;
        glass *= 1.0-recede;
        float reflection = dot(normal,vec3(-0.48,0.52,0.71))-0.71;
        vec3 rim = mix(vec3(0.74,0.63,0.67),vec3(0.99,0.89,0.76),clamp(height+local.x*0.13+reflection,0.0,1.0));
        float coverage = max(panel,line);
        vec3 tint = mix(vec3(0.23,0.15,0.28),mix(glass,rim,line),coverage);
        fragColor = vec4(tint, max(shadow,coverage));
      }
    `;

    function update(frames,viewport,view) {
      frameUniforms.uViewport.value = viewport;
      const xScale = viewport[0]*view.unitsPerPixel/(2*view.halfSize[0]);
      const yScale = viewport[1]*view.unitsPerPixel/(2*view.halfSize[1]);
      pool.forEach((pane) => {
        pane.mesh.visible = false;
        if (pane.lip) pane.lip.visible = false;
      });
      const result = new Map();
      for (const frame of frames) {
        let pane = pool.get(frame.name);
        if (!pane) {
          const rect = { value:[0,0,0,0] };
          const slopes = { value:frame.slopes };
          const axisX = { value:[1,0,0] };
          const axisY = { value:[0,1,0] };
          const uniforms = {...frameUniforms,uFrame:rect,uSlopes:slopes,uCardX:axisX,uCardY:axisY};
          const options = {transparent:true,depthTest:false,depthWrite:false};
          const material = raw(paneVertex,paneFragment,{...uniforms,uForeground:{value:0}},options);
          const mesh = new T.Mesh(plane,material);
          mesh.frustumCulled = false;
          scene.add(mesh);
          let lip;
          if (frame.name === "warehouse") {
            lip = new T.Mesh(plane,raw(paneVertex,paneFragment,{...uniforms,uForeground:{value:1}},options));
            lip.frustumCulled = false;
            foreground.add(lip);
          }
          pane = { mesh,lip,rect,axisX,axisY };
          pool.set(frame.name,pane);
        }
        pane.rect.value = [
          viewport[0]*.5 + (frame.x-view.referenceCenter[0])*xScale,
          viewport[1]*.5 + (view.referenceCenter[1]-frame.y)*yScale,
          frame.width*xScale*.5,frame.height*yScale*.5,
        ];
        const [pitch,yaw] = frame.angles;
        const sinPitch = Math.sin(pitch);
        const sinYaw = Math.sin(yaw);
        const cosYaw = Math.cos(yaw);
        pane.axisX.value = [cosYaw,0,-sinYaw];
        pane.axisY.value = [sinYaw*sinPitch,Math.cos(pitch),cosYaw*sinPitch];
        pane.mesh.visible = true;
        if (pane.lip) pane.lip.visible = true;
        result.set(frame.name,{ rect:pane.rect.value,slopes:frame.slopes,axisX:pane.axisX.value,axisY:pane.axisY.value });
      }
      return result;
    }

    function dispose() {
      plane.dispose();
      pool.forEach(({mesh,lip}) => {
        mesh.material.dispose();
        lip?.material.dispose();
      });
    }

    return { scene,foreground,update,dispose };
  }

  function makeHarmonics(scene) {
    const group = new T.Group();
    scene.add(group);
    const clock = { value: 0 };
    const orbitVertex = vertexPreamble + `
      in vec2 uv;
      uniform float uTime;
      uniform float uVoice;
      out vec2 vUV;
      out float vDepth;
      void main() {
        vUV = uv;
        vDepth = position.z;
        float angle = atan((position.y-0.9)*1.35,position.x);
        float drift = sin(angle*3.0-uTime*1.75+uVoice)*0.111;
        float echo = sin(angle*7.0-uTime*2.3-uVoice)*0.067;
        vec3 p = position + vec3(drift*0.60,drift+echo,0.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
      }
    `;
    const energyPass = fragments + `
      in vec2 vUV;
      in float vDepth;
      uniform vec3 uInk;
      uniform float uTime;
      uniform float uVoice;
      uniform float uOpacity;
      void main() {
        float p = vUV.x;
        float phase = p*25.132741-uTime*2.8-uVoice;
        float tone = pow(0.5+0.5*cos(phase),8.0);
        float overtone = 0.29*pow(0.5+0.5*cos(phase*2.0-0.48),6.0);
        float leader = pow(0.5+0.5*cos(p*6.2831853-uTime*1.04+uVoice*.26),22.0);
        float pulse = min(1.0,tone*.72+overtone+leader*.91);
        float reach = mix(0.54,1.0,smoothstep(-22.0,20.0,vDepth));
        vec3 light = mix(uInk,vec3(1.0,0.97,1.0),pulse*.79);
        fragColor = vec4(light,uOpacity*reach*(.53+.47*pulse));
      }
    `;
    const pointGlow = fragments + `
      in vec2 vUV;
      uniform vec3 uInk;
      uniform float uFade;
      void main() {
        vec2 p = vUV*2.0-1.0;
        float distanceToLight = length(p);
        float a = exp(-5.1*distanceToLight*distanceToLight) * (1.0-smoothstep(0.64,1.0,length(p)));
        fragColor = vec4(mix(uInk,vec3(1.0,0.98,1.0),a*0.61),a*uFade);
      }
    `;

    const overlay = { transparent: true, depthTest: true, depthWrite: false };
    const additive = { ...overlay, blending: T.AdditiveBlending };
    const ink = [[.75,.49,.99],[.90,.76,1],[.76,.91,.86],[.97,.79,.96]];
    const curves = [];
    function position(t, line) {
      const angle = t*Math.PI*2;
      const spacing = (line-1.5)*.22;
      const wave = .19*Math.sin(angle*4+line*.63)+.088*Math.sin(angle*9-line);
      const major = (13.16+spacing+wave)*Math.cos(angle);
      const minor = (5.42+spacing+wave)*Math.sin(angle);
      // The lower arc crosses in front, and the upper arc recedes behind the models.
      const depth = 30.8*Math.tanh(Math.sin(angle)*3.2);
      return new T.Vector3(
        major*.916+minor*.401,
        .90+major*.401-minor*.916,
        depth+spacing*2,
      );
    }

    function tube(path, radius, tint, opacity, voice, materialOptions, order) {
      const material = raw(orbitVertex, energyPass, {
        uInk: { value: tint }, uTime: clock, uVoice: { value: voice }, uOpacity: { value: opacity },
      }, materialOptions);
      const mesh = new T.Mesh(new T.TubeGeometry(path,240,radius,6,true), material);
      mesh.renderOrder = order;
      group.add(mesh);
    }

    for (let line = 0; line < 4; line++) {
      const path = new T.CatmullRomCurve3(Array.from({length:128},(_,i) => position(i/128,line)),true);
      curves.push(path);
      tube(path,.093,[.34,.17,.48],.36,line*.79,overlay,16);
      tube(path,.123,ink[line],.23,line*.79,additive,17);
      tube(path,.035,ink[line],.95,line*.79,overlay,18);
    }

    const plane = new T.PlaneGeometry(2,2);
    const sparks = Array.from({length:17}, (_,i) => {
      const material = raw(uvVertex, pointGlow, {
        uInk: { value: ink[i%ink.length] }, uFade: { value: 1 },
      }, additive);
      const mesh = new T.Mesh(plane,material);
      mesh.renderOrder = 20;
      group.add(mesh);
      return {mesh,phase:i/17,rate:.108+(i%4)*.017,voice:i%4,curve:curves[i%4]};
    });

    return {
      update(time, camera, show) {
        group.visible = show;
        if (!show) return;
        group.quaternion.copy(camera.quaternion);
        clock.value = time;
        for (const {mesh,phase,rate,voice,curve} of sparks) {
          const t = (phase+time*rate)%1;
          curve.getPoint(t,mesh.position);
          const angle = Math.atan2((mesh.position.y-.9)*1.35,mesh.position.x);
          const drift = Math.sin(angle*3-time*1.75+voice*.79)*.111;
          const echo = Math.sin(angle*7-time*2.3-voice*.79)*.067;
          mesh.position.x += drift*.60;
          mesh.position.y += drift+echo;
          mesh.scale.setScalar(.14+.062*Math.sin(time*4.8+phase*20));
          mesh.material.uniforms.uFade.value = mesh.position.z > 0 ? .94 : .55;
        }
      },
    };
  }

  function makeSmoke(scene, stackCount) {
    const geometry = new T.PlaneGeometry(2,2);
    const fragment = fragments + `
      in vec2 vUV;
      uniform float uAge;
      uniform float uFade;
      uniform float uSeed;

      float cloud(vec2 p,vec2 center,vec2 width) {
        vec2 offset = (p-center)/width;
        return exp(-dot(offset,offset));
      }

      void main() {
        vec2 p = vUV*2.0-1.0;
        float density = cloud(p,vec2(-0.13,-0.21),vec2(0.54,0.47))*.57
          + cloud(p,vec2(0.22,0.03),vec2(0.43,0.53))*.50
          + cloud(p,vec2(-0.26,0.24),vec2(0.46,0.43))*.47;
        float folds = sin(p.x*21.0+p.y*8.0+uSeed)*sin(p.y*19.0-p.x*6.0+uSeed);
        density *= 1.0+folds*0.15;
        float edge = 1.0-smoothstep(0.7,1.0,max(abs(p.x),abs(p.y)));
        float alpha = smoothstep(.1,.75,density)*edge*uFade;
        vec3 smoke = mix(vec3(.33,.37,.40),vec3(.70,.66,.72),uAge);
        smoke += max(p.y-p.x,0.0)*.075;
        fragColor = vec4(smoke,alpha);
      }
    `;
    const puffsPerStack = 9;
    const stacks = Array.from({length:stackCount},(_,stack) =>
      Array.from({length:puffsPerStack},(_,index) => {
        const seed = index*1.81+stack*.73;
        const material = raw(uvVertex,fragment,{
          uAge:{value:0},uFade:{value:0},uSeed:{value:seed},
        },{transparent:true,depthWrite:false});
        const mesh = new T.Mesh(geometry,material);
        mesh.renderOrder = 12;
        mesh.visible = false;
        scene.add(mesh);
        return {mesh,seed,phase:index/puffsPerStack+stack*.17};
      })
    );
    return {
      update(time,camera,origins) {
        stacks.forEach((puffs,stack) => {
          const origin = origins[stack];
          for (const {mesh,seed,phase} of puffs) {
            mesh.visible = Boolean(origin);
            if (!origin) continue;
            const age = (time/(4.9+stack*.56)+phase)%1;
            const grow = Math.sqrt(age);
            const drift = Math.sin(age*5.1+seed)*age;
            mesh.quaternion.copy(camera.quaternion);
            mesh.position.set(
              origin[0]-age*.91+drift*.28,
              origin[1]+age*3.28,
              origin[2]-age*.43+drift*.23,
            );
            mesh.scale.set(.19+grow*.73,.17+grow*.49,1);
            mesh.material.uniforms.uAge.value = age;
            mesh.material.uniforms.uFade.value = Math.min((age+.026)*12,1,(1-age)*2.4)*.54;
          }
        });
      },
    };
  }

  function create(canvas, data) {
    if (!T || !canvas.getContext("webgl2",{ alpha: true, antialias: true })) return null;
    const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.autoClear = false;
    renderer.setClearColor(0x000000,0);
    renderer.outputColorSpace = T.SRGBColorSpace;
    let shaderError = false;
    renderer.debug.onShaderError = (context, program, vertex, fragment) => {
      shaderError = true;
      console.error("Forseti · Three.js",context.getProgramInfoLog(program),
        context.getShaderInfoLog(vertex),context.getShaderInfoLog(fragment));
    };
    const scene = new T.Scene();
    const orbitScene = new T.Scene();
    const camera = new T.OrthographicCamera(-1,1,1,-1,.1,145);
    const center = new T.Vector3();
    const viewDirection = new T.Vector3();
    const viewRight = new T.Vector3();
    const viewUp = new T.Vector3();
    const worldUp = new T.Vector3(0,1,0);
    const pitchRotation = camera.quaternion.clone();
    const smokePosition = new T.Vector3();
    const modelTilts = new Map();
    const apertures = makeApertures();
    const haze = makeHarmonics(orbitScene);
    const smoke = makeSmoke(scene,data.chimneys.length);
    const palette = {
      uDark: { value: data.palette.flatMap((color) => color.slice(0,3)) },
      uLight: { value: data.palette.flatMap((color) => color.slice(3,6)) },
      uGrain: { value: data.palette.map((color) => color[6]) },
      uView: { value: viewDirection },
    };
    const solidFragment = surfaceFragment(data.palette.length,false);
    const splatFragment = surfaceFragment(data.palette.length,true);
    const positionScale = data.positionScale ?? 2048;
    const geometricAssets = Object.fromEntries(Object.entries(data.models).map(([name,model]) => [name, {
      vertices: makeVertices(model.vertices,positionScale), splats: makeSplats(model.splats,positionScale),
    }]));
    const pieces = Object.fromEntries(Object.keys(geometricAssets).map((name) => [name, []]));
    const shadowPool = [];
    const shadowPlane = new T.PlaneGeometry(2,2);
    const shadowFragment = fragments + apertureCode + `
      in vec2 vUV;
      uniform float uFade;
      void main() {
        if (apertureDistance(cardPoint(gl_FragCoord.xy))>0.0) discard;
        vec2 p = vUV*2.0-1.0;
        float r = dot(p,p);
        float a = exp(-3.48*r)*(1.0-smoothstep(.65,1.0,r))*uFade;
        fragColor = vec4(0.033,0.074,0.067,a);
      }
    `;

    function cutUniforms() {
      return { uFrame:{value:[0,0,1,1]}, uSlopes:{value:[.6,.6]}, uCardX:{value:[1,0,0]},
        uCardY:{value:[0,1,0]}, uRaised:{value:0} };
    }

    function setCut(uniforms, aperture, raised = false) {
      uniforms.uFrame.value = aperture.rect;
      uniforms.uSlopes.value = aperture.slopes;
      uniforms.uCardX.value = aperture.axisX;
      uniforms.uCardY.value = aperture.axisY;
      uniforms.uRaised.value = raised ? 1 : 0;
    }

    function pieceFor(name,index) {
      const pool = pieces[name];
      if (pool[index]) return pool[index];
      const item = geometricAssets[name];
      const group = new T.Group();
      const opacity = { value: 1 };
      const aperture = cutUniforms();
      const uniforms = {...palette,...aperture,uFade:opacity};
      group.add(new T.Mesh(item.vertices,raw(solidVertex,solidFragment,uniforms,{side:T.DoubleSide})));
      if (item.splats) {
        const dots = new T.Mesh(item.splats,raw(splatVertex,splatFragment,uniforms,
          { transparent: true, depthWrite: false, side: T.DoubleSide, forceSinglePass: true }));
        dots.frustumCulled = false;
        dots.renderOrder = 8;
        group.add(dots);
      }
      scene.add(group);
      pool[index] = { group,opacity,aperture };
      return pool[index];
    }

    function shadowFor(index) {
      if (shadowPool[index]) return shadowPool[index];
      const group = new T.Group();
      const opacity = { value: 1 };
      const aperture = cutUniforms();
      const plane = new T.Mesh(shadowPlane,raw(uvVertex,shadowFragment,{...aperture,uFade:opacity},
        { transparent: true, depthWrite: false, side: T.DoubleSide, forceSinglePass: true }));
      plane.rotation.x = -Math.PI/2;
      plane.renderOrder = 6;
      group.add(plane);
      scene.add(group);
      shadowPool[index] = {group,plane,opacity,aperture};
      return shadowPool[index];
    }

    let aspect = 1;
    function resize(width,height) {
      aspect = width / height;
      const resolution = Math.min(window.devicePixelRatio || 1,2, Math.sqrt(4_800_000 / (width*height)));
      renderer.setPixelRatio(resolution);
      renderer.setSize(width,height,false);
    }

    function updateModelTilts(frames,view) {
      viewRight.fromArray(view.right);
      viewUp.fromArray(view.up);
      for (const frame of frames) {
        const [pitch,yaw] = frame.angles;
        let tilt = modelTilts.get(frame.name);
        if (!tilt) {
          tilt = {pivot:new T.Vector3(),rotation:camera.quaternion.clone()};
          modelTilts.set(frame.name,tilt);
        }
        const central = frame.name === "warehouse";
        const highway = frame.name === "highway";
        const gain = central ? .43 : highway ? .31 : .47;
        const depth = central ? -8.8 : highway ? 0 : -3.6;
        const x = (frame.x-view.referenceCenter[0])*view.unitsPerPixel;
        const y = (view.referenceCenter[1]-frame.y)*view.unitsPerPixel;
        tilt.pivot.copy(viewRight).multiplyScalar(x).addScaledVector(viewUp,y)
          .addScaledVector(viewDirection,depth);
        tilt.rotation.setFromAxisAngle(viewUp,yaw*gain)
          .multiply(pitchRotation.setFromAxisAngle(viewRight,pitch*gain));
      }
    }

    function applyTilt(position,tilt) {
      return position.sub(tilt.pivot).applyQuaternion(tilt.rotation).add(tilt.pivot);
    }

    function place(group,item) {
      const tilt = modelTilts.get(item.module);
      applyTilt(group.position.set(item.x,item.y,item.z),tilt);
      group.quaternion.setFromAxisAngle(worldUp,item.yaw).premultiply(tilt.rotation);
    }

    function render(view, frames, objects, shadows, time, overview, chimneys) {
      const [width,height] = view.halfSize;
      camera.left = -width;
      camera.right = width;
      camera.top = height;
      camera.bottom = -height;
      camera.updateProjectionMatrix();
      viewDirection.fromArray(view.front);
      center.fromArray(view.target);
      camera.position.copy(center).addScaledVector(viewDirection,64);
      camera.lookAt(center);
      camera.updateMatrixWorld();
      const aperturesByModule = apertures.update(frames,[canvas.width,canvas.height],view);
      updateModelTilts(frames,view);

      for (const group of Object.values(pieces)) group.forEach((piece) => { piece.group.visible = false; });
      const counts = {};
      for (const item of objects) {
        const index = counts[item.model] || 0;
        const piece = pieceFor(item.model,index);
        counts[item.model] = index+1;
        piece.group.visible = true;
        place(piece.group,item);
        piece.group.scale.setScalar(item.scale ?? 1);
        piece.opacity.value = item.opacity;
        setCut(piece.aperture,aperturesByModule.get(item.module),item.raised);
      }
      shadowPool.forEach((shadow) => { shadow.group.visible = false; });
      shadows.forEach((value,index) => {
        const shadow = shadowFor(index);
        shadow.group.visible = true;
        place(shadow.group,value);
        shadow.plane.scale.set(value.rx,value.rz,1);
        shadow.opacity.value = value.opacity;
        setCut(shadow.aperture,aperturesByModule.get(value.module));
      });
      haze.update(time,camera,overview);
      const factoryTilt = modelTilts.get("factory");
      const mouths = chimneys.map((origin) => applyTilt(smokePosition.fromArray(origin),factoryTilt).toArray());
      smoke.update(time,camera,mouths);
      renderer.clear();
      renderer.render(apertures.scene,camera);
      renderer.render(scene,camera);
      renderer.render(apertures.foreground,camera);
      if (overview) renderer.render(orbitScene,camera);
      if (shaderError) throw new Error("Falha ao compilar material Three.js");
    }

    function dispose() {
      const geometries = new Set();
      const materials = new Set();
      for (const layer of [scene,orbitScene]) {
        layer.traverse((item) => {
          if (item.geometry) geometries.add(item.geometry);
          if (item.material) materials.add(item.material);
        });
      }
      Object.values(geometricAssets).forEach(({vertices,splats}) => {
        geometries.add(vertices);
        if (splats) geometries.add(splats);
      });
      geometries.add(shadowPlane);
      geometries.forEach((item) => item.dispose());
      materials.forEach((item) => item.dispose());
      apertures.dispose();
      renderer.dispose();
    }

    return { resize, render, dispose, get aspect() { return aspect; } };
  }

  window.ForsetiLogistics3D = { create };
})();
