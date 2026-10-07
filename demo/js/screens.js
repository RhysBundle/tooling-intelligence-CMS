/*
 * Device screens for the sequence, as HTML.
 *
 * Each event type that has a screen gets one here, built from the phase 1
 * artwork. Positions are in the artwork's own pixels (the 1024x768 SupplyPro
 * UI); css/screens.css widens them to the render's 16:9 screen.
 *
 * The screens are static. What moves is marked with data attributes, and
 * demo.js plays it with its own timers so "Start again" can cancel it:
 *   data-tap           pressed first on arrival, such as Product Category
 *   data-type="text"   typed in on arrival, on the keyboard named by data-kbd
 *                      (text or num) with data-kbd-label above its field
 *   data-auto          with data-type: filled in by the device, all at once
 *                      and with no cursor, such as a scan or a scale reading
 *   data-before        shown until the typing is done
 *   data-after         shown once the typing is done
 *   data-pick          picked (highlighted) on arrival
 *   data-press         pressed on the way to the next step
 *   data-logout        the rail's Logout button, pressed by a log out step
 *
 * A screen can be two whole screens, data-before and data-after, when a tap
 * moves the device on to another screen within one step.
 *
 * Products come from shared/catalogue.js, which must load first, then
 * shared/event-types.js.
 */
window.TIScreens = (function () {
  'use strict';

  var Cat = window.TICatalogue;
  var Ev = window.TIEvents;

  var ROWS = 6;        // rows that fit the result list
  var ROW_PITCH = 94;  // row top to row top, artwork px

  // Upper rail on the Select Product list. The rest of the screens only have
  // Admin Menu and Logout at the bottom.
  var LIST_RAIL = ['Transactions', 'Find Elsewhere', 'Special<br>Order', 'Product<br>Category', 'Return to Start'];
  var RAIL_TOPS = [121, 188, 257, 325, 394];

  var DEVICE_NAMES = { smartdrawer: 'SmartDrawer', supplysystem: 'SupplySystem' };

  // The work areas on the phase 1 allocation screen (08_Search_3). The CMS
  // has no list of codes, so both allocation prompts offer these. The first
  // prompt of a kind picks the first code, the next the second, and so on, so
  // a run of prompts does not look like the same screen again.
  var ALLOC_CODES = ['C26', 'K5', 'K6'];
  var ALLOC_PITCH = 67;  // row top to row top, artwork px
  var CAT_ROWS = 3;      // category rows that fit the list
  var CAT_PITCH = 98;

  // Placeholder line drawings by product type, until TI send photos.
  var THUMBS = {
    cutting_tool: '<svg viewBox="0 0 52 40" fill="none" stroke="#666" stroke-width="1.6"><path d="M6 20h10M16 12h22l8 8-8 8H16z"/><path d="M20 12v16M26 12v16M32 12v16"/></svg>',
    hand_tool: '<svg viewBox="0 0 52 40" fill="none" stroke="#666" stroke-width="1.6"><rect x="8" y="14" width="30" height="12" rx="2"/><path d="M38 20h8M12 14v12"/></svg>',
    fastener: '<svg viewBox="0 0 52 40" fill="none" stroke="#666" stroke-width="1.6"><circle cx="20" cy="20" r="9"/><circle cx="20" cy="20" r="3.5"/><path d="M32 20h14"/></svg>',
    ppe_item: '<svg viewBox="0 0 52 40" fill="none" stroke="#666" stroke-width="1.6"><path d="M26 8l14 5v10c0 7-7 11-14 13-7-2-14-6-14-13V13z"/></svg>',
    grinding_disc: '<svg viewBox="0 0 52 40" fill="none" stroke="#666" stroke-width="1.6"><circle cx="26" cy="20" r="13"/><circle cx="26" cy="20" r="4"/></svg>',
    handheld_scanner: '<svg viewBox="0 0 52 40" fill="none" stroke="#666" stroke-width="1.6"><rect x="16" y="6" width="20" height="22" rx="2"/><path d="M20 30h12v5H20zM20 11h12M20 16h12"/></svg>'
  };

  var X_ICON = '<svg viewBox="0 0 34 34"><path d="M11 11l12 12M23 11L11 23" stroke="#d6050a" stroke-width="3.2" stroke-linecap="square"/></svg>';
  var UP_ICON = '<svg viewBox="0 0 32 32"><path d="M10 19l6-6 6 6" fill="none" stroke="#7a7a7a" stroke-width="2.4"/></svg>';
  var DOWN_ICON = '<svg viewBox="0 0 32 32"><path d="M10 13l6 6 6-6" fill="none" stroke="#7a7a7a" stroke-width="2.4"/></svg>';

  // Take: black dot with a red arrow leaving it. Return: red dot with a black
  // arrow going into it. As drawn on the knobs in the artwork, in the knob's
  // own 109px box.
  var KNOB_ICON = {
    take: '<svg viewBox="0 0 109 109"><circle cx="55.5" cy="29.5" r="9.5" fill="#1a1a1a" stroke="#fff" stroke-width="1.2"/>' +
      '<path d="M55.5 10.5l8 7.5h-4.2v9h-7.6v-9h-4.2z" fill="#d6141c"/></svg>',
    'return': '<svg viewBox="0 0 109 109"><circle cx="56" cy="21" r="10" fill="#d0141c" stroke="#fff" stroke-width="1.2"/>' +
      '<path d="M56 24.5l7 6.5h-3.2v7.5h-7.6v-7.5h-3.2z" fill="#1a1a1a" stroke="#fff" stroke-width=".8"/></svg>'
  };

  // Where the logo is, relative to the page using these screens.
  var api = { base: '' };

  /* ---------- Shared parts ---------- */

  // opts.tap: which upper rail button is tapped on arrival.
  // opts.attrs: attributes for the screen itself, such as data-before.
  function chrome(title, panel, upperRail, opts) {
    opts = opts || {};
    var rail = (upperRail || []).map(function (label, k) {
      return '<div class="scr-btn scr-rail-btn" style="top:' + RAIL_TOPS[k] + 'px"' + (k === opts.tap ? ' data-tap' : '') + '>' + label + '</div>';
    }).join('');
    return '<div class="scr"' + (opts.attrs || '') + '>' +
      '<div class="scr-title"><span class="scr-title-text">' + esc(title) + '</span>' +
        '<img class="scr-logo" src="' + api.base + 'assets/img/ti-logo.png" alt=""></div>' +
      '<div class="scr-redline"></div>' +
      '<div class="scr-panel">' + panel + '</div>' +
      rail +
      '<div class="scr-btn scr-rail-btn scr-rail-low" style="top:620px">Admin<br>Menu</div>' +
      '<div class="scr-btn scr-rail-btn scr-rail-low" style="top:689px" data-logout>Logout</div>' +
    '</div>';
  }

  // The name, menu number, part number and unit of issue block at the top of
  // every screen about one product.
  function productHead(p, itemCode) {
    p = p || {};
    return '<div class="scr-ph-name">' + esc(p.name) + '</div>' +
      '<div class="scr-ph-menu">Menu#:' + esc(p.menu) + '</div>' +
      '<div class="scr-ph-pn">P/N:&nbsp; <b>' + esc(p.pn) + '</b></div>' +
      '<div class="scr-ph-uoi">Unit of Issue:&nbsp; <b>' + esc(p.uoi) + '</b></div>' +
      (itemCode ? '<div class="scr-ph-code">Item Code:</div>' : '') +
      '<div class="scr-ph-rule"></div>';
  }

  function bigButton(label, side, press) {
    return '<div class="scr-btn scr-big-btn scr-big-' + side + '"' + (press ? ' data-press' : '') + '>' + esc(label) + '</div>';
  }

  // The FIND field. With typed set, the runner types the query in; without
  // it, the query is shown already entered and selected, as the device leaves
  // it after a search.
  function findRow(query, typed) {
    var text = '';
    if (typed && query) text = '<span class="scr-text" data-type="' + esc(query) + '" data-kbd="text"></span>';
    else if (query) text = '<span class="scr-text is-selected">' + esc(query) + '</span>';
    return '<div class="scr-find-label">FIND:</div>' +
      '<div class="scr-field scr-find">' + text + '</div>' +
      '<div class="scr-x">' + X_ICON + '</div>';
  }

  function row(p, k, picked) {
    return '<div class="scr-row" style="top:' + (k * ROW_PITCH) + 'px"' + (picked ? ' data-pick data-press' : '') + '>' +
      '<div class="scr-row-thumb">' + (THUMBS[p.type] || THUMBS.hand_tool) + '</div>' +
      '<div class="scr-row-name">' + esc(p.name) + '</div>' +
      '<div class="scr-row-pn">P/N: <b>' + esc(p.pn) + '</b></div>' +
      '<div class="scr-row-qty">Current qty: ' + esc(p.qty) + ' ' + esc(p.uoi) + '</div>' +
      '<div class="scr-row-dev">Device Type: ' + esc(DEVICE_NAMES[p.device] || '') + '</div>' +
      '<div class="scr-pip scr-pip-t">T</div><div class="scr-pip scr-pip-r">R</div>' +
    '</div>';
  }

  function list(products, pickId, attr) {
    return '<div class="scr-list"' + (attr || '') + '>' +
      products.slice(0, ROWS).map(function (p, k) { return row(p, k, p.id === pickId); }).join('') +
    '</div>';
  }

  function scrollRail() {
    return '<div class="scr-scroll">' +
      '<div class="scr-scroll-btn scr-scroll-up">' + UP_ICON + '</div>' +
      '<div class="scr-scroll-thumb"></div>' +
      '<div class="scr-scroll-btn scr-scroll-down">' + DOWN_ICON + '</div>' +
    '</div>';
  }

  /* ---------- Screens ---------- */

  // Search: the full list, then the query is typed into FIND and the list
  // narrows to the results.
  function search(step) {
    var query = (step.text || {}).query || '';
    var lists = query
      ? list(Cat.search(''), null, ' data-before') + list(Cat.search(query), null, ' data-after hidden')
      : list(Cat.search(''), null);
    return chrome('Select Product',
      findRow(query, true) + '<div class="scr-listbox">' + lists + '</div>' + scrollRail(),
      LIST_RAIL);
  }

  // Select: the results of the search before it, with the product picked.
  function select(step, ctx) {
    var prev = precedingSearch(ctx.steps, ctx.index);
    var byCategory = prev && (prev.params || {}).mode === 'category_page';
    var query = prev && !byCategory ? (prev.text || {}).query || '' : '';
    var pool = ctx.results || (byCategory ? Cat.inCategory(prev.params.category) : Cat.search(query));
    var p = ctx.product;
    return chrome('Select Product',
      findRow(query, false) + '<div class="scr-listbox">' + list(promote(pool, p), p && p.id) + '</div>' + scrollRail(),
      LIST_RAIL);
  }

  // Take or return, chosen with the two knobs.
  function action(step, ctx) {
    var chosen = (step.params || {}).action === 'return' ? 'return' : 'take';
    function knob(kind, label) {
      return '<div class="scr-knob scr-knob-' + kind + '"' + (kind === chosen ? ' data-pick data-press' : '') + '>' +
        '<span class="scr-knob-icon">' + KNOB_ICON[kind] + '</span><span class="scr-knob-label">' + label + '</span></div>';
    }
    return chrome('Select Product',
      productHead(ctx.product, true) +
      '<div class="scr-action-label">Select an action:</div>' +
      knob('take', 'Take') + knob('return', 'Return') +
      bigButton('Back', 'left'),
      null);
  }

  // The Take screen: current quantity, and the quantity being taken typed in.
  function quantity(step, ctx) {
    var t = step.text || {};
    var p = ctx.product || {};
    var line = String(t.prompt || '').trim() || (p.loc ? 'Open location door ' + p.loc + '.' : '');
    return chrome('Take',
      productHead(p, false) +
      '<div class="scr-instruction">' + esc(line) + '</div>' +
      '<div class="scr-qty-label scr-qty-label-current">Current Quantity:</div>' +
      '<div class="scr-field scr-qty-field scr-qty-current"><span class="scr-text">' + esc(p.qty) + '</span></div>' +
      '<div class="scr-qty-label scr-qty-label-enter">Enter Quantity:</div>' +
      '<div class="scr-field scr-qty-field scr-qty-enter"><span class="scr-text" data-type="' + esc(t.quantity) + '" data-kbd="num" data-kbd-label="Enter Quantity:"></span></div>' +
      bigButton('Back', 'left') + bigButton('Continue', 'right', true),
      null);
  }

  // Login and product allocation codes, as 08_Search_3 and 3A, with the
  // step's prompt as the heading. Picked from the list, then Next. A scan
  // fills FIND and the list narrows to the code, already picked.
  function allocation(step, ctx) {
    var t = step.text || {};
    var scan = (step.params || {}).input_mode === 'barcode';
    var before = (ctx.steps || []).slice(0, ctx.index || 0).filter(function (s) { return s.type === step.type; }).length;
    var code = ALLOC_CODES[before % ALLOC_CODES.length];
    function codes(only, picked, attr) {
      var shown = only ? [code] : ALLOC_CODES;
      return '<div class="scr-opts"' + (attr || '') + '>' + shown.map(function (c, k) {
        var mine = c === code;
        return '<div class="scr-opt' + (mine && picked ? ' is-picked' : '') + '" style="top:' + (k * ALLOC_PITCH) + 'px"' +
          (mine && !scan ? ' data-pick' : '') + '>' + esc(c) + '</div>';
      }).join('') + '</div>';
    }
    var find = scan ? '<span class="scr-text" data-type="' + esc(code) + '" data-auto></span>' : '';
    return chrome(step.type === 'product_allocation_code' ? 'Product Allocation Code' : 'Login Allocation Code',
      '<div class="scr-heading">' + esc(t.prompt) + '</div>' +
      '<div class="scr-find-label scr-pick-find-label scr-bold">FIND:</div>' +
      '<div class="scr-field scr-pick-find">' + find + '</div>' +
      '<div class="scr-x scr-pick-x">' + X_ICON + '</div>' +
      '<div class="scr-optbox scr-alloc-box">' +
        (scan ? codes(false, false, ' data-before') + codes(true, true, ' data-after hidden') : codes(false, false)) +
      '</div>' +
      (t.helper ? '<div class="scr-helper">' + esc(t.helper) + '</div>' : '') +
      bigButton('Back', 'left') + bigButton('Next', 'right', true),
      null);
  }

  // Category browse. Product Category is pressed on the full Select Product
  // list, then the category is picked on the Product Category page
  // (08_Search_5, 5B), which leads to its products. The list shows the
  // three rows around the category, scrolled as the device would.
  function category(step) {
    var want = (step.params || {}).category;
    var cats = [{ id: '', name: 'All Products', description: '' }].concat(Cat.CATEGORIES);
    var at = 0;
    cats.forEach(function (c, k) { if (c.id === want) at = k; });
    var first = Math.max(0, Math.min(at - 1, cats.length - CAT_ROWS));
    var rows = cats.slice(first, first + CAT_ROWS).map(function (c, k) {
      return '<div class="scr-opt scr-cat" style="top:' + (k * CAT_PITCH) + 'px"' + (c.id === want ? ' data-pick data-press' : '') + '>' +
        '<span class="scr-cat-k">Name:</span><span class="scr-cat-v">' + esc(c.name) + '</span>' +
        '<span class="scr-cat-k scr-cat-low">Description:</span><span class="scr-cat-v scr-cat-low">' + esc(c.description) + '</span>' +
      '</div>';
    }).join('');
    // The thumb's share of the track is the share of rows on show.
    var track = 249;
    var thumb = Math.round(track * CAT_ROWS / cats.length);
    var thumbTop = 33 + Math.round((track - thumb) * first / Math.max(1, cats.length - CAT_ROWS));
    var listScreen = chrome('Select Product',
      findRow('', false) + '<div class="scr-listbox">' + list(Cat.search(''), null) + '</div>' + scrollRail(),
      LIST_RAIL, { tap: 3, attrs: ' data-before' });
    var catScreen = chrome('Product Category',
      '<div class="scr-heading">Select a Product Category</div>' +
      '<div class="scr-find-label scr-pick-find-label">FIND:</div>' +
      '<div class="scr-field scr-pick-find"></div>' +
      '<div class="scr-x scr-pick-x">' + X_ICON + '</div>' +
      '<div class="scr-optbox scr-cat-box"><div class="scr-opts">' + rows + '</div></div>' +
      '<div class="scr-scroll scr-cat-scroll">' +
        '<div class="scr-scroll-btn scr-scroll-up">' + UP_ICON + '</div>' +
        '<div class="scr-scroll-thumb" style="top:' + thumbTop + 'px;height:' + thumb + 'px"></div>' +
        '<div class="scr-scroll-btn scr-scroll-down">' + DOWN_ICON + '</div>' +
      '</div>' +
      '<div class="scr-btn scr-big-btn scr-cat-return">Return</div>',
      null, { attrs: ' data-after hidden' });
    return listScreen + catScreen;
  }

  // The device's message box (Message.bmp, 05_CheckOut_9): the screen goes
  // flat behind a white box with OK. Used for the loan period, information
  // windows and confirmations.
  function dialog(title, body) {
    return '<div class="scr scr-dim"><div class="scr-dlg">' +
      '<div class="scr-dlg-text">' +
        (title ? '<div class="scr-dlg-title">' + esc(title) + '</div>' : '') +
        '<div class="scr-dlg-body">' + esc(body) + '</div>' +
      '</div>' +
      '<div class="scr-btn scr-dlg-ok" data-press>OK</div>' +
    '</div></div>';
  }

  // The loan period, worded as the device words it after a take.
  function loanPeriod(step) {
    var period = String((step.text || {}).period || '').trim();
    return dialog('', period ? 'Must be returned in ' + period + '.' : '');
  }

  // A screen that tells the operator what to do next, as 05_CheckOut_8: the
  // product, a centred instruction and Back. The device moves on by itself
  // once it is done, so nothing is pressed.
  function instruction(title, p, line, extra, high) {
    return chrome(title,
      productHead(p, true) +
      '<div class="scr-say' + (high ? ' scr-say-high' : '') + '">' + esc(line) + '</div>' +
      (extra || '') +
      bigButton('Back', 'mid'),
      null);
  }

  // No phase 1 screen exists for the cradle, so it is an instruction screen.
  function scanner(step, ctx) {
    var t = step.text || {};
    var from = (step.params || {}).direction !== 'to_cradle';
    var line = String(t.message || '').trim() ||
      (from ? 'Lift the scanner from its cradle.' : 'Return the scanner to its cradle.');
    return instruction('Handheld Scanner', ctx.product, line);
  }

  // A Scale location: the instruction, then the device's own scale icon,
  // red and shaking while it weighs, green once the reading settles.
  function scale(step, ctx) {
    var t = step.text || {};
    var line = String(t.message || '').trim() || 'Place the items on the scale.';
    var icon = '<div class="scr-scale-icon" data-before>' +
        '<img src="' + api.base + 'assets/img/scale-weighing-1.png" alt="">' +
        '<img class="scr-scale-alt" src="' + api.base + 'assets/img/scale-weighing-2.png" alt="">' +
      '</div>' +
      '<div class="scr-scale-icon" data-after hidden><img src="' + api.base + 'assets/img/scale-settled.png" alt=""></div>' +
      '<div class="scr-scale-label">Weight:</div>' +
      '<div class="scr-field scr-qty-field scr-scale-field"><span class="scr-text" data-type="' + esc(t.weight) + '" data-auto></span></div>';
    return instruction('Scale Location', ctx.product, line, icon, true);
  }

  // Any event type without its own screen yet. Says so, rather than guessing.
  function placeholder(step) {
    var type = Ev.get(step.type);
    var t = step.text || {};
    var lines = Object.keys(t).filter(function (k) { return String(t[k]).trim(); }).map(function (k) {
      return '<div class="scr-todo-line">' + esc(t[k]) + '</div>';
    }).join('');
    return chrome(type ? type.label : step.type,
      '<div class="scr-todo">' +
        '<div class="scr-todo-kicker">Screen not built yet</div>' +
        '<div class="scr-todo-title">' + esc(Ev.describe(step)) + '</div>' +
        lines +
      '</div>',
      null);
  }

  /* ---------- On-screen keyboard ----------
   * The device's keyboard and number pad (05_CheckOut_5, 09_TakeButton_7,
   * and the device's own keyboard-international.bmp and keyboard-num.bmp).
   * Each key carries data-key: the character it types, or shift, caps or
   * done (the Enter beside Cancel). A key given as [label, width, data-key]
   * is wider than the 73px letter keys; [null, width] is a gap.
   */
  var KEY_ROWS = [
    { indent: 0, keys: ['‘', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '*', '#'] },
    { indent: 0, keys: ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\\'] },
    { indent: 37, keys: ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', ',', ['Enter', 113, 'return']] },
    { indent: 0, keys: ['\\', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', ['Shift', 149, 'shift']] },
    { indent: 0, keys: [['Caps Lock', 145, 'caps'], [null, 42], ['', 602, ' '], [null, 39], ['AltGr', 146, 'altgr']] }
  ];
  var PAD_X = [7, 104, 200];       // number pad columns, in its tray
  var PAD_Y = [8, 88, 169, 249];   // and rows
  var ROW_Y = [7, 88, 169, 250, 332];  // keyboard rows, in the tray

  function keyRow(row, r) {
    return '<div class="kbd-row" style="top:' + ROW_Y[r] + 'px;left:' + (6 + row.indent) + 'px">' + row.keys.map(function (k) {
      var label = k, width = 73, key = k;
      if (typeof k !== 'string') { label = k[0]; width = k[1]; key = k[2]; }
      if (label === null) return '<div style="flex:' + width + ' 1 0"></div>';
      var letter = /^[a-z]$/.test(key) ? ' kbd-letter' : '';
      return '<div class="kbd-key' + letter + '" style="flex:' + width + ' 1 0" data-key="' + esc(key) + '">' + esc(label) + '</div>';
    }).join('') + '</div>';
  }

  /* The keyboard ('text') or number pad ('num') screen, with the field's
   * label. demo.js types into .kbd-out. */
  api.keyboard = function (kind, label) {
    var num = kind === 'num';
    var body = num
      ? '<div class="kbd-group kbd-pad">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map(function (d, k) {
          return '<div class="kbd-key" style="left:' + PAD_X[k % 3] + 'px;top:' + PAD_Y[Math.floor(k / 3)] + 'px" data-key="' + d + '">' + d + '</div>';
        }).join('') + '</div>'
      : '<div class="kbd-group kbd-switch"><div class="kbd-key">Switch<br>Keyboard</div></div>' +
        '<div class="kbd-tray">' + KEY_ROWS.map(keyRow).join('') + '</div>';
    return '<div class="scr kbd kbd-' + (num ? 'num' : 'text') + '">' +
      '<div class="kbd-panel">' +
        (label ? '<div class="kbd-label">' + esc(label) + '</div>' : '') +
        '<div class="kbd-field"><span class="kbd-out"></span></div>' +
      '</div>' +
      body +
      '<div class="kbd-group kbd-edit"><div class="kbd-key kbd-l">Clear</div><div class="kbd-key kbd-r">Backspace</div></div>' +
      '<div class="kbd-group kbd-end"><div class="kbd-key kbd-l">Cancel</div><div class="kbd-key kbd-r" data-key="done">Enter</div></div>' +
    '</div>';
  };

  /* ---------- API ---------- */

  /* The screen for one step, as HTML.
   * ctx: { steps, index } and, for tools/screen-check.html only, product and
   * results to stand in for catalogue lookups. */
  api.build = function (step, ctx) {
    ctx = Object.assign({}, ctx);
    if (!ctx.product) ctx.product = Ev.selectedProductAt(ctx.steps || [step], ctx.index || 0);
    var t = step.text || {};
    switch (step.type) {
      case 'product_search':
        return (step.params || {}).mode === 'category_page' ? category(step) : search(step);
      case 'select_product': return select(step, ctx);
      case 'select_action': return action(step, ctx);
      case 'enter_quantity': return quantity(step, ctx);
      case 'login_allocation_code':
      case 'product_allocation_code': return allocation(step, ctx);
      case 'display_loan_period': return loanPeriod(step);
      case 'info_window': return dialog(t.title, t.body);
      case 'transaction_confirmation': return dialog('', t.message);
      case 'handheld_scanner_cradle': return scanner(step, ctx);
      case 'scale_transaction': return scale(step, ctx);
      default: return placeholder(step);
    }
  };

  /* Puts a screen straight into the state its arrival ends in, with no
   * timing. demo.js plays the same changes one at a time. */
  api.settle = function (el) {
    el.querySelectorAll('[data-type]').forEach(function (n) {
      n.textContent = n.getAttribute('data-type');
      if (!n.hasAttribute('data-auto')) n.classList.add('is-selected');
    });
    api.swap(el);
    el.querySelectorAll('[data-pick]').forEach(function (n) { n.classList.add('is-picked'); });
  };

  /* After the typing: hide what was there before, show the results. */
  api.swap = function (el) {
    el.querySelectorAll('[data-before]').forEach(function (n) { n.hidden = true; });
    el.querySelectorAll('[data-after]').forEach(function (n) { n.hidden = false; });
  };

  /* ---------- Helpers ---------- */

  // The product_search step a selection follows, if any.
  function precedingSearch(steps, i) {
    for (var k = (i || 0) - 1; k >= 0; k--) {
      if (steps[k] && steps[k].type === 'product_search') return steps[k];
    }
    return null;
  }

  // Bring the picked product into the visible rows without reordering the
  // rest, so the list still reads as a real result set.
  function promote(pool, p) {
    if (!p) return pool;
    var at = pool.indexOf(p);
    if (at >= 0 && at < ROWS) return pool;
    return [p].concat(pool.filter(function (q) { return q !== p; }));
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  return api;
})();
