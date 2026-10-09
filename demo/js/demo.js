/*
 * Tooling Intelligence product demo, HTML player.
 *
 * Flow so far:
 *   title > user ID > environment clip > End frame slides across to the product
 *   > the zoom and login clip for the login type, where there is one;
 *     otherwise zoom to screen > device login screen > (badge and barcode
 *     only) physical login clip
 *   > the user's sequence, one device screen per step, with the take or
 *     return clip each time an item is taken out or put back > stub
 *
 * Classic scripts only (no modules), so it runs from file:// and in an LMS.
 */
(function () {
  'use strict';

  var MEDIA = window.TI_MEDIA || {};
  var CONFIGS = window.TI_CONFIGS || [];
  var SEQUENCES = window.TI_SEQUENCES || {};
  var PARAMS = new URLSearchParams(window.location.search);

  var PLACEHOLDER_SECONDS = 4;   // a missing clip continues after this
  var LOAD_TIMEOUT_MS = 12000;   // a clip that never loads is treated as missing
  var FADE_MS = 450;             // matches .slide transition in demo.css
  // The hand-off from the environment to the zoom. Keep in step with demo.css.
  var SWAP_MS = 200;             // video's last frame crossfades to the slide image
  var HOLD_MS = 300;             // pause on the two products
  var SLIDE_MS = 1500;           // slide image moves across to the product
  var SETTLE_MS = 200;           // pause on the product before the zoom
  var ZOOM_FADE_MS = 500;        // slide image crossfades to the zoom's first frame
  var TYPE_DELAY_MS = 110;       // per character, typed logins and typed screen text
  // The sequence. A step's dwell (from the CMS) is the hold after these.
  var READ_MS = 500;             // a new screen shows before anything is typed into it
  var AFTER_TYPE_MS = 400;       // typed text shows before the results come up
  var PICK_MS = 600;             // a screen shows before its row or knob is picked
  var AUTO_MS = 1200;            // a scan, or the scale settling, takes this long
  var PRESS_MS = 250;            // a button press shows for this long
  var NEXT_GUARD_MS = 250;       // step-through ignores a second Next this soon
  var LANDED_MS = 600;           // a zoom and login clip's last frame holds before the sequence
  // The cursor. A move takes longer the further it goes, within these limits.
  var MOVE_MIN_MS = 350;
  var MOVE_MAX_MS = 900;
  var MOVE_MS_PER_PX = 0.4;      // device px, so a move across the panel is ~800ms
  var CURSOR_FADE_MS = 250;      // matches .cursor in demo.css
  // Where it first shows, low on the panel, as a share of the device's screen
  // (1100, 880 on SmartDrawer's, which fills the frame)
  var CURSOR_REST = { x: 1100 / 1920, y: 880 / 1080 };
  var STAGE_SCALE = 1280 / 1920;  // the device layer's 1920x1080 px onto the stage
  // The on-screen keyboard. Key to key moves are quicker than the cursor's
  // other moves, as a typist's are.
  var KEY_MOVE_MIN_MS = 160;
  var KEY_MOVE_MAX_MS = 420;
  var KEY_MS_PER_PX = 0.25;
  var KEY_PRESS_MS = 150;        // a key shows red for this long
  var KEYBOARD_READ_MS = 400;    // the keyboard shows before the first key

  var LABELS = {
    location: {
      f1_automotive: 'F1 automotive', aircraft_hangar: 'Aircraft hangar', cnc_machine_shop: 'CNC machine shop',
      medical_cleanroom: 'Medical cleanroom', rail_depot: 'Rail depot', amazon_warehouse: 'Warehouse'
    },
    solution: { smartdrawer: 'SmartDrawer', supplysystem: 'SupplySystem' },
    login_type: {
      rfid: 'RFID badge', barcode: 'Barcode scan',
      login_no_password: 'Typed, no password', login_with_password: 'Typed, with password'
    }
  };

  var state = { slide: 'slide-title', config: null, run: 0, busy: false, sequence: null, mode: 'auto', onNext: null };
  var slots = {};

  /* ---------- Stage scaling ---------- */
  var stage = document.getElementById('stage');
  function fit() {
    var s = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    stage.style.setProperty('--s', s);
  }
  window.addEventListener('resize', fit);
  fit();

  /* ---------- Media slots ---------- */
  // Builds a poster, a video and (optionally) an end still inside a container.
  function createSlot(container, def, name) {
    container.innerHTML = '';
    def = def || {};
    var slot = {
      name: name, def: def, el: container, video: null, endImg: null,
      missing: null, posterOk: def.poster ? null : false, badge: null, onKnown: []
    };

    if (def.poster) {
      var img = document.createElement('img');
      img.className = 'poster';
      img.alt = '';
      img.onload = function () { slot.posterOk = true; };
      img.onerror = function () { img.remove(); slot.posterOk = false; maybeBadge(slot); };
      img.src = def.poster;
      container.appendChild(img);
    }

    if (def.end) {
      var end = document.createElement('img');
      end.className = 'end-still';
      end.alt = '';
      end.onerror = function () { end.remove(); slot.endImg = null; };
      end.src = def.end;
      container.appendChild(end);
      slot.endImg = end;
    }

    if (!def.video) { settle(slot, true); return slot; }

    var v = document.createElement('video');
    v.preload = 'auto';
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.muted = true; // none of the renders carry audio
    if (def.loop) v.loop = true;
    v.addEventListener('error', function () { v.remove(); slot.video = null; settle(slot, true); });
    v.addEventListener('loadeddata', function () { settle(slot, false); });
    v.src = def.video;
    container.appendChild(v);
    slot.video = v;

    setTimeout(function () {
      if (slot.missing === null) { v.remove(); slot.video = null; settle(slot, true); }
    }, LOAD_TIMEOUT_MS);

    return slot;
  }

  function settle(slot, missing) {
    if (slot.missing !== null) return;
    slot.missing = missing;
    if (missing) maybeBadge(slot);
    slot.onKnown.splice(0).forEach(function (fn) { fn(); });
  }

  // A looping background whose video file is missing, with no still to fall
  // back on, gets a label. A slot with no video set is intentional: no label.
  function maybeBadge(slot) {
    if (!slot.def.loop || !slot.def.video || slot.badge || slot.missing !== true || slot.posterOk !== false) return;
    var badge = document.createElement('div');
    badge.className = 'ph-badge';
    badge.innerHTML = '<b>Video placeholder:</b> ' + escapeHtml(slot.def.label || slot.name) +
      '<br>' + escapeHtml(slot.def.video || 'no file set');
    slot.el.appendChild(badge);
    slot.badge = badge;
  }

  function whenKnown(slot, fn) { slot.missing === null ? slot.onKnown.push(fn) : fn(); }

  function startLoop(slot) { if (slot && slot.video) slot.video.play().catch(function () {}); }
  function stopLoop(slot) { if (slot && slot.video) slot.video.pause(); }

  // Plays a one-shot clip, then calls done. A missing clip shows a
  // placeholder panel that counts down, or can be skipped.
  function playClip(slot, done) {
    var run = state.run;
    var finished = false;
    function finish() {
      if (finished || run !== state.run) return;
      finished = true;
      if (slot.endImg) slot.endImg.classList.add('is-shown');
      done();
    }

    whenKnown(slot, function () {
      if (run !== state.run) return;
      if (!slot.missing) {
        slot.video.currentTime = 0;
        slot.video.onended = finish;
        slot.video.play().catch(finish);
        return;
      }
      var panel = document.createElement('div');
      panel.className = 'ph-clip';
      panel.innerHTML =
        '<p class="ph-kicker">Video placeholder</p>' +
        '<p class="ph-title">' + escapeHtml(slot.def.label || slot.name) + '</p>' +
        '<p class="ph-file">' + escapeHtml(slot.def.video || 'no file set') + '</p>' +
        '<p class="ph-count" aria-live="off"></p>';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-submit btn-small';
      btn.textContent = 'Continue';
      panel.appendChild(btn);
      slot.el.appendChild(panel);

      var left = PLACEHOLDER_SECONDS;
      var count = panel.querySelector('.ph-count');
      function tick() { count.textContent = 'Continues in ' + left + 's'; }
      tick();
      var timer = setInterval(function () {
        left -= 1;
        if (left <= 0) { cleanup(); finish(); } else { tick(); }
      }, 1000);
      function cleanup() { clearInterval(timer); panel.remove(); }
      btn.addEventListener('click', function () { cleanup(); finish(); });
      btn.focus();
    });
  }

  /* ---------- Slides ---------- */
  var loopFor = {};

  function goTo(id) {
    var from = document.getElementById(state.slide);
    var to = document.getElementById(id);
    if (loopFor[state.slide]) stopLoop(loopFor[state.slide]);

    to.hidden = false;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        to.classList.add('is-active');
        if (from && from !== to) from.classList.remove('is-active');
      });
    });
    setTimeout(function () { if (from && from !== to && state.slide !== from.id) from.hidden = true; }, FADE_MS + 30);

    state.slide = id;
    if (loopFor[id]) startLoop(loopFor[id]);
  }

  // Runs fn after delay, unless the demo was restarted in the meantime.
  function later(ms, fn) {
    var run = state.run;
    setTimeout(function () { if (run === state.run) fn(); }, ms);
  }

  /* ---------- The run ---------- */
  var device = document.getElementById('device');
  var plate = document.getElementById('device-plate');
  var welcome = document.getElementById('device-welcome');
  var field = document.getElementById('device-field');
  var fieldText = document.getElementById('device-field-text');
  var enterBtn = document.getElementById('device-enter');
  var panLayer = document.getElementById('pan-layer');
  var panImg = document.getElementById('pan-img');
  var zoomMedia = document.getElementById('zoom-media');
  var takeMedia = document.getElementById('take-media');
  var returnMedia = document.getElementById('return-media');
  var screenEl = document.getElementById('screen');
  var stepNext = document.getElementById('step-next');
  var cursor = document.getElementById('cursor');
  var toneSaturation = document.querySelector('#render-tone .tone-saturation');
  var toneGamma = document.querySelectorAll('#render-tone .tone-gamma');

  // Puts the slide image back where its End frame covers the screen exactly,
  // matching the video's last frame. ext is the extension to the left.
  function resetPan(ext) {
    ext = ext || 0;
    panImg.classList.add('no-anim');
    panImg.style.transform = 'none';
    panImg.style.left = (-ext) + 'px';
    panImg.style.top = '0px';
    panImg.style.width = (1920 + ext) + 'px';
    panImg.style.height = '1080px';
    void panImg.offsetWidth; // apply before the transition comes back
    panImg.classList.remove('no-anim');
    panLayer.classList.remove('is-shown');
    zoomMedia.classList.remove('is-shown');
  }

  function prepare(config, sequence) {
    var env = (MEDIA.environments || {})[config.location] || {};
    // Which product's media to use. See stand_in in media.js.
    var sol = (MEDIA.stand_in || {})[config.solution] || config.solution;
    state.mediaSolution = sol;
    slots.env = createSlot(document.getElementById('env-media'), env, 'env');
    // A clip that zooms in and logs in, where one exists for this login
    // type, plays in the zoom's place. See zoom_login in media.js.
    var zoomLogin = ((MEDIA.zoom_login || {})[sol] || {})[config.login_type];
    state.zoomLogin = !!zoomLogin;
    slots.zoom = createSlot(zoomMedia, zoomLogin || (MEDIA.zoom || {})[sol], 'zoom');
    // Loaded now so they are ready mid-sequence. Each product has its own,
    // so these skip the stand-in.
    var action = MEDIA.action || {};
    slots.take = createSlot(takeMedia, (action.take || {})[config.solution], 'take');
    slots['return'] = createSlot(returnMedia, (action['return'] || {})[config.solution], 'return');

    resetPan(env.ext);
    state.slideBy = (env.slide_by || {})[sol];
    state.panReady = false;
    if (env.slide && typeof state.slideBy === 'number') {
      panImg.onload = function () { state.panReady = true; };
      panImg.onerror = function () { state.panReady = false; };
      panImg.src = env.slide;
    } else {
      panImg.removeAttribute('src');
    }

    // The login screen, and where the device's screen sits, for the framing
    // the zoom ends on. A zoom and login clip can name its own (see media.js).
    var screen = (MEDIA.login_screen || {})[(zoomLogin && zoomLogin.login_screen) || sol];
    state.loginScreen = screen;
    device.hidden = true;
    fieldText.textContent = '';
    field.classList.remove('is-typing');
    // With no custom welcome message, the clip's own last frame is used, so
    // the cut from video to HTML is invisible. A custom message uses the
    // clean still with the text set in HTML. A zoom and login clip ends on
    // its own last frame ('end'), or on the zoom's where it has none.
    if (screen) {
      if (config.welcome_message && !state.zoomLogin) {
        plate.src = screen.clean;
        welcome.textContent = config.welcome_message;
      } else {
        plate.src = (zoomLogin && zoomLogin.end) || screen.frame;
        welcome.textContent = '';
      }
    }
    state.hasScreen = !!screen;
    setGeometry(screen);

    // The sequence that plays after login, from the CMS or the demo's own
    // files (see the user ID lookup). ?mode=step or ?mode=auto overrides the
    // sequence's own playback mode, ?tone=off turns the render tone off and
    // ?cursor=off the cursor, ?keyboard=off the on-screen keyboard, all for
    // testing.
    state.sequence = sequence || null;
    state.cursorOn = PARAMS.get('cursor') !== 'off';
    state.keyboardOn = PARAMS.get('keyboard') !== 'off';
    var mode = PARAMS.get('mode');
    state.mode = mode === 'step' || mode === 'step_through' ? 'step_through'
      : mode === 'auto' ? 'auto'
      : (state.sequence && state.sequence.playback_mode) || 'auto';
    clearScreen();
    setTone(PARAMS.get('tone') === 'off' ? null : screen && screen.tone);
    setTheme(config);
  }

  // The customer's colours and logo on the device screens, from the config's
  // theme_colour, button_colour and logo (see shared/theme.js, which the CMS
  // previews them with). The login screen is the render's own frame, so it
  // keeps the device's colours. The logo is a data URI from the CMS or a path
  // from this folder. One that does not load shows as a labelled box, so a
  // wrong path is seen rather than quietly showing TI's.
  var DEFAULT_LOGO = window.TIScreens.logo;
  function setTheme(config) {
    var vars = window.TITheme.vars(config);
    window.TITheme.VARS.forEach(function (name) {
      if (vars[name]) screenEl.style.setProperty(name, vars[name]);
      else screenEl.style.removeProperty(name);
    });
    var logo = String(config.logo || '').trim();
    window.TIScreens.logo = logo || DEFAULT_LOGO;
    window.TIScreens.logoMissing = null;
    if (!logo) return;
    var run = state.run;
    var img = new Image();
    img.onerror = function () { if (run === state.run) window.TIScreens.logoMissing = logo; };
    img.src = logo;
  }

  // The render's colour change, applied to the HTML screens. See media.js.
  // A tone is a gamma, or a curve of [in, out] levels from 0 to 255.
  function setTone(tone) {
    toneSaturation.setAttribute('values', tone ? tone.saturation : 1);
    toneGamma.forEach(function (f) {
      if (tone && tone.curve) {
        f.setAttribute('type', 'table');
        f.setAttribute('tableValues', curveTable(tone.curve));
      } else {
        f.setAttribute('type', 'gamma');
        f.setAttribute('exponent', tone ? tone.gamma : 1);
      }
    });
    screenEl.classList.toggle('is-toned', !!tone);
  }

  // The curve as an SVG table: 33 evenly spaced levels, joined straight.
  function curveTable(points) {
    var out = [];
    for (var k = 0; k <= 32; k++) {
      var x = Math.min(255, k * 8);
      var j = 1;
      while (j < points.length - 1 && points[j][0] < x) j++;
      var a = points[j - 1], b = points[j];
      var y = a[1] + (b[1] - a[1]) * (x - a[0]) / ((b[0] - a[0]) || 1);
      out.push((y / 255).toFixed(4));
    }
    return out.join(' ');
  }

  // Where the device's screen sits in the zoom's last frame. SmartDrawer's
  // fills it, widened to 16:9 (see css/screens.css), which is the CSS as it
  // stands. SupplySystem's is the 1024x768 UI as it is, smaller and off
  // centre ('screen' in media.js), so the screens, the log out message, the
  // cursor's first place and the Next pill move and scale with it. The pill
  // keeps its size against the device's screen.
  var SMARTDRAWER_SCALE = 1080 / 768;
  function setGeometry(screen) {
    var g = screen && screen.screen;
    var w = g ? 1024 * g.scale : 1920, h = g ? 768 * g.scale : 1080;
    var left = g ? g.left : 0, top = g ? g.top : 0;
    var b = (g && g.bleed) || [0, 0, 0, 0];
    var props = {
      left: (left - b[3]) + 'px', top: (top - b[0]) + 'px', right: 'auto', bottom: 'auto',
      width: (w + b[1] + b[3]) + 'px', height: (h + b[0] + b[2]) + 'px',
      '--scr-w': '1024px', '--scr-s': g && g.scale, '--scr-x': b[3] + 'px', '--scr-y': b[0] + 'px'
    };
    Object.keys(props).forEach(function (k) {
      if (g) screenEl.style.setProperty(k, props[k]); else screenEl.style.removeProperty(k);
    });
    var wm = screen && screen.welcome;
    welcome.style.left = wm ? wm.left + 'px' : '';
    welcome.style.top = wm ? wm.top + 'px' : '';
    welcome.style.width = wm ? wm.width + 'px' : '';
    welcome.style.fontSize = wm ? wm.size + 'px' : '';
    welcome.style.lineHeight = wm ? wm.line + 'px' : '';
    state.cursorRest = { x: left + CURSOR_REST.x * w, y: top + CURSOR_REST.y * h };
    // The pill is centred on the title bar, which is 76 artwork px high
    var k = g ? g.scale / SMARTDRAWER_SCALE : 1;
    stepNext.style.setProperty('--next-x', g ? ((left + 512 * g.scale) * STAGE_SCALE) + 'px' : '');
    stepNext.style.setProperty('--next-top', g ? ((top + 38 * g.scale) * STAGE_SCALE - 22 * k) + 'px' : '');
    stepNext.style.setProperty('--next-s', g ? k : '');
  }

  function begin() {
    goTo('slide-scene');
    later(FADE_MS, function () { playClip(slots.env, afterEnvironment); });
  }

  // The environment has ended on the two products.
  // 1. Switch to the slide image, whose End frame matches the video's last frame.
  // 2. Hold, then slide it across until the chosen product is centred:
  //    right for SmartDrawer, left for SupplyVend (once its image exists).
  // 3. Crossfade to the zoom clip, paused on its first frame, then play it.
  //    The SmartDrawer zoom clip is a placeholder for now.
  function afterEnvironment() {
    if (!state.panReady) {
      // No slide image for this product yet: straight crossfade.
      later(HOLD_MS, showZoom);
      return;
    }
    panLayer.classList.add('is-shown');
    later(SWAP_MS + HOLD_MS, function () {
      panImg.style.transform = 'translateX(' + state.slideBy + 'px)';
      later(SLIDE_MS + SETTLE_MS, showZoom);
    });
  }

  function showZoom() {
    zoomMedia.classList.add('is-shown');
    later(ZOOM_FADE_MS, function () { playClip(slots.zoom, afterZoom); });
  }

  function afterZoom() {
    if (!state.hasScreen) {
      showNext(LABELS.solution[state.config.solution] + ' screens still need their zoom clip and screen artwork.');
      return;
    }
    device.hidden = false;
    // The clip has logged in already, so the sequence starts.
    if (state.zoomLogin) { later(LANDED_MS, function () { afterLogin(false); }); return; }
    later(900, login);
  }

  function login() {
    var type = state.config.login_type;
    if (type === 'login_no_password' || type === 'login_with_password') {
      typeOnScreen(field, fieldText, field, String(state.config.user_id), 'text', 'User ID', function () {
        later(400, function () {
          moveTo(enterBtn, function () {
            press(enterBtn, function () {
              // No password screen yet, so a password login goes straight on.
              later(500, function () { afterLogin(false); });
            });
          });
        });
      });
      return;
    }
    // Badge and barcode: the physical action is a 3D clip.
    later(1200, function () {
      slots.login = createSlot(document.getElementById('login-media'), (MEDIA.login_action || {})[type], 'login');
      goTo('slide-login-action');
      later(FADE_MS, function () {
        playClip(slots.login, function () { afterLogin(true); });
      });
    });
  }

  // Types text into el one character at a time. caret gets is-typing while it
  // runs, which shows a caret.
  function typeText(el, text, caret, done) {
    caret.classList.add('is-typing');
    var i = 0;
    (function step() {
      if (i >= text.length) { caret.classList.remove('is-typing'); done(); return; }
      el.textContent += text.charAt(i++);
      later(TYPE_DELAY_MS, step);
    })();
  }

  /* ---------- The sequence ----------
   * Each step: its screen cuts in, its arrival plays (typing, then the row or
   * knob it picks), it holds for its dwell or until Next, then its exit plays
   * (the press that leads on) and the next step cuts in. The screens and what
   * moves on them are in screens.js.
   *
   * The login was the config's, so the sequence's own log in step is skipped.
   * If the two name different login methods, the config wins.
   *
   * Each time an item is taken out or put back, the take or return clip plays
   * on its own slide, then the next step comes back on the device. See
   * actionClipAfter for when.
   */
  function afterLogin(fromClip) {
    var seq = state.sequence;
    if (!seq) { showNext('This user ID has no sequence yet.'); return; }
    var check = window.TIValidator ? window.TIValidator.validate(seq) : { valid: true, errors: [] };
    if (!check.valid) {
      showNext("This user ID's sequence breaks the CMS rules, so it was not played. " + check.errors[0].message);
      return;
    }
    var first = seq.steps[0] && seq.steps[0].type === 'login_method' ? 1 : 0;
    runStep(first, fromClip);
  }

  // viaSlide: coming back from the login clip's slide, so the screen is set
  // up first and the slide fades back to it.
  function runStep(i, viaSlide) {
    var steps = state.sequence.steps;
    if (i >= steps.length) { showNext('End of the sequence.'); return; }
    var step = steps[i];
    state.stepIndex = i;

    if (step.type === 'logout') { logout(i, viaSlide); return; }
    if (DOOR_STEPS[step.type]) { playAction(DOOR_STEPS[step.type], i); return; }

    screenEl.innerHTML = window.TIScreens.build(step, { steps: steps, index: i });
    screenEl.hidden = false;
    if (viaSlide) {
      goTo('slide-scene');
      later(FADE_MS, function () { arrive(i); });
    } else {
      arrive(i);
    }
  }

  // In order: the cursor presses anything tapped first (Product Category),
  // clicks into each field and types, or the device fills the field itself
  // (a scan, a scale reading); then the screen moves on to its results, and
  // the cursor comes to rest on the row or knob it picks. The click on that
  // comes with the press on the way out.
  function arrive(i) {
    var taps = shown('[data-tap]');
    var typed = shown('[data-type]');
    function tap() {
      var el = taps.shift();
      if (!el) { type(); return; }
      moveTo(el, function () { press(el, tap); });
    }
    function type() {
      var el = typed.shift();
      if (!el) { results(); return; }
      var text = el.getAttribute('data-type');
      if (el.hasAttribute('data-auto')) {
        later(AUTO_MS, function () { el.textContent = text; later(AFTER_TYPE_MS, type); });
        return;
      }
      typeOnScreen(el.closest('.scr-field') || el, el, el, text, el.getAttribute('data-kbd') || 'text', el.getAttribute('data-kbd-label') || '', function () {
        el.classList.add('is-selected');
        later(AFTER_TYPE_MS, type);
      });
    }
    function results() {
      window.TIScreens.swap(screenEl);
      var picks = shown('[data-pick]');
      if (!picks.length) { hold(i); return; }
      later(PICK_MS, function () {
        moveTo(picks[0], function () {
          picks.forEach(function (n) { n.classList.add('is-picked'); });
          hold(i);
        });
      });
    }
    if (taps.length || typed.length) later(READ_MS, tap); else tap();
  }

  // The marked parts of the screen that are on show. A step can hold a
  // second screen, or a second list, that is hidden until its results.
  function shown(sel) {
    if (screenEl.hidden) return [];
    return [].filter.call(screenEl.querySelectorAll(sel), function (n) { return n.getClientRects().length > 0; });
  }

  function hold(i) {
    if (state.mode === 'step_through') { waitForNext(function () { leave(i); }); return; }
    later(dwellFor(state.sequence.steps[i]), function () { leave(i); });
  }

  function dwellFor(step) {
    var d = Number(step.dwell_ms);
    return d > 0 ? d : (Number(state.sequence.default_dwell_ms) || 3000);
  }

  function leave(i) {
    var target = shown('[data-press]')[0];
    moveTo(target, function () {
      press(target, function () {
        var clip = actionClipAfter(state.sequence.steps, i);
        if (clip) playAction(clip, i); else runStep(i + 1);
      });
    });
  }

  // Steps that are the door being used, so they play the clip in place of a
  // screen. The clip's length stands in for the step's dwell.
  var DOOR_STEPS = { open_pocket_take: 'take', check_in: 'return' };
  // Steps that end a take or return: anything after them is a new one.
  var NEW_TRANSACTION = { select_action: 1, select_product: 1, product_search: 1, logout: 1 };

  // The clip that plays after step i: 'take', 'return' or null.
  // A take or return chosen on the knobs plays its clip once its last screen
  // is done, which is the quantity if there is one, otherwise the knobs. If
  // the sequence has its own door step for it, that step plays the clip
  // instead, so it never plays twice. A Scale step is done on screen, so a
  // take or return through one has no clip.
  function actionClipAfter(steps, i) {
    var type = steps[i].type;
    if (type !== 'select_action' && type !== 'enter_quantity') return null;
    var kind = null;
    for (var k = i; k >= 0; k--) {
      if (steps[k].type === 'select_action') { kind = (steps[k].params || {}).action === 'return' ? 'return' : 'take'; break; }
      if (steps[k].type === 'select_product' || steps[k].type === 'product_search') return null;
    }
    if (!kind) return null;
    for (k = i + 1; k < steps.length; k++) {
      var t = steps[k].type;
      if (t === 'enter_quantity' || DOOR_STEPS[t] || t === 'scale_transaction') return null;
      if (NEW_TRANSACTION[t]) break;
    }
    return kind;
  }

  // Plays the take or return clip, then step i + 1 comes back on the device.
  // The clips start and end at a different framing from the zoom, so they
  // fade in and out on their own slide, as the login clip does.
  function playAction(kind, i) {
    var slot = slots[kind];
    takeMedia.hidden = kind !== 'take';
    returnMedia.hidden = kind !== 'return';
    goTo('slide-action');
    later(FADE_MS, function () {
      // Once the device is out of sight: the screen is hidden so a log out
      // straight after goes to the login screen without pressing Logout on
      // the screen from before the clip, and the cursor shows again from
      // its resting place after the clip, as the operator comes back.
      screenEl.hidden = true;
      hideCursor();
      playClip(slot, function () { runStep(i + 1, true); });
    });
  }

  function press(el, done, ms) {
    if (!el) { done(); return; }
    click();
    el.classList.add('is-pressed');
    later(ms || PRESS_MS, function () { el.classList.remove('is-pressed'); done(); });
  }

  /* ---------- The on-screen keyboard ----------
   * Typing goes as it does on the device: the field is tapped, the keyboard
   * or number pad takes over the screen, each key is pressed in turn, then
   * Enter, and the screen comes back with the text in the field. The
   * keyboards are in screens.js. ?keyboard=off types straight into the
   * field instead.
   *
   * target: what the cursor taps. el: where the text ends up. caret: shows
   * the caret when typing straight in. kind: 'text' or 'num'.
   */
  function typeOnScreen(target, el, caret, text, kind, label, done) {
    moveTo(target, function () {
      click();
      if (!state.keyboardOn) { typeText(el, text, caret, done); return; }
      var wasHidden = screenEl.hidden;
      var holder = document.createElement('div');
      holder.innerHTML = window.TIScreens.keyboard(kind, label);
      var kb = holder.firstChild;
      screenEl.appendChild(kb);
      screenEl.hidden = false;
      var out = kb.querySelector('.kbd-out');
      var keys = {};
      [].forEach.call(kb.querySelectorAll('[data-key]'), function (k) { keys[k.getAttribute('data-key')] = k; });
      var plan = keyPlan(text, kind);
      var shift = false, caps = false;
      out.classList.add('is-typing');
      later(KEYBOARD_READ_MS, next);

      function next() {
        var p = plan.shift();
        var key = keys[p.key];
        // A character the keyboard has no key for still appears
        if (!key) { out.textContent += p.ch || ''; next(); return; }
        moveTo(key, function () {
          if (p.key === 'shift') shift = true;
          if (p.key === 'caps') caps = !caps;
          if (p.ch) { out.textContent += p.ch; shift = false; }
          if (keys.shift) keys.shift.classList.toggle('is-on', shift);
          if (keys.caps) keys.caps.classList.toggle('is-on', caps);
          kb.classList.toggle('is-upper', shift || caps);
          press(key, p.key === 'done' ? finish : next, KEY_PRESS_MS);
        }, true);
      }
      function finish() {
        kb.remove();
        if (wasHidden) screenEl.hidden = true;
        el.textContent = text;
        done();
      }
    });
  }

  // The keys to press for text: Shift before a capital, Caps Lock before a
  // run of them and again after it, each character, then Enter.
  function keyPlan(text, kind) {
    var plan = [], caps = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i), low = ch.toLowerCase();
      if (kind !== 'num' && /[a-z]/.test(low)) {
        var upper = ch !== low;
        if (upper && !caps) {
          if (/[A-Z]/.test(text.charAt(i + 1))) { plan.push({ key: 'caps' }); caps = true; }
          else plan.push({ key: 'shift' });
        } else if (!upper && caps) {
          plan.push({ key: 'caps' }); caps = false;
        }
      }
      plan.push({ key: kind === 'num' ? ch : low, ch: ch });
    }
    plan.push({ key: 'done' });
    return plan;
  }

  /* ---------- The cursor ----------
   * Goes to whatever is typed into, picked or pressed next, so a viewer can
   * follow the automatic screens. Positions are in the device layer's
   * 1920x1080 px. It shows at CURSOR_REST, on the device's screen, the
   * first time it is needed, and
   * goes when the operator logs out or walks to the drawer for a clip.
   */
  // quick: a hop between keys on the on-screen keyboard
  function moveTo(el, done, quick) {
    var to = el && state.cursorOn ? cursorPoint(el) : null;
    if (!to) { done(); return; }
    if (!state.cursorAt) {
      placeCursor(state.cursorRest, 0);
      cursor.classList.add('is-shown');
      later(CURSOR_FADE_MS, function () { moveTo(el, done, quick); });
      return;
    }
    var dist = Math.sqrt(Math.pow(to.x - state.cursorAt.x, 2) + Math.pow(to.y - state.cursorAt.y, 2));
    if (dist < 2) { done(); return; }
    var ms = quick
      ? Math.min(KEY_MOVE_MAX_MS, KEY_MOVE_MIN_MS + dist * KEY_MS_PER_PX)
      : Math.min(MOVE_MAX_MS, MOVE_MIN_MS + dist * MOVE_MS_PER_PX);
    ms = Math.round(ms);
    placeCursor(to, ms);
    later(ms, done);
  }

  // The middle of el, in device px, or null if it takes no space.
  function cursorPoint(el) {
    var d = device.getBoundingClientRect();
    var r = el.getBoundingClientRect();
    if (!d.width || (!r.width && !r.height)) return null;
    var k = 1920 / d.width;
    return { x: (r.left + r.width / 2 - d.left) * k, y: (r.top + r.height / 2 - d.top) * k };
  }

  function placeCursor(p, ms) {
    cursor.style.setProperty('--move-ms', ms + 'ms');
    cursor.style.transform = 'translate(' + p.x.toFixed(1) + 'px, ' + p.y.toFixed(1) + 'px)';
    state.cursorAt = p;
  }

  // Restarts the click ring and press, even when clicks come close together.
  function click() {
    if (!state.cursorAt) return;
    cursor.classList.remove('is-clicking');
    void cursor.offsetWidth;
    cursor.classList.add('is-clicking');
  }

  // Fades out, letting a click that is still running finish.
  function hideCursor() {
    cursor.classList.remove('is-shown');
    state.cursorAt = null;
  }

  // Log out: Logout is pressed on the screen that is up, then the device goes
  // back to its login screen, with the farewell message in the welcome panel.
  function logout(i, viaSlide) {
    var step = state.sequence.steps[i];
    var btn = shown('[data-logout]')[0];
    later(btn ? READ_MS : 0, function () {
      moveTo(btn, function () {
        press(btn, function () {
          hideCursor();
          var screen = state.loginScreen;
          var message = String((step.text || {}).message || '');
          if (screen) {
            plate.src = message ? screen.clean : screen.frame;
            welcome.textContent = message;
          }
          fieldText.textContent = '';
          screenEl.hidden = true;
          if (viaSlide) {
            goTo('slide-scene');
            later(FADE_MS, function () { hold(i); });
          } else {
            hold(i);
          }
        });
      });
    });
  }

  // Step-through: Next, or the right arrow, Space, Enter or Page Down.
  function waitForNext(fn) {
    var run = state.run;
    var from = Date.now();
    stepNext.hidden = false;
    state.onNext = function () {
      if (run !== state.run || Date.now() - from < NEXT_GUARD_MS) return;
      state.onNext = null;
      stepNext.hidden = true;
      stepNext.blur();
      fn();
    };
  }
  stepNext.addEventListener('click', function () { if (state.onNext) state.onNext(); });
  document.addEventListener('keydown', function (e) {
    if (!state.onNext) return;
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter' || e.key === 'PageDown') {
      e.preventDefault();
      state.onNext();
    }
  });

  function clearScreen() {
    screenEl.hidden = true;
    screenEl.innerHTML = '';
    stepNext.hidden = true;
    state.onNext = null;
    hideCursor();
  }

  function findSequence(id) {
    var key = String(id).trim().toLowerCase();
    for (var k in SEQUENCES) {
      if (Object.prototype.hasOwnProperty.call(SEQUENCES, k) && k.toLowerCase() === key) return SEQUENCES[k];
    }
    return null;
  }

  /* ---------- User ID ----------
   * Over http(s) the ID is looked up in the CMS first (data/cms.js), so a user
   * made or changed there works straight away; on SAGA that is the CMS next
   * to the demo. Whatever the CMS hasn't got, the ID or its sequence, comes
   * from the demo's own configs.js and sequences.js, which are also the only
   * source from file:// and when the CMS can't be reached.
   */
  var CMS_TIMEOUT_MS = 6000;  // a CMS that hasn't answered by then counts as down

  // The CMS's address, ending in a slash, or null for none. ?cms= overrides
  // data/cms.js for testing, and ?cms=off turns it off.
  function cmsBase() {
    var setting = PARAMS.has('cms') ? PARAMS.get('cms') : window.TI_CMS;
    if (!setting || setting === 'off' || !window.fetch) return null;
    var url;
    try { url = new URL(setting, window.location.href); } catch (e) { return null; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href.replace(/\/*$/, '/');
  }

  // Resolves to { config, sequence } from the CMS (sequence null if it has
  // none), or null if it hasn't got the ID. Rejects if it can't be reached.
  function fromCms(base, id) {
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, CMS_TIMEOUT_MS);
    function get(path) {
      return fetch(base + path, { cache: 'no-store', signal: ctl ? ctl.signal : undefined }).then(function (r) {
        if (r.status === 404) return null;
        if (!r.ok) throw new Error('The CMS answered ' + r.status);
        return r.json();
      });
    }
    // The CMS matches IDs case by case, so a miss checks its whole list,
    // ignoring case, as the lookup in configs.js does.
    return get('api/config/' + encodeURIComponent(id)).then(function (config) {
      if (config) return config;
      return get('api/configs').then(function (all) {
        var key = id.toLowerCase();
        return (all || []).filter(function (c) { return String(c.user_id).toLowerCase() === key; })[0] || null;
      });
    }).then(function (config) {
      if (!config) return null;
      return get('api/sequence/' + encodeURIComponent(config.user_id)).then(function (sequence) {
        return { config: config, sequence: sequence };
      });
    }).then(function (found) {
      clearTimeout(timer);
      return found;
    }, function (err) {
      clearTimeout(timer);
      throw err;
    });
  }

  function findConfig(id) {
    var key = id.trim().toLowerCase();
    for (var i = 0; i < CONFIGS.length; i++) {
      if (String(CONFIGS[i].user_id).toLowerCase() === key) return CONFIGS[i];
    }
    return null;
  }

  var form = document.getElementById('userid-form');
  var input = document.getElementById('userid');
  var error = document.getElementById('userid-error');
  var submitBtn = form.querySelector('[type="submit"]');

  function showError(msg) {
    error.textContent = msg;
    input.classList.add('is-invalid');
    input.focus();
  }
  input.addEventListener('input', function () {
    error.textContent = '';
    input.classList.remove('is-invalid');
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (state.busy) return;
    var id = input.value.trim();
    if (!id) { showError('Please enter your user ID.'); return; }
    state.busy = true;
    var cms = cmsBase();
    if (!cms) { start(id, null); return; }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Checking...';
    fromCms(cms, id).then(function (found) {
      start(id, found || {});
    }, function (err) {
      if (window.console) console.warn("Couldn't reach the CMS, so the demo's own data is used.", err);
      start(id, { down: true });
    });
  });

  // found: what the CMS had ({ config, sequence }), {} if it hasn't got the
  // ID, { down: true } if it couldn't be reached, or null if it wasn't asked.
  function start(id, found) {
    found = found || {};
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit';
    var config = found.config || findConfig(id);
    if (!config) {
      state.busy = false;
      showError(found.down
        ? "We couldn't reach the CMS to check that user ID. Check the connection and try again."
        : "We couldn't find that user ID. Check it and try again.");
      return;
    }
    var sequence = found.sequence || findSequence(config.user_id);
    state.source = {
      config: found.config ? 'CMS' : 'Demo data files',
      sequence: found.sequence ? 'CMS' : sequence ? 'Demo data files' : 'None'
    };
    state.config = config;
    prepare(config, sequence);
    begin();
  }

  function showNext(note) {
    var c = state.config;
    var rows = [
      ['User ID', c.user_id],
      ['Environment', LABELS.location[c.location] || c.location],
      ['Solution', LABELS.solution[c.solution] || c.solution],
      ['Login method', LABELS.login_type[c.login_type] || c.login_type],
      ['Config from', state.source.config],
      ['Sequence from', state.source.sequence]
    ];
    document.getElementById('next-config').innerHTML = rows.map(function (r) {
      return '<dt>' + escapeHtml(r[0]) + '</dt><dd>' + escapeHtml(r[1]) + '</dd>';
    }).join('');
    document.getElementById('next-note').textContent = note;
    goTo('slide-next');
    // Reaching the end of what is built counts as complete for now.
    if (window.TIScorm) window.TIScorm.complete();
  }

  /* ---------- Buttons ---------- */
  document.getElementById('btn-start').addEventListener('click', function () {
    goTo('slide-userid');
    setTimeout(function () { input.focus(); }, FADE_MS + 30);
  });
  document.getElementById('btn-restart').addEventListener('click', function () {
    state.run += 1;
    state.busy = false;
    state.config = null;
    input.value = '';
    ['env-media', 'zoom-media', 'login-media', 'take-media', 'return-media'].forEach(function (id) { document.getElementById(id).innerHTML = ''; });
    device.hidden = true;
    clearScreen();
    resetPan();
    goTo('slide-title');
  });

  /* ---------- Helpers ---------- */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  /* ---------- Boot ---------- */
  if (window.TIScorm) window.TIScorm.init();
  loopFor['slide-title'] = slots.title = createSlot(document.querySelector('[data-slot="title_bg"]'), MEDIA.title_bg, 'title_bg');
  loopFor['slide-userid'] = slots.userid = createSlot(document.querySelector('[data-slot="userid_bg"]'), MEDIA.userid_bg, 'userid_bg');
  startLoop(slots.title);

  // ?userid=TI pre-fills the ID, for testing
  var pre = PARAMS.get('userid');
  if (pre) input.value = pre;

  window.TIDemo = { state: state, slots: slots, goTo: goTo };
})();
