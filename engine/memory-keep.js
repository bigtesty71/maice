/**
 *MAGGIE Engine — Mistral AI companion Experiment
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
const mysql = require('mysql2/promise');

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

    // Gemma 3 via Gemini API — single arg constructor
    this.genAI = new GoogleGenerativeAI(this.apiKey);

    // --- Database (MySQL Persistent Memory) ---
    this.isVercel = process.env.VERCEL === '1';
    this.pool = mysql.createPool({
      host: process.env.MYSQL_HOST || '82.197.82.158',
      user: process.env.MYSQL_USER || 'u649168233_maggie',
      password: process.env.MYSQL_PASSWORD || 'Revolution_100',
      database: process.env.MYSQL_DATABASE || 'u649168233_longterm',
      ssl: {
        rejectUnauthorized: false
      },
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 15000
    });
    this.dbReady = this.setupStorage(); // Async — tables created on first await

    // Force reload latest config to ensure parity with disk (32k context fix)
    this.config = JSON.parse(fs.readFileSync(cfgFile, 'utf-8'));

    // --- Flat Files (always-loaded) ---
    this.coreMemory = this._loadFlat(path.join(engineDir, 'core_memory.txt'));
    this.directives = this._loadFlat(path.join(engineDir, 'directives.txt'));

    // --- Stream (conscious thought) ---
    this.streamFile = this.isVercel ? '/tmp/stream_state.json' : path.join(process.cwd(), 'stream_state.json');
    this.stream = this._loadStream();

    // --- Timing & Rate Limiting ---
    this.lastInteraction = Date.now();
    this.lastLLMCall = 0;
    this.llmQueue = Promise.resolve();
    this.llmBusy = false;
    this.lastPrompts = new Map();

    // --- Heartbeat (autonomous background loop) ---
    this.heartbeatInterval = null;
    this.heartbeatMinutes = this.config.heartbeat_minutes || 30;
    if (!this.isVercel) {
      this.startHeartbeat();
    } else {
      console.log('[MAGGIE] Heartbeat disabled in Vercel environment.');
    }

    // --- Telegram Bot (2-way chat) ---
    this.telegramBot = null;
    this.setupTelegramBot();

    console.log('[MAGGIE] Engine initialized.');
    console.log(`  Model: ${this.config.model_name}`);
    console.log(`  Vision: ${this.config.vision_model_name}`);
    console.log(`  Sifter: ${this.config.sifter_model_name}`);
    console.log(`  Context Cap: ${this.config.app_context_cap} tokens`);
    console.log(`  Heartbeat: every ${this.heartbeatMinutes} minutes`);
    console.log(`  DB: MySQL @ ${process.env.MYSQL_HOST || '82.197.82.158'}`);
  }

  // =========================================================================
  // STORAGE SETUP
  // =========================================================================

  async setupStorage() {
    try {
      await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS experience_memory (
          id INT AUTO_INCREMENT PRIMARY KEY,
          content LONGTEXT,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS domain_memory (
          id INT AUTO_INCREMENT PRIMARY KEY,
          \`key\` VARCHAR(255),
          value TEXT,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // --- Graph Memory (Neurographical Knowledge Graph) ---
      await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS graph_nodes (
          id INT AUTO_INCREMENT PRIMARY KEY,
          label VARCHAR(255) UNIQUE,
          type VARCHAR(50) DEFAULT 'entity',
          strength DOUBLE DEFAULT 1.0,
          first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS graph_edges (
          id INT AUTO_INCREMENT PRIMARY KEY,
          source_label VARCHAR(255),
          target_label VARCHAR(255),
          relationship VARCHAR(255),
          weight DOUBLE DEFAULT 1.0,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY unique_edge (source_label, target_label, relationship)
        )
      `);

      // --- Tasks (Agentic Task Management) ---
      await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS tasks (
          id INT AUTO_INCREMENT PRIMARY KEY,
          description TEXT,
          status VARCHAR(20) DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          completed_at TIMESTAMP NULL
        )
      `);

      // --- Visitors (User Recognition & Privacy Isolation) ---
      await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS visitors (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255),
          email VARCHAR(255),
          session_token VARCHAR(255) UNIQUE,
          site_origin VARCHAR(255) DEFAULT 'default',
          first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      console.log('[MAGGIE] MySQL tables verified/created.');
    } catch (err) {
      console.error('[MAGGIE] MySQL setup error:', err.message);
    }
  }

  // =========================================================================
  // VISITOR RECOGNITION (User Memory & Privacy Isolation)
  // =========================================================================

  /**
   * Register or retrieve a visitor. Returns { token, name, isReturning }
   * Token is unique per email + site_origin combo for privacy isolation.
   */
  async registerVisitor(name, email, siteOrigin = 'default') {
    await this.dbReady;
    const crypto = require('crypto');

    // Check if this email already exists for this site
    const [rows] = await this.pool.execute(
      'SELECT * FROM visitors WHERE email = ? AND site_origin = ?',
      [email, siteOrigin]
    );

    if (rows.length > 0) {
      const existing = rows[0];
      // Returning visitor — update last_seen and name if changed
      await this.pool.execute(
        'UPDATE visitors SET last_seen = CURRENT_TIMESTAMP, name = ? WHERE id = ?',
        [name, existing.id]
      );

      console.log(`[Visitor] Returning visitor: ${name} (${email}) on ${siteOrigin}`);
      await this.saveExperience(`[Visitor Return] ${name} (${email}) returned. First seen: ${existing.first_seen}. They have visited before.`);

      return {
        token: existing.session_token,
        name: existing.name,
        isReturning: true,
        firstSeen: existing.first_seen
      };
    }

    // New visitor — generate unique token
    const token = crypto.randomBytes(32).toString('hex');

    await this.pool.execute(
      'INSERT INTO visitors (name, email, session_token, site_origin) VALUES (?, ?, ?, ?)',
      [name, email, token, siteOrigin]
    );

    console.log(`[Visitor] New visitor registered: ${name} (${email}) on ${siteOrigin}`);
    await this.saveExperience(`[New Visitor] ${name} (${email}) just registered for the first time.`);

    return {
      token,
      name,
      isReturning: false,
      firstSeen: new Date().toISOString()
    };
  }

  async getVisitorByToken(token) {
    if (!token) return null;
    await this.dbReady;

    const [rows] = await this.pool.execute(
      'SELECT * FROM visitors WHERE session_token = ?',
      [token]
    );

    if (rows.length > 0) {
      await this.pool.execute(
        'UPDATE visitors SET last_seen = CURRENT_TIMESTAMP WHERE id = ?',
        [rows[0].id]
      );
      return rows[0];
    }
    return null;
  }

  async getVisitorContext(token) {
    const visitor = await this.getVisitorByToken(token);
    if (!visitor) return '';

    const firstDate = new Date(visitor.first_seen).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric'
    });

    return `\n[ACTIVE VISITOR] You are currently speaking with ${visitor.name} (${visitor.email}). ` +
      `They first connected on ${firstDate}. ` +
      `Address them by name naturally — you remember them.`;
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
  // LLM CALLS (GEMMA 3 via Gemini API)
  // =========================================================================

  async callLLM(messages, purpose = 'inference') {
    // --- Rate Limiting ---
    const now = Date.now();
    const timeSinceLast = now - (this.lastLLMCall || 0);
    if (timeSinceLast < 2000) {
      const wait = 2000 - timeSinceLast;
      console.log(`[Rate Limit] Throttling ${purpose} for ${wait}ms...`);
      await new Promise(r => setTimeout(r, wait));
    }

    // --- Redundancy Check ---
    const promptKey = JSON.stringify(messages).slice(-200);
    if (this.lastPrompts.has(promptKey) && (Date.now() - this.lastPrompts.get(promptKey)) < 1500) {
      console.warn(`[Redundancy] Blocking redundant ${purpose} call.`);
      return '';
    }
    this.lastPrompts.set(promptKey, Date.now());
    if (this.lastPrompts.size > 20) {
      const firstKey = this.lastPrompts.keys().next().value;
      this.lastPrompts.delete(firstKey);
    }

    const purposeGroup = purpose.toLowerCase();

    // Only one inference call at a time
    if (purposeGroup === 'inference') {
      let waitCount = 0;
      while (this.llmBusy) {
        await new Promise(r => setTimeout(r, 100));
        waitCount++;
        if (waitCount > 600) {
          console.error('[LLM Lock] Forcing release after 60s wait.');
          this.llmBusy = false;
          break;
        }
      }
      this.llmBusy = true;
    }

    this.lastLLMCall = Date.now();

    // --- Model Selection ---
    // Strip 'models/' prefix if present — Gemma 3 needs bare model names
    let modelId = this.config.model_name;
    if (purposeGroup === 'sifting' || purposeGroup === 'classification' || purposeGroup === 'intake-classification') {
      modelId = this.config.sifter_model_name;
    }
    modelId = modelId.replace(/^models\//, '');

    const temperature = purposeGroup === 'inference' ? 0.7 : 0.1;

    try {
      // ═══════════════════════════════════════════════════════════════
      // GEMMA 3 CONTENT BUILDING
      // Gemma 3 does NOT support systemInstruction parameter.
      // System context is embedded into the first user turn instead.
      // Strict user/model alternation is required.
      // ═══════════════════════════════════════════════════════════════

      // 1. Collect all system-role text into one block
      let systemText = `${this.coreMemory}\n\nDIRECTIVES:\n${this.directives}`;
      const conversationTurns = [];

      for (const m of messages) {
        if (m.role === 'system') {
          systemText += `\n\n${m.content}`;
        } else {
          conversationTurns.push({
            role: m.role === 'assistant' ? 'model' : 'user',
            text: m.content
          });
        }
      }

      // 2. Build Gemini-compatible contents array
      let contents = [];

      // Inject system text as the opening of the first user turn
      const systemPrefix = `[SYSTEM INSTRUCTIONS]\n${systemText}\n[END SYSTEM INSTRUCTIONS]\n\n`;
      let systemInjected = false;

      for (const turn of conversationTurns) {
        let text = turn.text;

        // Prepend system text to the very first user turn
        if (!systemInjected && turn.role === 'user') {
          text = systemPrefix + text;
          systemInjected = true;
        }

        const lastTurn = contents[contents.length - 1];
        // Merge consecutive same-role turns (Gemma 3 strict alternation)
        if (lastTurn && lastTurn.role === turn.role) {
          lastTurn.parts[0].text += '\n\n' + text;
        } else {
          contents.push({ role: turn.role, parts: [{ text }] });
        }
      }

      // If system text wasn't injected yet (no user turns existed), create one
      if (!systemInjected) {
        contents.unshift({ role: 'user', parts: [{ text: systemPrefix + '[Awaiting input]' }] });
      }

      // Ensure first turn is user (Gemma 3 requirement)
      if (contents[0].role === 'model') {
        contents.unshift({ role: 'user', parts: [{ text: '[Conversation context]' }] });
      }

      // Ensure last turn is user (required for generation)
      if (contents[contents.length - 1].role === 'model') {
        contents.push({ role: 'user', parts: [{ text: '[Continue]' }] });
      }

      console.log(`[callLLM] ${purpose} | model: ${modelId} | turns: ${contents.length}`);

      // 3. Call the API — NO systemInstruction (Gemma 3 doesn't support it)
      const model = this.genAI.getGenerativeModel({ model: modelId });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Neural link timed out (55s)')), 55000)
      );

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

      console.log(`[callLLM] ${purpose} reply length: ${text.length}`);
      return text;
    } catch (err) {
      console.error(`❌ [LLM Error: ${purpose}] ${err.message}`);
      if (purposeGroup === 'inference') {
        return `[System Error] Neural core timeout or disconnect. (Ref: ${err.message.slice(0, 80)})`;
      }
      return '';
    } finally {
      if (purposeGroup === 'inference') {
        this.llmBusy = false;
      }
    }
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
  async _storeGraphData(graph) {
    try {
      await this.dbReady;
      // Upsert nodes
      for (const entity of (graph.entities || [])) {
        if (entity.label) {
          await this.pool.execute(`
            INSERT INTO graph_nodes (label, type) VALUES (?, ?)
            ON DUPLICATE KEY UPDATE
              strength = strength + 0.5,
              last_seen = CURRENT_TIMESTAMP
          `, [entity.label.toLowerCase().trim(), entity.type || 'entity']);
        }
      }

      // Upsert edges
      for (const rel of (graph.relationships || [])) {
        if (rel.source && rel.target && rel.relationship) {
          await this.pool.execute(`
            INSERT INTO graph_edges (source_label, target_label, relationship) VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE
              weight = weight + 1.0,
              timestamp = CURRENT_TIMESTAMP
          `, [
            rel.source.toLowerCase().trim(),
            rel.target.toLowerCase().trim(),
            rel.relationship.toLowerCase().trim()
          ]);
        }
      }
      console.log(`[Graph] Perspective updated via Intake Valve.`);
    } catch (err) {
      console.error('[Graph Persistence Error]', err.message);
    }
  }

  // =========================================================================
  // EXPERIENCE & DOMAIN MEMORY
  // =========================================================================

  async saveExperience(content) {
    await this.dbReady;
    await this.pool.execute('INSERT INTO experience_memory (content) VALUES (?)', [content]);
  }

  async saveDomain(key, value) {
    await this.dbReady;
    await this.pool.execute('INSERT INTO domain_memory (`key`, value) VALUES (?, ?)', [key, value]);
  }

  async getRecentExperiences(limit = 5) {
    await this.dbReady;
    const [rows] = await this.pool.execute(
      "SELECT content, timestamp FROM experience_memory WHERE content NOT LIKE '[Sifter Pattern]%' ORDER BY timestamp DESC LIMIT ?",
      [limit]
    );
    return rows;
  }

  async getSifterPatterns(limit = 3) {
    await this.dbReady;
    const [rows] = await this.pool.execute(
      "SELECT content FROM experience_memory WHERE content LIKE '[Sifter Pattern]%' ORDER BY timestamp DESC LIMIT ?",
      [limit]
    );
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
  async toolRemember(args) {
    const eqIdx = args.indexOf('=');
    if (eqIdx === -1) {
      await this.saveExperience(args.trim());
      console.log(`[Tool:REMEMBER] Saved to experience: ${args.trim().slice(0, 60)}`);
      return `Noted and saved to experience memory: "${args.trim()}"`;
    }
    const key = args.slice(0, eqIdx).trim();
    const value = args.slice(eqIdx + 1).trim();
    await this.saveDomain(key, value);
    console.log(`[Tool:REMEMBER] Saved domain fact: ${key} = ${value.slice(0, 40)}`);
    return `Saved to domain memory: ${key} = ${value}`;
  }

  /** TASK_ADD — Create a new task */
  async toolTaskAdd(description) {
    await this.dbReady;
    const [result] = await this.pool.execute('INSERT INTO tasks (description) VALUES (?)', [description.trim()]);
    console.log(`[Tool:TASK_ADD] Created task #${result.insertId}: ${description.trim()}`);
    return `Task #${result.insertId} created: "${description.trim()}"`;
  }

  /** TASK_LIST — List all pending tasks */
  async toolTaskList() {
    await this.dbReady;
    const [tasks] = await this.pool.execute("SELECT id, description, status, created_at FROM tasks ORDER BY created_at DESC LIMIT 20");
    if (tasks.length === 0) return 'No tasks found. The task list is empty.';
    const lines = tasks.map(t => `#${t.id} [${t.status.toUpperCase()}] ${t.description} (${t.created_at})`);
    console.log(`[Tool:TASK_LIST] ${tasks.length} tasks`);
    return `Current tasks:\n${lines.join('\n')}`;
  }

  /** TASK_DONE — Mark a task as complete */
  async toolTaskDone(idStr) {
    const id = parseInt(idStr.replace('#', '').trim());
    if (isNaN(id)) return 'Invalid task ID.';
    await this.dbReady;
    const [result] = await this.pool.execute("UPDATE tasks SET status = 'done', completed_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
    if (result.affectedRows === 0) return `Task #${id} not found.`;
    console.log(`[Tool:TASK_DONE] Completed task #${id}`);
    return `Task #${id} marked as done.`;
  }

  /** ANALYZE — Analyze the knowledge graph for insights */
  async toolAnalyze() {
    const stats = await this.getGraphStats();
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

    const emailUser = process.env.MAGGIE_EMAIL_USER;
    const emailPass = process.env.MAGGIE_EMAIL_PASS;
    const emailHost = process.env.MAGGIE_EMAIL_HOST || 'smtp.hostinger.com';

    if (!emailUser || !emailPass) {
      return 'Email not configured. Set MAGGIE_EMAIL_USER and MAGGIE_EMAIL_PASS in .env';
    }

    try {
      const transporter = nodemailer.createTransport({
        host: emailHost,
        port: 465,
        secure: true,
        auth: { user: emailUser, pass: emailPass }
      });

      const info = await transporter.sendMail({
        from: `"MAGGIE" <${emailUser}>`,
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
      case 'REMEMBER': return await this.toolRemember(toolArgs);
      case 'TASK_ADD': return await this.toolTaskAdd(toolArgs);
      case 'TASK_LIST': return await this.toolTaskList();
      case 'TASK_DONE': return await this.toolTaskDone(toolArgs);
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
  async getTaskStats() {
    await this.dbReady;
    const [[pendingRow]] = await this.pool.execute("SELECT COUNT(*) as count FROM tasks WHERE status = 'pending'");
    const [[doneRow]] = await this.pool.execute("SELECT COUNT(*) as count FROM tasks WHERE status = 'done'");
    const [recentTasks] = await this.pool.execute(
      "SELECT id, description, status, created_at FROM tasks ORDER BY created_at DESC LIMIT 5"
    );
    return { pending: pendingRow.count, done: doneRow.count, total: pendingRow.count + doneRow.count, recentTasks };
  }

  // =========================================================================
  // GRAPH MEMORY — Neurographical Knowledge Graph
  // =========================================================================

  /**
   * Extract entities and relationships from text and store in the knowledge graph.
   */
  async extractAndStoreGraph(text) {
    const extractPrompt = [
      {
        role: 'system',
        content: 'Extract entities and relationships from the following text. Respond ONLY with raw JSON: {"entities": [{"label": "name", "type": "person|place|concept|thing"}], "relationships": [{"source": "entity1", "target": "entity2", "relationship": "relates_to"}]}. If nothing notable, respond with {"entities":[], "relationships":[]}'
      },
      { role: 'user', content: text }
    ];

    const raw = await this.callLLM(extractPrompt, 'sifting');
    try {
      const jsonStart = raw.indexOf('{');
      const jsonEnd = raw.lastIndexOf('}') + 1;
      if (jsonStart !== -1 && jsonEnd > jsonStart) {
        const graph = JSON.parse(raw.slice(jsonStart, jsonEnd));
        this._storeGraphData(graph);
      }
    } catch (err) {
      console.error('[Graph Extract Parse Error]', err.message);
    }
  }

  /**
   * Get a summary of the graph for heartbeat use.
   */
  getGraphSummary() {
    return this.getGraphStats();
  }

  /**
   * Retrieve related memories by traversing the knowledge graph.
   * Given a query, find matching nodes and walk their edges.
   */
  async getRelatedMemories(query, limit = 8) {
    await this.dbReady;
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

    if (words.length === 0) return [];

    // Find nodes matching any word in the query
    const placeholders = words.map(() => 'label LIKE ?').join(' OR ');
    const params = words.map(w => `%${w}%`);

    const [matchingNodes] = await this.pool.execute(
      `SELECT label, type, strength FROM graph_nodes WHERE (${placeholders}) AND strength > 1.0 ORDER BY strength DESC LIMIT 15`,
      params
    );

    if (matchingNodes.length === 0) return [];

    // Walk edges from matching nodes
    const nodeLabels = matchingNodes.map(n => n.label);
    const edgePlaceholders = nodeLabels.map(() => '?').join(',');

    const [edges] = await this.pool.execute(`
      SELECT source_label, target_label, relationship, weight
      FROM graph_edges
      WHERE (source_label IN (${edgePlaceholders}) OR target_label IN (${edgePlaceholders}))
      AND weight > 0.5
      ORDER BY weight DESC
      LIMIT ?
    `, [...nodeLabels, ...nodeLabels, limit]);

    // Format as readable context
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
  async getGraphStats() {
    await this.dbReady;
    const [[nodeRow]] = await this.pool.execute('SELECT COUNT(*) as count FROM graph_nodes');
    const [[edgeRow]] = await this.pool.execute('SELECT COUNT(*) as count FROM graph_edges');
    const [topNodes] = await this.pool.execute(
      'SELECT label, type, strength FROM graph_nodes ORDER BY strength DESC LIMIT 8'
    );
    const [recentEdges] = await this.pool.execute(
      'SELECT source_label, target_label, relationship FROM graph_edges ORDER BY timestamp DESC LIMIT 5'
    );

    return { nodeCount: nodeRow.count, edgeCount: edgeRow.count, topNodes, recentEdges };
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
        for (const pattern of (analysis.patterns || [])) {
          await this.saveExperience(`[Sifter Pattern] ${pattern}`);
        }

        // --- Synaptic Pruning (Lightweight Decay) ---
        await this.pool.execute('UPDATE graph_nodes SET strength = strength * 0.95');
        await this.pool.execute('UPDATE graph_edges SET weight = weight * 0.95');

        // Remove "forgotten" nodes and edges
        await this.pool.execute('DELETE FROM graph_nodes WHERE strength < 0.1');
        await this.pool.execute('DELETE FROM graph_edges WHERE weight < 0.1');

        console.log('[MAGGIE] Synaptic pruning complete (Graph weight decay applied).');

        // Step 4 — Flush + Resume
        const overlapN = parseInt(this.config.rolling_overlap || 3);
        const overlap = this.stream.slice(-overlapN);

        this.stream = [
          { role: 'system', content: `[CONSOLIDATION SUMMARY] ${analysis.summary || 'Conversation consolidated.'}` },
          ...overlap
        ];
        this._saveStream();
        console.log('[] Sleep Simulation complete. Waking in fresh context.\n');
      } else {
        throw new Error('No valid JSON found in sifter output.');
      }
    } catch (err) {
      console.error('[MAGGIE] Sifter Error:', err.message);

      // FIX: Never discard memory. If the sifter fails, save the raw snapshot to DB.
      console.log('[MAGGIE] Consolidation failed. Saving raw snapshot to Experience Memory as fallback.');
      await this.saveExperience(`[RAW CONSOLIDATION FALLBACK] The Sleep Simulation sifter failed. Raw snapshot of conversation preserved:\n\n${snapshot}`);

      // Flush some of the stream to prevent context overflow, but keep more than 5.
      // 15 turns is enough to maintain the immediate "conscious" thread.
      const preserveCount = 15;
      this.stream = this.stream.slice(-preserveCount);
      this._saveStream();

      console.log(`[MAGGIE] Emergency flush complete. ${preserveCount} turns kept, full history archived to DB.`);
    }
  }

  // =========================================================================
  // HANDLE MESSAGE — Main entry point
  // =========================================================================

  async handleMessage(userMsg, visitorToken = null) {
    this.lastInteraction = Date.now();
    console.log(`[handleMessage] Processing: "${userMsg.slice(0, 60)}"`);

    // --- Async Intake Valve (don't block the response) ---
    this.intakeValve(userMsg).catch(err =>
      console.error('[Intake Valve Async Error]', err.message)
    );

    // --- Context Cap Check ---
    const cap = this.config.app_context_cap || 32000;
    const currentTokens = this._getStreamTokens();
    if (currentTokens > cap * 0.85) {
      await this.performMemoryKeep();
    }

    // --- Visitor Context (Who is MAGGIE talking to?) ---
    let visitorContext = '';
    if (visitorToken) {
      visitorContext = await this.getVisitorContext(visitorToken);
    }

    // --- Graph Recall (Passive Associative Retrieval) ---
    let graphContext = '';
    try {
      const graphResult = await this.getRelatedMemories(userMsg);
      if (graphResult && graphResult.summary) {
        graphContext = `\n\n[GRAPH MEMORY] ${graphResult.summary}`;
        console.log(`[Graph Recall] ${graphResult.nodes.length} nodes, ${graphResult.edges.length} edges activated.`);
      }
    } catch (err) {
      console.log('[Graph Recall] No graph data yet — that is fine.');
    }

    // --- Build Prompt ---
    const toolProtocol = `
[AGENTIC TOOLS] You have access to the following tools. Use them by writing the tool command on its own line:
  SEARCH: <query>, REMEMBER: <key>=<value>, TASK_ADD: <desc>, TASK_LIST, TASK_DONE: <id>, ANALYZE, FETCH: <url>, READ: <path>, WRITE: <path>|<content>, LIST_FILES: <dir>, TIME, EMAIL: <to>|<subject>|<body>, BROWSE: <url>, TELEGRAM: <message>.`;

    const contextInfo = graphContext ? `\n${graphContext}` : '';

    // Build message array for callLLM
    // System instruction is applied inside callLLM (core memory + directives)
    // Here we add the tool protocol, visitor context, and graph context
    const messages = [
      { role: 'system', content: `${toolProtocol}${visitorContext}${contextInfo}` }
    ];

    // Add recent stream context (limit to last 12 turns for performance)
    const recentStream = this.stream.slice(-12);
    for (const turn of recentStream) {
      messages.push({ role: turn.role, content: turn.content });
    }

    // Add the current user message
    messages.push({ role: 'user', content: userMsg });

    // --- LLM Call ---
    console.log(`[handleMessage] Calling LLM with ${messages.length} messages...`);
    let reply = '';
    try {
      reply = await this.callLLM(messages, 'inference');
    } catch (err) {
      console.error('[handleMessage] LLM call failed:', err.message);
      reply = `I'm having trouble connecting to my neural core right now. (${err.message.slice(0, 50)})`;
    }

    // Safety: ensure we always have a reply
    if (!reply || reply.trim().length === 0) {
      console.warn('[handleMessage] Empty reply from LLM, using fallback.');
      reply = "I heard you, but my neural core returned an empty response. Could you try again?";
    }

    console.log(`[handleMessage] Got reply (${reply.length} chars): "${reply.slice(0, 80)}..."`);

    // --- Multi-Tool Agent Loop (max 2 rounds) ---
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
          if (trimmed.toUpperCase() === tool) {
            toolCalls.push({ tool, args: '' });
            break;
          }
        }
      }

      if (toolCalls.length === 0) break;

      const results = [];
      for (const { tool, args } of toolCalls) {
        console.log(`[Agent] Executing tool: ${tool}${args ? ' → ' + args.slice(0, 60) : ''}`);
        try {
          const result = await this.executeTool(tool, args);
          results.push(`[${tool} RESULT]\n${result}`);
        } catch (err) {
          results.push(`[${tool} ERROR] ${err.message}`);
        }
      }

      messages.push({ role: 'assistant', content: reply });
      messages.push({
        role: 'system',
        content: `TOOL RESULTS:\n${results.join('\n\n')}\n\nNow compose your final response to the user using these results. Do NOT call tools again unless absolutely necessary.`
      });

      try {
        reply = await this.callLLM(messages, 'inference');
        if (!reply || reply.trim().length === 0) {
          reply = results.map(r => r).join('\n');
        }
      } catch (err) {
        console.error('[Agent Tool Round Error]', err.message);
        reply = results.map(r => r).join('\n');
      }
      toolRound++;
    }

    // --- Append to Stream ---
    this.stream.push({ role: 'user', content: userMsg });
    this.stream.push({ role: 'assistant', content: reply });
    this._saveStream();

    console.log(`[handleMessage] Complete. Reply delivered.`);
    return reply;
  }

  // =========================================================================
  // HANDLE VISION MESSAGE — Image understanding via Pixtral
  // =========================================================================

  async handleVisionMessage(imageBase64, userMsg = 'What do you see in this image?') {
    if (this.config.disable_vision) {
      console.log('[ Vision] Vision is disabled.');
      return 'Vision functionality is currently disabled.';
    }
    this.lastInteraction = Date.now();

    let visionModel = (this.config.vision_model_name || 'gemma-3-27b-it').replace(/^models\//, '');

    console.log(`[ Vision] Processing image (${Math.round(imageBase64.length / 1024)}KB) with ${visionModel}`);

    const systemPrompt = `[SYSTEM INSTRUCTIONS]\n${this.coreMemory}\n\nDIRECTIVES:\n${this.directives}\n\n[VISION TASK] Describe what you see in detail, then respond to the user's message.\n[END SYSTEM INSTRUCTIONS]`;
    try {
      // Gemma 3 does NOT support systemInstruction — just get bare model
      const model = this.genAI.getGenerativeModel({ model: visionModel });

      // Transform context stream to Gemini format (Strict Role Alternating)
      const contents = [];

      // Inject system prompt as opening context
      contents.push({ role: 'user', parts: [{ text: systemPrompt }] });
      contents.push({ role: 'model', parts: [{ text: 'Understood. I am ready for the vision task.' }] });

      this.stream.slice(-6).forEach(m => {
        let role = m.role === 'assistant' ? 'model' : 'user';
        const lastTurn = contents[contents.length - 1];
        if (lastTurn && lastTurn.role === role) {
          lastTurn.parts[0].text += '\n\n' + m.content;
        } else {
          contents.push({ role, parts: [{ text: m.content }] });
        }
      });

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

      console.log('[Vision] Response generated.');
      return reply;
    } catch (err) {
      console.error('[Vision Error]', err.message);
      return `Vision error: ${err.message}`;
    }
  }

  // =========================================================================
  // STATUS — Memory statistics
  // =========================================================================

  async getStatus() {
    try {
      // Helper for timeouts
      const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('DB Timeout')), ms));

      const dbStats = await Promise.race([
        (async () => {
          await this.dbReady;
          const [[expRow]] = await this.pool.execute('SELECT COUNT(*) as count FROM experience_memory');
          const [[domRow]] = await this.pool.execute('SELECT COUNT(*) as count FROM domain_memory');
          const [recentRows] = await this.pool.execute("SELECT content, timestamp FROM experience_memory WHERE content NOT LIKE '[Sifter Pattern]%' ORDER BY timestamp DESC LIMIT 5");
          const [patternRows] = await this.pool.execute("SELECT content FROM experience_memory WHERE content LIKE '[Sifter Pattern]%' ORDER BY timestamp DESC LIMIT 3");
          const graph = await this.getGraphStats();
          const taskStats = await this.getTaskStats();

          return {
            experience_count: expRow.count,
            domain_count: domRow.count,
            recent: recentRows.map(row => ({
              content: row.content.length > 70 ? row.content.slice(0, 70) + '..' : row.content,
              timestamp: row.timestamp
            })),
            patterns: patternRows.map(r => ({ content: r.content.replace('[Sifter Pattern] ', '') })),
            graph,
            taskStats
          };
        })(),
        timeout(12000)
      ]).catch(err => {
        console.error('[MAGGIE Status Error]', err.message);
        return null;
      });

      return {
        experience_count: dbStats?.experience_count || 0,
        domain_count: dbStats?.domain_count || 0,
        recent_experiences: dbStats?.recent || [],
        sifter_patterns: dbStats?.patterns || [],
        stream_messages: this.stream.length,
        stream_tokens: this._getStreamTokens(),
        context_cap: this.config.app_context_cap,
        bot_mode: dbStats ? 'Neural-Keep (Graph + MySQL)' : 'Local-Mode (DB Offline)',
        graph_nodes: dbStats?.graph?.nodeCount || 0,
        graph_edges: dbStats?.graph?.edgeCount || 0,
        graph_top_nodes: dbStats?.graph?.topNodes || [],
        graph_recent_edges: dbStats?.graph?.recentEdges || [],
        tasks_pending: dbStats?.taskStats?.pending || 0,
        tasks_done: dbStats?.taskStats?.done || 0,
        tasks_recent: dbStats?.taskStats?.recentTasks || [],
        status: dbStats ? 'active' : 'degraded',
        _v: Date.now()
      };
    } catch (err) {
      console.error('[Status Root Error]', err);
      return { status: 'error', error: err.message };
    }
  }

  /**
   * Sync/Restore the volatile chat stream from a client-side cache.
   * This ensures continuity even if the server restarts.
   */
  async restoreStream(history = []) {
    if (!Array.isArray(history) || history.length === 0) return;

    // Filter to ensure basic schema
    const cleanHistory = history.filter(m => m.role && m.content).map(m => ({
      role: m.role === 'assistant' || m.role === 'ai' ? 'assistant' : 'user', // normalize
      content: m.content
    }));

    if (cleanHistory.length === 0) return;

    // If local stream is empty or very short, restore from client
    if (this.stream.length <= 1) {
      console.log(`[MAGGIE] Restoring stream from client cache (${cleanHistory.length} turns).`);
      this.stream = cleanHistory;
      this._saveStream();
    } else {
      console.log('[MAGGIE] Server already has active stream. Skipping client sync.');
    }
  }

  // =========================================================================
  // RESET — Wipe everything
  // =========================================================================

  async reset() {
    await this.dbReady;
    await this.pool.execute('DELETE FROM experience_memory');
    await this.pool.execute('DELETE FROM domain_memory');
    await this.pool.execute('DELETE FROM graph_nodes');
    await this.pool.execute('DELETE FROM graph_edges');
    await this.pool.execute('DELETE FROM tasks');

    this.stream = [];
    this._saveStream();

    try { fs.unlinkSync(path.join(process.cwd(), 'last_snapshot.txt')); } catch { }

    console.log('[MAGGIE] Brain wiped (including graph + tasks).');
    return { status: 'success', message: 'Brain wiped. Memory + graph + tasks cleared.' };
  }
  // =========================================================================
  // TELEGRAM — 2-Way Chat & Tools
  // =========================================================================

  async setupTelegramBot() {
    if (this.config.disable_telegram) {
      console.log('[MAGGIE] Telegram bot is disabled via config.');
      return;
    }
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const allowedChatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !allowedChatId) return;

    // On Vercel, we use Webhooks. Locally, we use Polling.
    if (this.isVercel) {
      console.log('[MAGGIE] Telegram bot initialized in Webhook mode.');
      this.telegramBot = new TelegramBot(token); // No polling

      // Auto-set webhook if VERCEL_URL is present
      const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
      if (baseUrl) {
        try {
          await this.telegramBot.setWebHook(`${baseUrl}/api/telegram`);
          console.log(`[MAGGIE] Telegram Webhook set to: ${baseUrl}/api/telegram`);
        } catch (err) {
          console.error('[MAGGIE] Failed to set Telegram Webhook:', err.message);
        }
      }
    } else {
      console.log('[MAGGIE] Initializing Telegram bot polling (interval: 30s)...');
      this.telegramBot = new TelegramBot(token, { polling: { interval: 30000, autoStart: true } });

      this.telegramBot.on('message', async (msg) => {
        await this._handleIncomingTelegram(msg);
      });
    }

    this.telegramBot.on('polling_error', (error) => {
      console.error(`[Telegram Polling] ${error.code}: ${error.message}`);
    });
  }

  /** Centralized handler for Telegram messages */
  async _handleIncomingTelegram(msg) {
    const allowedChatId = process.env.TELEGRAM_CHAT_ID;
    const chatId = msg.chat.id.toString();
    const text = msg.text;

    if (chatId !== allowedChatId) {
      console.log(`[Telegram] Ignored message from unauthorized chat: ${chatId} (${msg.from.first_name})`);
      return;
    }

    if (!text) return;

    console.log(`[Telegram] Received from user: "${text}"`);

    try {
      this.telegramBot.sendChatAction(chatId, 'typing');
      const response = await this.handleMessage(text);
      if (response) {
        await this.telegramBot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
      }
    } catch (err) {
      console.error('[Telegram Error]', err.message);
      this.telegramBot.sendMessage(chatId, `⚠ Error processing message: ${err.message}`);
    }
  }

  /** API Entry point for Vercel Webhooks */
  async handleTelegramWebhook(update) {
    if (update.message) {
      await this._handleIncomingTelegram(update.message);
    }
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
      console.log('\n--- [ Heartbeat] Autonomous cycle starting ---');
      try {
        const graphData = await this.getGraphSummary();
        const taskStats = await this.getTaskStats();
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
  EMAIL: <to> | <subject> | <body> — Send email from @companain.life
  TELEGRAM: <message> — Message the user on Telegram
  WRITE: <path> | <content> — Write content to a file
  READ: <path> — Read content from a file
  LIST_FILES: <path> — List files in a directory

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
        const TOOL_NAMES = ['SEARCH', 'REMEMBER', 'TASK_ADD', 'ANALYZE', 'BROWSE', 'EMAIL', 'TELEGRAM', 'WRITE', 'READ', 'LIST_FILES'];
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
          // Save the summary of her findings to Experience Memory so Jewells can see it on the web UI
          const persistenceMsg = `[Autonomous Insight] ${heartbeatReply.trim().slice(0, 500)}`;
          await this.saveExperience(persistenceMsg);
        }

        console.log('--- [ Heartbeat] Cycle complete ---\n');
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
