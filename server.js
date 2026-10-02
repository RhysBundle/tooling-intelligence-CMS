const express = require('express');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const TICatalogue = require('./shared/catalogue.js');
const TIEvents = require('./shared/event-types.js');
const TIValidator = require('./shared/sequence-validator.js');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'configs.db');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
// event-types.js and sequence-validator.js are required above AND served to
// the browser, so the builder, the player and the API share one rule set.
app.use('/shared', express.static(path.join(__dirname, 'shared')));

let db;

// Save database to file
function saveDatabase() {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
}

// Initialize database
async function initDatabase() {
    const SQL = await initSqlJs();
    
    // Load existing database or create new one
    if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
        console.log('📂 Loaded existing database');
    } else {
        db = new SQL.Database();
        console.log('📂 Created new database');
    }
    
    // Create table if it doesn't exist
    db.run(`
        CREATE TABLE IF NOT EXISTS user_configs (
            user_id TEXT PRIMARY KEY,
            solution TEXT NOT NULL,
            login_type TEXT NOT NULL,
            location TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);

    // Sequences are stored alongside, keyed on the same user_id, so a customer
    // can have the original four-field config, a sequence, or both. The
    // existing user_configs table is deliberately untouched: the live service
    // keeps working exactly as before if no sequence exists for a user.
    db.run(`
        CREATE TABLE IF NOT EXISTS sequences (
            user_id TEXT PRIMARY KEY,
            name TEXT,
            playback_mode TEXT NOT NULL DEFAULT 'auto',
            default_dwell_ms INTEGER NOT NULL DEFAULT 3000,
            steps TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);
    saveDatabase();
}

// ============================================
// HELPERS
// ============================================

function rowsFrom(results) {
    if (results.length === 0) return [];
    const columns = results[0].columns;
    return results[0].values.map(row => {
        const obj = {};
        columns.forEach((col, i) => obj[col] = row[i]);
        return obj;
    });
}

// steps is stored as a JSON string; hand the client real objects.
function hydrateSequence(row) {
    let steps = [];
    try {
        steps = JSON.parse(row.steps);
    } catch (e) {
        steps = [];
    }
    return Object.assign({}, row, { steps, step_count: steps.length });
}

function sequenceExists(userId) {
    const stmt = db.prepare('SELECT user_id FROM sequences WHERE user_id = ?');
    stmt.bind([userId]);
    const exists = stmt.step();
    stmt.free();
    return exists;
}

// Normalise whatever the client sent into the shape the validator expects.
function normaliseSequence(body, userId) {
    return {
        user_id: (userId !== undefined ? userId : body.user_id) || '',
        name: body.name || '',
        playback_mode: body.playback_mode || 'auto',
        default_dwell_ms: body.default_dwell_ms == null ? 3000 : Number(body.default_dwell_ms),
        steps: Array.isArray(body.steps) ? body.steps : []
    };
}

// ============================================
// API ENDPOINTS
// ============================================

// Get all configurations (for CMS listing)
app.get('/api/configs', (req, res) => {
    try {
        const results = db.exec('SELECT * FROM user_configs ORDER BY updated_at DESC');
        if (results.length === 0) {
            return res.json([]);
        }
        
        const columns = results[0].columns;
        const configs = results[0].values.map(row => {
            const obj = {};
            columns.forEach((col, i) => obj[col] = row[i]);
            return obj;
        });
        
        res.json(configs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single configuration by user ID (for Storyline)
app.get('/api/config/:userId', (req, res) => {
    try {
        const stmt = db.prepare('SELECT * FROM user_configs WHERE user_id = ?');
        stmt.bind([req.params.userId]);
        
        if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            res.json(row);
        } else {
            stmt.free();
            res.status(404).json({ error: 'User ID not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create new configuration
app.post('/api/config', (req, res) => {
    const { user_id, solution, login_type, location } = req.body;
    
    // Validate required fields
    if (!user_id || !solution || !login_type || !location) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    
    try {
        // Check if user_id already exists
        const checkStmt = db.prepare('SELECT user_id FROM user_configs WHERE user_id = ?');
        checkStmt.bind([user_id]);
        const exists = checkStmt.step();
        checkStmt.free();
        
        if (exists) {
            return res.status(409).json({ error: 'User ID already exists' });
        }
        
        db.run(`
            INSERT INTO user_configs (user_id, solution, login_type, location)
            VALUES (?, ?, ?, ?)
        `, [user_id, solution, login_type, location]);
        
        saveDatabase();
        
        res.status(201).json({ 
            message: 'Configuration created successfully',
            user_id 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update existing configuration
app.put('/api/config/:userId', (req, res) => {
    const { solution, login_type, location } = req.body;
    const userId = req.params.userId;
    
    try {
        // Check if exists
        const checkStmt = db.prepare('SELECT user_id FROM user_configs WHERE user_id = ?');
        checkStmt.bind([userId]);
        const exists = checkStmt.step();
        checkStmt.free();
        
        if (!exists) {
            return res.status(404).json({ error: 'User ID not found' });
        }
        
        db.run(`
            UPDATE user_configs 
            SET solution = ?, login_type = ?, location = ?, updated_at = datetime('now')
            WHERE user_id = ?
        `, [solution, login_type, location, userId]);
        
        saveDatabase();
        
        res.json({ message: 'Configuration updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete configuration
app.delete('/api/config/:userId', (req, res) => {
    try {
        // Check if exists first
        const checkStmt = db.prepare('SELECT user_id FROM user_configs WHERE user_id = ?');
        checkStmt.bind([req.params.userId]);
        const exists = checkStmt.step();
        checkStmt.free();
        
        if (!exists) {
            return res.status(404).json({ error: 'User ID not found' });
        }
        
        db.run('DELETE FROM user_configs WHERE user_id = ?', [req.params.userId]);
        saveDatabase();
        
        res.json({ message: 'Configuration deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// SEQUENCE API
// ============================================

// The event catalogue, so a client does not have to hardcode it.
app.get('/api/event-types', (req, res) => {
    res.json({
        event_types: TIEvents.EVENT_TYPES,
        product_types: TIEvents.PRODUCT_TYPES,
        hardware: TIEvents.HARDWARE,
        catalogue: { categories: TICatalogue.CATEGORIES, products: TICatalogue.PRODUCTS },
        limits: {
            max_steps: TIValidator.MAX_STEPS,
            min_dwell_ms: TIValidator.MIN_DWELL,
            max_dwell_ms: TIValidator.MAX_DWELL
        }
    });
});

// Dry-run validation. The builder calls this on save; it is also the endpoint
// to point at when someone asks "would this sequence be accepted?".
app.post('/api/sequence/validate', (req, res) => {
    const sequence = normaliseSequence(req.body, req.body.user_id);
    res.json(TIValidator.validate(sequence));
});

// List all sequences (for CMS listing).
app.get('/api/sequences', (req, res) => {
    try {
        const rows = rowsFrom(db.exec(
            'SELECT user_id, name, playback_mode, default_dwell_ms, steps, created_at, updated_at ' +
            'FROM sequences ORDER BY updated_at DESC'
        ));
        res.json(rows.map(hydrateSequence));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get one sequence by user ID. This is what the player and Storyline fetch.
app.get('/api/sequence/:userId', (req, res) => {
    try {
        const stmt = db.prepare('SELECT * FROM sequences WHERE user_id = ?');
        stmt.bind([req.params.userId]);

        if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            res.json(hydrateSequence(row));
        } else {
            stmt.free();
            res.status(404).json({ error: 'No sequence for this user ID' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create a sequence.
app.post('/api/sequence', (req, res) => {
    const sequence = normaliseSequence(req.body, req.body.user_id);

    const result = TIValidator.validate(sequence);
    if (!result.valid) {
        return res.status(400).json({ error: 'Sequence is not valid', ...result });
    }

    try {
        if (sequenceExists(sequence.user_id)) {
            return res.status(409).json({ error: 'A sequence already exists for this User ID' });
        }

        db.run(`
            INSERT INTO sequences (user_id, name, playback_mode, default_dwell_ms, steps)
            VALUES (?, ?, ?, ?, ?)
        `, [
            sequence.user_id,
            sequence.name,
            sequence.playback_mode,
            sequence.default_dwell_ms,
            JSON.stringify(sequence.steps)
        ]);

        saveDatabase();

        res.status(201).json({
            message: 'Sequence created successfully',
            user_id: sequence.user_id,
            step_count: sequence.steps.length,
            warnings: result.warnings
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Replace a sequence. Reordering is a PUT with the steps in the new order,
// so there is no separate reorder endpoint to keep in sync.
app.put('/api/sequence/:userId', (req, res) => {
    const userId = req.params.userId;
    const sequence = normaliseSequence(req.body, userId);

    const result = TIValidator.validate(sequence);
    if (!result.valid) {
        return res.status(400).json({ error: 'Sequence is not valid', ...result });
    }

    try {
        if (!sequenceExists(userId)) {
            return res.status(404).json({ error: 'No sequence for this user ID' });
        }

        db.run(`
            UPDATE sequences
            SET name = ?, playback_mode = ?, default_dwell_ms = ?, steps = ?, updated_at = datetime('now')
            WHERE user_id = ?
        `, [
            sequence.name,
            sequence.playback_mode,
            sequence.default_dwell_ms,
            JSON.stringify(sequence.steps),
            userId
        ]);

        saveDatabase();

        res.json({
            message: 'Sequence updated successfully',
            step_count: sequence.steps.length,
            warnings: result.warnings
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete a sequence. Leaves the user's four-field config alone.
app.delete('/api/sequence/:userId', (req, res) => {
    try {
        if (!sequenceExists(req.params.userId)) {
            return res.status(404).json({ error: 'No sequence for this user ID' });
        }

        db.run('DELETE FROM sequences WHERE user_id = ?', [req.params.userId]);
        saveDatabase();

        res.json({ message: 'Sequence deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start server
initDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`\n🚀 TI Storyline Config Server running on port ${PORT}`);
        console.log(`\n📋 CMS:       http://localhost:${PORT}`);
        console.log(`🧩 Builder:   http://localhost:${PORT}/sequences.html`);
        console.log(`▶️  Player:    http://localhost:${PORT}/player.html?user=TI_DEMO`);
        console.log(`📡 API:       http://localhost:${PORT}/api/config/{userId}`);
        console.log(`📡 Sequence:  http://localhost:${PORT}/api/sequence/{userId}`);
        console.log(`\n💡 Storyline will fetch: GET /api/config/{userId} and GET /api/sequence/{userId}\n`);
    });
}).catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});
