/*
 * The instruction pop-ups: one line per step saying what the operator does
 * on it, shown at the bottom right while the step plays (setTip() in
 * demo.js). Worded from the step's type and settings, so nothing is filled
 * in per customer. A config with allow_instructions off shows none.
 *
 *   TIInstructions.step(step, { steps, index })
 *   TIInstructions.login(login_type)
 *   TIInstructions.clip('take' or 'return')
 *
 * Each returns the line, or '' for none.
 */
(function () {
  'use strict';

  var LOGIN = {
    rfid: 'Scan your RFID badge to log in.',
    barcode: 'Scan your barcode to log in.',
    // There is no password screen yet, so both typed logins read the same
    login_no_password: 'Enter your user ID to log in.',
    login_with_password: 'Enter your user ID to log in.'
  };

  // The take and return clips, and the door steps that play them
  var CLIP = {
    take: 'Take the item from its location, then close the door.',
    'return': 'Put the item back in its location, then close the door.'
  };

  var INFO = {
    quantity: 'Check the quantity left, then press OK.',
    lot_number: 'Check the lot number, then press OK.',
    custom: 'Read the message, then press OK.'
  };

  // Take or return, from the knobs at or before step i. The Take screen's
  // quantity is for either.
  function actionAt(steps, i) {
    for (var k = i; k >= 0; k--) {
      var s = steps[k];
      if (s.type === 'select_action') return (s.params || {}).action === 'return' ? 'return' : 'take';
      if (s.type === 'select_product' || s.type === 'product_search') break;
    }
    return 'take';
  }

  function step(s, ctx) {
    ctx = ctx || {};
    var steps = ctx.steps || [s];
    var i = ctx.index || 0;
    var p = s.params || {};
    var scan = p.input_mode === 'barcode';
    switch (s.type) {
      case 'login_allocation_code':
        return scan ? 'Scan the allocation code for your job.' : 'Pick the allocation code for your job, then press Next.';
      case 'product_allocation_code':
        return scan ? 'Scan the allocation code for this item.' : 'Pick the allocation code for this item, then press Next.';
      case 'display_loan_period':
        return 'Check when the item must be returned, then press OK.';
      case 'product_search':
        return p.mode === 'category_page' ? 'Press Product Category, then pick a category to browse.'
          : 'Enter text here to search for a product.';
      case 'select_product':
        var product = window.TIEvents && window.TIEvents.selectedProductAt(steps, i);
        return product ? 'Pick ' + product.name + ' from the results.' : 'Pick the product from the results.';
      case 'select_action':
        var back = p.action === 'return';
        if (p.control === 'hardware') return back ? 'Press the Return button on the device.' : 'Press the Take button on the device.';
        return back ? 'Press Return to put the item back.' : 'Press Take to take the item out.';
      case 'enter_quantity':
        return actionAt(steps, i) === 'return' ? 'Enter how many you are returning, then press Continue.'
          : 'Enter how many you are taking, then press Continue.';
      case 'info_window':
        return INFO[p.info_type] || INFO.custom;
      case 'transaction_confirmation':
        return 'Your transaction is complete. Press OK to carry on.';
      case 'open_pocket_take':
        return CLIP.take;
      case 'check_in':
        return CLIP['return'];
      case 'handheld_scanner_cradle':
        return p.direction === 'to_cradle' ? 'Put the scanner back in its cradle.' : 'Lift the scanner from its cradle.';
      case 'scale_transaction':
        return p.action === 'return' ? 'Put the items on the scale. It weighs what you return.'
          : 'Take the items from the scale. It weighs what you take.';
      case 'logout':
        return 'Press Logout when you have finished.';
    }
    // login_method is the config's login (TIInstructions.login), and an
    // event type added later has no line until it is given one here
    return '';
  }

  window.TIInstructions = {
    step: step,
    login: function (type) { return LOGIN[type] || ''; },
    clip: function (kind) { return CLIP[kind] || ''; }
  };
})();
