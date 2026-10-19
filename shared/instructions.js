/*
 * TI Storyline CMS - Instruction pop-ups
 * --------------------------------------
 * The line the demo shows at the bottom right while each step plays, saying
 * what the operator does on it. Every step has a default line, worded from
 * its type and settings. A step's Pop-up instruction in the sequence builder
 * replaces it for that user ID; blank keeps the default. Used by the demo
 * (setTip() in demo/js/demo.js) and by the sequence builder, which shows
 * each step's default as the field's placeholder. A plain <script> in the
 * browser after catalogue.js and event-types.js, required() in node.
 *
 * A line, default or custom, can use {product}, {search} and {quantity},
 * filled from the sequence at that step: the product selected, the latest
 * search term (or category browsed) and the latest quantity entered.
 *
 * The fields live in each step's text (added to every event type at the end
 * of event-types.js): instruction on every step, and clip_instruction on
 * select_action for the take or return clip that plays after it.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./event-types.js'), require('./catalogue.js'));
    } else {
        // catalogue.js and event-types.js must be loaded first.
        root.TIInstructions = factory(root.TIEvents, root.TICatalogue);
    }
})(typeof self !== 'undefined' ? self : this, function (TIEvents, TICatalogue) {
    'use strict';

    // Every default line, in sequence order, for the demo and for the list
    // TI review. id is how the code below picks one; when says where it shows.
    var DEFAULTS = [
        { id: 'login.rfid', step: 'login_method', when: 'Log in by RFID badge', text: 'Scan your RFID badge to log in.' },
        { id: 'login.barcode', step: 'login_method', when: 'Log in by barcode', text: 'Scan your barcode to log in.' },
        { id: 'login.typed', step: 'login_method', when: 'Typed log in, with or without a password', text: 'Enter your user ID to log in.' },
        { id: 'login.fingerprint', step: 'login_method', when: 'Log in by fingerprint (for later: no customer setup uses it yet)', text: 'Scan your fingerprint to log in.' },
        { id: 'login_allocation_code.list', step: 'login_allocation_code', when: 'Code picked from the list', text: 'Pick the allocation code for your job, then press Next.' },
        { id: 'login_allocation_code.barcode', step: 'login_allocation_code', when: 'Code scanned', text: 'Scan the allocation code for your job.' },
        { id: 'display_loan_period', step: 'display_loan_period', when: 'Loan period message', text: 'Check when the item must be returned, then press OK.' },
        { id: 'product_search.typed', step: 'product_search', when: 'Typed search', text: 'Enter text here to search for a product.' },
        { id: 'product_search.category', step: 'product_search', when: 'Category browse', text: 'Press Product Category, then pick a category to browse.' },
        { id: 'select_product', step: 'select_product', when: 'Picking the product from the results', text: 'Pick {product} from the results.' },
        { id: 'product_allocation_code.list', step: 'product_allocation_code', when: 'Code picked from the list', text: 'Pick the allocation code for this item, then press Next.' },
        { id: 'product_allocation_code.barcode', step: 'product_allocation_code', when: 'Code scanned', text: 'Scan the allocation code for this item.' },
        { id: 'select_action.take', step: 'select_action', when: 'Take, on-screen button', text: 'Press Take to take the item out.' },
        { id: 'select_action.return', step: 'select_action', when: 'Return, on-screen button', text: 'Press Return to put the item back.' },
        { id: 'select_action.take_hardware', step: 'select_action', when: 'Take, hardware button', text: 'Press the Take button on the device.' },
        { id: 'select_action.return_hardware', step: 'select_action', when: 'Return, hardware button', text: 'Press the Return button on the device.' },
        { id: 'enter_quantity.take', step: 'enter_quantity', when: 'Quantity for a take', text: 'Enter how many you are taking, then press Continue.' },
        { id: 'enter_quantity.return', step: 'enter_quantity', when: 'Quantity for a return', text: 'Enter how many you are returning, then press Continue.' },
        { id: 'clip.take', step: 'open_pocket_take', when: 'While the take clip plays: after Take is chosen, or on a Door open, item taken step', text: 'Take the item from its location, then close the door.' },
        { id: 'clip.return', step: 'check_in', when: 'While the return clip plays: after Return is chosen, or on a Check-in step', text: 'Put the item back in its location, then close the door.' },
        { id: 'info_window.quantity', step: 'info_window', when: 'Showing the quantity remaining', text: 'Check the quantity left, then press OK.' },
        { id: 'info_window.lot_number', step: 'info_window', when: 'Showing the lot number', text: 'Check the lot number, then press OK.' },
        { id: 'info_window.custom', step: 'info_window', when: 'Showing a custom message', text: 'Read the message, then press OK.' },
        { id: 'handheld_scanner_cradle.from', step: 'handheld_scanner_cradle', when: 'Taking the scanner from its cradle', text: 'Lift the scanner from its cradle.' },
        { id: 'handheld_scanner_cradle.to', step: 'handheld_scanner_cradle', when: 'Returning the scanner to its cradle', text: 'Put the scanner back in its cradle.' },
        { id: 'scale_transaction.take', step: 'scale_transaction', when: 'Taking from a Scale location', text: 'Take the items from the scale. It weighs what you take.' },
        { id: 'scale_transaction.return', step: 'scale_transaction', when: 'Returning to a Scale location', text: 'Put the items on the scale. It weighs what you return.' },
        { id: 'transaction_confirmation', step: 'transaction_confirmation', when: 'Confirmation message', text: 'Your transaction is complete. Press OK to carry on.' },
        { id: 'logout', step: 'logout', when: 'When Logout is pressed', text: 'Press Logout when you have finished.' }
    ];

    var TOKENS = ['{product}', '{search}', '{quantity}'];

    var TEXT = {};
    DEFAULTS.forEach(function (d) { TEXT[d.id] = d.text; });

    // The config's login types and the login step's methods, to their line
    var LOGIN = {
        rfid: 'login.rfid', barcode: 'login.barcode', fingerprint: 'login.fingerprint',
        login_no_password: 'login.typed', login_with_password: 'login.typed',
        typed: 'login.typed', typed_password: 'login.typed'
    };

    // Take or return, from the knobs at or before step i. The quantity
    // screen is the same for both.
    function actionAt(steps, i) {
        for (var k = Math.min(i, steps.length - 1); k >= 0; k--) {
            var s = steps[k] || {};
            if (s.type === 'select_action') return (s.params || {}).action === 'return' ? 'return' : 'take';
            if (s.type === 'select_product' || s.type === 'product_search') break;
        }
        return 'take';
    }

    // The id of step i's default line, or null if it has none.
    function defaultId(steps, i) {
        var s = steps[i];
        if (!s) return null;
        var p = s.params || {};
        var scan = p.input_mode === 'barcode';
        var back = p.action === 'return';
        switch (s.type) {
            case 'login_method': return LOGIN[p.method] || null;
            case 'login_allocation_code': return scan ? 'login_allocation_code.barcode' : 'login_allocation_code.list';
            case 'product_allocation_code': return scan ? 'product_allocation_code.barcode' : 'product_allocation_code.list';
            case 'display_loan_period': return 'display_loan_period';
            case 'product_search': return p.mode === 'category_page' ? 'product_search.category' : 'product_search.typed';
            case 'select_product': return 'select_product';
            case 'select_action':
                return 'select_action.' + (back ? 'return' : 'take') + (p.control === 'hardware' ? '_hardware' : '');
            case 'enter_quantity': return 'enter_quantity.' + actionAt(steps, i);
            case 'open_pocket_take': return 'clip.take';
            case 'check_in': return 'clip.return';
            case 'info_window': return TEXT['info_window.' + p.info_type] ? 'info_window.' + p.info_type : 'info_window.custom';
            case 'handheld_scanner_cradle': return p.direction === 'to_cradle' ? 'handheld_scanner_cradle.to' : 'handheld_scanner_cradle.from';
            case 'scale_transaction': return back ? 'scale_transaction.return' : 'scale_transaction.take';
            case 'transaction_confirmation': return 'transaction_confirmation';
            case 'logout': return 'logout';
        }
        // An event type added later has no line until it is given one here
        return null;
    }

    // Fills {product}, {search} and {quantity} from the sequence at step i.
    // Where the sequence has none yet, a plain phrase stands in.
    function fill(line, steps, i) {
        line = String(line || '');
        if (line.indexOf('{') < 0) return line;
        steps = steps || [];
        var product = TIEvents.selectedProductAt(steps, i);
        var search = null, quantity = null;
        for (var k = Math.min(i, steps.length - 1); k >= 0; k--) {
            var s = steps[k] || {};
            if (search === null && s.type === 'product_search') {
                var c = (s.params || {}).mode === 'category_page' && TICatalogue.category((s.params || {}).category);
                search = c ? c.name : String((s.text || {}).query || '').trim();
            }
            if (quantity === null && s.type === 'enter_quantity') quantity = String((s.text || {}).quantity || '').trim();
        }
        return line
            .replace(/\{product\}/gi, product ? product.name : 'the product')
            .replace(/\{search\}/gi, search || 'a product')
            .replace(/\{quantity\}/gi, quantity || 'the quantity');
    }

    function own(s, key) {
        return String(((s || {}).text || {})[key] || '').trim();
    }

    // Step i's default line as it will show, tokens filled. '' if none.
    function defaultFor(steps, i) {
        var id = defaultId(steps, i);
        return id ? fill(TEXT[id], steps, i) : '';
    }

    // The line for step i: its own Pop-up instruction if set, otherwise the
    // default. '' for none.
    function step(steps, i) {
        var custom = own(steps[i], 'instruction');
        return custom ? fill(custom, steps, i) : defaultFor(steps, i);
    }

    // The login, which plays as a clip before the sequence's screens. The
    // config's login type picks the default, as it picks the clip; the
    // sequence's log in step can reword it.
    function login(loginType, steps) {
        steps = steps || [];
        var first = steps[0];
        var custom = first && first.type === 'login_method' ? own(first, 'instruction') : '';
        if (custom) return fill(custom, steps, 0);
        return LOGIN[loginType] ? TEXT[LOGIN[loginType]] : '';
    }

    // The take or return clip that plays after step i. A door step (Door
    // open, item taken; Check-in) is the clip, so it has its own line.
    // Otherwise the clip belongs to the latest Take or Return choice, whose
    // clip pop-up can reword it.
    function clip(kind, steps, i) {
        steps = steps || [];
        var s = steps[i] || {};
        if (s.type === 'open_pocket_take' || s.type === 'check_in') return step(steps, i);
        var custom = '';
        for (var k = Math.min(i, steps.length - 1); k >= 0; k--) {
            var t = steps[k] || {};
            if (t.type === 'select_action') { custom = own(t, 'clip_instruction'); break; }
            if (t.type === 'select_product' || t.type === 'product_search') break;
        }
        return fill(custom || TEXT['clip.' + kind] || '', steps, i);
    }

    // The default clip line for a select_action step, for the builder.
    function clipDefault(steps, i) {
        var back = ((steps[i] || {}).params || {}).action === 'return';
        return fill(TEXT[back ? 'clip.return' : 'clip.take'], steps, i);
    }

    return {
        DEFAULTS: DEFAULTS,
        TOKENS: TOKENS,
        step: step,
        defaultFor: defaultFor,
        login: login,
        clip: clip,
        clipDefault: clipDefault,
        fill: fill
    };
});
