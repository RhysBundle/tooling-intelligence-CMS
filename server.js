const express = require('express');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'configs.db');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

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
    saveDatabase();
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

// Start server
initDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`\n🚀 TI Storyline Config Server running on port ${PORT}`);
        console.log(`\n📋 CMS:     http://localhost:${PORT}`);
        console.log(`📡 API:     http://localhost:${PORT}/api/config/{userId}`);
        console.log(`\n💡 Storyline will fetch: GET /api/config/{userId}\n`);
    });
}).catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});
