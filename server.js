/**
 * MAGGIE Core Server — Gemma AI companion Experiment
 * ====================================================
 * Express server exposing the MemoryKeep engine via HTTP.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const MemoryKeepEngine = require('./engine/memory-keep');

const app = express();
const PORT = process.env.PORT || 8000;

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: '20mb' })); // Large limit for base64 images
app.use(express.static(path.join(__dirname, 'public')));

// --- Initialize Engine ---
const engine = new MemoryKeepEngine(
    path.join(__dirname, 'engine', 'config.json')
);

// =========================================================================
// ROUTES
// =========================================================================

/**
 * POST /chat — Send a message, get a reply
 */
app.post('/chat', async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) {
            return res.status(400).json({ error: 'Message is required.' });
        }

        // Pass visitor token so MAGGIE knows who she's talking to
        const visitorToken = req.headers['x-visitor-token'] || null;

        console.log(`\n[Chat] User: ${message.slice(0, 80)}...`);
        const reply = await engine.handleMessage(message, visitorToken);
        console.log(`[Chat] MAGGIE: ${reply.slice(0, 80)}...`);

        res.json({ reply });
    } catch (err) {
        console.error('[Chat Error]', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /vision — Send an image + optional message for vision analysis
 */
app.post('/vision', async (req, res) => {
    try {
        const { image, message } = req.body;
        if (!image) {
            return res.status(400).json({ error: 'Image data is required.' });
        }

        console.log(`\n[Vision] Image received (${Math.round(image.length / 1024)}KB)`);
        const reply = await engine.handleVisionMessage(image, message || 'What do you see in this image?');
        console.log(`[Vision] MAGGIE ${reply.slice(0, 80)}...`);

        res.json({ reply });
    } catch (err) {
        console.error('[Vision Error]', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /status — Memory statistics
 */
app.get('/status', async (req, res) => {
    try {
        const status = await engine.getStatus();
        res.json(status);
    } catch (err) {
        console.error('[Status Error]', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /history — Current stream state
 */
app.get('/history', (req, res) => {
    res.json({ history: engine.stream });
});

/**
 * GET /graph — Knowledge graph data
 */
app.get('/graph', async (req, res) => {
    try {
        const stats = await engine.getGraphStats();
        res.json(stats);
    } catch (err) {
        console.error('[Graph Error]', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /register — Register or recognize a visitor
 */
app.post('/register', async (req, res) => {
    try {
        const { name, email } = req.body;
        if (!email || !email.includes('@')) {
            return res.status(400).json({ error: 'Valid email is required.' });
        }

        // Use Origin header for site isolation, fallback to referer or 'default'
        const origin = req.headers.origin || req.headers.referer || 'default';
        let siteOrigin = 'default';
        try { siteOrigin = new URL(origin).hostname || 'default'; } catch { }

        const result = await engine.registerVisitor(name || 'Friend', email, siteOrigin);
        res.json(result);
    } catch (err) {
        console.error('[Register Error]', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /whoami — Look up visitor by token
 */
app.get('/whoami', async (req, res) => {
    try {
        const token = req.headers['x-visitor-token'];
        if (!token) {
            return res.json({ recognized: false });
        }

        const visitor = await engine.getVisitorByToken(token);
        if (!visitor) {
            return res.json({ recognized: false });
        }

        res.json({
            recognized: true,
            name: visitor.name,
            email: visitor.email,
            firstSeen: visitor.first_seen,
            lastSeen: visitor.last_seen
        });
    } catch (err) {
        console.error('[WhoAmI Error]', err);
        res.json({ recognized: false });
    }
});

/**
 * GET /api/reports — List all autonomous reports
 */
app.get('/api/reports', async (req, res) => {
    try {
        const fs = require('fs').promises;
        const reportsDir = path.join(__dirname, 'public', 'reports');

        // Ensure directory exists
        try {
            await fs.access(reportsDir);
        } catch {
            await fs.mkdir(reportsDir, { recursive: true });
        }

        const files = await fs.readdir(reportsDir);
        const htmlFiles = files.filter(f => f.endsWith('.html') && f !== 'index.html');

        const reports = await Promise.all(htmlFiles.map(async f => {
            const stats = await fs.stat(path.join(reportsDir, f));
            return {
                name: f,
                displayName: f.replace(/_/g, ' ').replace('.html', '').replace(/\b\w/g, l => l.toUpperCase()),
                url: `/reports/${f}`,
                created: stats.birthtime,
                size: stats.size
            };
        }));

        res.json({ reports });
    } catch (err) {
        console.error('[Reports List Error]', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/telegram — Telegram Webhook Receiver
 */
app.post('/api/telegram', async (req, res) => {
    try {
        console.log('[Telegram Webhook] Received update.');
        await engine.handleTelegramWebhook(req.body);
        res.json({ ok: true });
    } catch (err) {
        console.error('[Telegram Webhook Error]', err);
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// START
// =========================================================================

app.listen(PORT, () => {
    console.log(`\n╔══════════════════════════════════════════════╗`);
    console.log(`║   MAGGIE ACTIVE — Memory-Aug-Graph-Entity    ║`);
    console.log(`║   Port: ${PORT}                                ║`);
    console.log(`║   Mode: Neural-Keep (Graph + Vision)         ║`);
    console.log(`║   UI:   http://localhost:${PORT}                ║`);
    console.log(`╚══════════════════════════════════════════════╝\n`);
});

module.exports = app;