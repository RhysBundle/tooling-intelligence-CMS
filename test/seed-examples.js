#!/usr/bin/env node
/*
 * Seed the worked example sequences into a running CMS.
 *
 *   node test/seed-examples.js                              -> http://localhost:3000
 *   node test/seed-examples.js https://tooling-intelligence-cms.onrender.com
 *
 * Idempotent: an existing sequence is updated (PUT) rather than duplicated.
 * Only touches the sequences table, never user_configs.
 */

const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const FILE = path.join(__dirname, '..', 'examples', 'steuart-example-sequences.json');

async function main() {
    const { sequences } = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    console.log(`Seeding ${sequences.length} sequences into ${BASE}\n`);

    let failed = 0;

    for (const seq of sequences) {
        const post = await send('POST', '/api/sequence', seq);

        if (post.status === 409) {
            const put = await send('PUT', `/api/sequence/${encodeURIComponent(seq.user_id)}`, seq);
            report(seq, put, 'updated');
            if (!put.ok) failed++;
        } else {
            report(seq, post, 'created');
            if (!post.ok) failed++;
        }
    }

    console.log('\nFinal state:');
    const list = await send('GET', '/api/sequences');
    if (list.ok) {
        list.body.forEach(s => {
            console.log(`  ${s.user_id.padEnd(16)} ${String(s.step_count).padStart(2)} steps  ${s.playback_mode}`);
        });
    }

    // Not process.exit(): fetch's keep-alive sockets are still open, and exiting
    // on top of them trips a libuv assert on Windows. Set the code and let node
    // close its own handles.
    process.exitCode = failed ? 1 : 0;
}

function report(seq, res, verb) {
    if (res.ok) {
        console.log(`  OK    ${seq.user_id} ${verb}, ${res.body.step_count} steps`);
        (res.body.warnings || []).forEach(w => console.log(`        warn: ${w.message}`));
    } else {
        console.log(`  FAIL  ${seq.user_id}: ${res.body.error || res.status}`);
        (res.body.errors || []).forEach(e => console.log(`        ${e.message}`));
    }
}

async function send(method, route, body) {
    const res = await fetch(BASE + route, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined
    });
    let parsed = {};
    try { parsed = await res.json(); } catch (e) { /* empty body */ }
    return { ok: res.ok, status: res.status, body: parsed };
}

main().catch(err => {
    console.error('Seeding failed:', err.message);
    console.error('Is the server running? Try: npm start');
    process.exitCode = 1;
});
