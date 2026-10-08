/*
 * TI CMS - Customer colours and logo on the device screens
 * --------------------------------------------------------
 * A config can carry three optional fields that dress the demo's device
 * screens in the customer's brand:
 *
 *   theme_colour   the screen behind the white panel, the title bar, and
 *                  under the on-screen keyboard. The device's own is #3e3e3e.
 *   button_colour  every button, the line under the title bar, and pressed
 *                  keys. The device's own is #bd1c22.
 *   logo           the title bar's logo in place of TI's, as a data URI (SVG,
 *                  PNG, JPEG or WebP). It lives in the config itself, so an
 *                  export can bake it into the demo, which runs offline.
 *
 * The server checks them with this, the CMS form previews them with it, and
 * the demo player (demo/js/demo.js) colours its screens with it, so all three
 * agree. Required on the server, loaded as a script in the browser.
 *
 * Logos are only ever shown through <img>, never put into the page as markup,
 * so an SVG's own scripts and links do nothing.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.TITheme = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var DEFAULTS = { theme_colour: '#3e3e3e', button_colour: '#bd1c22' };
    var LABELS = { theme_colour: 'Theme colour', button_colour: 'Button colour', logo: 'Logo' };
    var LOGO_MAX_BYTES = 500 * 1024;
    var LOGO_TYPES = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp'];

    // Every CSS variable vars() can set, so a page can clear the last one's.
    var VARS = ['--scr-bg', '--scr-title', '--scr-title-mark', '--scr-title-text',
        '--btn-top', '--btn-mid', '--btn-bottom', '--btn-edge', '--btn-edge-top', '--btn-text',
        '--btn-line-a', '--btn-line', '--btn-line-b', '--key-on-top', '--key-on-bottom'];

    // '#3a8ee0', '3A8EE0' or '#38e' to '#3a8ee0'. Anything else to null.
    function colour(s) {
        var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(s == null ? '' : s).trim());
        if (!m) return null;
        var h = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
        return '#' + h.toLowerCase();
    }

    /* The CSS variables for a config's colours, read by demo/css/screens.css.
     * The device's gradients and edges are worked out from the one colour, in
     * the same steps as the device's own red and grey, and text goes white or
     * dark, whichever reads better. A colour that is missing or not hex gives
     * no variables, so the device's own colour stays. */
    function vars(config) {
        config = config || {};
        var out = {};
        var bg = rgb(colour(config.theme_colour));
        if (bg) {
            var text = textOn(bg);
            out['--scr-bg'] = hex(bg);
            out['--scr-title'] = hex(mix(bg, BLACK, 0.08));
            out['--scr-title-mark'] = hex(mix(bg, text === '#fff' ? WHITE : BLACK, 0.135));
            out['--scr-title-text'] = text;
        }
        var btn = rgb(colour(config.button_colour));
        if (btn) {
            var edge = [42, 42, 42];
            out['--btn-top'] = hex(btn);
            out['--btn-mid'] = hex(mix(btn, BLACK, 0.18));
            out['--btn-bottom'] = hex(mix(btn, BLACK, 0.34));
            out['--btn-edge'] = hex(mix(btn, edge, 0.6));
            out['--btn-edge-top'] = hex(mix(btn, edge, 0.4));
            out['--btn-text'] = textOn(mix(btn, BLACK, 0.18));
            out['--btn-line-a'] = hex(mix(btn, BLACK, 0.12));
            out['--btn-line'] = hex(btn);
            out['--btn-line-b'] = hex(mix(btn, BLACK, 0.32));
            out['--key-on-top'] = hex(btn);
            out['--key-on-bottom'] = hex(mix(btn, BLACK, 0.38));
        }
        return out;
    }

    // Why a logo can't be stored, or null if it can.
    function logoProblem(logo) {
        var s = String(logo == null ? '' : logo);
        var m = /^data:([a-z0-9.+\/-]+);base64,/i.exec(s);
        if (!m || LOGO_TYPES.indexOf(m[1].toLowerCase()) < 0) {
            return 'The logo must be an SVG, PNG, JPEG or WebP image.';
        }
        var data = s.slice(m[0].length);
        if (Math.floor(data.length * 3 / 4) > LOGO_MAX_BYTES) {
            return 'The logo must be under ' + Math.round(LOGO_MAX_BYTES / 1024) + ' KB.';
        }
        if (!/^[A-Za-z0-9+\/]*={0,2}$/.test(data)) return 'The logo file could not be read.';
        return null;
    }

    /* Checks and tidies the three fields from a form or an API call.
     * Returns { values, errors }. A field the body leaves out is left out of
     * values too, so an update that doesn't mention it keeps what is stored;
     * an empty string or null clears it. */
    function normalise(body) {
        body = body || {};
        var values = {};
        var errors = [];
        ['theme_colour', 'button_colour'].forEach(function (k) {
            if (!(k in body)) return;
            if (body[k] == null || String(body[k]).trim() === '') { values[k] = null; return; }
            var c = colour(body[k]);
            if (c) values[k] = c;
            else errors.push(LABELS[k] + ' must be a hex colour, such as #3d6b99.');
        });
        if ('logo' in body) {
            if (body.logo == null || body.logo === '') {
                values.logo = null;
            } else {
                var problem = logoProblem(body.logo);
                if (problem) errors.push(problem);
                else values.logo = String(body.logo);
            }
        }
        return { values: values, errors: errors };
    }

    /* ---------- Helpers ---------- */

    var BLACK = [0, 0, 0];
    var WHITE = [255, 255, 255];

    function rgb(h) {
        return h ? [1, 3, 5].map(function (k) { return parseInt(h.substr(k, 2), 16); }) : null;
    }

    function hex(c) {
        return '#' + c.map(function (v) { return ('0' + Math.round(v).toString(16)).slice(-2); }).join('');
    }

    function mix(a, b, t) {
        return a.map(function (v, k) { return v + (b[k] - v) * t; });
    }

    // White or dark text, whichever has the higher contrast on c (WCAG).
    function textOn(c) {
        var l = c.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
        var lum = 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
        var dark = 0.0331;  // #333
        return 1.05 / (lum + 0.05) >= (lum + 0.05) / (dark + 0.05) ? '#fff' : '#333';
    }

    return {
        DEFAULTS: DEFAULTS,
        LOGO_MAX_BYTES: LOGO_MAX_BYTES,
        LOGO_TYPES: LOGO_TYPES,
        VARS: VARS,
        colour: colour,
        vars: vars,
        logoProblem: logoProblem,
        normalise: normalise
    };
});
