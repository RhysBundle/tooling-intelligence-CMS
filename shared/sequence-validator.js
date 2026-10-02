/*
 * TI Storyline CMS - Sequence validator
 * -------------------------------------
 * Shared by the browser builder (live feedback as the operator edits) and the
 * API (authoritative check before anything is stored). Same file both sides so
 * the two can never disagree.
 *
 * "Unlimited" in Steuart's ask is implemented as UNBOUNDED LENGTH WITH RULES,
 * not literally anything goes. Without the rules TI can build a nonsense
 * sequence (take before select, two logins, steps after logout) and send it to
 * a prospect, which is a risk to TI's own brand as much as ours.
 *
 * Since the physical acts are screen states rather than renders, nothing here
 * warns about render cost any more. The thing worth warning about is RUN TIME:
 * whether a prospect will actually sit through the sequence.
 *
 * Returns { valid, errors: [{ index, message }], warnings: [{ index, message }] }
 * index is null for whole-sequence problems.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./event-types.js'));
    } else {
        root.TIValidator = factory(root.TIEvents);
    }
})(typeof self !== 'undefined' ? self : this, function (TIEvents) {
    'use strict';

    // Practical ceiling. Not a spec limit, a guard against a runaway paste or
    // a sequence no prospect will sit through. Raise it if TI ask.
    var MAX_STEPS = 60;
    var LONG_SEQUENCE_WARN = 25;

    // Past this, a prospect stops watching. Two and a half minutes.
    var LONG_RUN_WARN_MS = 150000;

    // Dwell time bounds, milliseconds. Gerry flagged that the existing videos
    // move too fast to read, so per-step dwell is an operator field.
    var MIN_DWELL = 500;
    var MAX_DWELL = 30000;

    function validate(sequence) {
        var errors = [];
        var warnings = [];

        function err(index, message) { errors.push({ index: index, message: message }); }
        function warn(index, message) { warnings.push({ index: index, message: message }); }

        if (!sequence || typeof sequence !== 'object') {
            return { valid: false, errors: [{ index: null, message: 'Sequence must be an object.' }], warnings: [] };
        }

        // ---- sequence level -------------------------------------------

        if (!sequence.user_id || !String(sequence.user_id).trim()) {
            err(null, 'User ID is required.');
        }

        var mode = sequence.playback_mode;
        if (mode && mode !== 'auto' && mode !== 'step_through') {
            err(null, 'Playback mode must be "auto" or "step_through".');
        }

        if (sequence.default_dwell_ms != null) {
            var d = Number(sequence.default_dwell_ms);
            if (!isFinite(d) || d < MIN_DWELL || d > MAX_DWELL) {
                err(null, 'Default dwell must be between ' + MIN_DWELL + ' and ' + MAX_DWELL + ' ms.');
            }
        }

        var steps = sequence.steps;
        if (!Array.isArray(steps) || steps.length === 0) {
            err(null, 'A sequence needs at least one step.');
            return { valid: false, errors: errors, warnings: warnings };
        }
        if (steps.length > MAX_STEPS) {
            err(null
                , 'A sequence cannot exceed ' + MAX_STEPS + ' steps (this one has ' + steps.length + ').');
        }
        if (steps.length > LONG_SEQUENCE_WARN) {
            warn(null, steps.length + ' steps is a long watch for a prospect. Consider splitting it.');
        }

        // ---- step level -----------------------------------------------

        var state = {};          // sticky state flags set by earlier steps
        var seen = {};           // type id -> count
        var terminalAt = -1;
        var newClips = 0;

        steps.forEach(function (step, i) {
            var human = i + 1;

            if (!step || typeof step !== 'object' || !step.type) {
                err(i, 'Step ' + human + ' has no event type.');
                return;
            }

            var type = TIEvents.get(step.type);
            if (!type) {
                err(i, 'Step ' + human + ': unknown event type "' + step.type + '".');
                return;
            }

            seen[type.id] = (seen[type.id] || 0) + 1;

            // First step must establish a session.
            if (i === 0 && type.id !== 'login_method') {
                err(i, 'A sequence must start with a log in step.');
            }
            if (i > 0 && type.id === 'login_method') {
                err(i, 'Step ' + human + ': log in can only be the first step.');
            }

            // Repeatability.
            if (type.repeatable === false && seen[type.id] > 1) {
                err(i, 'Step ' + human + ': "' + type.label + '" cannot appear more than once.');
            }

            // Nothing may follow a terminal step.
            if (terminalAt >= 0) {
                err(i, 'Step ' + human + ' comes after log out. Log out must be the last step.');
            }
            if (type.terminal) {
                terminalAt = i;
            }

            // Prerequisite state.
            (type.requires || []).forEach(function (flag) {
                if (!state[flag]) {
                    err(i, 'Step ' + human + ' (' + type.label + ') ' + explainMissing(flag) + '.');
                }
            });

            // Params: every one present and from its enum.
            (type.params || []).forEach(function (p) {
                var v = (step.params || {})[p.key];
                if (v === undefined || v === null || v === '') {
                    err(i, 'Step ' + human + ': "' + p.label + '" must be set.');
                    return;
                }
                var ok = p.values.some(function (opt) { return opt.value === v; });
                if (!ok) {
                    err(i, 'Step ' + human + ': "' + v + '" is not a valid ' + p.label + '.');
                }
            });

            // Editable text: required unless flagged optional, and within the
            // character limit or it overflows the fixed device screen mockup.
            (type.text || []).forEach(function (f) {
                var v = (step.text || {})[f.key];
                var s = v == null ? '' : String(v);
                if (!s.trim() && !f.optional) {
                    err(i, 'Step ' + human + ': "' + f.label + '" cannot be empty.');
                }
                if (s.length > f.maxLength) {
                    err(i, 'Step ' + human + ': "' + f.label + '" is ' + s.length +
                        ' characters, limit is ' + f.maxLength + '.');
                }
            });

            // Per-step dwell override.
            if (step.dwell_ms != null && step.dwell_ms !== '') {
                var sd = Number(step.dwell_ms);
                if (!isFinite(sd) || sd < MIN_DWELL || sd > MAX_DWELL) {
                    err(i, 'Step ' + human + ': dwell must be between ' + MIN_DWELL + ' and ' + MAX_DWELL + ' ms.');
                }
            }

            // Asset availability is a warning, never an error. On this
            // architecture only the login clip can be missing.
            if (TIEvents.needsNewClip(step)) {
                newClips++;
                warn(i, 'Step ' + human + ' (' + TIEvents.describe(step) +
                    ') needs a 3D login clip that does not exist yet.');
            }

            (type.sets || []).forEach(function (flag) { state[flag] = true; });
        });

        // ---- whole sequence sanity ------------------------------------

        if (terminalAt < 0) {
            warn(null, 'Sequence does not end with a log out step, so Storyline never gets control back for the closing 3D.');
        }
        if (state.taken && !state.logged_out) {
            warn(null, 'An item is taken but the user never logs out.');
        }

        // Run time is the thing that actually goes wrong now. A prospect
        // watching a follow-up link will not sit through five minutes.
        var ms = estimateDuration(sequence);
        if (ms > LONG_RUN_WARN_MS) {
            warn(null, 'Web Object run time is about ' + formatDuration(ms) +
                ', which is a long watch for a prospect. Trim steps or shorten dwells.');
        }

        return { valid: errors.length === 0, errors: errors, warnings: warnings };
    }

    /* Total Web Object run time in milliseconds, from the per-step dwells.
     * The 3D bookends are NOT counted: their length is the length of the video
     * clips, which live outside the CMS. */
    function estimateDuration(sequence) {
        var fallback = Number((sequence || {}).default_dwell_ms) || 3000;
        return ((sequence || {}).steps || []).reduce(function (total, step) {
            if (TIEvents.stageOf(step) !== 'webobject') return total;
            var d = step.dwell_ms != null && step.dwell_ms !== '' ? Number(step.dwell_ms) : null;
            return total + (d && isFinite(d) ? d : fallback);
        }, 0);
    }

    function formatDuration(ms) {
        var total = Math.round(ms / 1000);
        var m = Math.floor(total / 60);
        var s = total % 60;
        return m ? m + 'm ' + (s < 10 ? '0' : '') + s + 's' : s + 's';
    }

    function explainMissing(flag) {
        switch (flag) {
            case 'logged_in': return 'needs a log in step before it';
            case 'searched': return 'needs a product search before it';
            case 'product_selected': return 'needs a product to be selected before it';
            default: return 'requires "' + flag + '" which no earlier step provides';
        }
    }

    return {
        validate: validate,
        estimateDuration: estimateDuration,
        formatDuration: formatDuration,
        MAX_STEPS: MAX_STEPS,
        MIN_DWELL: MIN_DWELL,
        MAX_DWELL: MAX_DWELL,
        LONG_RUN_WARN_MS: LONG_RUN_WARN_MS
    };
});
