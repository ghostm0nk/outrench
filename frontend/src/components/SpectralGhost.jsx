import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import './SpectralGhost.css';

export default function SpectralGhost({ quote, author, loadingText }) {
  const containerRef = useRef(null);
  const preloaderRef = useRef(null);
  const contentRef = useRef(null);
  const progressBarRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false; // guard against StrictMode double-invoke

    // ─── Preloader ──────────────────────────────────────────────────
    let isComplete = false;
    let loadingSteps = 0;
    const totalSteps = 5;

    function updateProgress(step) {
      loadingSteps = Math.min(step, totalSteps);
      if (progressBarRef.current) {
        progressBarRef.current.style.width = `${(loadingSteps / totalSteps) * 100}%`;
      }
    }

    function completePreloader(canvas) {
      if (isComplete) return;
      isComplete = true;
      updateProgress(totalSteps);
      setTimeout(() => {
        if (preloaderRef.current) preloaderRef.current.classList.add('fade-out');
        if (contentRef.current) contentRef.current.classList.add('fade-in');
        canvas.classList.add('fade-in');
        setTimeout(() => {
          if (preloaderRef.current) preloaderRef.current.style.display = 'none';
        }, 1000);
      }, 1500);
    }

    // ─── Three.js Scene ─────────────────────────────────────────────
    updateProgress(1);

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.z = 20;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: true,
      premultipliedAlpha: false,
      stencil: false,
      depth: true,
      preserveDrawingBuffer: false,
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    updateProgress(2);

    // Post-processing
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      0.3, 1.25, 0.0
    );
    composer.addPass(bloomPass);

    updateProgress(3);

    // Analog Decay Shader
    const analogDecayShader = {
      uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0.0 },
        uResolution: { value: new THREE.Vector2(container.clientWidth, container.clientHeight) },
        uAnalogGrain: { value: 0.4 },
        uAnalogBleeding: { value: 1.0 },
        uAnalogVSync: { value: 1.0 },
        uAnalogScanlines: { value: 1.0 },
        uAnalogVignette: { value: 1.0 },
        uAnalogJitter: { value: 0.4 },
        uAnalogIntensity: { value: 0.6 },
        uLimboMode: { value: 0.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uTime;
        uniform vec2 uResolution;
        uniform float uAnalogGrain;
        uniform float uAnalogBleeding;
        uniform float uAnalogVSync;
        uniform float uAnalogScanlines;
        uniform float uAnalogVignette;
        uniform float uAnalogJitter;
        uniform float uAnalogIntensity;
        uniform float uLimboMode;
        varying vec2 vUv;
        float random(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123); }
        float random(float x) { return fract(sin(x) * 43758.5453123); }
        float gaussian(float z, float u, float o) { return (1.0 / (o * sqrt(2.0 * 3.1415))) * exp(-(((z - u) * (z - u)) / (2.0 * (o * o)))); }
        vec3 grain(vec2 uv, float time, float intensity) {
          float seed = dot(uv, vec2(12.9898, 78.233));
          float noise = fract(sin(seed) * 43758.5453 + time * 2.0);
          noise = gaussian(noise, 0.0, 0.5 * 0.5);
          return vec3(noise) * intensity;
        }
        void main() {
          vec2 uv = vUv;
          float time = uTime * 1.8;
          vec2 jitteredUV = uv;
          if (uAnalogJitter > 0.01) {
            float jitterAmount = (random(vec2(floor(time * 60.0))) - 0.5) * 0.003 * uAnalogJitter * uAnalogIntensity;
            jitteredUV.x += jitterAmount;
            jitteredUV.y += (random(vec2(floor(time * 30.0) + 1.0)) - 0.5) * 0.001 * uAnalogJitter * uAnalogIntensity;
          }
          if (uAnalogVSync > 0.01) {
            float vsyncRoll = sin(time * 2.0 + uv.y * 100.0) * 0.02 * uAnalogVSync * uAnalogIntensity;
            float vsyncChance = step(0.95, random(vec2(floor(time * 4.0))));
            jitteredUV.y += vsyncRoll * vsyncChance;
          }
          vec4 color = texture2D(tDiffuse, jitteredUV);
          if (uAnalogBleeding > 0.01) {
            float bleedAmount = 0.012 * uAnalogBleeding * uAnalogIntensity;
            float offsetPhase = time * 1.5 + uv.y * 20.0;
            vec2 redOffset = vec2(sin(offsetPhase) * bleedAmount, 0.0);
            vec2 blueOffset = vec2(-sin(offsetPhase * 1.1) * bleedAmount * 0.8, 0.0);
            float r = texture2D(tDiffuse, jitteredUV + redOffset).r;
            float g = texture2D(tDiffuse, jitteredUV).g;
            float b = texture2D(tDiffuse, jitteredUV + blueOffset).b;
            color = vec4(r, g, b, color.a);
          }
          if (uAnalogGrain > 0.01) {
            vec3 grainEffect = grain(uv, time, 0.075 * uAnalogGrain * uAnalogIntensity);
            grainEffect *= (1.0 - color.rgb);
            color.rgb += grainEffect;
          }
          if (uAnalogScanlines > 0.01) {
            float scanlineFreq = 600.0 + uAnalogScanlines * 400.0;
            float scanlinePattern = sin(uv.y * scanlineFreq) * 0.5 + 0.5;
            float scanlineIntensity = 0.1 * uAnalogScanlines * uAnalogIntensity;
            color.rgb *= (1.0 - scanlinePattern * scanlineIntensity);
            float horizontalLines = sin(uv.y * scanlineFreq * 0.1) * 0.02 * uAnalogScanlines * uAnalogIntensity;
            color.rgb *= (1.0 - horizontalLines);
          }
          if (uAnalogVignette > 0.01) {
            vec2 vignetteUV = (uv - 0.5) * 2.0;
            float vignette = 1.0 - dot(vignetteUV, vignetteUV) * 0.3 * uAnalogVignette * uAnalogIntensity;
            color.rgb *= vignette;
          }
          if (uLimboMode > 0.5) {
            float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
            color.rgb = vec3(gray);
          }
          gl_FragColor = color;
        }
      `,
    };

    const analogDecayPass = new ShaderPass(analogDecayShader);
    composer.addPass(analogDecayPass);
    composer.addPass(new OutputPass());

    // Params
    const params = {
      bodyColor: 0x0f2027,
      glowColor: 'orange',
      eyeGlowColor: 'green',
      ghostOpacity: 0.88,
      emissiveIntensity: 5.8,
      pulseSpeed: 1.6,
      pulseIntensity: 0.6,
      eyeGlowDecay: 0.95,
      eyeGlowResponse: 0.31,
      rimLightIntensity: 1.8,
      followSpeed: 0.075,
      wobbleAmount: 0.35,
      floatSpeed: 1.6,
      movementThreshold: 0.07,
      particleCount: 250,
      particleDecayRate: 0.005,
      particleColor: 'orange',
      createParticlesOnlyWhenMoving: true,
      particleCreationRate: 5,
      revealRadius: 43,
      fadeStrength: 2.2,
      baseOpacity: 0.35,
      revealOpacity: 0.0,
      fireflyGlowIntensity: 2.6,
      fireflySpeed: 0.04,
    };

    const fluorescentColors = {
      cyan: 0x00ffff, lime: 0x00ff00, magenta: 0xff00ff, yellow: 0xffff00,
      orange: 0xff4500, pink: 0xff1493, purple: 0x9400d3, blue: 0x0080ff,
      green: 0x00ff80, red: 0xff0040, teal: 0x00ffaa, violet: 0x8a2be2,
    };

    // Atmosphere
    const atmosphereMaterial = new THREE.ShaderMaterial({
      uniforms: {
        ghostPosition: { value: new THREE.Vector3(0, 0, 0) },
        revealRadius: { value: params.revealRadius },
        fadeStrength: { value: params.fadeStrength },
        baseOpacity: { value: params.baseOpacity },
        revealOpacity: { value: params.revealOpacity },
        time: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldPosition;
        void main() {
          vUv = uv;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 ghostPosition;
        uniform float revealRadius;
        uniform float fadeStrength;
        uniform float baseOpacity;
        uniform float revealOpacity;
        uniform float time;
        varying vec2 vUv;
        varying vec3 vWorldPosition;
        void main() {
          float dist = distance(vWorldPosition.xy, ghostPosition.xy);
          float dynamicRadius = revealRadius + sin(time * 2.0) * 5.0;
          float reveal = smoothstep(dynamicRadius * 0.2, dynamicRadius, dist);
          reveal = pow(reveal, fadeStrength);
          float opacity = mix(revealOpacity, baseOpacity, reveal);
          gl_FragColor = vec4(0.001, 0.001, 0.002, opacity);
        }
      `,
      transparent: true,
      depthWrite: false,
    });

    const atmosphere = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), atmosphereMaterial);
    atmosphere.position.z = -50;
    atmosphere.renderOrder = -100;
    scene.add(atmosphere);

    scene.add(new THREE.AmbientLight(0x0a0a2e, 0.08));

    // Ghost body
    const ghostGroup = new THREE.Group();
    scene.add(ghostGroup);

    const ghostGeometry = new THREE.SphereGeometry(2, 40, 40);
    const posAttr = ghostGeometry.getAttribute('position');
    const pos = posAttr.array;
    for (let i = 0; i < pos.length; i += 3) {
      if (pos[i + 1] < -0.2) {
        const x = pos[i], z = pos[i + 2];
        pos[i + 1] = -2.0 + Math.sin(x * 5) * 0.35 + Math.cos(z * 4) * 0.25 + Math.sin((x + z) * 3) * 0.15;
      }
    }
    ghostGeometry.computeVertexNormals();

    const ghostMaterial = new THREE.MeshStandardMaterial({
      color: params.bodyColor,
      transparent: true,
      opacity: params.ghostOpacity,
      emissive: fluorescentColors[params.glowColor],
      emissiveIntensity: params.emissiveIntensity,
      roughness: 0.02,
      metalness: 0.0,
      side: THREE.DoubleSide,
      alphaTest: 0.1,
    });

    const ghostBody = new THREE.Mesh(ghostGeometry, ghostMaterial);
    ghostGroup.add(ghostBody);

    const rimLight1 = new THREE.DirectionalLight(0x4a90e2, params.rimLightIntensity);
    rimLight1.position.set(-8, 6, -4);
    scene.add(rimLight1);
    const rimLight2 = new THREE.DirectionalLight(0x50e3c2, params.rimLightIntensity * 0.7);
    rimLight2.position.set(8, -4, -6);
    scene.add(rimLight2);

    updateProgress(4);

    // Eyes
    const eyeGroup = new THREE.Group();
    ghostGroup.add(eyeGroup);

    const socketMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const socketGeo = new THREE.SphereGeometry(0.45, 16, 16);
    const leftSocket = new THREE.Mesh(socketGeo, socketMat);
    leftSocket.position.set(-0.7, 0.6, 1.9);
    leftSocket.scale.set(1.1, 1.0, 0.6);
    eyeGroup.add(leftSocket);
    const rightSocket = new THREE.Mesh(socketGeo, socketMat);
    rightSocket.position.set(0.7, 0.6, 1.9);
    rightSocket.scale.set(1.1, 1.0, 0.6);
    eyeGroup.add(rightSocket);

    const eyeGeo = new THREE.SphereGeometry(0.3, 12, 12);
    const leftEyeMat = new THREE.MeshBasicMaterial({ color: fluorescentColors[params.eyeGlowColor], transparent: true, opacity: 0 });
    const leftEye = new THREE.Mesh(eyeGeo, leftEyeMat);
    leftEye.position.set(-0.7, 0.6, 2.0);
    eyeGroup.add(leftEye);
    const rightEyeMat = new THREE.MeshBasicMaterial({ color: fluorescentColors[params.eyeGlowColor], transparent: true, opacity: 0 });
    const rightEye = new THREE.Mesh(eyeGeo, rightEyeMat);
    rightEye.position.set(0.7, 0.6, 2.0);
    eyeGroup.add(rightEye);

    const outerGlowGeo = new THREE.SphereGeometry(0.525, 12, 12);
    const leftOuterGlowMat = new THREE.MeshBasicMaterial({ color: fluorescentColors[params.eyeGlowColor], transparent: true, opacity: 0, side: THREE.BackSide });
    const leftOuterGlow = new THREE.Mesh(outerGlowGeo, leftOuterGlowMat);
    leftOuterGlow.position.set(-0.7, 0.6, 1.95);
    eyeGroup.add(leftOuterGlow);
    const rightOuterGlowMat = new THREE.MeshBasicMaterial({ color: fluorescentColors[params.eyeGlowColor], transparent: true, opacity: 0, side: THREE.BackSide });
    const rightOuterGlow = new THREE.Mesh(outerGlowGeo, rightOuterGlowMat);
    rightOuterGlow.position.set(0.7, 0.6, 1.95);
    eyeGroup.add(rightOuterGlow);

    // Fireflies
    const fireflies = [];
    const fireflyGroup = new THREE.Group();
    scene.add(fireflyGroup);
    for (let i = 0; i < 20; i++) {
      const ffGeo = new THREE.SphereGeometry(0.02, 2, 2);
      const ffMat = new THREE.MeshBasicMaterial({ color: 0xffff44, transparent: true, opacity: 0.9 });
      const firefly = new THREE.Mesh(ffGeo, ffMat);
      firefly.position.set((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 20);
      const glowMat = new THREE.MeshBasicMaterial({ color: 0xffff88, transparent: true, opacity: 0.4, side: THREE.BackSide });
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), glowMat);
      firefly.add(glow);
      const ffLight = new THREE.PointLight(0xffff44, 0.8, 3, 2);
      firefly.add(ffLight);
      firefly.userData = {
        velocity: new THREE.Vector3((Math.random() - 0.5) * params.fireflySpeed, (Math.random() - 0.5) * params.fireflySpeed, (Math.random() - 0.5) * params.fireflySpeed),
        phase: Math.random() * Math.PI * 2,
        pulseSpeed: 2 + Math.random() * 3,
        glowMaterial: glowMat,
        fireflyMaterial: ffMat,
        light: ffLight,
      };
      fireflyGroup.add(firefly);
      fireflies.push(firefly);
    }

    // Particles
    const particles = [];
    const particleGroup = new THREE.Group();
    scene.add(particleGroup);
    const particlePool = [];
    const particleGeos = [new THREE.SphereGeometry(0.05, 6, 6), new THREE.TetrahedronGeometry(0.04, 0), new THREE.OctahedronGeometry(0.045, 0)];
    const particleBaseMat = new THREE.MeshBasicMaterial({ color: fluorescentColors[params.particleColor], transparent: true, opacity: 0, alphaTest: 0.1 });

    for (let i = 0; i < 100; i++) {
      const p = new THREE.Mesh(particleGeos[Math.floor(Math.random() * particleGeos.length)], particleBaseMat.clone());
      p.visible = false;
      particleGroup.add(p);
      particlePool.push(p);
    }

    function createParticle() {
      let p;
      if (particlePool.length > 0) { p = particlePool.pop(); p.visible = true; }
      else if (particles.length < params.particleCount) {
        p = new THREE.Mesh(particleGeos[Math.floor(Math.random() * particleGeos.length)], particleBaseMat.clone());
        particleGroup.add(p);
      } else return null;
      const pColor = new THREE.Color(fluorescentColors[params.particleColor]);
      pColor.offsetHSL(Math.random() * 0.1 - 0.05, 0, 0);
      p.material.color = pColor;
      p.position.copy(ghostGroup.position);
      p.position.z -= 0.8 + Math.random() * 0.6;
      p.position.x += (Math.random() - 0.5) * 3.5;
      p.position.y += (Math.random() - 0.5) * 3.5 - 0.8;
      const sv = 0.6 + Math.random() * 0.7;
      p.scale.set(sv, sv, sv);
      p.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
      p.userData.life = 1.0;
      p.userData.decay = Math.random() * 0.003 + params.particleDecayRate;
      p.userData.rotationSpeed = { x: (Math.random() - 0.5) * 0.015, y: (Math.random() - 0.5) * 0.015, z: (Math.random() - 0.5) * 0.015 };
      p.userData.velocity = { x: (Math.random() - 0.5) * 0.012, y: (Math.random() - 0.5) * 0.012 - 0.002, z: (Math.random() - 0.5) * 0.012 - 0.006 };
      p.material.opacity = Math.random() * 0.9;
      particles.push(p);
      return p;
    }

    // Mouse tracking
    const mouse = new THREE.Vector2();
    const prevMouse = new THREE.Vector2();
    const mouseSpeed = new THREE.Vector2();
    let lastMouseUpdate = 0;
    let isMouseMoving = false;
    let mouseMovementTimer = null;

    function onMouseMove(e) {
      const now = performance.now();
      if (now - lastMouseUpdate > 16) {
        prevMouse.copy(mouse);
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        mouseSpeed.x = mouse.x - prevMouse.x;
        mouseSpeed.y = mouse.y - prevMouse.y;
        isMouseMoving = true;
        if (mouseMovementTimer) clearTimeout(mouseMovementTimer);
        mouseMovementTimer = setTimeout(() => { isMouseMoving = false; }, 80);
        lastMouseUpdate = now;
      }
    }
    window.addEventListener('mousemove', onMouseMove);

    // Resize handler
    let resizeTimeout;
    function onResize() {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
        composer.setSize(container.clientWidth, container.clientHeight);
        bloomPass.setSize(container.clientWidth, container.clientHeight);
        analogDecayPass.uniforms.uResolution.value.set(container.clientWidth, container.clientHeight);
      }, 250);
    }
    window.addEventListener('resize', onResize);

    // Animation loop
    let animFrameId;
    let time = 0;
    let currentMovement = 0;
    let lastFrameTime = 0;
    let isInitialized = false;
    let frameCount = 0;
    let lastParticleTime = 0;

    function forceInitialRender() {
      if (cancelled) return;
      for (let i = 0; i < 3; i++) composer.render();
      for (let i = 0; i < 10; i++) createParticle();
      composer.render();
      isInitialized = true;
      completePreloader(renderer.domElement);
    }

    updateProgress(5);
    const initTimer = setTimeout(forceInitialRender, 100);

    function animate(timestamp) {
      animFrameId = requestAnimationFrame(animate);
      if (!isInitialized) return;

      const deltaTime = timestamp - lastFrameTime;
      lastFrameTime = timestamp;
      if (deltaTime > 100) return;

      const timeIncrement = (deltaTime / 16.67) * 0.01;
      time += timeIncrement;
      frameCount++;

      atmosphereMaterial.uniforms.time.value = time;
      analogDecayPass.uniforms.uTime.value = time;

      const targetX = mouse.x * 11;
      const targetY = mouse.y * 7;
      const prevPos = ghostGroup.position.clone();

      ghostGroup.position.x += (targetX - ghostGroup.position.x) * params.followSpeed;
      ghostGroup.position.y += (targetY - ghostGroup.position.y) * params.followSpeed;

      atmosphereMaterial.uniforms.ghostPosition.value.copy(ghostGroup.position);

      const movementAmount = prevPos.distanceTo(ghostGroup.position);
      currentMovement = currentMovement * params.eyeGlowDecay + movementAmount * (1 - params.eyeGlowDecay);

      ghostGroup.position.y += Math.sin(time * params.floatSpeed * 1.5) * 0.03 + Math.cos(time * params.floatSpeed * 0.7) * 0.018 + Math.sin(time * params.floatSpeed * 2.3) * 0.008;

      const pulse1 = Math.sin(time * params.pulseSpeed) * params.pulseIntensity;
      const breathe = Math.sin(time * 0.6) * 0.12;
      ghostMaterial.emissiveIntensity = params.emissiveIntensity + pulse1 + breathe;

      // Fireflies
      fireflies.forEach(firefly => {
        const ud = firefly.userData;
        const pulse = Math.sin(time + ud.phase * ud.pulseSpeed) * 0.4 + 0.6;
        ud.glowMaterial.opacity = params.fireflyGlowIntensity * 0.4 * pulse;
        ud.fireflyMaterial.opacity = params.fireflyGlowIntensity * 0.9 * pulse;
        ud.light.intensity = params.fireflyGlowIntensity * 0.8 * pulse;
        ud.velocity.x += (Math.random() - 0.5) * 0.001;
        ud.velocity.y += (Math.random() - 0.5) * 0.001;
        ud.velocity.z += (Math.random() - 0.5) * 0.001;
        ud.velocity.clampLength(0, params.fireflySpeed);
        firefly.position.add(ud.velocity);
        if (Math.abs(firefly.position.x) > 30) ud.velocity.x *= -0.5;
        if (Math.abs(firefly.position.y) > 20) ud.velocity.y *= -0.5;
        if (Math.abs(firefly.position.z) > 15) ud.velocity.z *= -0.5;
      });

      // Ghost tilt
      const mouseDir = new THREE.Vector2(targetX - ghostGroup.position.x, targetY - ghostGroup.position.y).normalize();
      ghostBody.rotation.z = ghostBody.rotation.z * 0.95 + -mouseDir.x * 0.1 * params.wobbleAmount * 0.05;
      ghostBody.rotation.x = ghostBody.rotation.x * 0.95 + mouseDir.y * 0.1 * params.wobbleAmount * 0.05;
      ghostBody.rotation.y = Math.sin(time * 1.4) * 0.05 * params.wobbleAmount;

      const scaleVariation = 1 + Math.sin(time * 2.1) * 0.025 * params.wobbleAmount + pulse1 * 0.015;
      const finalScale = scaleVariation * (1 + Math.sin(time * 0.8) * 0.012);
      ghostBody.scale.set(finalScale, finalScale, finalScale);

      // Eye glow
      const isMoving = currentMovement > params.movementThreshold;
      const targetGlow = isMoving ? 1.0 : 0.0;
      const glowSpeed = isMoving ? params.eyeGlowResponse * 2 : params.eyeGlowResponse;
      const newOpacity = leftEyeMat.opacity + (targetGlow - leftEyeMat.opacity) * glowSpeed;
      leftEyeMat.opacity = newOpacity;
      rightEyeMat.opacity = newOpacity;
      leftOuterGlowMat.opacity = newOpacity * 0.3;
      rightOuterGlowMat.opacity = newOpacity * 0.3;

      // Particles
      const normalizedMouseSpeed = Math.sqrt(mouseSpeed.x ** 2 + mouseSpeed.y ** 2) * 8;
      const shouldCreate = params.createParticlesOnlyWhenMoving ? currentMovement > 0.005 && isMouseMoving : currentMovement > 0.005;
      if (shouldCreate && timestamp - lastParticleTime > 100) {
        const rate = Math.min(params.particleCreationRate, Math.max(1, Math.floor(normalizedMouseSpeed * 3)));
        for (let i = 0; i < rate; i++) createParticle();
        lastParticleTime = timestamp;
      }

      const toUpdate = Math.min(particles.length, 60);
      for (let i = 0; i < toUpdate; i++) {
        const idx = (frameCount + i) % particles.length;
        if (idx < particles.length) {
          const p = particles[idx];
          p.userData.life -= p.userData.decay;
          p.material.opacity = p.userData.life * 0.85;
          p.position.x += p.userData.velocity.x;
          p.position.y += p.userData.velocity.y;
          p.position.z += p.userData.velocity.z;
          p.position.x += Math.cos(time * 1.8 + p.position.y) * 0.0008;
          p.rotation.x += p.userData.rotationSpeed.x;
          p.rotation.y += p.userData.rotationSpeed.y;
          p.rotation.z += p.userData.rotationSpeed.z;
          if (p.userData.life <= 0) {
            p.visible = false;
            p.material.opacity = 0;
            particlePool.push(p);
            particles.splice(idx, 1);
            i--;
          }
        }
      }

      composer.render();
    }

    // Fake initial mouse position to centre ghost
    const fakeEvent = new MouseEvent('mousemove', { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 });
    window.dispatchEvent(fakeEvent);
    animate(0);

    // ─── Cleanup (runs when component unmounts) ──────────────────────
    return () => {
      cancelled = true;
      cancelAnimationFrame(animFrameId);
      clearTimeout(initTimer);
      clearTimeout(resizeTimeout);
      if (mouseMovementTimer) clearTimeout(mouseMovementTimer);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onResize);

      // Dispose Three.js objects
      ghostGeometry.dispose();
      ghostMaterial.dispose();
      atmosphereMaterial.dispose();
      particleGeos.forEach(g => g.dispose());
      particleBaseMat.dispose();
      composer.dispose();
      renderer.dispose();

      // Remove canvas from DOM
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div ref={containerRef} className="spectral-ghost-container">
      {/* Preloader */}
      <div ref={preloaderRef} className="preloader">
        <div className="preloader-content">
          <div className="ghost-loader">
            <svg className="ghost-svg" height="80" viewBox="0 0 512 512" width="80" xmlns="http://www.w3.org/2000/svg">
              <path
                className="ghost-body"
                d="m508.374 432.802s-46.6-39.038-79.495-275.781c-8.833-87.68-82.856-156.139-172.879-156.139-90.015 0-164.046 68.458-172.879 156.138-32.895 236.743-79.495 275.782-79.495 275.782-15.107 25.181 20.733 28.178 38.699 27.94 35.254-.478 35.254 40.294 70.516 40.294 35.254 0 35.254-35.261 70.508-35.261s37.396 45.343 72.65 45.343 37.389-45.343 72.651-45.343c35.254 0 35.254 35.261 70.508 35.261s35.27-40.772 70.524-40.294c17.959.238 53.798-2.76 38.692-27.94z"
                fill="white"
              />
              <circle className="ghost-eye left-eye" cx="208" cy="225" r="22" fill="black" />
              <circle className="ghost-eye right-eye" cx="297" cy="225" r="22" fill="black" />
            </svg>
          </div>
          <div className="loading-text">{loadingText || 'Summoning spirits'}</div>
          <div className="loading-progress">
            <div ref={progressBarRef} className="progress-bar" />
          </div>
        </div>
      </div>

      {/* Main content revealed after load */}
      <div ref={contentRef} className="ghost-content">
        <div className="quote-container">
          <h1 className="quote">
            {quote || <>Veil of Dust<br />Trail of Ash<br />Heart of Ice</>}
          </h1>
          <span className="author">{author || 'Whispers through memory'}</span>
        </div>
      </div>
    </div>
  );
}
