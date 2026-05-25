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

const m0002: Migration = {
  name: "0002_provider_split",
  sql: `
ALTER TABLE agents RENAME COLUMN model_profile_id TO provider_id;
ALTER TABLE agents ADD COLUMN model TEXT NOT NULL DEFAULT '';
`,
};

const m0003: Migration = {
  name: "0003_drop_legacy_sqlite_memories",
  sql: `
DROP TRIGGER IF EXISTS memories_ai;
DROP TRIGGER IF EXISTS memories_ad;
DROP TRIGGER IF EXISTS memories_au;
DROP TABLE IF EXISTS memories_fts;
DROP TABLE IF EXISTS memories;
`,
};

const m0004: Migration = {
  name: "0004_add_message_subagents",
  sql: `
ALTER TABLE messages ADD COLUMN subagents TEXT;
`,
};

const m0005: Migration = {
  name: "0005_add_message_meta",
  sql: `
ALTER TABLE messages ADD COLUMN message_meta TEXT;
`,
};

export const migrations: Migration[] = [m0001, m0002, m0003, m0004, m0005];
