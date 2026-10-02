/*
 * TI Storyline CMS - Event type catalogue
 * ---------------------------------------
 * Single source of truth for the sequence builder (browser), the preview
 * player (browser) and the API validator (node). Loaded as a plain <script>
 * in the browser and required() on the server, so it must stay dependency
 * free and must not use ES module syntax. catalogue.js must load first.
 *
 * ARCHITECTURE, and it drives everything below
 * --------------------------------------------
 * A sequence has three parts, in this order:
 *
 *   1. 3D            the approach and the physical login action, ending on a
 *                    still of the device screen. One clip per login method.
 *   2. WEB OBJECT    every screen from post-login through to log out. No 3D
 *                    at all in here. The physical acts the operator performs
 *                    (opening a pocket lid, taking the item, lifting a scanner
 *                    off its cradle) are represented by what the DEVICE SCREEN
 *                    shows while they happen, not by a render of the hand.
 *   3. 3D            the closing sequence, entered when log out fires.
 *
 * So `stage` on each event type is not decoration, it tells Storyline whether
 * to be playing video or showing the Web Object. Only login_method is '3d'.
 * logout is the handback point: it is a Web Object screen that ends the
 * Web Object's turn.
 *
 * The consequence worth remembering: because the physical acts are screen
 * states rather than renders, nothing in a sequence multiplies by product type
 * or hardware type. A sequence costs its two bookend clips and nothing else.
 *
 * Each event type describes ONE selectable step:
 *
 *   id            stable key stored in the database, never change it
 *   label         what the CMS operator sees in the event library
 *   stage         3d | webobject, see above
 *   beat          true if this step represents a physical act happening off
 *                 screen while the device screen waits
 *   repeatable    may appear more than once in a sequence
 *   terminal      nothing may follow it
 *   requires      state flags that must already be true
 *   sets          state flags this step sets
 *   params        operator-chosen options, each with an enum of values
 *   text          operator-editable on-screen copy, each with a max length
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./catalogue.js'));
    } else {
        // catalogue.js must be loaded first.
        root.TIEvents = factory(root.TICatalogue);
    }
})(typeof self !== 'undefined' ? self : this, function (TICatalogue) {
    'use strict';

    // ----------------------------------------------------------------
    // Shared option lists
    // ----------------------------------------------------------------

    var INPUT_MODES = [
        { value: 'barcode', label: 'Barcode scan' },
        { value: 'select_from_list', label: 'Select from list' }
    ];

    // Kept because the catalogue tags every product with one, and the CMS
    // uses it to group and filter. No longer used for render counting.
    var PRODUCT_TYPES = [
        { value: 'cutting_tool', label: 'Cutting tool' },
        { value: 'ppe_item', label: 'PPE item' },
        { value: 'hand_tool', label: 'Hand tool' },
        { value: 'handheld_scanner', label: 'Handheld scanner' },
        { value: 'fastener', label: 'Fastener' },
        { value: 'grinding_disc', label: 'Grinding disc' }
    ];

    var HARDWARE = [
        { value: 'smartdrawer', label: 'SmartDrawer' },
        { value: 'supplysystem', label: 'SupplySystem' },
        { value: 'supplybay', label: 'SupplyBay (not in original spec)' }
    ];

    // ----------------------------------------------------------------
    // Event catalogue
    // ----------------------------------------------------------------

    var EVENT_TYPES = [
        {
            id: 'login_method',
            label: 'Log in',
            stage: '3d',
            note: 'The 3D clip covers the approach and the login action, and ends on a still of the device screen. The Web Object loads on the next step. Copy on the login screen belongs to the clip, so there is nothing to edit here.',
            repeatable: false,
            requires: [],
            sets: ['logged_in'],
            params: [
                {
                    key: 'method',
                    label: 'Login method',
                    values: [
                        { value: 'rfid', label: 'RFID badge scan', clip: 'existing' },
                        { value: 'barcode', label: 'Barcode scan', clip: 'existing' },
                        { value: 'typed', label: 'Typed, no password', clip: 'existing' },
                        { value: 'typed_password', label: 'Typed with password', clip: 'existing' },
                        { value: 'fingerprint', label: 'Fingerprint', clip: 'new' }
                    ]
                }
            ],
            text: []
        },
        {
            id: 'login_allocation_code',
            label: 'Login allocation code prompt',
            stage: 'webobject',
            repeatable: true,
            requires: ['logged_in'],
            sets: [],
            params: [
                { key: 'input_mode', label: 'Entry method', values: INPUT_MODES }
            ],
            text: [
                { key: 'prompt', label: 'Screen prompt', maxLength: 40, placeholder: 'Scan job card' },
                { key: 'helper', label: 'Helper line', maxLength: 60, optional: true }
            ]
        },
        {
            id: 'display_loan_period',
            label: 'Display loan period',
            stage: 'webobject',
            repeatable: true,
            requires: ['logged_in'],
            sets: [],
            params: [],
            text: [
                { key: 'title', label: 'Title', maxLength: 30, placeholder: 'Loan period' },
                { key: 'period', label: 'Period shown', maxLength: 30, placeholder: '7 days' }
            ]
        },
        {
            id: 'product_search',
            label: 'Search for a product',
            stage: 'webobject',
            repeatable: true,
            requires: ['logged_in'],
            sets: ['searched'],
            params: [
                {
                    key: 'mode',
                    label: 'Search route',
                    values: [
                        { value: 'typed', label: 'Typed search' },
                        { value: 'category_page', label: 'Category page browse' }
                    ]
                },
                {
                    key: 'category',
                    label: 'Category (category browse only)',
                    values: TICatalogue.categoryOptions()
                }
            ],
            text: [
                {
                    key: 'query', label: 'Typed search term', maxLength: 30,
                    placeholder: 'End mill', optional: true
                }
            ]
        },
        {
            id: 'select_product',
            label: 'Select a product',
            stage: 'webobject',
            note: 'Name, part number, unit of issue, quantity, device type, menu number and door code all come from the catalogue in shared/catalogue.js.',
            repeatable: true,
            requires: ['searched'],
            sets: ['product_selected'],
            params: [
                { key: 'product', label: 'Product', values: TICatalogue.options() }
            ],
            text: []
        },
        {
            id: 'product_allocation_code',
            label: 'Product allocation code prompt',
            stage: 'webobject',
            repeatable: true,
            requires: ['product_selected'],
            sets: [],
            params: [
                { key: 'input_mode', label: 'Entry method', values: INPUT_MODES },
                {
                    key: 'applies_on',
                    label: 'Applies on',
                    values: [
                        { value: 'take', label: 'Take' },
                        { value: 'return', label: 'Return' }
                    ]
                }
            ],
            text: [
                { key: 'prompt', label: 'Screen prompt', maxLength: 40, placeholder: 'Scan allocation code' }
            ]
        },
        {
            id: 'select_action',
            label: 'Choose take or return',
            stage: 'webobject',
            repeatable: true,
            requires: ['product_selected'],
            sets: [],
            params: [
                {
                    key: 'action',
                    label: 'Action chosen',
                    values: [
                        { value: 'take', label: 'Take' },
                        { value: 'return', label: 'Return' }
                    ]
                },
                {
                    key: 'control',
                    label: 'Control used',
                    // Both are the same screen. The hardware option only changes
                    // the caption, since the Web Object cannot show a button press.
                    values: [
                        { value: 'onscreen', label: 'On-screen button' },
                        { value: 'hardware', label: 'Hardware Take/Return button' }
                    ]
                }
            ],
            text: []
        },
        {
            id: 'enter_quantity',
            label: 'Enter quantity and confirm',
            stage: 'webobject',
            repeatable: true,
            requires: ['product_selected'],
            sets: [],
            params: [],
            text: [
                // Blank uses the real screen's derived line, "Open location
                // door <door code>.", from the selected product's catalogue entry.
                {
                    key: 'prompt', label: 'Instruction line', maxLength: 60,
                    placeholder: 'Open location door A-C002.', optional: true
                },
                { key: 'quantity', label: 'Quantity entered', maxLength: 6, placeholder: '1' }
            ]
        },
        {
            id: 'info_window',
            label: 'Information window',
            stage: 'webobject',
            note: 'This is the event Steuart specifically wants customisable.',
            repeatable: true,
            requires: ['logged_in'],
            sets: [],
            params: [
                {
                    key: 'info_type',
                    label: 'Information shown',
                    values: [
                        { value: 'quantity', label: 'Quantity remaining' },
                        { value: 'lot_number', label: 'Lot number' },
                        { value: 'custom', label: 'Custom message' }
                    ]
                }
            ],
            text: [
                { key: 'title', label: 'Window title', maxLength: 30, placeholder: 'Lot number' },
                { key: 'body', label: 'Window body', maxLength: 120, placeholder: 'Lot 4471-B, expires 03/2027' }
            ]
        },
        {
            id: 'open_pocket_take',
            label: 'Door open, item taken',
            stage: 'webobject',
            beat: true,
            note: 'The device screen holds a door-open state while the operator reaches in. No render, so this repeats freely for a product kit.',
            repeatable: true,
            requires: ['product_selected'],
            sets: ['taken'],
            params: [],
            text: [
                {
                    key: 'message', label: 'Screen message', maxLength: 60,
                    placeholder: 'Door open. Take the item and close the door.', optional: true
                }
            ]
        },
        {
            id: 'handheld_scanner_cradle',
            label: 'Handheld scanner from / to charging cradle',
            stage: 'webobject',
            beat: true,
            repeatable: true,
            requires: ['logged_in'],
            sets: [],
            params: [
                {
                    key: 'direction',
                    label: 'Direction',
                    values: [
                        { value: 'from_cradle', label: 'Take from cradle' },
                        { value: 'to_cradle', label: 'Return to cradle' }
                    ]
                }
            ],
            text: [
                {
                    key: 'message', label: 'Screen message', maxLength: 60,
                    placeholder: 'Lift the scanner from its cradle.', optional: true
                }
            ]
        },
        {
            id: 'scale_transaction',
            label: 'Transaction from a Scale location',
            stage: 'webobject',
            beat: true,
            note: 'Scale is a new location type. On this architecture it is a screen showing the weight reading, not a render.',
            repeatable: true,
            requires: ['product_selected'],
            sets: ['taken'],
            params: [
                {
                    key: 'action',
                    label: 'Action',
                    values: [
                        { value: 'take', label: 'Take' },
                        { value: 'return', label: 'Return' }
                    ]
                }
            ],
            text: [
                { key: 'weight', label: 'Weight shown', maxLength: 20, placeholder: '1.248 kg' },
                {
                    key: 'message', label: 'Screen message', maxLength: 60,
                    placeholder: 'Place the items on the scale.', optional: true
                }
            ]
        },
        {
            id: 'check_in',
            label: 'Check-in process',
            stage: 'webobject',
            repeatable: true,
            requires: ['product_selected'],
            sets: [],
            params: [],
            text: [
                { key: 'prompt', label: 'Screen prompt', maxLength: 40, placeholder: 'Check item back in' },
                { key: 'confirmation', label: 'Confirmation line', maxLength: 40, placeholder: 'Returned successfully' }
            ]
        },
        {
            id: 'transaction_confirmation',
            label: 'Transaction confirmation',
            stage: 'webobject',
            repeatable: true,
            requires: ['logged_in'],
            sets: [],
            params: [],
            text: [
                { key: 'message', label: 'Confirmation message', maxLength: 40, placeholder: 'Taken successfully' }
            ]
        },
        {
            id: 'logout',
            label: 'Press log out',
            stage: 'webobject',
            handback: true,
            note: 'The last Web Object screen. Pressing it hands control back to Storyline for the closing 3D sequence.',
            repeatable: false,
            terminal: true,
            requires: ['logged_in'],
            sets: ['logged_out'],
            params: [],
            text: [
                { key: 'message', label: 'Farewell message', maxLength: 40, placeholder: 'Goodbye' }
            ]
        }
    ];

    // ----------------------------------------------------------------
    // Lookups and helpers
    // ----------------------------------------------------------------

    var BY_ID = {};
    EVENT_TYPES.forEach(function (t) { BY_ID[t.id] = t; });

    function get(id) {
        return BY_ID[id] || null;
    }

    /* Default step object for a newly added event, with every param set to
     * its first value and every text field set to its placeholder. */
    function defaultStep(id) {
        var type = get(id);
        if (!type) return null;
        var step = { type: id, params: {}, text: {}, dwell_ms: null };
        (type.params || []).forEach(function (p) {
            step.params[p.key] = p.values[0].value;
        });
        (type.text || []).forEach(function (f) {
            step.text[f.key] = f.placeholder || '';
        });
        return step;
    }

    /* Human-readable one-liner for a configured step. */
    function describe(step) {
        var type = get(step.type);
        if (!type) return 'Unknown event (' + step.type + ')';

        // The catalogue label is long, so name the product itself.
        if (step.type === 'select_product') {
            var p = TICatalogue.product((step.params || {}).product);
            return p ? 'Select ' + p.name + ' (' + p.pn + ')' : type.label;
        }
        if (step.type === 'product_search' && (step.params || {}).mode === 'category_page') {
            var c = TICatalogue.category((step.params || {}).category);
            return 'Category page browse' + (c ? ': ' + c.name : '');
        }

        var bits = [];
        (type.params || []).forEach(function (p) {
            var chosen = null;
            p.values.forEach(function (v) {
                if (v.value === (step.params || {})[p.key]) chosen = v.label;
            });
            if (chosen) bits.push(chosen);
        });
        return type.label + (bits.length ? ' (' + bits.join(', ') + ')' : '');
    }

    /* Which side of the handover a step sits on. */
    function stageOf(step) {
        var type = get(step.type);
        return type ? type.stage : 'webobject';
    }

    /* Does this step need a 3D clip that does not exist yet? Only the login
     * clip can, and only for fingerprint. */
    function needsNewClip(step) {
        var type = get(step.type);
        if (!type || type.stage !== '3d') return false;
        var needs = false;
        (type.params || []).forEach(function (p) {
            p.values.forEach(function (v) {
                if (v.value === (step.params || {})[p.key] && v.clip === 'new') needs = true;
            });
        });
        return needs;
    }

    /* The product in play at step i, that is the most recent select_product at
     * or before i. The Take screen needs it for the part number, unit of issue,
     * current quantity, menu number and door code, exactly as the real screen
     * derives them. Returns null before any selection. */
    function selectedProductAt(steps, i) {
        for (var k = Math.min(i, steps.length - 1); k >= 0; k--) {
            if (steps[k] && steps[k].type === 'select_product') {
                return TICatalogue.product((steps[k].params || {}).product);
            }
        }
        return null;
    }

    /* The category in play at step i, from the most recent category browse. */
    function browsedCategoryAt(steps, i) {
        for (var k = Math.min(i, steps.length - 1); k >= 0; k--) {
            var s = steps[k];
            if (s && s.type === 'product_search' && (s.params || {}).mode === 'category_page') {
                return TICatalogue.category(s.params.category);
            }
        }
        return null;
    }

    return {
        EVENT_TYPES: EVENT_TYPES,
        PRODUCT_TYPES: PRODUCT_TYPES,
        HARDWARE: HARDWARE,
        get: get,
        defaultStep: defaultStep,
        describe: describe,
        stageOf: stageOf,
        needsNewClip: needsNewClip,
        selectedProductAt: selectedProductAt,
        browsedCategoryAt: browsedCategoryAt
    };
});
