/*
 * Minimal SCORM 1.2 wrapper. Does nothing when no LMS is found, so the
 * demo still runs from file:// or a plain web server.
 */
window.TIScorm = (function () {
  'use strict';

  var api = null;
  var active = false;
  var finished = false;

  function findApi(win) {
    var tries = 0;
    while (win && !win.API && win.parent && win.parent !== win && tries < 10) {
      win = win.parent;
      tries++;
    }
    return (win && win.API) || null;
  }

  function locate() {
    var found = null;
    try { found = findApi(window); } catch (e) {}
    if (!found) {
      try { if (window.opener) found = findApi(window.opener); } catch (e) {}
    }
    return found;
  }

  function set(key, value) {
    if (!active) return;
    try { api.LMSSetValue(key, value); } catch (e) {}
  }
  function commit() {
    if (!active) return;
    try { api.LMSCommit(''); } catch (e) {}
  }

  function init() {
    api = locate();
    if (!api) return false;
    try { active = String(api.LMSInitialize('')) === 'true'; } catch (e) { active = false; }
    if (!active) return false;

    var status = '';
    try { status = api.LMSGetValue('cmi.core.lesson_status'); } catch (e) {}
    if (status === 'not attempted' || status === '') {
      set('cmi.core.lesson_status', 'incomplete');
      commit();
    }
    return true;
  }

  function complete() {
    set('cmi.core.lesson_status', 'completed');
    commit();
  }

  function finish() {
    if (!active || finished) return;
    finished = true;
    set('cmi.core.exit', '');
    commit();
    try { api.LMSFinish(''); } catch (e) {}
  }

  window.addEventListener('beforeunload', finish);
  window.addEventListener('pagehide', finish);

  return { init: init, complete: complete, finish: finish, isActive: function () { return active; } };
})();
