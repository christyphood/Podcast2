(function () {
  'use strict';

  var phoneScreen = document.getElementById('phoneScreen');
  var heroStage = document.getElementById('heroStage');
  var viewPlaylist = document.getElementById('viewPlaylist');
  var viewPlayer = document.getElementById('viewPlayer');
  var navBack = document.getElementById('navBack');
  var discSpacer = document.getElementById('discSpacer');
  var pillWrap = document.getElementById('pillWrap');
  var morphDiscWrap = document.getElementById('morphDiscWrap');
  var audio = document.getElementById('audio');
  var playBtn = document.getElementById('playBtn');
  var disc = document.getElementById('disc');
  var progressTrack = document.getElementById('progressTrack');
  var progressFill = document.getElementById('progressFill');
  var progressHandle = document.getElementById('progressHandle');
  var timeCurrent = document.getElementById('timeCurrent');
  var timeTotal = document.getElementById('timeTotal');
  var lyricsList = document.getElementById('lyricsList');
  var lyricLines = lyricsList ? lyricsList.querySelectorAll('.player__lyrics-line') : [];
  var lastActiveLyric = -1;

  var currentView = 'playlist';
  var isDragging = false;
  var isNavigating = false;
  var PULL_START_PX = 8;
  var PULL_COMMIT_RATIO = 0.28;
  var gestureHadPull = false;
  var starsRenderer = null;
  var starsResizeObserver = null;

  function alignDiscToSpacer() {
    if (!discSpacer || !heroStage) return;
    var spacerRect = discSpacer.getBoundingClientRect();
    var stageRect = heroStage.getBoundingClientRect();
    var centerY = spacerRect.top + spacerRect.height / 2 - stageRect.top;
    heroStage.style.setProperty('--disc-y-player', centerY + 'px');
  }

  function alignDiscToPlaylist() {
    if (!heroStage) return;
    heroStage.style.setProperty('--disc-y', '52%');
  }

  function resetLyricsHighlight() {
    lastActiveLyric = -1;
    for (var i = 0; i < lyricLines.length; i++) {
      lyricLines[i].classList.remove('is-active', 'is-passed');
    }
  }

  function syncLyrics(currentTime) {
    if (!lyricLines.length) return;
    var activeIdx = -1;
    for (var i = lyricLines.length - 1; i >= 0; i--) {
      var cue = parseFloat(lyricLines[i].getAttribute('data-t'));
      if (!Number.isFinite(cue)) continue;
      if (currentTime >= cue) {
        activeIdx = i;
        break;
      }
    }
    if (activeIdx === lastActiveLyric) return;
    lastActiveLyric = activeIdx;
    for (var j = 0; j < lyricLines.length; j++) {
      lyricLines[j].classList.toggle('is-active', j === activeIdx);
      lyricLines[j].classList.toggle('is-passed', activeIdx >= 0 && j < activeIdx);
    }
  }

  function startPlaybackFromBeginning() {
    audio.currentTime = 0;
    resetLyricsHighlight();
    updateProgress();
    audio.play().then(function () {
      setPlayingUI(true);
      phoneScreen.classList.add('is-playing');
    }).catch(function () { /* autoplay blocked */ });
  }

  function pausePlayback() {
    if (audio.paused) return;
    audio.pause();
    setPlayingUI(false);
    phoneScreen.classList.remove('is-playing');
  }

  function clearPullGestureStyles() {
    phoneScreen.classList.remove('is-pulling-player', 'pull-armed', 'player-entry-pull');
    phoneScreen.style.removeProperty('--player-pull');
    phoneScreen.style.removeProperty('--player-pull-dim');
    viewPlayer.style.removeProperty('transform');
    viewPlayer.style.removeProperty('transition');
  }

  function syncPlayBtnLabel() {
    if (!playBtn) return;
    playBtn.setAttribute('aria-label', currentView === 'player' ? '播放' : '下拉打开播放器');
  }

  function goToPlayer(opts) {
    if (currentView !== 'playlist' || isNavigating) return;
    opts = opts || {};
    var fromPull = !!opts.fromPull;
    var pullOffset = fromPull ? (phoneScreen.style.getPropertyValue('--player-pull') || '0px') : null;
    isNavigating = true;
    clearPullGestureStyles();
    if (starsRenderer) starsRenderer.mode = 'player';
    resetStarsToBase();
    currentView = 'player';
    syncPlayBtnLabel();
    heroStage.classList.add('hero-stage--expanding');
    heroStage.classList.remove('cosmic--pressed');
    phoneScreen.className = 'phone-screen state-player';
    phoneScreen.setAttribute('data-cosmic-phase', 'ready');
    viewPlayer.classList.add('active');
    viewPlaylist.classList.add('exit-to-player');

    if (fromPull && pullOffset) {
      viewPlayer.style.transform = 'translateY(calc(-100% + ' + pullOffset + '))';
      viewPlayer.style.transition = 'none';
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          viewPlayer.style.transition = 'transform 0.48s cubic-bezier(0.16, 1, 0.3, 1)';
          viewPlayer.style.transform = 'translateY(0)';
        });
      });
    }

    requestAnimationFrame(function () {
      requestAnimationFrame(alignDiscToSpacer);
    });

    var navDelay = fromPull ? 520 : 500;
    setTimeout(function () {
      viewPlaylist.classList.remove('active', 'exit-to-player');
      heroStage.classList.remove('hero-stage--expanding');
      viewPlayer.style.removeProperty('transform');
      viewPlayer.style.removeProperty('transition');
      alignDiscToSpacer();
      startPlaybackFromBeginning();
      isNavigating = false;
    }, navDelay);
  }

  function goToPlaylist() {
    if (currentView !== 'player') return;
    clearPullGestureStyles();
    currentView = 'playlist';
    syncPlayBtnLabel();
    isNavigating = false;
    heroStage.classList.add('hero-stage--expanding');
    phoneScreen.className = 'phone-screen';

    if (!audio.paused) {
      audio.pause();
      setPlayingUI(false);
      phoneScreen.classList.remove('is-playing');
    }
    resetDiscSpin();

    viewPlayer.classList.add('exit-to-playlist');
    viewPlaylist.classList.add('enter-from-player', 'active');
    alignDiscToPlaylist();

    if (starsRenderer) {
      starsRenderer.mode = 'playlist';
      reseedPlaylistStars();
    }
    if (typeof CosmicResonance !== 'undefined') CosmicResonance.setReadyImmediate();

    setTimeout(function () {
      viewPlayer.classList.remove('active', 'exit-to-playlist');
      viewPlaylist.classList.remove('enter-from-player');
      heroStage.classList.remove('hero-stage--expanding');
    }, 400);

    setTimeout(function () {
      viewPlaylist.classList.remove('enter-from-player');
    }, 800);
  }

  navBack.addEventListener('click', goToPlaylist);

  function isPullGestureExcluded(target) {
    if (!target || !target.closest) return false;
    return !!target.closest(
      'button, a[href], input, select, textarea, label, #progressTrack, #playBtn, .player__timeline'
    );
  }

  function initPagePullDown() {
    if (!phoneScreen) return;

    var pullTracking = false;
    var pullActive = false;
    var pullPointerId = null;
    var pullStartY = 0;
    function releasePullCapture(e) {
      if (!e || e.pointerId !== pullPointerId) return;
      try {
        phoneScreen.releasePointerCapture(e.pointerId);
      } catch (err) { /* ignore */ }
    }

    function resetPullPreview() {
      pullTracking = false;
      pullActive = false;
      pullPointerId = null;
      clearPullGestureStyles();
      if (currentView === 'playlist') {
        viewPlayer.classList.remove('active');
      }
    }

    function setPullOffset(px) {
      var pullMax = phoneScreen.clientHeight || 844;
      var offset = Math.max(0, Math.min(px, pullMax));
      var progress = offset / pullMax;
      phoneScreen.style.setProperty('--player-pull', offset + 'px');
      phoneScreen.style.setProperty('--player-pull-dim', String(progress));
      phoneScreen.classList.add('is-pulling-player');
      viewPlayer.classList.add('active');
    }

    function onPullEnd(commit) {
      if (!pullTracking && !pullActive) return;
      if (commit) {
        pullTracking = false;
        pullActive = false;
        if (typeof CosmicResonance !== 'undefined') CosmicResonance.triggerBurst();
        goToPlayer({ fromPull: true });
        return;
      }
      resetPullPreview();
    }

    function onPointerDown(e) {
      if (currentView !== 'playlist' || isNavigating) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (isPullGestureExcluded(e.target)) return;
      gestureHadPull = false;
      pullTracking = true;
      pullActive = false;
      pullStartY = e.clientY;
      pullPointerId = e.pointerId;
    }

    function onPointerMove(e) {
      if (!pullTracking || e.pointerId !== pullPointerId) return;
      var dy = e.clientY - pullStartY;
      if (dy < -12) {
        releasePullCapture(e);
        resetPullPreview();
        return;
      }
      if (dy < PULL_START_PX) return;
      if (!pullActive) {
        pullActive = true;
        gestureHadPull = true;
        phoneScreen.classList.add('pull-armed');
        try {
          phoneScreen.setPointerCapture(pullPointerId);
        } catch (err) { /* ignore */ }
      }
      e.preventDefault();
      setPullOffset(dy);
    }

    function finishPull(e) {
      if (e.pointerId !== pullPointerId) return;
      var dy = e.clientY - pullStartY;
      var threshold = (phoneScreen.clientHeight || 844) * PULL_COMMIT_RATIO;
      var commit = pullTracking && pullActive && dy >= threshold;
      if (pullActive) gestureHadPull = true;
      releasePullCapture(e);
      onPullEnd(commit);
      if (!commit) {
        window.setTimeout(function () {
          gestureHadPull = false;
        }, 0);
      }
    }

    var pullOpts = { passive: false, capture: true };
    phoneScreen.addEventListener('pointerdown', onPointerDown, pullOpts);
    phoneScreen.addEventListener('pointermove', onPointerMove, pullOpts);
    phoneScreen.addEventListener('pointerup', finishPull, pullOpts);
    phoneScreen.addEventListener('pointercancel', finishPull, pullOpts);
  }

  initPagePullDown();

  playBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (currentView === 'playlist') return;
    togglePlay();
  });

  morphDiscWrap.addEventListener('click', function (e) {
    if (currentView !== 'player') return;
    if (e.target.closest('#playBtn')) return;
    pausePlayback();
  });

  viewPlayer.addEventListener('click', function (e) {
    if (currentView !== 'player') return;
    if (e.target.closest('#playBtn')) return;
    if (e.target.closest('#progressTrack')) return;
    pausePlayback();
  });

  // ========== AUDIO PLAYER ==========
  function formatTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  function setPlayingUI(playing) {
    if (playing) {
      disc.classList.add('spin-ready');
      disc.classList.add('is-playing');
    } else {
      disc.classList.remove('is-playing');
    }
    playBtn.classList.toggle('is-playing', playing);
    phoneScreen.classList.toggle('is-playing', playing);
    if (currentView === 'player') {
      playBtn.setAttribute('aria-label', playing ? '暂停' : '播放');
    }
  }

  function resetDiscSpin() {
    disc.classList.remove('spin-ready', 'is-playing');
  }

  async function togglePlay() {
    if (audio.paused) {
      try {
        await audio.play();
        setPlayingUI(true);
      } catch (e) { /* blocked */ }
    } else {
      audio.pause();
      setPlayingUI(false);
    }
  }

  function updateProgress() {
    var dur = audio.duration;
    var cur = audio.currentTime;
    var pct = dur > 0 ? (cur / dur) * 100 : 0;
    progressFill.style.width = pct + '%';
    progressHandle.style.left = pct + '%';
    timeCurrent.textContent = formatTime(cur);
    syncLyrics(cur);
  }

  function seekFromEvent(e) {
    var rect = progressTrack.getBoundingClientRect();
    var x = (e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX)) - rect.left;
    var ratio = Math.max(0, Math.min(1, x / rect.width));
    if (audio.duration) audio.currentTime = ratio * audio.duration;
    updateProgress();
  }

  audio.addEventListener('loadedmetadata', function () {
    timeTotal.textContent = formatTime(audio.duration);
  });
  audio.addEventListener('timeupdate', updateProgress);
  audio.addEventListener('ended', function () {
    setPlayingUI(false);
    phoneScreen.classList.remove('is-playing');
  });

  progressTrack.addEventListener('mousedown', function (e) { isDragging = true; seekFromEvent(e); });
  window.addEventListener('mousemove', function (e) { if (isDragging) seekFromEvent(e); });
  window.addEventListener('mouseup', function () { isDragging = false; });
  progressTrack.addEventListener('touchstart', function (e) { isDragging = true; seekFromEvent(e); }, { passive: true });
  progressTrack.addEventListener('touchmove', function (e) { if (isDragging) seekFromEvent(e); }, { passive: true });
  progressTrack.addEventListener('touchend', function () { isDragging = false; });

  // ========== THREE.JS STARS ==========
  function resizeStars() {
    if (!starsRenderer) return;
    var w = heroStage.clientWidth;
    var h = heroStage.clientHeight;
    if (w < 1 || h < 1) return;
    starsRenderer.renderer.setSize(w, h);
    starsRenderer.camera.aspect = w / h;
    starsRenderer.camera.updateProjectionMatrix();
    if (typeof CosmicResonance !== 'undefined') CosmicResonance.resize();
  }

  function respawnStarParticle(i, positions, depths) {
    var theta = Math.random() * Math.PI * 2;
    var phi = Math.acos(2 * Math.random() - 1);
    if (Math.random() < 0.5) {
      phi = Math.PI * 0.42 + Math.random() * Math.PI * 0.48;
    }
    var r = 420 + Math.random() * 380;
    var ix = i * 3;
    positions[ix] = r * Math.sin(phi) * Math.cos(theta);
    positions[ix + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.35 - 80;
    positions[ix + 2] = r * Math.cos(phi) * 0.65;
    depths[i] = Math.random();
  }

  function resetStarsToBase() {
    if (!starsRenderer) return;
    var attr = starsRenderer.dust.geometry.attributes.position;
    var arr = attr.array;
    var base = starsRenderer.basePositions;
    arr.set(base);
    attr.needsUpdate = true;
  }

  function reseedPlaylistStars() {
    if (!starsRenderer) return;
    var attr = starsRenderer.dust.geometry.attributes.position;
    var arr = attr.array;
    for (var i = 0; i < starsRenderer.count; i++) {
      respawnStarParticle(i, arr, starsRenderer.depths);
    }
    attr.needsUpdate = true;
  }

  function updatePlaylistStars(arr, depths, n) {
    for (var i = 0; i < n; i++) {
      var ix = i * 3;
      var x = arr[ix];
      var y = arr[ix + 1];
      var z = arr[ix + 2];
      var len = Math.sqrt(x * x + y * y + z * z) || 1;
      var speed = 0.18 + depths[i] * 0.95;
      arr[ix] -= (x / len) * speed;
      arr[ix + 1] -= (y / len) * speed * 0.85;
      arr[ix + 2] -= (z / len) * speed * 0.5;
      if (len < 42) respawnStarParticle(i, arr, depths);
    }
  }

  function initStarsScene() {
    if (typeof THREE === 'undefined' || !heroStage) return;
    var canvas = document.getElementById('stars-canvas');
    var w = heroStage.clientWidth;
    var h = heroStage.clientHeight;

    var scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x02040a, 0.0018);
    var camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 2000);
    camera.position.z = 400;
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    var count = 8000;
    var positions = new Float32Array(count * 3);
    var basePositions = new Float32Array(count * 3);
    var depths = new Float32Array(count);
    var colors = new Float32Array(count * 3);
    var color = new THREE.Color();
    for (var i = 0; i < count; i++) {
      var r = 700 * Math.pow(Math.random(), 0.5);
      var theta = Math.random() * Math.PI * 2;
      var phi = Math.acos(2 * Math.random() - 1);
      var x = r * Math.sin(phi) * Math.cos(theta);
      var y = r * Math.sin(phi) * Math.sin(theta) * 0.2;
      var z = r * Math.cos(phi);
      basePositions[i * 3] = x;
      basePositions[i * 3 + 1] = y;
      basePositions[i * 3 + 2] = z;
      depths[i] = Math.random();
      var mix = Math.random();
      if (mix > 0.75) color.setHex(0xbfe8ff);
      else if (mix > 0.4) color.setHex(0x17e6c4).multiplyScalar(0.35);
      else color.setHex(0xffffff).multiplyScalar(0.2);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    var spriteCanvas = document.createElement('canvas');
    spriteCanvas.width = 16;
    spriteCanvas.height = 16;
    var sctx = spriteCanvas.getContext('2d');
    var grad = sctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.2, 'rgba(255,255,255,0.8)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, 16, 16);
    var spriteTex = new THREE.CanvasTexture(spriteCanvas);

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    var dust = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 2,
      vertexColors: true,
      map: spriteTex,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    scene.add(dust);

    starsRenderer = {
      renderer: renderer,
      camera: camera,
      dust: dust,
      basePositions: basePositions,
      depths: depths,
      count: count,
      mode: 'playlist'
    };

    var clock = new THREE.Clock();
    (function animate() {
      requestAnimationFrame(animate);
      var t = clock.getElapsedTime();
      var attr = dust.geometry.attributes.position;
      var arr = attr.array;
      var n = starsRenderer.count;

      if (starsRenderer.mode === 'playlist') {
        updatePlaylistStars(arr, starsRenderer.depths, n);
        attr.needsUpdate = true;
        dust.rotation.y = t * 0.008;
        camera.position.x = Math.sin(t * 0.05) * 12;
        camera.position.y = Math.cos(t * 0.04) * 8;
      } else {
        dust.rotation.y = t * 0.02;
        camera.position.x = Math.sin(t * 0.08) * 30;
        camera.position.y = Math.cos(t * 0.06) * 20;
      }

      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    })();

    reseedPlaylistStars();

    if (typeof ResizeObserver !== 'undefined') {
      starsResizeObserver = new ResizeObserver(resizeStars);
      starsResizeObserver.observe(heroStage);
    }
    window.addEventListener('resize', resizeStars);
  }

  // ========== CLOCK ==========
  var timeEl = document.querySelector('.ios-status-bar__time');
  if (timeEl) {
    function tick() {
      var d = new Date();
      timeEl.textContent = d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
    }
    tick();
    setInterval(tick, 60000);
  }

  alignDiscToPlaylist();
  syncPlayBtnLabel();
  initStarsScene();

  phoneScreen.setAttribute('data-cosmic-phase', 'ready');

  if (typeof CosmicResonance !== 'undefined') {
    CosmicResonance.init({
      phoneScreen: phoneScreen,
      heroStage: heroStage,
      pillWrap: pillWrap,
      morphDiscWrap: morphDiscWrap,
      playBtn: playBtn,
      getCurrentView: function () { return currentView; },
      getGestureHadPull: function () { return gestureHadPull; },
      onNavigate: goToPlayer
    });
  }

  window.addEventListener('resize', function () {
    if (currentView === 'player') alignDiscToSpacer();
  });

  audio.load();
  if (audio.readyState >= 1) {
    timeTotal.textContent = formatTime(audio.duration);
  }
})();
