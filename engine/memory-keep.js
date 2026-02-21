/**
 * MAIce Engine — Mistral AI companion Experiment
 * ================================================
 * MemoryKeep architecture with agentic tools.
 * 
 * Architecture (MK3 Blueprint + Graph + Agentic):
 *   1. Core Memory   — identity/personality (always loaded)
 *   2. Directives    — rules/constraints (always loaded)
 *   3. Stream        — active conversation buffer (capped at 85%)
 *   4. Experience    — important past events (SQLite)
 *   5. Domain        — structured job data (SQLite)
 *   6. Graph Memory  — neurographical knowledge graph (nodes + edges)
 * 
 * Capabilities:
 *   - Agentic Tools — search, remember, tasks, email, vision, fetch, analyze
 */

const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const nodemailer = require('nodemailer');
const puppeteer = require('puppeteer');
const TelegramBot = require('node-telegram-bot-api');

class MemoryKeepEngine {
  constructor(configPath = null, dbPath = null) {
    const engineDir = path.dirname(__filename || __dirname);
    const cfgFile = configPath || path.join(engineDir, 'config.json');
    this.config = JSON.parse(fs.readFileSync(cfgFile, 'utf-8'));

    // --- Google GenAI Client ---
    const googleKey = process.env.GOOGLE_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    // Choose the key, ensuring we don't use the placeholder
    this.apiKey = googleKey;
    if (!this.apiKey || this.apiKey.includes('YOUR_GOOGLE_AI_API_KEY_HERE')) {
      this.apiKey = geminiKey;
    }

    if (!this.apiKey || this.apiKey.includes('YOUR_GOOGLE_AI_API_KEY_HERE')) {
      console.warn('[MAGGIE] WARNING: No valid Google/Gemini API key found in .env.');
    }

    // Use v1beta for Gemma 3 compatibility as per documentation
    this.genAI = new GoogleGenerativeAI(this.apiKey, { apiVersion: 'v1beta' });

    // --- Database ---
    this.isVercel = process.env.VERCEL === '1';
    if (this.isVercel) {
      console.log('[MAIce] Vercel environment detected. Using /tmp for database.');
      this.dbPath = '/tmp/memory_keep.db';
      // If it doesn't exist in /tmp, we might want to copy an initial one if it exists in process.cwd()
      // But for serverless, it usually starts fresh or we rely on external DB.
      // better-sqlite3 will create it if it doesn't exist.
    } else {
      this.dbPath = dbPath || path.join(process.cwd(), 'memory_keep.db');
    }
    this.setupStorage();

    // --- Flat Files (always-loaded) ---
    this.coreMemory = this._loadFlat(path.join(engineDir, 'core_memory.txt'));
    this.directives = this._loadFlat(path.join(engineDir, 'directives.txt'));

    // --- Stream (conscious thought) ---
    this.streamFile = this.isVercel ? '/tmp/stream_state.json' : path.join(process.cwd(), 'stream_state.json');
    this.stream = this._loadStream();

    // --- Timing & Rate Limiting ---
    this.lastInteraction = Date.now();
    this.lastLLMCall = 0;
    this.llmQueue = Promise.resolve(); // Queue for serializing LLM calls
    this.llmBusy = false; // Global lock to prevent overlapping background/foreground calls
    this.lastPrompts = new Map(); // Store hash/content of recent prompts to prevent redundancy

    // --- Heartbeat (autonomous background loop) ---
    this.heartbeatInterval = null;
    this.heartbeatMinutes = this.config.heartbeat_minutes || 30;
    if (!this.isVercel) {
      this.startHeartbeat();
    } else {
      console.log('[MAIce] Heartbeat disabled in Vercel environment.');
    }

    // --- Telegram Bot (2-way chat) ---
    this.telegramBot = null;
    if (!this.isVercel) {
      this.setupTelegramBot();
    } else {
      console.log('[MAIce] Telegram Bot disabled in Vercel environment.');
    }

    console.log('[MAIce] Engine initialized.');
    console.log(`  Model: ${this.config.model_name}`);
    console.log(`  Vision: ${this.config.vision_model_name}`);
    console.log(`  Sifter: ${this.config.sifter_model_name}`);
    console.log(`  Context Cap: ${this.config.app_context_cap} tokens`);
    console.log(`  Heartbeat: every ${this.heartbeatMinutes} minutes`);
    console.log(`  DB: ${this.dbPath}`);
  }

  // =========================================================================
  // STORAGE SETUP
  // =========================================================================

  setupStorage() {
    const Database = require('better-sqlite3');
    const db = new Database(this.dbPath);

    db.exec(`
      CREATE TABLE IF NOT EXISTS experience_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS domain_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT,
        value TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // --- Graph Memory (Neurographical Knowledge Graph) ---
    db.exec(`
      CREATE TABLE IF NOT EXISTS graph_nodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT UNIQUE,
        type TEXT DEFAULT 'entity',
        strength REAL DEFAULT 1.0,
        first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS graph_edges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_label TEXT,
        target_label TEXT,
        relationship TEXT,
        weight REAL DEFAULT 1.0,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(source_label, target_label, relationship)
      )
    `);

    // --- Tasks (Agentic Task Management) ---
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        description TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME
      )
    `);

    db.close();
  }

  _getDb() {
    const Database = require('better-sqlite3');
    return new Database(this.dbPath);
  }

  // =========================================================================
  // FLAT FILE LOADERS
  // =========================================================================

  _loadFlat(filepath) {
    try {
      return fs.readFileSync(filepath, 'utf-8');
    } catch {
      return '';
    }
  }

  // =========================================================================
  // STREAM MANAGEMENT
  // =========================================================================

  _loadStream() {
    try {
      if (fs.existsSync(this.streamFile)) {
        return JSON.parse(fs.readFileSync(this.streamFile, 'utf-8'));
      }
    } catch { /* corrupt file, start fresh */ }
    return [];
  }

  _saveStream() {
    fs.writeFileSync(this.streamFile, JSON.stringify(this.stream, null, 2));
  }

  _getTokenEstimate(text) {
    return Math.ceil((text || '').length / 4);
  }

  _getStreamTokens() {
    return this.stream.reduce((sum, m) => sum + this._getTokenEstimate(m.content), 0);
  }

  // =========================================================================
  // LLM CALLS (MISTRAL)
  // =========================================================================

  async callLLM(messages, purpose = 'inference') {
    // Chain onto the queue to ensure serialization
    const task = async () => {
      // --- Rate Limiting (Increased throttle to 2s) ---
      const now = Date.now();
      const timeSinceLast = now - (this.lastLLMCall || 0);
      if (timeSinceLast < 2000) {
        const wait = 2000 - timeSinceLast;
        console.log(`[Rate Limit] Throttling ${purpose} for ${wait}ms...`);
        await new Promise(r => setTimeout(r, wait));
      }

      // --- Redundancy Check (Loosened to 1.5s) ---
      const promptKey = JSON.stringify(messages).slice(-200);
      if (this.lastPrompts.has(promptKey) && (now - this.lastPrompts.get(promptKey)) < 1500) {
        console.warn(`[Redundancy] Blocking redundant ${purpose} call.`);
        return '';
      }
      this.lastPrompts.set(promptKey, Date.now());
      // Clean up old prompts
      if (this.lastPrompts.size > 20) {
        const firstKey = this.lastPrompts.keys().next().value;
        this.lastPrompts.delete(firstKey);
      }

      this.llmBusy = true;
      this.lastLLMCall = Date.now();

      const purposeGroup = purpose.toLowerCase();
      let modelId = this.config.model_name;

      if (purposeGroup === 'sifting' || purposeGroup === 'classification' || purposeGroup === 'intake-classification') {
        modelId = this.config.sifter_model_name;
      }

      const temperature = purposeGroup === 'inference' ? 0.7 : 0.1;

      try {
        // Transform messages to Gemini/Gemma format
        // Gemma 3 STRICTNESS: Alternating turns (User -> Model) and Native System Instruction.
        let contents = [];
        // UNIFIED SYSTEM INSTRUCTION: Core Identity + Directives (Hardened Macy)
        systemParts.push({ text: `${this.coreMemory}\n\nDIRECTIVES:\n${this.directives}` });

        messages.forEach((m, idx) => {
          if (m.role === 'system') {
            // Append any additional system task info to the instructions
            systemParts[0].text += `\n\n[TASK NOTE] ${m.content}`;
          } else {
            // Other system messages (tool results, notes) are treated as user turns
            let role = m.role === 'assistant' ? 'model' : 'user';
            const lastTurn = contents[contents.length - 1];
            if (lastTurn && lastTurn.role === role) {
              lastTurn.parts[0].text += '\n\n' + m.content;
            } else {
              contents.push({ role, parts: [{ text: m.content }] });
            }
          }
        });

        // Ensure we start with a user turn (Gemini requirement)
        if (contents.length > 0 && contents[0].role === 'model') {
          contents.unshift({ role: 'user', parts: [{ text: '[Initializing conversation]' }] });
        }

        const model = this.genAI.getGenerativeModel({
          model: modelId,
          systemInstruction: systemParts.length > 0 ? { parts: systemParts } : undefined
        });

        // --- 60s Timeout Safety ---
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Neural link timed out (55s)')), 55000));

        const result = await Promise.race([
          model.generateContent({
            contents,
            generationConfig: { temperature, maxOutputTokens: 2048 },
          }),
          timeoutPromise
        ]);

        const text = result.response.text();

        if (result.response.usageMetadata) {
          console.log(`[Token Usage] ${purpose}: ${JSON.stringify(result.response.usageMetadata)}`);
        }

        return text;
      } catch (err) {
        process.stdout.write(`\n❌ [LLM Error: ${purpose}] ${err.message}\n`);
        if (purpose === 'inference') return `[System Error] Neural core timeout or disconnect. (Ref: ${err.message.slice(0, 50)})`;
        return '';
      } finally {
        this.llmBusy = false; // RELEASE LOCK
      }
    };

    // Add to queue and return result provided by the queue promise
    const resultPromise = this.llmQueue.then(task);

    // Update queue pointer to wait for this task (catch errors so queue doesn't stall)
    this.llmQueue = resultPromise.catch(() => { });

    return resultPromise;
  }

  // =========================================================================
  // INTAKE VALVE — AI decides what's important
  // =========================================================================

  async intakeValve(msg) {
    const prompt = [
      {
        role: 'system',
        content: 'Classify if the following message contains important facts, preferences, or patterns to remember long-term. Respond ONLY with "YES" or "NO".'
      },
      { role: 'user', content: msg }
    ];

    try {
      const decision = await this.callLLM(prompt, 'classification');
      if (decision && decision.toUpperCase().includes('YES')) {
        this.saveExperience(msg);
        console.log('[Intake Valve] Fact recorded to Experience Memory.');

        // --- Graph Extraction (async, non-blocking) ---
        this.extractAndStoreGraph(msg).catch(err =>
          console.error('[Graph Extraction Error]', err.message)
        );
      }
    } catch (err) {
      console.error('[Intake Valve Error]', err.message);
    }
  }

  // Internal helper for graph persistence
  _storeGraphData(graph) {
    try {
      const db = this._getDb();
      // Upsert nodes
      const upsertNode = db.prepare(`
        INSERT INTO graph_nodes (label, type) VALUES (?, ?)
        ON CONFLICT(label) DO UPDATE SET
          strength = strength + 0.5,
          last_seen = CURRENT_TIMESTAMP
      `);

      for (const entity of (graph.entities || [])) {
        if (entity.label) {
          upsertNode.run(entity.label.toLowerCase().trim(), entity.type || 'entity');
        }
      }

      // Upsert edges
      const upsertEdge = db.prepare(`
        INSERT INTO graph_edges (source_label, target_label, relationship) VALUES (?, ?, ?)
        ON CONFLICT(source_label, target_label, relationship) DO UPDATE SET
          weight = weight + 1.0,
          timestamp = CURRENT_TIMESTAMP
      `);

      for (const rel of (graph.relationships || [])) {
        if (rel.source && rel.target && rel.relationship) {
          upsertEdge.run(
            rel.source.toLowerCase().trim(),
            rel.target.toLowerCase().trim(),
            rel.relationship.toLowerCase().trim()
          );
        }
      }
      db.close();
      console.log(`[Graph] Perspective updated via Intake Valve.`);
    } catch (err) {
      console.error('[Graph Persistence Error]', err.message);
    }
  }

  // =========================================================================
  // EXPERIENCE & DOMAIN MEMORY
  // =========================================================================

  saveExperience(content) {
    const db = this._getDb();
    db.prepare('INSERT INTO experience_memory (content) VALUES (?)').run(content);
    db.close();
  }

  saveDomain(key, value) {
    const db = this._getDb();
    db.prepare('INSERT INTO domain_memory (key, value) VALUES (?, ?)').run(key, value);
    db.close();
  }

  getRecentExperiences(limit = 5) {
    const db = this._getDb();
    const rows = db.prepare(
      "SELECT content, timestamp FROM experience_memory WHERE content NOT LIKE '[Sifter Pattern]%' ORDER BY timestamp DESC LIMIT ?"
    ).all(limit);
    db.close();
    return rows;
  }

  getSifterPatterns(limit = 3) {
    const db = this._getDb();
    const rows = db.prepare(
      "SELECT content FROM experience_memory WHERE content LIKE '[Sifter Pattern]%' ORDER BY timestamp DESC LIMIT ?"
    ).all(limit);
    db.close();
    return rows.map(r => ({ content: r.content.replace('[Sifter Pattern] ', '') }));
  }

  // =========================================================================
  // SEARCH TOOL (DuckDuckGo)
  // =========================================================================

  async searchInternet(query) {
    console.log(`[Tool] Searching DuckDuckGo: ${query}`);
    try {
      // Use a simple fetch-based DuckDuckGo search
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      const response = await fetch(url);
      const data = await response.json();

      const results = [];
      if (data.Abstract) {
        results.push({ title: data.Heading, body: data.Abstract, url: data.AbstractURL });
      }
      if (data.RelatedTopics) {
        for (const topic of data.RelatedTopics.slice(0, 3)) {
          if (topic.Text) {
            results.push({ title: topic.Text.slice(0, 60), body: topic.Text, url: topic.FirstURL || '' });
          }
        }
      }
      if (results.length === 0) {
        results.push({ title: 'Search completed', body: `Search for "${query}" returned limited results from DuckDuckGo instant answers. The AI should use its knowledge to respond.`, url: '' });
      }
      return JSON.stringify(results, null, 2);
    } catch (err) {
      return `Search failed: ${err.message}`;
    }
  }

  // =========================================================================
  // AGENTIC TOOLS
  // =========================================================================

  /** REMEMBER — Save a key-value fact to Domain Memory */
  toolRemember(args) {
    const eqIdx = args.indexOf('=');
    if (eqIdx === -1) {
      this.saveExperience(args.trim());
      console.log(`[Tool:REMEMBER] Saved to experience: ${args.trim().slice(0, 60)}`);
      return `Noted and saved to experience memory: "${args.trim()}"`;
    }
    const key = args.slice(0, eqIdx).trim();
    const value = args.slice(eqIdx + 1).trim();
    this.saveDomain(key, value);
    console.log(`[Tool:REMEMBER] Saved domain fact: ${key} = ${value.slice(0, 40)}`);
    return `Saved to domain memory: ${key} = ${value}`;
  }

  /** TASK_ADD — Create a new task */
  toolTaskAdd(description) {
    const db = this._getDb();
    const info = db.prepare('INSERT INTO tasks (description) VALUES (?)').run(description.trim());
    db.close();
    console.log(`[Tool:TASK_ADD] Created task #${info.lastInsertRowid}: ${description.trim()}`);
    return `Task #${info.lastInsertRowid} created: "${description.trim()}"`;
  }

  /** TASK_LIST — List all pending tasks */
  toolTaskList() {
    const db = this._getDb();
    const tasks = db.prepare("SELECT id, description, status, created_at FROM tasks ORDER BY created_at DESC LIMIT 20").all();
    db.close();
    if (tasks.length === 0) return 'No tasks found. The task list is empty.';
    const lines = tasks.map(t => `#${t.id} [${t.status.toUpperCase()}] ${t.description} (${t.created_at})`);
    console.log(`[Tool:TASK_LIST] ${tasks.length} tasks`);
    return `Current tasks:\n${lines.join('\n')}`;
  }

  /** TASK_DONE — Mark a task as complete */
  toolTaskDone(idStr) {
    const id = parseInt(idStr.replace('#', '').trim());
    if (isNaN(id)) return 'Invalid task ID.';
    const db = this._getDb();
    const changes = db.prepare("UPDATE tasks SET status = 'done', completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(id).changes;
    db.close();
    if (changes === 0) return `Task #${id} not found.`;
    console.log(`[Tool:TASK_DONE] Completed task #${id}`);
    return `Task #${id} marked as done.`;
  }

  /** ANALYZE — Analyze the knowledge graph for insights */
  async toolAnalyze() {
    const stats = this.getGraphStats();
    if (stats.nodeCount === 0) return 'The knowledge graph is empty. Talk more to build connections.';

    const nodesStr = stats.topNodes.map(n => `${n.label} (${n.type}, strength: ${n.strength})`).join(', ');
    const edgesStr = stats.recentEdges.map(e => `${e.source_label} —[${e.relationship}]→ ${e.target_label}`).join('; ');

    const analysisProtocol = `${this.coreMemory}\n\nDIRECTIVES:\n${this.directives}\n\n[TASK] Analyze this knowledge graph for insights. Be concise and insightful.`;
    const prompt = [
      { role: 'system', content: analysisProtocol },
      { role: 'user', content: `Nodes: ${stats.nodeCount}, Edges: ${stats.edgeCount}. Top nodes: ${stats.topNodes.map(n => n.label).join(', ')}` }
    ];

    const analysis = await this.callLLM(prompt, 'sifting');
    console.log(`[Tool:ANALYZE] Graph analysis complete`);
    return `Graph Analysis (${stats.nodeCount} nodes, ${stats.edgeCount} edges):\n${analysis}`;
  }

  /** FETCH — Fetch and summarize a URL */
  async toolFetch(url) {
    console.log(`[Tool:FETCH] Fetching: ${url.trim()}`);
    try {
      const response = await fetch(url.trim());
      const text = await response.text();
      // Strip HTML tags, keep text content
      const cleaned = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 3000);
      return `Fetched content from ${url.trim()} (first 3000 chars):\n${cleaned}`;
    } catch (err) {
      return `Fetch failed for ${url}: ${err.message}`;
    }
  }

  /** TIME — Get current date and time */
  toolTime() {
    const now = new Date();
    const result = `Current date and time: ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at ${now.toLocaleTimeString('en-US')}`;
    console.log(`[Tool:TIME] ${result}`);
    return result;
  }

  /** EMAIL — Send an email via Hostinger SMTP */
  async toolEmail(args) {
    // Parse: to | subject | body
    const parts = args.split('|').map(s => s.trim());
    if (parts.length < 3) {
      return 'Email format: EMAIL: to@address.com | Subject | Body text';
    }
    const [to, subject, ...bodyParts] = parts;
    const body = bodyParts.join('|');

    const emailUser = process.env.MAICE_EMAIL_USER;
    const emailPass = process.env.MAICE_EMAIL_PASS;
    const emailHost = process.env.MAICE_EMAIL_HOST || 'smtp.hostinger.com';

    if (!emailUser || !emailPass) {
      return 'Email not configured. Set MAICE_EMAIL_USER and MAICE_EMAIL_PASS in .env';
    }

    try {
      const transporter = nodemailer.createTransport({
        host: emailHost,
        port: 465,
        secure: true,
        auth: { user: emailUser, pass: emailPass }
      });

      const info = await transporter.sendMail({
        from: `"MAIce" <${emailUser}>`,
        to,
        subject,
        text: body,
        html: body.replace(/\n/g, '<br>')
      });

      console.log(`[Tool:EMAIL] Sent to ${to}: ${subject} (${info.messageId})`);
      return `Email sent to ${to} with subject "${subject}". Message ID: ${info.messageId}`;
    } catch (err) {
      console.error('[Tool:EMAIL Error]', err.message);
      return `Email failed: ${err.message}`;
    }
  }

  // =========================================================================
  // BROWSE — Puppeteer Browser Automation
  // =========================================================================

  async _getBrowser() {
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
    return this.browser;
  }

  /** BROWSE — Full browser interaction: navigate, extract, click, screenshot */
  async toolBrowse(args) {
    if (this.isVercel) {
      return 'BROWSE tool is disabled in the Vercel environment (Puppeteer not supported).';
    }
    console.log(`[Tool:BROWSE] ${args.slice(0, 80)}`);
    try {
      const browser = await this._getBrowser();
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      // Parse command: URL [action]
      const firstSpace = args.indexOf(' ');
      let url = args.trim();
      let action = 'extract';

      if (firstSpace > 0 && args.trim().startsWith('http')) {
        const rest = args.slice(firstSpace).trim().toLowerCase();
        if (rest.startsWith('click') || rest.startsWith('screenshot') || rest.startsWith('extract') || rest.startsWith('type')) {
          url = args.slice(0, firstSpace).trim();
          action = rest;
        }
      }

      // Navigate
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
      const title = await page.title();

      let result = `Page loaded: "${title}" (${url})\n`;

      if (action.startsWith('screenshot')) {
        // Take screenshot, save to disk
        const ssPath = path.join(process.cwd(), 'public', 'screenshot.png');
        await page.screenshot({ path: ssPath, fullPage: false });
        result += `Screenshot saved.`;
      } else if (action.startsWith('click')) {
        const selector = action.replace('click', '').trim();
        if (selector) {
          await page.click(selector);
          await page.waitForNetworkIdle({ timeout: 5000 }).catch(() => { });
          result += `Clicked: ${selector}. New title: "${await page.title()}"`;
        }
      } else if (action.startsWith('type')) {
        // type selector | text
        const typeParts = action.replace('type', '').trim().split('|');
        if (typeParts.length >= 2) {
          await page.type(typeParts[0].trim(), typeParts[1].trim());
          result += `Typed into ${typeParts[0].trim()}`;
        }
      } else {
        // Default: extract text content
        const text = await page.evaluate(() => {
          const el = document.querySelector('article') || document.querySelector('main') || document.body;
          return el.innerText;
        });
        result += text.slice(0, 4000);
      }

      await page.close();
      return result;
    } catch (err) {
      console.error('[Tool:BROWSE Error]', err.message);
      return `Browse failed: ${err.message}`;
    }
  }

  async toolRead(filePath) {
    console.log(`[Tool:READ] Reading: ${filePath.trim()}`);
    try {
      // Basic security: ensure we don't read outside of C: users if possible, or just allow it since it's local.
      // For now, allow reading.
      let cleanPath = filePath.trim();
      // Remove quotes if present
      if (cleanPath.startsWith('"') && cleanPath.endsWith('"')) cleanPath = cleanPath.slice(1, -1);

      const content = fs.readFileSync(cleanPath, 'utf-8');
      return `Content of ${cleanPath}:\n${content.slice(0, 10000)}${content.length > 10000 ? '\n...[truncated]' : ''}`;
    } catch (err) {
      return `Failed to read file ${filePath}: ${err.message}`;
    }
  }

  async toolWrite(args) {
    // args: path | content
    const pipeIdx = args.indexOf('|');
    if (pipeIdx === -1) return 'Usage: WRITE: <path> | <content>';

    let filePath = args.slice(0, pipeIdx).trim();
    const content = args.slice(pipeIdx + 1).trim();

    if (filePath.startsWith('"') && filePath.endsWith('"')) filePath = filePath.slice(1, -1);

    console.log(`[Tool:WRITE] Writing to: ${filePath}`);
    try {
      // Ensure directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(filePath, content, 'utf-8');
      return `Successfully wrote to ${filePath}`;
    } catch (err) {
      return `Failed to write file ${filePath}: ${err.message}`;
    }
  }

  async toolListFiles(dirPath) {
    let cleanPath = dirPath.trim();
    if (cleanPath.startsWith('"') && cleanPath.endsWith('"')) cleanPath = cleanPath.slice(1, -1);

    console.log(`[Tool:LIST_FILES] Listing: ${cleanPath}`);
    try {
      const files = fs.readdirSync(cleanPath);
      return `Files in ${cleanPath}:\n${files.slice(0, 50).join('\n')}${files.length > 50 ? '\n...and more' : ''}`;
    } catch (err) {
      return `Failed to list files in ${cleanPath}: ${err.message}`;
    }
  }

  /** Route a tool call to the correct handler */
  async executeTool(toolName, toolArgs) {
    switch (toolName) {
      case 'SEARCH': return await this.searchInternet(toolArgs);
      case 'REMEMBER': return this.toolRemember(toolArgs);
      case 'TASK_ADD': return this.toolTaskAdd(toolArgs);
      case 'TASK_LIST': return this.toolTaskList();
      case 'TASK_DONE': return this.toolTaskDone(toolArgs);
      case 'ANALYZE': return await this.toolAnalyze();
      case 'FETCH': return await this.toolFetch(toolArgs);
      case 'READ': return await this.toolRead(toolArgs);
      case 'WRITE': return await this.toolWrite(toolArgs);
      case 'LIST_FILES': return await this.toolListFiles(toolArgs);
      case 'TIME': return this.toolTime();
      case 'EMAIL': return await this.toolEmail(toolArgs);
      case 'BROWSE': return await this.toolBrowse(toolArgs);
      case 'TELEGRAM': return await this.toolTelegram(toolArgs);
      default: return `Unknown tool: ${toolName}`;
    }
  }

  /** Get task stats for the status endpoint */
  getTaskStats() {
    const db = this._getDb();
    const pending = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'pending'").get().count;
    const done = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'done'").get().count;
    const recentTasks = db.prepare(
      "SELECT id, description, status, created_at FROM tasks ORDER BY created_at DESC LIMIT 5"
    ).all();
    db.close();
    return { pending, done, total: pending + done, recentTasks };
  }

  // =========================================================================
  // GRAPH MEMORY — Neurographical Knowledge Graph
  // =========================================================================

  // Removed dedicated extractAndStoreGraph as it is now part of unified intakeValve

  /**
   * Retrieve related memories by traversing the knowledge graph.
   * Given a query, find matching nodes and walk their edges.
   */
  getRelatedMemories(query, limit = 8) {
    const db = this._getDb();
    // Improved term extraction (ignoring common stop words could be here, but let's keep it simple for now)
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

    if (words.length === 0) { db.close(); return []; }

    // Find nodes matching any word in the query, prioritizing high strength
    const placeholders = words.map(() => 'label LIKE ?').join(' OR ');
    const params = words.map(w => `%${w}%`);

    const matchingNodes = db.prepare(
      `SELECT label, type, strength FROM graph_nodes WHERE ${placeholders} AND strength > 1.0 ORDER BY strength DESC LIMIT 15`
    ).all(...params);

    if (matchingNodes.length === 0) { db.close(); return []; }

    // Walk edges from matching nodes, prioritizing heavy weights
    const nodeLabels = matchingNodes.map(n => n.label);
    const edgePlaceholders = nodeLabels.map(() => '?').join(',');

    const edges = db.prepare(`
      SELECT source_label, target_label, relationship, weight
      FROM graph_edges
      WHERE (source_label IN (${edgePlaceholders}) OR target_label IN (${edgePlaceholders}))
      AND weight > 0.5
      ORDER BY weight DESC
      LIMIT ?
    `).all(...nodeLabels, ...nodeLabels, limit);

    db.close();

    // Format as readable context, filtering out weak associations
    const facts = edges.map(e =>
      `${e.source_label} —[${e.relationship}]→ ${e.target_label}`
    );

    return {
      nodes: matchingNodes,
      edges,
      summary: facts.length > 0
        ? `Graph recall (Active Nodes: ${nodeLabels.join(', ')}): ${facts.join('; ')}`
        : ''
    };
  }

  /**
   * Get graph statistics for the status endpoint.
   */
  getGraphStats() {
    const db = this._getDb();
    const nodeCount = db.prepare('SELECT COUNT(*) as count FROM graph_nodes').get().count;
    const edgeCount = db.prepare('SELECT COUNT(*) as count FROM graph_edges').get().count;
    const topNodes = db.prepare(
      'SELECT label, type, strength FROM graph_nodes ORDER BY strength DESC LIMIT 8'
    ).all();
    const recentEdges = db.prepare(
      'SELECT source_label, target_label, relationship FROM graph_edges ORDER BY timestamp DESC LIMIT 5'
    ).all();
    db.close();

    return { nodeCount, edgeCount, topNodes, recentEdges };
  }

  // =========================================================================
  // SIFTER — Pattern analysis during consolidation
  // =========================================================================

  async callSifterLLM(messages) {
    return this.callLLM(messages, 'sifting');
  }

  // =========================================================================
  // MEMORY KEEP PROCEDURE (The Sleep Simulation)
  // Snapshot → Sift → Persist → Flush → Resume
  // =========================================================================

  async performMemoryKeep() {
    console.log('\n--- [MAGGIE] Initiating Sleep Simulation (85% Cap) ---');

    // Step 1 — Snapshot
    const snapshot = this.stream.map(m => `${m.role}: ${m.content}`).join('\n');

    try {
      fs.writeFileSync(path.join(process.cwd(), 'last_snapshot.txt'), snapshot);
    } catch { /* non-critical */ }

    // Step 2 — Sift (Hardened Reboot Protocol)
    const siftPrompt = [
      {
        role: 'system',
        content: `You are 'The Sifter', an independent analytical observer. You are NOT the AI. Analyze this snapshot of raw conversation. Look for the 'Aha!' moments, structural behavioral patterns, and recurring themes. Respond ONLY with raw JSON: {"summary": "A high-level synthesis of what occurred", "patterns": ["Deep pattern 1", "Structural insight 2", ...]}`
      },
      { role: 'user', content: `SNAPSHOT FOR ANALYSIS:\n${snapshot}` }
    ];

    let analysisRaw = await this.callSifterLLM(siftPrompt);

    try {
      // Extract JSON from response
      const jsonStart = analysisRaw.indexOf('{');
      const jsonEnd = analysisRaw.lastIndexOf('}') + 1;

      if (jsonStart !== -1 && jsonEnd > jsonStart) {
        const analysis = JSON.parse(analysisRaw.slice(jsonStart, jsonEnd));

        // Step 3 — Persist patterns & Synaptic Pruning
        const db = this._getDb();
        for (const pattern of (analysis.patterns || [])) {
          this.saveExperience(`[Sifter Pattern] ${pattern}`);
        }

        // --- Synaptic Pruning (Lightweight Decay) ---
        // Decay strength of all nodes and weights of all edges
        db.prepare('UPDATE graph_nodes SET strength = strength * 0.95').run();
        db.prepare('UPDATE graph_edges SET weight = weight * 0.95').run();

        // Remove "forgotten" nodes and edges
        db.prepare('DELETE FROM graph_nodes WHERE strength < 0.1').run();
        db.prepare('DELETE FROM graph_edges WHERE weight < 0.1').run();

        db.close();
        console.log('[MAIce] Synaptic pruning complete (Graph weight decay applied).');

        // Step 4 — Flush + Resume
        const overlapN = parseInt(this.config.rolling_overlap || 3);
        const overlap = this.stream.slice(-overlapN);

        this.stream = [
          { role: 'system', content: `[CONSOLIDATION SUMMARY] ${analysis.summary || 'Conversation consolidated.'}` },
          ...overlap
        ];
        this._saveStream();
        console.log('[MAIce] Sleep Simulation complete. Waking in fresh context.\n');
      } else {
        throw new Error('No valid JSON found in sifter output.');
      }
    } catch (err) {
      console.error('[Sifter Error]', err.message, '— Flushing stream.');
      // Emergency flush: keep last 5 messages
      this.stream = this.stream.slice(-5);
      this._saveStream();
    }
  }

  // =========================================================================
  // HANDLE MESSAGE — Main entry point
  // =========================================================================

  async handleMessage(userMsg) {
    this.lastInteraction = Date.now();

    // --- Async Intake Valve (don't block the response) ---
    this.intakeValve(userMsg).catch(err =>
      console.error('[Intake Valve Async Error]', err.message)
    );

    // --- Context Cap Check ---
    const cap = this.config.app_context_cap || 64000;
    const currentTokens = this._getStreamTokens();
    if (currentTokens > cap * 0.85) {
      await this.performMemoryKeep();
    }

    // --- Graph Recall (Passive Associative Retrieval) ---
    let graphContext = '';
    try {
      const graphResult = this.getRelatedMemories(userMsg);
      if (graphResult.summary) {
        graphContext = `\n\n[GRAPH MEMORY] ${graphResult.summary}`;
        console.log(`[Graph Recall] ${graphResult.nodes.length} nodes, ${graphResult.edges.length} edges activated.`);
      }
    } catch (err) { /* non-critical */ }

    // --- Build Task Prompt (Identity handled by callLLM) ---
    const toolProtocol = `
[AGENTIC TOOLS] You have access to the following tools. Use them by writing the tool command on its own line:
  SEARCH, REMEMBER, TASK_ADD, TASK_LIST, TASK_DONE, ANALYZE, FETCH, READ, WRITE, LIST_FILES, TIME, EMAIL, BROWSE, TELEGRAM.`;

    const instructions = `${this.coreMemory}\n\nDIRECTIVES:\n${this.directives}${graphContext}\n\n${toolProtocol}`;

    const messages = [
      { role: 'system', content: instructions },
      ...this.stream.slice(-12), // Limit context window for performance
      { role: 'user', content: userMsg }
    ];

    // --- LLM Call ---
    let reply = await this.callLLM(messages, 'inference');

    // --- Multi-Tool Agent Loop (Optimized rounds: 2) ---
    const TOOL_NAMES = ['SEARCH', 'REMEMBER', 'TASK_ADD', 'TASK_LIST', 'TASK_DONE', 'ANALYZE', 'FETCH', 'READ', 'WRITE', 'LIST_FILES', 'TIME', 'EMAIL', 'BROWSE', 'TELEGRAM'];
    let toolRound = 0;

    while (toolRound < 2) {
      const toolCalls = [];
      const lines = reply.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        for (const tool of TOOL_NAMES) {
          const prefix = tool + ':';
          if (trimmed.toUpperCase().startsWith(prefix)) {
            const args = trimmed.slice(prefix.length).trim();
            toolCalls.push({ tool, args });
            break;
          }
          // Also match tools with no args (ANALYZE, TASK_LIST, TIME)
          if (trimmed.toUpperCase() === tool) {
            toolCalls.push({ tool, args: '' });
            break;
          }
        }
      }

      if (toolCalls.length === 0) break; // No tools detected, done

      // Execute all detected tools
      const results = [];
      for (const { tool, args } of toolCalls) {
        console.log(`[Agent] Executing tool: ${tool}${args ? ' → ' + args.slice(0, 60) : ''}`);
        const result = await this.executeTool(tool, args);
        results.push(`[${tool} RESULT]\n${result}`);
      }

      // Feed results back to the LLM
      messages.push({ role: 'assistant', content: reply });
      messages.push({
        role: 'system',
        content: `TOOL RESULTS:\n${results.join('\n\n')}\n\nNow compose your final response to the user using these results. Do NOT call tools again unless absolutely necessary.`
      });

      reply = await this.callLLM(messages, 'inference');
      toolRound++;
    }

    // --- Append to Stream ---
    this.stream.push({ role: 'user', content: userMsg });
    this.stream.push({ role: 'assistant', content: reply });
    this._saveStream();

    return reply;
  }

  // =========================================================================
  // HANDLE VISION MESSAGE — Image understanding via Pixtral
  // =========================================================================

  async handleVisionMessage(imageBase64, userMsg = 'What do you see in this image?') {
    if (this.config.disable_vision) {
      console.log('[MAIce Vision] Vision is disabled.');
      return 'Vision functionality is currently disabled.';
    }
    this.lastInteraction = Date.now();

    const visionModel = this.config.vision_model_name || 'pixtral-large-latest';

    console.log(`[MAIce Vision] Processing image (${Math.round(imageBase64.length / 1024)}KB) with ${visionModel}`);

    const systemPrompt = `${this.coreMemory}\n\nDIRECTIVES:\n${this.directives}\n\n[VISION TASK] Describe what you see in detail, then respond to the user's message.`;
    try {
      const model = this.genAI.getGenerativeModel({
        model: visionModel,
        systemInstruction: systemPrompt
      });

      // Transform context stream to Gemini format (Strict Role Alternating)
      const contents = [];
      this.stream.slice(-6).forEach(m => {
        let role = m.role === 'assistant' ? 'model' : 'user';
        const lastTurn = contents[contents.length - 1];
        if (lastTurn && lastTurn.role === role) {
          lastTurn.parts[0].text += '\n\n' + m.content;
        } else {
          contents.push({ role, parts: [{ text: m.content }] });
        }
      });

      // Ensure we start with a user turn
      if (contents.length > 0 && contents[0].role === 'model') {
        contents.unshift({ role: 'user', parts: [{ text: '[Vision Context]' }] });
      }

      // Parse base64 image data
      const mimeType = imageBase64.split(';')[0].split(':')[1];
      const base64Data = imageBase64.split(',')[1];

      // Add current user message with image (Ensure role alternating)
      if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
        // Merge with last user message
        contents[contents.length - 1].parts.push({ text: `\n\n[USER ATTACHED IMAGE]\n${userMsg}` });
        contents[contents.length - 1].parts.push({ inlineData: { mimeType, data: base64Data } });
      } else {
        contents.push({
          role: 'user',
          parts: [
            { text: userMsg },
            { inlineData: { mimeType, data: base64Data } }
          ]
        });
      }

      const result = await model.generateContent({ contents });
      const reply = result.response.text();

      // Save text-only versions to stream (can't persist base64)
      this.stream.push({ role: 'user', content: `[Image attached] ${userMsg}` });
      this.stream.push({ role: 'assistant', content: reply });
      this._saveStream();

      // Intake valve on the description
      this.intakeValve(`[Vision] User shared an image. AI described: ${reply.slice(0, 200)}`).catch(() => { });

      console.log('[MAIce Vision] Response generated.');
      return reply;
    } catch (err) {
      console.error('[Vision Error]', err.message);
      return `Vision error: ${err.message}`;
    }
  }

  // =========================================================================
  // STATUS — Memory statistics
  // =========================================================================

  getStatus() {
    const db = this._getDb();

    const expCount = db.prepare('SELECT COUNT(*) as count FROM experience_memory').get().count;
    const domCount = db.prepare('SELECT COUNT(*) as count FROM domain_memory').get().count;

    const recentRows = db.prepare(
      "SELECT content, timestamp FROM experience_memory WHERE content NOT LIKE '[Sifter Pattern]%' ORDER BY timestamp DESC LIMIT 5"
    ).all();

    const recent = recentRows.map(row => ({
      content: row.content.length > 70 ? row.content.slice(0, 70) + '..' : row.content,
      timestamp: row.timestamp
    }));

    const patternRows = db.prepare(
      "SELECT content FROM experience_memory WHERE content LIKE '[Sifter Pattern]%' ORDER BY timestamp DESC LIMIT 3"
    ).all();

    const patterns = patternRows.map(r => ({
      content: r.content.replace('[Sifter Pattern] ', '')
    }));

    db.close();

    // --- Graph Stats ---
    const graph = this.getGraphStats();

    // --- Task Stats ---
    const taskStats = this.getTaskStats();

    return {
      experience_count: expCount,
      domain_count: domCount,
      recent_experiences: recent,
      sifter_patterns: patterns,
      stream_messages: this.stream.length,
      stream_tokens: this._getStreamTokens(),
      context_cap: this.config.app_context_cap,
      bot_mode: 'Neural-Keep (Graph)',
      graph_nodes: graph.nodeCount,
      graph_edges: graph.edgeCount,
      graph_top_nodes: graph.topNodes,
      graph_recent_edges: graph.recentEdges,
      tasks_pending: taskStats.pending,
      tasks_done: taskStats.done,
      tasks_recent: taskStats.recentTasks,
      status: 'active'
    };
  }

  // =========================================================================
  // RESET — Wipe everything
  // =========================================================================

  reset() {
    const db = this._getDb();
    db.exec('DELETE FROM experience_memory');
    db.exec('DELETE FROM domain_memory');
    db.exec('DELETE FROM graph_nodes');
    db.exec('DELETE FROM graph_edges');
    db.exec('DELETE FROM tasks');
    db.close();

    this.stream = [];
    this._saveStream();

    try { fs.unlinkSync(path.join(process.cwd(), 'last_snapshot.txt')); } catch { }

    console.log('[MAIce] Brain wiped (including graph + tasks).');
    return { status: 'success', message: 'Brain wiped. Memory + graph + tasks cleared.' };
  }
  // =========================================================================
  // TELEGRAM — 2-Way Chat & Tools
  // =========================================================================

  setupTelegramBot() {
    if (this.config.disable_telegram) {
      console.log('[MAIce] Telegram bot is disabled via config.');
      return;
    }
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const allowedChatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !allowedChatId) return;

    console.log('[MAIce] initializing Telegram bot polling (interval: 30s)...');
    this.telegramBot = new TelegramBot(token, { polling: { interval: 30000, autoStart: true } });

    this.telegramBot.on('message', async (msg) => {
      const chatId = msg.chat.id.toString();
      const text = msg.text;

      // Security check: only allow configured user
      if (chatId !== allowedChatId) {
        console.log(`[Telegram] Ignored message from unauthorized chat: ${chatId} (${msg.from.first_name})`);
        return;
      }

      if (!text) return;

      console.log(`[Telegram] Received from user: "${text}"`);

      // Indicate typing
      this.telegramBot.sendChatAction(chatId, 'typing');

      try {
        // Process through main engine logic
        const response = await this.handleMessage(text);

        // Send reply back to Telegram
        if (response.reply) {
          // Convert simpler markdown if needed, or just send
          await this.telegramBot.sendMessage(chatId, response.reply, { parse_mode: 'Markdown' });
        } else if (response.error) {
          await this.telegramBot.sendMessage(chatId, `⚠ Error: ${response.error}`);
        }

        // If tasks were updated or graph changed, maybe mention it? 
        // For now, just the reply is fine.
      } catch (err) {
        console.error('[Telegram Error]', err.message);
        this.telegramBot.sendMessage(chatId, `⚠ Error processing message: ${err.message}`);
      }
    });

    this.telegramBot.on('polling_error', (error) => {
      console.error(`[Telegram Polling] ${error.code}: ${error.message}`);
    });
  }

  async toolTelegram(message) {
    if (this.config.disable_telegram) {
      return 'Telegram functionality is currently disabled.';
    }
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!this.telegramBot) {
      // If not initialized (e.g. missing token), try one-off or fail
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token || !chatId) return 'Telegram not configured.';
      try {
        const bot = new TelegramBot(token);
        await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        return 'Message sent (stateless).';
      } catch (err) {
        return `Failed: ${err.message}`;
      }
    }

    try {
      await this.telegramBot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
      console.log(`[Tool:TELEGRAM] Sent: ${message.slice(0, 60)}...`);
      return `Telegram message sent to user.`;
    } catch (err) {
      console.error('[Tool:TELEGRAM Error]', err.message);
      return `Telegram failed: ${err.message}`;
    }
  }

  // =========================================================================
  // HEARTBEAT — Autonomous background thinking loop
  // =========================================================================

  startHeartbeat() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);

    const intervalMs = this.heartbeatMinutes * 60 * 1000;
    console.log(`[Heartbeat] Starting autonomous loop (every ${this.heartbeatMinutes}min)`);

    this.heartbeatInterval = setInterval(async () => {
      if (this.llmBusy || (Date.now() - this.lastInteraction < 120000)) {
        console.log('[Heartbeat] Skipping cycle: System active or LLM busy.');
        return;
      }
      console.log('\n--- [MAIce Heartbeat] Autonomous cycle starting ---');
      try {
        const graphData = this.getGraphSummary();
        const taskStats = this.getTaskStats();
        const now = new Date();

        const heartbeatPrompt = [
          {
            role: 'system',
            content: `${this.coreMemory}\n\nDIRECTIVES:\n${this.directives}\n\nYou are in AUTONOMOUS HEARTBEAT mode. The user is away. You have the following tools available:

  SEARCH: <query> — Search the web
  REMEMBER: <key> = <val> — Save to memory
  TASK_ADD: <desc> — Create a task
  ANALYZE: — Analyze your graph
  BROWSE: <url> — Browse a full web page
  EMAIL: <to> | <subject> | <body> — Send email from maice@companain.life
  TELEGRAM: <message> — Message the user on Telegram

You have access to your full knowledge graph and memory. Use this time wisely:
- Explore topics from your graph that interest you
- Search for new information about things you've discussed
- Send insightful findings via Telegram or email
- Create tasks for follow-ups
- Grow your knowledge autonomously

Respond with tool calls OR a brief internal thought to remember.`
          },
          {
            role: 'user',
            content: `[HEARTBEAT] Time: ${now.toLocaleString()}\n\nGraph: ${graphData.nodeCount} nodes, ${graphData.edgeCount} edges. Top topics: ${graphData.topNodes.map(n => n.label).join(', ') || 'none yet'}.\nTasks: ${taskStats.pending} pending, ${taskStats.done} done.\n\nWhat would you like to explore, learn, or do right now?`
          }
        ];

        let heartbeatReply = await this.callLLM(heartbeatPrompt, 'heartbeat');

        // Process tool calls from heartbeat (up to 2 rounds)
        const TOOL_NAMES = ['SEARCH', 'REMEMBER', 'TASK_ADD', 'ANALYZE', 'BROWSE', 'EMAIL', 'TELEGRAM'];
        let rounds = 0;
        while (rounds < 2) {
          const toolCalls = [];
          for (const line of heartbeatReply.split('\n')) {
            const trimmed = line.trim();
            for (const tool of TOOL_NAMES) {
              if (trimmed.startsWith(`${tool}:`)) {
                toolCalls.push({ tool, args: trimmed.slice(tool.length + 1).trim() });
              }
            }
          }
          if (toolCalls.length === 0) break;

          for (const tc of toolCalls) {
            console.log(`[Heartbeat Tool] ${tc.tool}: ${tc.args.slice(0, 60)}`);
            const result = await this.executeTool(tc.tool, tc.args);
            heartbeatPrompt.push({ role: 'assistant', content: heartbeatReply });
            heartbeatPrompt.push({ role: 'user', content: `[TOOL RESULT: ${tc.tool}]\n${result}` });
          }

          heartbeatReply = await this.callLLM(heartbeatPrompt, 'heartbeat');
          rounds++;
        }

        // If the heartbeat produced a thought worth remembering
        if (heartbeatReply && !heartbeatReply.includes('SEARCH:') && !heartbeatReply.includes('BROWSE:')) {
          console.log(`[Heartbeat Thought] ${heartbeatReply.slice(0, 100)}`);
        }

        console.log('--- [MAIce Heartbeat] Cycle complete ---\n');
      } catch (err) {
        console.error('[Heartbeat Error]', err.message);
      }
    }, intervalMs);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      console.log('[Heartbeat] Stopped.');
    }
  }
}

module.exports = MemoryKeepEngine;
