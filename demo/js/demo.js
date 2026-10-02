/*
 * Tooling Intelligence product demo, HTML player.
 *
 * Flow so far:
 *   title > user ID > environment clip > End frame slides across to the product
 *   > zoom to screen > device login screen
 *   > (badge and barcode only) physical login clip > stub
 *
 * Classic scripts only (no modules), so it runs from file:// and in an LMS.
 */
(function () {
  'use strict';

  var MEDIA = window.TI_MEDIA || {};
  var CONFIGS = window.TI_CONFIGS || [];

  var PLACEHOLDER_SECONDS = 4;   // a missing clip continues after this
  var LOAD_TIMEOUT_MS = 12000;   // a clip that never loads is treated as missing
  var FADE_MS = 450;             // matches .slide transition in demo.css
  // The hand-off from the environment to the zoom. Keep in step with demo.css.
  var SWAP_MS = 200;             // video's last frame crossfades to the slide image
  var HOLD_MS = 300;             // pause on the two products
  var SLIDE_MS = 1500;           // slide image moves across to the product
  var SETTLE_MS = 200;           // pause on the product before the zoom
  var ZOOM_FADE_MS = 500;        // slide image crossfades to the zoom's first frame
  var TYPE_DELAY_MS = 110;       // per character, typed logins

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

  var state = { slide: 'slide-title', config: null, run: 0, busy: false };
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

  function prepare(config) {
    var env = (MEDIA.environments || {})[config.location] || {};
    // Which product's media to use. See stand_in in media.js.
    var sol = (MEDIA.stand_in || {})[config.solution] || config.solution;
    state.mediaSolution = sol;
    slots.env = createSlot(document.getElementById('env-media'), env, 'env');
    slots.zoom = createSlot(zoomMedia, (MEDIA.zoom || {})[sol], 'zoom');

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

    var screen = (MEDIA.login_screen || {})[sol];
    device.hidden = true;
    fieldText.textContent = '';
    field.classList.remove('is-typing');
    // With no custom welcome message, the clip's own last frame is used, so
    // the cut from video to HTML is invisible. A custom message uses the
    // clean still with the text set in HTML.
    if (screen) {
      if (config.welcome_message) {
        plate.src = screen.clean;
        welcome.textContent = config.welcome_message;
      } else {
        plate.src = screen.frame;
        welcome.textContent = '';
      }
    }
    state.hasScreen = !!screen;
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
    later(900, login);
  }

  function login() {
    var type = state.config.login_type;
    if (type === 'login_no_password' || type === 'login_with_password') {
      typeInto(String(state.config.user_id), function () {
        later(400, function () {
          enterBtn.classList.add('is-pressed');
          later(250, function () {
            enterBtn.classList.remove('is-pressed');
            later(500, function () {
              showNext(type === 'login_with_password'
                ? 'The password screen is the next part to build.'
                : 'The screens after login are the next part to build.');
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
        playClip(slots.login, function () { showNext('The screens after login are the next part to build.'); });
      });
    });
  }

  function typeInto(text, done) {
    field.classList.add('is-typing');
    var i = 0;
    (function step() {
      if (i >= text.length) { field.classList.remove('is-typing'); done(); return; }
      fieldText.textContent += text.charAt(i++);
      later(TYPE_DELAY_MS, step);
    })();
  }

  /* ---------- User ID ---------- */
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
    var config = findConfig(id);
    if (!config) { showError("We couldn't find that user ID. Check it and try again."); return; }
    state.busy = true;
    state.config = config;
    prepare(config);
    begin();
  });

  function showNext(note) {
    var c = state.config;
    var rows = [
      ['User ID', c.user_id],
      ['Environment', LABELS.location[c.location] || c.location],
      ['Solution', LABELS.solution[c.solution] || c.solution],
      ['Login method', LABELS.login_type[c.login_type] || c.login_type]
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
    ['env-media', 'zoom-media', 'login-media'].forEach(function (id) { document.getElementById(id).innerHTML = ''; });
    device.hidden = true;
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
  var pre = new URLSearchParams(window.location.search).get('userid');
  if (pre) input.value = pre;

  window.TIDemo = { state: state, slots: slots, goTo: goTo };
})();
