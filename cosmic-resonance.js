(function (global) {
  'use strict';

  var phase = 'ready';
  var deps = {};
  var vortexCtx = null;
  var burstCtx = null;
  var burstParticles = [];
  var isPressed = false;
  var rafId = 0;
  var timeOrigin = performance.now();

  function init(d) {
    deps = d;
    phase = 'ready';
    timeOrigin = performance.now();
    d.phoneScreen.setAttribute('data-cosmic-phase', 'ready');

    resizeCanvases();
    setupPointers();

    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function setReadyImmediate() {
    phase = 'ready';
    deps.phoneScreen.setAttribute('data-cosmic-phase', 'ready');
  }

  function getPhase() {
    return phase;
  }

  function getConvergence() {
    return 0;
  }

  function getSonicBreath(t) {
    return 0.84 + 0.16 * (
      0.55 * Math.sin(t * 2.15) +
      0.3 * Math.sin(t * 3.45 + 1.2) +
      0.15 * Math.sin(t * 5.1 + 0.5)
    );
  }

  function resizeCanvases() {
    if (!deps.heroStage) return;
    var dpr = window.devicePixelRatio || 1;

    var burstCanvas = document.getElementById('burst-canvas');
    if (burstCanvas) {
      var bw = deps.heroStage.clientWidth;
      var bh = deps.heroStage.clientHeight;
      burstCanvas.width = Math.floor(bw * dpr);
      burstCanvas.height = Math.floor(bh * dpr);
      burstCanvas.style.width = bw + 'px';
      burstCanvas.style.height = bh + 'px';
      var bctx = burstCanvas.getContext('2d');
      if (bctx) bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    var vortexCanvas = document.getElementById('vortex-canvas');
    if (vortexCanvas) {
      var vw = vortexCanvas.clientWidth;
      var vh = vortexCanvas.clientHeight;
      vortexCanvas.width = Math.floor(vw * dpr);
      vortexCanvas.height = Math.floor(vh * dpr);
      var vctx = vortexCanvas.getContext('2d');
      if (vctx) vctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    vortexCtx = vortexCanvas ? vortexCanvas.getContext('2d') : null;
    burstCtx = burstCanvas ? burstCanvas.getContext('2d') : null;
  }

  function getDiscCenterInVortex() {
    var vortexCanvas = document.getElementById('vortex-canvas');
    if (!vortexCanvas) return { x: 140, y: 140, w: 280, h: 280 };
    var w = vortexCanvas.clientWidth;
    var h = vortexCanvas.clientHeight;
    return { x: w / 2, y: h / 2, w: w, h: h };
  }

  function drawQuantumVortex(t) {
    if (!vortexCtx || deps.getCurrentView() !== 'playlist') return;

    var box = getDiscCenterInVortex();
    vortexCtx.clearRect(0, 0, box.w, box.h);
  }

  function triggerBurst() {
    if (!deps.morphDiscWrap) return;
    var box = getDiscCenterInVortex();
    var n = 32;
    for (var i = 0; i < n; i++) {
      var angle = (Math.PI * 2 * i) / n + Math.random() * 0.35;
      var speed = 1.2 + Math.random() * 3;
      burstParticles.push({
        x: box.x,
        y: box.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        size: 0.8 + Math.random() * 2,
        hue: Math.random() > 0.45 ? '#17e6c4' : '#c8a8ff'
      });
    }
  }

  function drawBurst() {
    if (!burstCtx || !deps.heroStage) return;
    var w = deps.heroStage.clientWidth;
    var h = deps.heroStage.clientHeight;
    burstCtx.clearRect(0, 0, w, h);

    for (var i = burstParticles.length - 1; i >= 0; i--) {
      var p = burstParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.035;
      p.life -= 0.03;
      if (p.life <= 0) {
        burstParticles.splice(i, 1);
        continue;
      }
      burstCtx.beginPath();
      burstCtx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      burstCtx.fillStyle = p.hue;
      burstCtx.globalAlpha = p.life * 0.8;
      burstCtx.fill();
    }
    burstCtx.globalAlpha = 1;
  }

  function loop(now) {
    var t = (now - timeOrigin) / 1000;
    drawQuantumVortex(t);
    drawBurst();
    rafId = requestAnimationFrame(loop);
  }

  function onPressStart(e) {
    if (phase !== 'ready' || deps.getCurrentView() !== 'playlist') return;
    if (e.target.closest('#progressTrack')) return;
    if (deps.phoneScreen && deps.phoneScreen.classList.contains('is-pulling-player')) return;
    isPressed = true;
    deps.heroStage.classList.add('cosmic--pressed');
  }

  function onPressEnd() {
    if (!isPressed) return;
    isPressed = false;
    deps.heroStage.classList.remove('cosmic--pressed');
    if (phase !== 'ready' || deps.getCurrentView() !== 'playlist') return;
    if (deps.getGestureHadPull && deps.getGestureHadPull()) return;
    if (deps.phoneScreen && deps.phoneScreen.classList.contains('is-pulling-player')) return;
    triggerBurst();
    setTimeout(function () {
      if (deps.onNavigate) deps.onNavigate();
    }, 320);
  }

  function setupPointers() {
    [deps.heroStage, deps.pillWrap].forEach(function (el) {
      if (!el) return;
      el.addEventListener('pointerdown', onPressStart);
      el.addEventListener('pointerup', onPressEnd);
      el.addEventListener('pointercancel', onPressEnd);
      el.addEventListener('pointerleave', function (e) {
        if (isPressed && e.pointerType === 'mouse') onPressEnd();
      });
    });
  }

  global.CosmicResonance = {
    init: init,
    getPhase: getPhase,
    getConvergence: getConvergence,
    getSonicBreath: getSonicBreath,
    setReadyImmediate: setReadyImmediate,
    resize: resizeCanvases,
    triggerBurst: triggerBurst
  };
})(window);
