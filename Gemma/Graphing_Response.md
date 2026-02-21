# Knowledge Graphs & Memory Architecture

You asked about "Graphing". In the context of AI memory, this usually refers to **Knowledge Graphs** or **Graph RAG**.

## What is it?
Instead of storing memory as isolated text chunks (Vector RAG), we store them as connected nodes.
*   **Vector**: "User likes dark mode" (Embedding: [0.1, 0.5...])
*   **Graph**: `(User) --[PREFERS]--> (Dark Mode)`

## Your Current Setup
You are already set up for this! I checked `db2.sql` and found:
```sql
CREATE TABLE memory_relationships (
    source_id INT,
    target_id INT,
    relationship_type VARCHAR(50), 
    ...
);
```
This table IS a graph edge list.

## How to Enable It (Future Step)
To turn on "Graphing" for Lux:
1.  **Update Sidecar Prompt**: Ask Gemma 3 4B to extract *relationships* between concepts, not just isolated facts.
    *   *Example*: "User says 'My cat Luna hates water'." -> Extract: `(Luna) --[IS_A]--> (Cat)`, `(Luna) --[HATES]--> (Water)`.
2.  **Populate `memory_relationships`**: Update `storage.js` to write these edges to your SQL table.
3.  **Graph Querying**: When Lux thinks, query not just by similarity, but by traversing these edges (e.g., "What does Luna hate?").

**Verdict**: We can absolutely do this. The foundation is laid. just say the word.
