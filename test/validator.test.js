#!/usr/bin/env node
/*
 * Validator tests. No dependencies, no server needed.
 *
 *   node test/validator.test.js
 *
 * These encode the rules that stop TI building a nonsense sequence and sending
 * it to a prospect. If a rule changes, change it here too.
 */

const assert = require('assert');
const TIEvents = require('../shared/event-types.js');
const TICatalogue = require('../shared/catalogue.js');
const { validate, estimateDuration, formatDuration, MAX_STEPS } = require('../shared/sequence-validator.js');
const fs = require('fs');
const path = require('path');

let pass = 0;
let fail = 0;

function test(name, fn) {
    try {
        fn();
        pass++;
        console.log(`  ok    ${name}`);
    } catch (e) {
        fail++;
        console.log(`  FAIL  ${name}`);
        console.log(`        ${e.message}`);
    }
}

function step(type, params = {}, text = {}) {
    const base = TIEvents.defaultStep(type);
    return {
        type,
        params: Object.assign({}, base.params, params),
        text: Object.assign({}, base.text, text),
        dwell_ms: null
    };
}

function seq(steps, extra = {}) {
    return Object.assign({ user_id: 'TEST', name: 'Test', playback_mode: 'auto', default_dwell_ms: 3000, steps }, extra);
}

function messages(result) {
    return result.errors.map(e => e.message).join(' | ');
}

console.log('\nSequence validator\n');

// ---- happy paths --------------------------------------------------

test('a minimal login-only sequence is valid', () => {
    const r = validate(seq([step('login_method')]));
    assert.ok(r.valid, messages(r));
});

test('the three worked examples from TI all validate', () => {
    const file = path.join(__dirname, '..', 'examples', 'steuart-example-sequences.json');
    const { sequences } = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.strictEqual(sequences.length, 3, 'expected three worked examples');
    sequences.forEach(s => {
        const r = validate(s);
        assert.ok(r.valid, `${s.user_id}: ${messages(r)}`);
    });
});

test('the same physical take can repeat four times (the product-kit case)', () => {
    const r = validate(seq([
        step('login_method'),
        step('product_search'),
        step('select_product'),
        step('open_pocket_take'),
        step('open_pocket_take'),
        step('open_pocket_take'),
        step('open_pocket_take'),
        step('logout')
    ]));
    assert.ok(r.valid, messages(r));
});

test('search, select, take twice over is valid', () => {
    const r = validate(seq([
        step('login_method'),
        step('product_search'),
        step('select_product'),
        step('open_pocket_take'),
        step('product_search'),
        step('select_product'),
        step('open_pocket_take'),
        step('logout')
    ]));
    assert.ok(r.valid, messages(r));
});

// ---- structural rules ---------------------------------------------

test('an empty sequence is rejected', () => {
    const r = validate(seq([]));
    assert.ok(!r.valid);
    assert.match(messages(r), /at least one step/);
});

test('a sequence must start with a log in', () => {
    const r = validate(seq([step('product_search'), step('select_product')]));
    assert.ok(!r.valid);
    assert.match(messages(r), /must start with a log in/);
});

test('log in cannot appear twice', () => {
    const r = validate(seq([step('login_method'), step('login_method')]));
    assert.ok(!r.valid);
    assert.match(messages(r), /log in can only be the first step/);
});

test('nothing may follow log out', () => {
    const r = validate(seq([step('login_method'), step('logout'), step('product_search')]));
    assert.ok(!r.valid);
    assert.match(messages(r), /after log out/);
});

test('a sequence over the step ceiling is rejected', () => {
    const steps = [step('login_method')];
    for (let i = 0; i < MAX_STEPS; i++) steps.push(step('info_window'));
    const r = validate(seq(steps));
    assert.ok(!r.valid);
    assert.match(messages(r), /cannot exceed/);
});

// ---- state prerequisites ------------------------------------------

test('you cannot take before a product is selected', () => {
    const r = validate(seq([step('login_method'), step('open_pocket_take')]));
    assert.ok(!r.valid);
    assert.match(messages(r), /needs a product to be selected/);
});

test('you cannot select a product before searching', () => {
    const r = validate(seq([step('login_method'), step('select_product')]));
    assert.ok(!r.valid);
    assert.match(messages(r), /needs a product search/);
});

test('you cannot enter a quantity before selecting a product', () => {
    const r = validate(seq([step('login_method'), step('enter_quantity')]));
    assert.ok(!r.valid);
    assert.match(messages(r), /needs a product to be selected/);
});

// ---- params and copy ----------------------------------------------

test('an unknown event type is rejected', () => {
    const r = validate(seq([step('login_method'), { type: 'teleport', params: {}, text: {} }]));
    assert.ok(!r.valid);
    assert.match(messages(r), /unknown event type/);
});

test('a param value outside its enum is rejected', () => {
    const s = step('login_method');
    s.params.method = 'retina_scan';
    const r = validate(seq([s]));
    assert.ok(!r.valid);
    assert.match(messages(r), /is not a valid Login method/);
});

test('copy over the character limit is rejected, so it cannot overflow the device screen', () => {
    const s = step('info_window', {}, { body: 'x'.repeat(121) });
    const r = validate(seq([step('login_method'), s]));
    assert.ok(!r.valid);
    assert.match(messages(r), /limit is 120/);
});

test('required copy cannot be blank', () => {
    const s = step('info_window', {}, { title: '   ' });
    const r = validate(seq([step('login_method'), s]));
    assert.ok(!r.valid);
    assert.match(messages(r), /cannot be empty/);
});

test('optional copy may be blank', () => {
    const s = step('login_allocation_code', {}, { helper: '' });
    const r = validate(seq([step('login_method'), s]));
    assert.ok(r.valid, messages(r));
});

test('an out-of-range dwell is rejected', () => {
    const s = step('login_method');
    s.dwell_ms = 90000;
    const r = validate(seq([s]));
    assert.ok(!r.valid);
    assert.match(messages(r), /dwell must be between/);
});

test('an unknown playback mode is rejected', () => {
    const r = validate(seq([step('login_method')], { playback_mode: 'karaoke' }));
    assert.ok(!r.valid);
    assert.match(messages(r), /Playback mode/);
});

test('a missing user ID is rejected', () => {
    const r = validate(seq([step('login_method')], { user_id: '' }));
    assert.ok(!r.valid);
    assert.match(messages(r), /User ID is required/);
});

// ---- warnings, not errors -----------------------------------------

test('taking an item needs no render, so it never warns', () => {
    const r = validate(seq([
        step('login_method'),
        step('product_search'),
        step('select_product'),
        step('open_pocket_take'),
        step('logout')
    ]));
    assert.ok(r.valid, messages(r));
    assert.ok(!r.warnings.some(w => /clip/.test(w.message)),
        'a take should not owe any 3D work');
});

test('fingerprint login is valid but flagged as needing a new clip', () => {
    const s = step('login_method', { method: 'fingerprint' });
    const r = validate(seq([s]));
    assert.ok(r.valid, messages(r));
    assert.ok(r.warnings.some(w => /login clip that does not exist/.test(w.message)));
});

test('rfid login is not flagged, because that clip exists', () => {
    const s = step('login_method', { method: 'rfid' });
    const r = validate(seq([s]));
    assert.strictEqual(TIEvents.needsNewClip(s), false);
    assert.ok(!r.warnings.some(w => /clip/.test(w.message)));
});

test('no log out warns but stays valid', () => {
    const r = validate(seq([step('login_method'), step('info_window')]));
    assert.ok(r.valid, messages(r));
    assert.ok(r.warnings.some(w => /does not end with a log out/.test(w.message)));
});

// ---- catalogue integrity ------------------------------------------

console.log('\nEvent catalogue\n');

test('every event type has a unique id', () => {
    const ids = TIEvents.EVENT_TYPES.map(t => t.id);
    assert.strictEqual(new Set(ids).size, ids.length);
});

test('every event type produces a valid default step', () => {
    TIEvents.EVENT_TYPES.forEach(t => {
        const s = TIEvents.defaultStep(t.id);
        assert.ok(s, `${t.id} has no default step`);
        (t.params || []).forEach(p => {
            assert.ok(s.params[p.key] !== undefined, `${t.id}.${p.key} missing from default`);
        });
        (t.text || []).forEach(f => {
            assert.ok(s.text[f.key] !== undefined, `${t.id}.${f.key} missing from default`);
        });
    });
});

test('every default placeholder fits its own character limit', () => {
    TIEvents.EVENT_TYPES.forEach(t => {
        (t.text || []).forEach(f => {
            const v = f.placeholder || '';
            assert.ok(v.length <= f.maxLength,
                `${t.id}.${f.key} placeholder is ${v.length}, limit ${f.maxLength}`);
        });
    });
});

test('every state flag a step requires is set by some other step', () => {
    const provided = new Set();
    TIEvents.EVENT_TYPES.forEach(t => (t.sets || []).forEach(f => provided.add(f)));
    TIEvents.EVENT_TYPES.forEach(t => {
        (t.requires || []).forEach(f => {
            assert.ok(provided.has(f), `${t.id} requires "${f}" which nothing sets`);
        });
    });
});

test('all fifteen of the event types TI listed are present', () => {
    assert.ok(TIEvents.EVENT_TYPES.length >= 15,
        `only ${TIEvents.EVENT_TYPES.length} event types defined`);
});



// ---- stages and the handover --------------------------------------

console.log('\n3D and Web Object stages\n');

test('login is the only 3D step, everything else is the Web Object', () => {
    const threeD = TIEvents.EVENT_TYPES.filter(t => t.stage === '3d').map(t => t.id);
    assert.deepStrictEqual(threeD, ['login_method']);
    TIEvents.EVENT_TYPES.forEach(t => {
        assert.ok(t.stage === '3d' || t.stage === 'webobject', `${t.id} has stage "${t.stage}"`);
    });
});

test('log out is the handback point and the only terminal step', () => {
    const terminal = TIEvents.EVENT_TYPES.filter(t => t.terminal).map(t => t.id);
    assert.deepStrictEqual(terminal, ['logout']);
    assert.strictEqual(TIEvents.get('logout').handback, true);
});

test('the four former physical events are now Web Object beats', () => {
    ['open_pocket_take', 'handheld_scanner_cradle', 'scale_transaction'].forEach(id => {
        const t = TIEvents.get(id);
        assert.strictEqual(t.stage, 'webobject', `${id} is not a Web Object step`);
        assert.strictEqual(t.beat, true, `${id} is not marked as a beat`);
    });
    // The hardware Take/Return button is an option on select_action, and it is
    // a caption now, not a render.
    const control = TIEvents.get('select_action').params.find(p => p.key === 'control');
    control.values.forEach(v => assert.ok(!v.clip, `select_action.${v.value} still claims a clip`));
});

test('nothing but the login clip can ever owe a 3D asset', () => {
    TIEvents.EVENT_TYPES.forEach(t => {
        (t.params || []).forEach(p => {
            p.values.forEach(v => {
                if (v.clip) {
                    assert.strictEqual(t.stage, '3d',
                        `${t.id}.${v.value} claims a clip but is not a 3D step`);
                }
            });
        });
    });
});

test('no event type multiplies by product type or hardware type any more', () => {
    TIEvents.EVENT_TYPES.forEach(t => {
        (t.params || []).forEach(p => {
            assert.ok(p.key !== 'product_type' && p.key !== 'hardware',
                `${t.id} still takes a "${p.key}" param, which reintroduces render multiplication`);
        });
    });
});

// ---- run time ------------------------------------------------------

console.log('\nRun time\n');

test('duration counts Web Object dwells and excludes the 3D bookends', () => {
    const s = seq([
        step('login_method'),                  // 3D, excluded
        step('info_window'),                   // default 3000
        step('info_window')                    // default 3000
    ], { default_dwell_ms: 3000 });
    s.steps[0].dwell_ms = 9000;
    assert.strictEqual(estimateDuration(s), 6000);
});

test('a per-step dwell overrides the default', () => {
    const s = seq([step('login_method'), step('info_window')], { default_dwell_ms: 3000 });
    s.steps[1].dwell_ms = 7500;
    assert.strictEqual(estimateDuration(s), 7500);
});

test('duration formats as minutes and seconds', () => {
    assert.strictEqual(formatDuration(24000), '24s');
    assert.strictEqual(formatDuration(95000), '1m 35s');
    assert.strictEqual(formatDuration(150000), '2m 30s');
});

test('an overlong run warns but stays valid', () => {
    const steps = [step('login_method')];
    for (let i = 0; i < 12; i++) steps.push(step('info_window'));
    const s = seq(steps, { default_dwell_ms: 20000 });
    const r = validate(s);
    assert.ok(r.valid, messages(r));
    assert.ok(r.warnings.some(w => /long watch/.test(w.message)), 'expected a run-time warning');
});

test('the worked examples all come in under the long-watch threshold', () => {
    const file = path.join(__dirname, '..', 'examples', 'steuart-example-sequences.json');
    const { sequences } = JSON.parse(fs.readFileSync(file, 'utf8'));
    sequences.forEach(s => {
        const ms = estimateDuration(s);
        assert.ok(ms < 150000, `${s.user_id} runs ${formatDuration(ms)}`);
    });
});

// ---- catalogue ----------------------------------------------------

console.log('\nProduct catalogue\n');

test('every product id is unique', () => {
    const ids = TICatalogue.PRODUCTS.map(p => p.id);
    assert.strictEqual(new Set(ids).size, ids.length);
});

test('every product sits in a category that exists', () => {
    const cats = new Set(TICatalogue.CATEGORIES.map(c => c.id));
    TICatalogue.PRODUCTS.forEach(p => {
        assert.ok(cats.has(p.category), `${p.id} is in unknown category "${p.category}"`);
    });
});

test('every product has a valid product type', () => {
    const types = new Set(TIEvents.PRODUCT_TYPES.map(t => t.value));
    TICatalogue.PRODUCTS.forEach(p => {
        assert.ok(types.has(p.type), `${p.id} has unknown type "${p.type}"`);
    });
});

test('every product has a door code and a device type', () => {
    TICatalogue.PRODUCTS.forEach(p => {
        assert.ok(p.loc, `${p.id} has no door code`);
        assert.ok(p.device === 'smartdrawer' || p.device === 'supplysystem',
            `${p.id} has unknown device "${p.device}"`);
    });
});

test('the eight products read off the SCORM screens are present with their part numbers', () => {
    const expected = {
        '2HCE 0006 001 S04': '0.06mm 3 Flute Standard Length End Mills for Steel',
        'TI-032-8': 'Diamond Tipped Tile Drill Bit',
        'TI-011-1': '1000g Calibration Weights Set',
        'TI-054-0': '10mm Washer',
        'TI-017-3': '20mm Carbide Drill Tip',
        'TI-203': '25mm Thru Coolant Drilling Assembly',
        'RB-011': 'Ultra-Performance Compression Flush Trim Router Bit',
        'INSP.': 'M10 x 3 Screw Plug Gauge'
    };
    Object.keys(expected).forEach(pn => {
        const hit = TICatalogue.PRODUCTS.find(p => p.pn === pn);
        assert.ok(hit, `no product with part number ${pn}`);
        assert.strictEqual(hit.name, expected[pn]);
        assert.strictEqual(hit.source, 'scorm');
    });
});

test('the three SCORM categories are present and named exactly', () => {
    ['Drilling Tools', 'Machine Tools', 'Inspection'].forEach(name => {
        const hit = TICatalogue.CATEGORIES.find(c => c.name === name);
        assert.ok(hit, `no category named ${name}`);
        assert.strictEqual(hit.source, 'scorm');
    });
});

test('every category fills a screen, so a category browse never looks half empty', () => {
    TICatalogue.CATEGORIES.forEach(c => {
        assert.ok(TICatalogue.inCategory(c.id).length >= 6,
            `${c.name} has only ${TICatalogue.inCategory(c.id).length} products`);
    });
});

test('a narrow search still fills a screen', () => {
    assert.strictEqual(TICatalogue.search('Router')[0].pn, 'RB-011');
    assert.ok(TICatalogue.search('Router').length >= 6, 'narrow search returned a short list');
    assert.ok(TICatalogue.search('zzzznothing').length >= 6, 'no-hit search returned a short list');
});

test('select_product offers every catalogue product and nothing else', () => {
    const opts = TIEvents.get('select_product').params[0].values.map(v => v.value);
    assert.strictEqual(opts.length, TICatalogue.PRODUCTS.length);
    opts.forEach(id => assert.ok(TICatalogue.product(id), `${id} is not a product`));
});

test('the selected product resolves from the most recent select_product', () => {
    const steps = [
        step('login_method'),
        step('product_search'),
        step('select_product', { product: 'router_bit' }),
        step('enter_quantity'),
        step('select_product', { product: 'washer_10' }),
        step('enter_quantity')
    ];
    assert.strictEqual(TIEvents.selectedProductAt(steps, 3).pn, 'RB-011');
    assert.strictEqual(TIEvents.selectedProductAt(steps, 5).pn, 'TI-054-0');
    assert.strictEqual(TIEvents.selectedProductAt(steps, 1), null);
});

test('the browsed category resolves from the most recent category page', () => {
    const steps = [
        step('login_method'),
        step('product_search', { mode: 'category_page', category: 'fasteners' }),
        step('select_product', { product: 'washer_10' })
    ];
    assert.strictEqual(TIEvents.browsedCategoryAt(steps, 2).name, 'Fasteners');
    assert.strictEqual(TIEvents.browsedCategoryAt(steps, 0), null);
});

// ---- customer colours and logo (shared/theme.js) ------------------

const TITheme = require('../shared/theme.js');
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

test('colours are tidied to lower case #rrggbb, and anything else is refused', () => {
    assert.strictEqual(TITheme.colour('3D6B99'), '#3d6b99');
    assert.strictEqual(TITheme.colour(' #38e '), '#3388ee');
    assert.strictEqual(TITheme.colour('blue'), null);
    assert.strictEqual(TITheme.colour('#12345'), null);
    const r = TITheme.normalise({ theme_colour: 'blue', button_colour: '#e8862a' });
    assert.strictEqual(r.errors.length, 1);
    assert.strictEqual(r.values.button_colour, '#e8862a');
});

test('a field left out stays out, so an update keeps what is stored; blank clears it', () => {
    assert.deepStrictEqual(TITheme.normalise({ solution: 'smartdrawer' }).values, {});
    assert.deepStrictEqual(TITheme.normalise({ theme_colour: '', logo: null }).values, { theme_colour: null, logo: null });
});

test('a logo must be an image data URI under the size limit', () => {
    assert.strictEqual(TITheme.logoProblem(PNG), null);
    assert.ok(TITheme.logoProblem('assets/img/logo.png'));
    assert.ok(TITheme.logoProblem('data:text/html;base64,PGI+aGk8L2I+'));
    assert.ok(TITheme.logoProblem('data:image/png;base64,' + 'A'.repeat(Math.ceil(TITheme.LOGO_MAX_BYTES * 4 / 3) + 8)));
    assert.ok(TITheme.logoProblem('data:image/svg+xml;base64,PHN2Zz4=" onerror="x'));
});

test('no colours means no variables, so the device keeps its own grey and red', () => {
    assert.deepStrictEqual(TITheme.vars({}), {});
    const v = TITheme.vars({ theme_colour: '#3e3e3e' });
    assert.strictEqual(v['--scr-title'], '#393939');
    assert.strictEqual(v['--scr-title-mark'], '#585858');
});

test('text on a light colour goes dark', () => {
    assert.strictEqual(TITheme.vars({ theme_colour: '#dfe6ec' })['--scr-title-text'], '#333');
    assert.strictEqual(TITheme.vars({ button_colour: '#ffd200' })['--btn-text'], '#333');
    assert.strictEqual(TITheme.vars({ button_colour: '#1f4e79' })['--btn-text'], '#fff');
});

// ---- summary ------------------------------------------------------

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
