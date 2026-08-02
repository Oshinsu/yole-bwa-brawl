import { clamp, damp, smoothstep, TAU } from "../core/math.js";

export class WeatherDirector {
  constructor(rng) {
    this.rng = rng;
    this.stormAmount = 0;
    this.targetStorm = 0;
    this.lightning = 0;
    this.nextLightning = rng.range(4, 9);
    this.windAngle = 0.22;
    this.windSpeed = 8.5;
    this.rainAmount = 0;
  }

  reset() {
    this.stormAmount = 0;
    this.targetStorm = 0;
    this.lightning = 0;
    this.nextLightning = this.rng.range(4, 9);
    this.windAngle = 0.22;
    this.windSpeed = 8.5;
    this.rainAmount = 0;
  }

  update(dt, stormGap, roundProgress) {
    // ⚠️ FENÊTRE ÉLARGIE AVEC LE RECUL DU GRAIN. À 18→95 m, un écart de départ
    // porté à 118 m tombait hors fenêtre : `proximity` valait 0, `stormAmount`
    // se réduisait au seul `drama` plafonné à 0,18, et il n'y avait plus ni
    // pluie (seuil 0,28) ni éclairs (0,35) ni houle de tempête. La tempête
    // disparaissait purement et simplement.
    const proximity = 1 - smoothstep(24, 128, stormGap);
    const drama = clamp(roundProgress * 0.18, 0, 0.18);
    this.targetStorm = clamp(proximity + drama, 0, 1);
    this.stormAmount = damp(this.stormAmount, this.targetStorm, 1.35, dt);
    this.rainAmount = smoothstep(0.28, 0.82, this.stormAmount);
    this.windAngle = 0.22 + Math.sin(roundProgress * 0.17) * 0.08 + this.stormAmount * 0.48;
    this.windSpeed = 8.5 + this.stormAmount * 7.5;

    this.nextLightning -= dt * (0.7 + this.stormAmount * 2.2);
    if (this.nextLightning <= 0 && this.stormAmount > 0.35) {
      this.lightning = this.rng.range(0.7, 1.25);
      this.nextLightning = this.rng.range(3.5, 8.0);
    }
    this.lightning = Math.max(0, this.lightning - dt * 4.8);
  }

  windVector(out = { x: 0, z: 0 }) {
    out.x = Math.sin(this.windAngle) * this.windSpeed;
    out.z = Math.cos(this.windAngle) * this.windSpeed;
    return out;
  }
}

export class AtmosphereSystem {
  constructor(THREE, scene, weatherRng, visualRng = weatherRng) {
    this.THREE = THREE;
    this.scene = scene;
    // Gameplay weather and purely visual lightning never share RNG state.
    this.weatherRng = weatherRng;
    this.rng = visualRng;
    this.weather = new WeatherDirector(weatherRng);
    this.graphicStyle = false;

    this.uniforms = {
      uTime: { value: 0 },
      uStorm: { value: 0 },
      uLightning: { value: 0 },
      uSunDir: { value: new THREE.Vector3(-0.28, 0.68, -0.24).normalize() },
      uTop: { value: new THREE.Color(0x079bd1) },
      uHorizon: { value: new THREE.Color(0xd1f3f7) },
      // Ocre de panache saharien, plus le violet nocturne d'un grain.
      uStormColor: { value: new THREE.Color(0x6d5230) },
      uClouds: { value: null },
      uHasClouds: { value: 0 },
      uGraphicStyle: { value: 0 }
    };

    const skyGeometry = new THREE.SphereGeometry(1450, 44, 26);
    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: this.uniforms,
      vertexShader: `
        varying vec3 vDirection;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vDirection = normalize(world.xyz - cameraPosition);
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform float uTime;
        uniform float uStorm;
        uniform float uLightning;
        uniform vec3 uSunDir;
        uniform vec3 uTop;
        uniform vec3 uHorizon;
        uniform vec3 uStormColor;
        uniform sampler2D uClouds;
        uniform float uHasClouds;
        uniform float uGraphicStyle;
        varying vec3 vDirection;

        float hash31(vec3 p) {
          p = fract(p * 0.1031);
          p += dot(p, p.yzx + 33.33);
          return fract((p.x + p.y) * p.z);
        }

        float noise3(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float n000 = hash31(i + vec3(0,0,0));
          float n100 = hash31(i + vec3(1,0,0));
          float n010 = hash31(i + vec3(0,1,0));
          float n110 = hash31(i + vec3(1,1,0));
          float n001 = hash31(i + vec3(0,0,1));
          float n101 = hash31(i + vec3(1,0,1));
          float n011 = hash31(i + vec3(0,1,1));
          float n111 = hash31(i + vec3(1,1,1));
          return mix(mix(mix(n000,n100,f.x),mix(n010,n110,f.x),f.y),
                     mix(mix(n001,n101,f.x),mix(n011,n111,f.x),f.y),f.z);
        }

        float fbm(vec3 p) {
          float value = 0.0;
          float amplitude = 0.55;
          for (int i = 0; i < 4; i++) {
            value += noise3(p) * amplitude;
            p = p * 2.03 + 13.7;
            amplitude *= 0.48;
          }
          return value;
        }

        void main() {
          vec3 dir = normalize(vDirection);
          float skyMix = smoothstep(-0.04, 0.78, dir.y);
          if (uGraphicStyle > 0.5) {
            // La caméra de course regarde légèrement vers le bas : son ciel
            // visible ne monte qu'à environ dir.y=0.30. L'ancien étalonnage
            // attendait 0.78 pour atteindre le bleu et laissait donc presque
            // tout l'écran dans la bande d'horizon ivoire.
            skyMix = smoothstep(-0.015, 0.31, dir.y);
            float skyBand = floor(clamp(skyMix, 0.0, 0.999) * 7.0) / 6.0;
            skyMix = mix(skyMix, skyBand, 0.08);
          }
          // Keep the palette hue, but expose the near-white horizon below the
          // post-process shoulder so it does not turn into a yellow-white panel.
          vec3 exposedHorizon = mix(
            uHorizon * 0.84,
            vec3(0.19, 0.74, 1.0),
            step(0.5, uGraphicStyle)
          );
          vec3 clearTop = mix(
            uTop,
            vec3(0.035, 0.43, 0.96),
            step(0.5, uGraphicStyle)
          );
          vec3 color = mix(exposedHorizon, clearTop, skyMix);
          float horizonVeil = 1.0 - smoothstep(0.015, 0.19, abs(dir.y));
          color = mix(color, exposedHorizon, horizonVeil * mix(0.30, 0.12, uGraphicStyle));

          // A compact solar disc and a restrained warm halo. The former pow(155)
          // lobe covered several degrees and blew out half of the horizon.
          float sunDot = max(dot(dir, uSunDir), 0.0);
          float sunCore = smoothstep(0.99978, 0.99997, sunDot);
          float sunHalo = pow(sunDot, 180.0);
          float sunAureole = pow(sunDot, 28.0);
          float regularStyle = 1.0 - step(0.5, uGraphicStyle);
          color += vec3(1.0, 0.57, 0.20) * sunAureole * 0.025 * regularStyle * (1.0 - uStorm * 0.78);
          color += vec3(1.0, 0.73, 0.34) * sunHalo * 0.18 * regularStyle * (1.0 - uStorm * 0.82);
          color += vec3(1.0, 0.92, 0.62) * sunCore * 1.35 * regularStyle * (1.0 - uStorm * 0.88);

          // En Gravure Alizé, le soleil devient un vrai élément de composition :
          // disque lisible, bord jaune et halo court. Il reste rond et lumineux,
          // sans anneau géant postérisé autour de lui.
          float graphicStyle = step(0.5, uGraphicStyle);
          float graphicSunDisc = smoothstep(0.99925, 0.99972, sunDot);
          float graphicSunRim = smoothstep(0.99855, 0.99925, sunDot) * (1.0 - graphicSunDisc);
          color += vec3(1.0, 0.76, 0.14) * graphicSunRim * 0.42 * graphicStyle * (1.0 - uStorm * 0.86);
          color = mix(
            color,
            vec3(1.0, 0.96, 0.72),
            graphicSunDisc * graphicStyle * (1.0 - uStorm * 0.92)
          );

          vec3 cloudP = dir * vec3(4.2, 2.0, 4.2);
          cloudP.xz += vec2(uTime * 0.025, -uTime * 0.018);
          // Textured cumulus costs two samples; fbm remains only as a missing
          // asset fallback. Coverage thickens into a real mass during the Grain.
          float cloud;
          if (uHasClouds > 0.5) {
            // La texture place ses cumulus entre V=0.43 et V=0.82. L'ancien
            // dir.y * 1.28 lisait le grand aplat noir pour toute la portion de
            // ciel réellement cadrée pendant la course.
            float cloudV = mix(
              clamp(dir.y * 1.28, 0.0, 1.0),
              clamp(0.49 + dir.y * 0.92, 0.0, 1.0),
              step(0.5, uGraphicStyle)
            );
            vec2 cloudUv = vec2(atan(dir.z, dir.x) * 0.15915494 + uTime * 0.0045, cloudV);
            // Integer angular repeat keeps atan's +/-pi wrap continuous.
            vec2 cloudUv2 = vec2(cloudUv.x * 2.0 - uTime * 0.0026 + 0.37, cloudUv.y * 0.86 + 0.06);
            cloud = max(texture2D(uClouds, cloudUv).r, texture2D(uClouds, cloudUv2).r * 0.72);
            if (uGraphicStyle > 0.5) {
              // Un troisième échantillon décalé évite qu'un cap de caméra tombe
              // dans un des rares grands trous noirs du panorama de cumulus.
              vec2 cloudUv3 = vec2(cloudUv.x * 1.43 + 0.68, cloudUv.y * 0.91 + 0.025);
              cloud = max(cloud, texture2D(uClouds, cloudUv3).r * 0.84);
            }
          } else {
            cloud = fbm(cloudP);
          }
          float cloudBand = smoothstep(0.015, 0.17, dir.y) * (1.0 - smoothstep(0.70, 0.94, dir.y));
          float coverage = mix(0.68, 0.31, uStorm);
          float density = smoothstep(coverage, coverage + 0.15, cloud) * cloudBand;
          if (uGraphicStyle > 0.5 && uStorm < 0.35) {
            density = smoothstep(0.38, 0.64, cloud)
              * smoothstep(0.005, 0.095, dir.y)
              * (1.0 - smoothstep(0.40, 0.62, dir.y));
          }
          // Les nuages se chargent de sable au lieu de virer à la nuit.
          vec3 cloudColor = mix(vec3(1.0, 0.91, 0.72), vec3(0.46, 0.34, 0.19), uStorm);
          cloudColor = mix(
            cloudColor,
            mix(
              mix(vec3(0.72, 0.88, 0.95), vec3(1.0, 0.995, 0.97), smoothstep(0.54, 0.90, cloud)),
              vec3(0.52, 0.57, 0.60),
              uStorm
            ),
            step(0.5, uGraphicStyle)
          );
          float cloudOpacity = mix(mix(0.48, 0.94, uStorm), mix(0.88, 0.96, uStorm), uGraphicStyle);
          color = mix(color, cloudColor, density * cloudOpacity);
          color += vec3(1.0, 0.62, 0.25) * pow(sunDot, 60.0) * density * 0.08 * (1.0 - uStorm);
          float stormVeil = clamp(uStorm * (0.46 + density * 0.50), 0.0, 0.96);
          color = mix(color, uStormColor, stormVeil);
          color += vec3(0.72, 0.82, 1.0) * uLightning;

          // Sub-LSB interleaved dither prevents visible rings in the long,
          // low-contrast horizon gradient without another texture lookup.
          float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5;
          color += dither / 255.0;
          gl_FragColor = vec4(color, 1.0);
        }
      `
    });
    // Source unique de la couleur d'horizon : le ciel la calcule, le brouillard
    // et la perspective aérienne de l'océan la consomment. Sans ça les trois
    // divergeaient (fog teal sombre, horizon ciel blanc, haze océan cyan) et le
    // lointain se découpait en silhouettes noires devant un ciel clair.
    this.horizonColor = new THREE.Color(0xd1f3f7);
    this.clearHorizon = new THREE.Color(0xd1f3f7);

    this.sky = new THREE.Mesh(skyGeometry, skyMaterial);
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    this.backdrop = null;
    this.nearBackdrop = null;

    this.stormWall = this.createStormWall();
    scene.add(this.stormWall.group);
    this.rain = this.createRain();
    scene.add(this.rain.points);
    this.lightningBolt = this.createLightningBolt();
    scene.add(this.lightningBolt.line);
    this.previousLightning = 0;
  }

  createStormWall() {
    const THREE = this.THREE;
    const group = new THREE.Group();
    const geometry = new THREE.PlaneGeometry(380, 90, 36, 12);
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0.74 },
        uLightning: { value: 0 }
      },
      vertexShader: `
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec3 p = position;
          p.x += sin(uv.y * 17.0 + uTime * 1.6) * 3.2;
          p.y += sin(uv.x * 26.0 + uTime * 2.2) * 1.6;
          p.z += sin(uv.x * 13.0 + uv.y * 9.0 + uTime) * 2.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform float uTime;
        uniform float uOpacity;
        uniform float uLightning;
        varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
        }
        void main() {
          vec2 drift = vec2(uTime * 0.12, -uTime * 0.18);
          float broad = noise(vUv * vec2(7.0, 3.0) + drift);
          float billow = 0.5 + 0.5 * sin(vUv.x * 47.0 + sin(vUv.y * 19.0 - uTime) * 2.2 - uTime * 1.7);
          float mass = broad * 0.68 + billow * 0.32;
          float edge = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.62, vUv.y);
          float curtain = 0.68 + mass * 0.32;
          // ⚠️ BRUME DE SABLE, plus un grain d'orage. La palette passe du
          // violet nocturne (0.025,0.018,0.065 -> 0.20,0.075,0.27) à l'ocre
          // saharien. C'est le phénomène réel : les panaches de poussière du
          // Sahara traversent l'Atlantique et voilent les Antilles en juin-août.
          vec3 color = mix(vec3(0.16, 0.115, 0.062), vec3(0.62, 0.43, 0.22), mass);
          // Le flash n'est plus un éclair bleu mais une SURCHAUFFE du sable :
          // le soleil qui perce le panache, blanc-doré.
          color += vec3(1.0, 0.86, 0.58) * uLightning;
          gl_FragColor = vec4(color, uOpacity * edge * curtain);
        }
      `
    });
    const wall = new THREE.Mesh(geometry, material);
    wall.position.y = 33;
    wall.rotation.y = Math.PI;
    group.add(wall);
    return { group, wall, material };
  }


  createLightningBolt() {
    const THREE = this.THREE;
    const pointCount = 18;
    const positions = new Float32Array(pointCount * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color: 0xdff6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;
    line.visible = false;
    return { line, geometry, material, positions, pointCount, life: 0 };
  }

  strikeLightning(focus, stormZ, strength) {
    const bolt = this.lightningBolt;
    const baseX = focus.x + this.rng.range(-55, 55);
    const baseZ = Math.max(stormZ + 4, focus.z - this.rng.range(22, 78));
    let x = baseX;
    for (let index = 0; index < bolt.pointCount; index++) {
      const t = index / (bolt.pointCount - 1);
      if (index > 0) x += this.rng.signed() * (1.8 + t * 1.5);
      bolt.positions[index * 3] = x;
      bolt.positions[index * 3 + 1] = 62 * (1 - t) + 2.0;
      bolt.positions[index * 3 + 2] = baseZ + this.rng.signed() * 1.4;
    }
    bolt.geometry.attributes.position.needsUpdate = true;
    bolt.material.opacity = clamp(strength, 0.35, 1);
    bolt.line.visible = true;
    bolt.life = 0.16;
  }

  createRain() {
    const THREE = this.THREE;
    const count = 900;
    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    for (let index = 0; index < count; index++) {
      positions[index * 3] = this.rng.range(-75, 75);
      positions[index * 3 + 1] = this.rng.range(0, 48);
      positions[index * 3 + 2] = this.rng.range(-50, 95);
      phases[index] = this.rng.next();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uAmount: { value: 0 }
      },
      vertexShader: `
        uniform float uTime;
        uniform float uAmount;
        attribute float aPhase;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          p.y = mod(p.y - uTime * mix(24.0, 46.0, uAmount) - aPhase * 42.0, 48.0);
          p.x += p.y * 0.18 * uAmount;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = mix(1.0, 2.7, uAmount) * (210.0 / max(1.0, -mv.z));
          vAlpha = uAmount;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float line = smoothstep(0.48, 0.0, abs(p.x) * 5.0 + abs(p.y) * 0.35);
          // ⚠️ CE N'EST PLUS DE LA PLUIE. Le bleu glacé (0.72,0.90,1.0) lisait
          // comme des gouttes ; une brume de sable transporte de la poussière.
          // Ocre clair, et moins opaque : du sable en suspension se voit en
          // masse, pas en traits nets.
          gl_FragColor = vec4(0.93,0.80,0.58,line * vAlpha * 0.52);
        }
      `
    });
    return { points: new THREE.Points(geometry, material), material };
  }

  fixedUpdate(dt, stormGap, roundProgress) {
    this.weather.update(dt, stormGap, roundProgress);
    return this.weather;
  }

  // Relief de fond. Bande cylindrique à grand rayon, ouverte vers l'intérieur.
  setBackdrop(texture) {
    if (!texture || this.backdrop) return;
    const THREE = this.THREE;
    // ⚠️ 1180 -> 2600. Le fond doit rester la chose la PLUS LOINTAINE : la mer
    // s'étend désormais à 2100 m (voir ocean.js), et un horizon peint planté à
    // 1180 m se serait retrouvé À L'INTÉRIEUR du disque d'eau — la bande de
    // montagnes aurait coupé la mer au lieu de la fermer.
    //
    // La hauteur est dérivée du rayon (`radius * 0.20`), donc la bande garde
    // exactement la même taille apparente : on l'éloigne sans la rapetisser.
    const radius = 2600;
    // The source is 5.33:1, while a full cylinder at this height would display
    // at more than 25:1 and stretch every mountain into a horizontal ribbon.
    // Six mirrored repeats restore its intended proportions and make every tile
    // boundary continuous. Rotate the geometry seam away from the +Z race view.
    texture.wrapS = THREE.MirroredRepeatWrapping ?? THREE.RepeatWrapping;
    texture.repeat?.set(6, 1);
    texture.needsUpdate = true;
    const height = radius * (this.graphicStyle ? 0.285 : 0.20);
    const geometry = new THREE.CylinderGeometry(radius, radius, height, 64, 1, true);
    const backdropOpacity = this.graphicStyle ? 0.96 : 0.25;
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: backdropOpacity,
      alphaTest: 0.025,
      depthWrite: false,
      side: THREE.BackSide,
      fog: false
    });
    material.clearOpacity = backdropOpacity;
    this.backdrop = new THREE.Mesh(geometry, material);
    // Le pied de la bande affleure l'horizon : la mer doit le recouvrir.
    this.backdrop.position.y = height * (this.graphicStyle ? 0.035 : 0.12);
    this.backdrop.rotation.y = Math.PI;
    this.backdrop.renderOrder = -8;
    this.backdrop.frustumCulled = false;
    this.scene.add(this.backdrop);
  }

  // Bande de cote PROCHE, posee en cylindre plus serre que la chaine lointaine :
  // c'est la parallaxe entre les deux qui donne la profondeur. Sans elle, le
  // relief lointain flottait seul au-dessus d'une mer vide.
  //
  // Elle suit le joueur en X/Z comme la bande lointaine — un decor de bord de
  // monde, pas un objet a doubler.
  setNearBackdrop(texture) {
    if (!texture || this.nearBackdrop) return;
    const THREE = this.THREE;
    const radius = 620;
    texture.wrapS = THREE.MirroredRepeatWrapping ?? THREE.RepeatWrapping;
    texture.repeat?.set(4, 1);
    texture.needsUpdate = true;
    const height = radius * 0.27;
    const geometry = new THREE.CylinderGeometry(radius, radius, height, 48, 1, true);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.52,
      // alphaTest : la bande est detouree, et 72 % de son quad est vide. Sans
      // lui ces texels sont tries et rasterises pour rien, devant la mer.
      alphaTest: 0.08,
      depthWrite: false,
      side: THREE.BackSide,
      fog: false
    });
    material.clearOpacity = 0.52;
    this.nearBackdrop = new THREE.Mesh(geometry, material);
    // Le pied doit passer SOUS l'horizon pour que la mer le recouvre, sinon on
    // voit la coupure nette du bas de la texture.
    this.nearBackdrop.position.y = height * 0.11;
    this.nearBackdrop.rotation.y = Math.PI;
    this.nearBackdrop.renderOrder = -7;
    this.nearBackdrop.frustumCulled = false;
    this.scene.add(this.nearBackdrop);
  }

  setClouds(texture) {
    if (!texture) return;
    texture.wrapS = this.THREE.RepeatWrapping;
    texture.wrapT = this.THREE.ClampToEdgeWrapping;
    this.uniforms.uClouds.value = texture;
    this.uniforms.uHasClouds.value = 1;
  }

  setGraphicStyle(enabled) {
    this.graphicStyle = Boolean(enabled);
    this.uniforms.uGraphicStyle.value = this.graphicStyle ? 1 : 0;
    if (this.backdrop?.material) {
      const opacity = this.graphicStyle ? 0.96 : 0.25;
      this.backdrop.material.clearOpacity = opacity;
      this.backdrop.material.opacity = opacity;
    }
    if (this.nearBackdrop) this.nearBackdrop.visible = !this.graphicStyle;
  }

  resetRng(weatherRng, visualRng = weatherRng) {
    this.weatherRng = weatherRng;
    this.rng = visualRng;
    this.weather.rng = weatherRng;
    this.weather.reset();
    this.previousLightning = 0;
    this.lightningBolt.life = 0;
    this.lightningBolt.line.visible = false;
  }

  update(dt, time, focus, stormZ) {
    const storm = this.weather.stormAmount;
    this.uniforms.uTime.value = time;
    this.uniforms.uStorm.value = storm;
    this.uniforms.uLightning.value = this.weather.lightning;
    this.sky.position.copy(focus);
    if (this.backdrop) {
      this.backdrop.position.x = focus.x;
      this.backdrop.position.z = focus.z;
      this.backdrop.material.opacity = this.backdrop.material.clearOpacity * (1 - storm * 0.78);
    }
    if (this.nearBackdrop) {
      this.nearBackdrop.position.x = focus.x;
      this.nearBackdrop.position.z = focus.z;
      this.nearBackdrop.material.opacity = this.nearBackdrop.material.clearOpacity * (1 - storm * 0.68);
    }

    this.stormWall.group.position.set(focus.x, 0, stormZ);
    this.stormWall.material.uniforms.uTime.value = time;
    this.stormWall.material.uniforms.uLightning.value = this.weather.lightning;
    this.stormWall.group.visible = stormZ > -500;

    this.rain.points.position.set(focus.x, focus.y, focus.z);
    this.rain.material.uniforms.uTime.value = time;
    this.rain.material.uniforms.uAmount.value = this.weather.rainAmount;
    this.rain.points.visible = this.weather.rainAmount > 0.03;

    if (this.weather.lightning > 0.56 && this.previousLightning <= 0.56) {
      this.strikeLightning(focus, stormZ, this.weather.lightning);
    }
    // Même formule que le shader de ciel (ligne `mix(color, uStormColor, ...)`)
    // pour que le raccord au ras de l'horizon soit invisible.
    this.horizonColor.copy(this.clearHorizon)
      .multiplyScalar(0.84)
      .lerp(this.uniforms.uStormColor.value, clamp(storm * 0.46, 0, 1));
    this.horizonColor.r += this.weather.lightning * 0.72;
    this.horizonColor.g += this.weather.lightning * 0.82;
    this.horizonColor.b += this.weather.lightning;
    this.previousLightning = this.weather.lightning;
    if (this.lightningBolt.life > 0) {
      this.lightningBolt.life -= dt;
      this.lightningBolt.material.opacity = clamp(this.lightningBolt.life * 7.5, 0, 1);
      this.lightningBolt.line.visible = true;
    } else this.lightningBolt.line.visible = false;
    return this.weather;
  }
}
