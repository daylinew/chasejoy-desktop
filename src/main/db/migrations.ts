/**
 * SQL migrations, applied in order by `name`.
 * Inlining the SQL avoids fs-path resolution differences between dev and packaged builds.
 */

export interface Migration {
  name: string;
  sql: string;
}

const m0001: Migration = {
  name: "0001_init",
  sql: `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS kv_meta (
    key   TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS agents (
    id                    TEXT PRIMARY KEY,
    name                  TEXT NOT NULL,
    role                  TEXT,
    goal_prompt           TEXT NOT NULL,
    model_profile_id      TEXT NOT NULL,
    workspace_dir         TEXT NOT NULL,
    enabled_tools         TEXT NOT NULL DEFAULT '[]',
    enabled_builtin_tools TEXT NOT NULL DEFAULT '[]',
    allowed_extra_paths   TEXT NOT NULL DEFAULT '[]',
    created_at            INTEGER NOT NULL,
    updated_at            INTEGER NOT NULL,
    archived              INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_agents_archived ON agents(archived);

CREATE TABLE IF NOT EXISTS threads (
    id              TEXT PRIMARY KEY,
    agent_id        TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    title           TEXT NOT NULL DEFAULT 'New conversation',
    created_at      INTEGER NOT NULL,
    last_active_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_threads_agent ON threads(agent_id, last_active_at DESC);

CREATE TABLE IF NOT EXISTS messages (
    id          TEXT PRIMARY KEY,
    thread_id   TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    role        TEXT NOT NULL,
    content     TEXT NOT NULL,
    tool_calls  TEXT,
    created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, created_at);

CREATE TABLE IF NOT EXISTS milestones (
    id           TEXT PRIMARY KEY,
    agent_id     TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    description  TEXT,
    status       TEXT NOT NULL CHECK(status IN ('todo','active','done','cancelled')),
    order_index  INTEGER NOT NULL DEFAULT 0,
    due_at       INTEGER,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_milestones_agent ON milestones(agent_id, order_index);

CREATE TABLE IF NOT EXISTS memories (
    id                 TEXT PRIMARY KEY,
    agent_id           TEXT REFERENCES agents(id) ON DELETE CASCADE,
    kind               TEXT NOT NULL,
    content            TEXT NOT NULL,
    source_thread_id   TEXT,
    source_message_id  TEXT,
    importance         REAL NOT NULL DEFAULT 0.5,
    pinned             INTEGER NOT NULL DEFAULT 0,
    cross_agent        INTEGER NOT NULL DEFAULT 0,
    embedding          BLOB,
    created_at         INTEGER NOT NULL,
    last_accessed_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memories_agent ON memories(agent_id, pinned DESC, importance DESC, last_accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_global ON memories(cross_agent, pinned DESC, importance DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
    content,
    kind UNINDEXED,
    memory_id UNINDEXED,
    tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
    INSERT INTO memories_fts (content, kind, memory_id) VALUES (new.content, new.kind, new.id);
END;
CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
    DELETE FROM memories_fts WHERE memory_id = old.id;
END;
CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE OF content, kind ON memories BEGIN
    DELETE FROM memories_fts WHERE memory_id = old.id;
    INSERT INTO memories_fts (content, kind, memory_id) VALUES (new.content, new.kind, new.id);
END;

CREATE TABLE IF NOT EXISTS alignment_events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id     TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    thread_id    TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    score        TEXT NOT NULL CHECK(score IN ('green','yellow','red')),
    reasoning    TEXT NOT NULL,
    created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alignment_agent_thread ON alignment_events(agent_id, thread_id, id DESC);

CREATE TABLE IF NOT EXISTS approval_policies (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id      TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    tool          TEXT NOT NULL,
    fingerprint   TEXT NOT NULL,
    decision      TEXT NOT NULL,
    created_at    INTEGER NOT NULL,
    UNIQUE(agent_id, tool, fingerprint)
);
`,
};

export const migrations: Migration[] = [m0001];
