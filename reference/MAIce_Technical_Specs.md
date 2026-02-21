# MAGGIE (Memory-Augmented Graph-Guided Intelligent Entity)
## Technical Specifications (MAGGIE Edition)

This document outlines the specialized **Memory Keep (MK3)** architecture implemented for the MAGGIE (Mistral AI companion Experiment).

---

## 1. The Full Stack
MAGGIE is built on a modern, event-driven Node.js stack designed for low-latency cognition and persistent memory.

*   **Runtime**: Node.js (v18+)
*   **Web Framework**: Express (serving the API and Neural Hub UI)
*   **Intelligence**: Mistral AI Large 2 (Primary), Pixtral (Vision), Mistral Small (Sifter/Sifting)
*   **Database**: SQLite via `better-sqlite3` (Low-overhead, local persistence)
*   **Automation**: Puppeteer (Headless browsing), Nodemailer (Email integration)
*   **Interface**: node-telegram-bot-api (Official Telegram tunnel)

---

## 2. Multi-Key Neural Distribution
To optimize performance and avoid rate limits, LLM calls are distributed across three distinct Mistral API keys based on the task's "taxation" level.

| Role | Key Name | Purpose | Model |
| :--- | :--- | :--- | :--- |
| **Primary** | `MISTRAL_API_KEY` | Real-time user inference and conscious chat. | `mistral-large-latest` |
| **Sifter** | `MISTRAL_API_KEY_SIFTER` | Intake valve classification and graph data extraction. | `mistral-small-latest` |
| **Sidecar** | `MISTRAL_API_KEY_SIDECAR` | Heartbeat cycles, autonomous research, and sleep simulations. | `mistral-large-latest` |

---

## 3. The Seven Layers of Memory
MAGGIE utilizes a tiered memory system to maintain long-term coherence while respecting context constraints.

1.  **Core Memory**: The immutable identity and soul of MAGGIE. (Loaded from `core_memory.txt`)
2.  **Directives**: Real-time operating protocols and mission focus. (Loaded from `directives.txt`)
3.  **The Stream**: Active conversation buffer. Capped at **64,000 tokens** (85% of standard context).
4.  **Experience Memory**: SQLite storage for unstructured facts, events, and "Aha!" moments.
5.  **Domain Memory**: Structured key-value storage for job-specific/technical data.
6.  **Graph Memory**: A neurographical knowledge graph mapping entities and relationships across memories.
7.  **Agentic Tools**: Autonomous capabilities for interacting with the external world.

---

## 4. Cognitive Protocols

### The Intake Valve
Every incoming message passes through a classification filter (the **Sifter**) to determine:
-   **Importance**: Is this a permanent trait or a fleeting comment?
-   **Extraction**: Identifying Entities (people, concepts, skills) and Relationships for the Neurograph.
-   **Action**: Does this trigger an immediate agentic task (e.g., adding a reminder)?

### Sleep Simulation (Consolidation)
When **The Stream** reaches capacity, MAGGIE enters a "Sleep Cycle":
1.  **Snapshot**: Captures the entire raw context.
2.  **Sift**: An independent analytical pass identifies structural patterns.
3.  **Persist**: High-value insights are written to Experience/Domain memory.
4.  **Flush**: The active stream is cleared and replaced with a concise summary + trailing context.

### The Heartbeat
An autonomous background loop (every 30 mins) that powers MAGGIE's "subconscious":
-   **Reflection**: Reasoning about current tasks and goals.
-   **Autonomous Research**: Investigating technical topics via **Search/Browse**.
-   **Maintenance**: Refining Knowledge Graph weights and pruning weak connections.

---

## 5. Agentic Toolset
MAGGIE is equipped with advanced tools to operate independently:

-   `SEARCH`: Real-time information gathering via DuckDuckGo.
-   `BROWSE`: Full Puppeteer-based browser automation (Click/Type/Extract).
-   `FETCH`: Direct HTML parsing and summarization.
-   `EMAIL`: Professional SMTP integration via Hostinger.
-   `TELEGRAM`: Active 2-way communication outside the web UI.
-   `ANALYZE`: Neurographical pattern recognition.

---
*Created on: 2026-02-20*
