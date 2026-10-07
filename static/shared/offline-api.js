/*
 * TI Sequence Builder - offline API shim
 * --------------------------------------
 * This file exists only in the static bundle. It is NOT part of the CMS repo.
 *
 * All three CMS pages are unmodified copies of the ones that run against the
 * Node server, so they talk to /api/... over fetch(). There is no Node here,
 * so this wraps window.fetch and answers those calls locally:
 *
 *   GET    /api/configs            list the four-field configs
 *   GET    /api/config/:userId     one
 *   POST   /api/config             create
 *   PUT    /api/config/:userId     replace
 *   DELETE /api/config/:userId     delete
 *
 *   GET    /api/sequences          list
 *   GET    /api/sequence/:userId   one
 *   POST   /api/sequence           create
 *   PUT    /api/sequence/:userId   replace
 *   DELETE /api/sequence/:userId   delete
 *   POST   /api/sequence/validate  dry run
 *   GET    /api/event-types        the catalogue
 *
 * Anything else falls through to the real fetch untouched.
 *
 * Storage: the seeds are baked in from data/sequences.js and data/configs.js,
 * and anything the viewer creates or edits is layered on top in localStorage.
 * So the CMS works with no server and no network, including from a file:// URL,
 * but nothing a viewer builds leaves their own browser. Deleting a baked-in
 * record is remembered as a tombstone rather than by mutating the seed.
 *
 * localStorage throws in some sandboxed frames, so every access is guarded and
 * falls back to memory for the session.
 */
(function () {
    'use strict';

    var realFetch = window.fetch ? window.fetch.bind(window) : null;

    function clone(o) { return JSON.parse(JSON.stringify(o)); }

    // ---- storage ------------------------------------------------------
    // One Collection per table. Seeds are read-only; viewer changes live in an
    // overlay of edits plus a tombstone list, so a baked-in record can be
    // deleted without the seed being mutated.

    function Collection(storageKey, seedFn) {
        this.key = storageKey;
        this.seedFn = seedFn;
        this.memory = null;          // fallback when localStorage is unavailable
    }

    Collection.prototype.read = function () {
        if (this.memory) return this.memory;
        try {
            var raw = window.localStorage.getItem(this.key);
            return raw ? JSON.parse(raw) : { edited: {}, deleted: [] };
        } catch (e) {
            this.memory = { edited: {}, deleted: [] };
            return this.memory;
        }
    };

    Collection.prototype.write = function (overlay) {
        this.memory = overlay;
        try {
            window.localStorage.setItem(this.key, JSON.stringify(overlay));
            this.memory = null;      // localStorage works, no need to shadow it
        } catch (e) {
            // Keep it in memory for this session and carry on.
        }
    };

    Collection.prototype.all = function () {
        var overlay = this.read();
        var out = [];
        var taken = {};

        this.seedFn().forEach(function (r) {
            if (overlay.deleted.indexOf(r.user_id) >= 0) return;
            out.push(clone(overlay.edited[r.user_id] || r));
            taken[r.user_id] = true;
        });

        Object.keys(overlay.edited).forEach(function (id) {
            if (taken[id]) return;
            if (overlay.deleted.indexOf(id) >= 0) return;
            out.push(clone(overlay.edited[id]));
        });

        return out;
    };

    Collection.prototype.find = function (id) {
        var hits = this.all().filter(function (r) { return r.user_id === id; });
        return hits.length ? hits[0] : null;
    };

    Collection.prototype.put = function (record) {
        var overlay = this.read();
        overlay.edited[record.user_id] = clone(record);
        var at = overlay.deleted.indexOf(record.user_id);
        if (at >= 0) overlay.deleted.splice(at, 1);
        this.write(overlay);
    };

    Collection.prototype.drop = function (id) {
        var overlay = this.read();
        delete overlay.edited[id];
        if (overlay.deleted.indexOf(id) < 0) overlay.deleted.push(id);
        this.write(overlay);
    };

    var sequences = new Collection('ti-sequences-v1', function () {
        var seed = window.TISeedSequences;
        return (seed && seed.sequences) ? seed.sequences : [];
    });

    var configs = new Collection('ti-configs-v1', function () {
        return window.TISeedConfigs || [];
    });

    function now() {
        return new Date().toISOString().slice(0, 19).replace('T', ' ');
    }

    // The pages expect step_count on listed sequences, which the server adds.
    function hydrate(seq) {
        var s = clone(seq);
        s.steps = Array.isArray(s.steps) ? s.steps : [];
        s.step_count = s.steps.length;
        return s;
    }

    function normalise(body, userId) {
        return {
            user_id: (userId !== undefined ? userId : body.user_id) || '',
            name: body.name || '',
            playback_mode: body.playback_mode || 'auto',
            default_dwell_ms: body.default_dwell_ms == null ? 3000 : Number(body.default_dwell_ms),
            steps: Array.isArray(body.steps) ? body.steps : []
        };
    }

    // ---- responses ----------------------------------------------------

    function reply(status, payload) {
        var text = JSON.stringify(payload);
        if (typeof Response === 'function') {
            return Promise.resolve(new Response(text, {
                status: status,
                headers: { 'Content-Type': 'application/json' }
            }));
        }
        // Very old engines: hand back a duck-typed response.
        return Promise.resolve({
            ok: status >= 200 && status < 300,
            status: status,
            json: function () { return Promise.resolve(JSON.parse(text)); },
            text: function () { return Promise.resolve(text); }
        });
    }

    // ---- routing ------------------------------------------------------

    function route(method, path, body) {

        // ---- the shipped four-field config CMS ----

        if (path === '/api/configs' && method === 'GET') {
            return reply(200, configs.all().slice().sort(function (a, b) {
                return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
            }));
        }

        if (path === '/api/config' && method === 'POST') {
            var c = body || {};
            if (!c.user_id || !c.solution || !c.login_type || !c.location) {
                return reply(400, { error: 'All fields are required' });
            }
            if (configs.find(c.user_id)) {
                return reply(409, { error: 'User ID already exists' });
            }
            configs.put({
                user_id: c.user_id,
                solution: c.solution,
                login_type: c.login_type,
                location: c.location,
                created_at: now(),
                updated_at: now()
            });
            return reply(201, {
                message: 'Configuration saved in this browser only',
                user_id: c.user_id
            });
        }

        var oneConfig = path.match(/^\/api\/config\/(.+)$/);
        if (oneConfig) {
            var cid = decodeURIComponent(oneConfig[1]);
            var existing = configs.find(cid);

            if (method === 'GET') {
                return existing ? reply(200, existing)
                    : reply(404, { error: 'User ID not found' });
            }

            if (method === 'PUT') {
                if (!existing) return reply(404, { error: 'User ID not found' });
                configs.put({
                    user_id: cid,
                    solution: body.solution,
                    login_type: body.login_type,
                    location: body.location,
                    created_at: existing.created_at || now(),
                    updated_at: now()
                });
                return reply(200, { message: 'Saved in this browser only' });
            }

            if (method === 'DELETE') {
                if (!existing) return reply(404, { error: 'User ID not found' });
                configs.drop(cid);
                return reply(200, { message: 'Removed in this browser only' });
            }
        }

        // ---- the sequence builder ----

        if (path === '/api/event-types') {
            // Only the builder and the player load the shared modules, so this
            // route is unavailable on the Configurations page.
            if (!window.TIEvents || !window.TIValidator || !window.TICatalogue) {
                return reply(404, { error: 'The event catalogue is not loaded on this page' });
            }
            return reply(200, {
                event_types: window.TIEvents.EVENT_TYPES,
                product_types: window.TIEvents.PRODUCT_TYPES,
                hardware: window.TIEvents.HARDWARE,
                catalogue: {
                    categories: window.TICatalogue.CATEGORIES,
                    products: window.TICatalogue.PRODUCTS
                },
                limits: {
                    max_steps: window.TIValidator.MAX_STEPS,
                    min_dwell_ms: window.TIValidator.MIN_DWELL,
                    max_dwell_ms: window.TIValidator.MAX_DWELL
                }
            });
        }

        if (path === '/api/sequences' && method === 'GET') {
            return reply(200, sequences.all().map(hydrate));
        }

        if (path === '/api/sequence/validate' && method === 'POST') {
            return reply(200, window.TIValidator.validate(normalise(body, body.user_id)));
        }

        if (path === '/api/sequence' && method === 'POST') {
            var created = normalise(body, body.user_id);
            var check = window.TIValidator.validate(created);
            if (!check.valid) {
                return reply(400, merge({ error: 'Sequence is not valid' }, check));
            }
            if (sequences.find(created.user_id)) {
                return reply(409, { error: 'A sequence already exists for this User ID' });
            }
            sequences.put(created);
            return reply(201, {
                message: 'Configuration saved in this browser only',
                user_id: created.user_id,
                step_count: created.steps.length,
                warnings: check.warnings
            });
        }

        var single = path.match(/^\/api\/sequence\/(.+)$/);
        if (single) {
            var id = decodeURIComponent(single[1]);

            if (method === 'GET') {
                var found = sequences.find(id);
                return found
                    ? reply(200, hydrate(found))
                    : reply(404, { error: 'No sequence for this user ID' });
            }

            if (method === 'PUT') {
                if (!sequences.find(id)) return reply(404, { error: 'No sequence for this user ID' });
                var updated = normalise(body, id);
                var res = window.TIValidator.validate(updated);
                if (!res.valid) {
                    return reply(400, merge({ error: 'Sequence is not valid' }, res));
                }
                sequences.put(updated);
                return reply(200, {
                    message: 'Saved in this browser only',
                    step_count: updated.steps.length,
                    warnings: res.warnings
                });
            }

            if (method === 'DELETE') {
                if (!sequences.find(id)) return reply(404, { error: 'No sequence for this user ID' });
                sequences.drop(id);
                return reply(200, { message: 'Removed in this browser only' });
            }
        }

        return null;   // not ours
    }

    function merge(a, b) {
        Object.keys(b).forEach(function (k) { a[k] = b[k]; });
        return a;
    }

    // ---- install ------------------------------------------------------

    window.fetch = function (input, init) {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();

        // Strip any origin so both "/api/x" and "https://host/api/x" match.
        var path = url;
        try {
            if (/^https?:\/\//i.test(url)) path = new URL(url).pathname;
        } catch (e) { /* leave as-is */ }

        // The pages call relative paths (api/...) so they also work under a
        // sub-path; match those the same as /api/...
        if (path.indexOf('api/') === 0) path = '/' + path;

        if (path.indexOf('/api/') !== 0) {
            return realFetch ? realFetch(input, init)
                : Promise.reject(new Error('fetch is not available'));
        }

        var body = {};
        try {
            if (init && init.body) body = JSON.parse(init.body);
        } catch (e) { /* empty or non-JSON body */ }

        var handled = route(method, path, body);
        if (handled) return handled;

        return reply(404, { error: 'Not found in the offline bundle: ' + method + ' ' + path });
    };

    // Let the pages say so in their own UI if they want to.
    window.TIOffline = true;
})();
