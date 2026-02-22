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

        console.log(`\n[Chat] User: ${message.slice(0, 80)}...`);
        const reply = await engine.handleMessage(message);
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
app.get('/status', (req, res) => {
    try {
        const status = engine.getStatus();
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
app.get('/graph', (req, res) => {
    try {
        const stats = engine.getGraphStats();
        res.json(stats);
    } catch (err) {
        console.error('[Graph Error]', err);
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
