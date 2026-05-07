import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getCacheDir } from "@/lib/paths";

export type SqliteDb = DatabaseSync;

let db: SqliteDb | null = null;

function openDb() {
  const cacheDir = getCacheDir();
  fs.mkdirSync(cacheDir, { recursive: true });

  const dbPath = path.join(cacheDir, "index.sqlite");
  const instance = new DatabaseSync(dbPath);
  instance.exec("PRAGMA journal_mode = WAL;");
  instance.exec("PRAGMA synchronous = NORMAL;");
  instance.exec("PRAGMA temp_store = MEMORY;");
  return instance;
}

export function getDb() {
  if (!db) db = openDb();
  return db;
}

export function migrateDb() {
  const database = getDb();

  database.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS files (
      file TEXT PRIMARY KEY,
      mtime_ms INTEGER NOT NULL,
      size INTEGER NOT NULL,
      session_id TEXT NOT NULL,
      daily_key TEXT NOT NULL,
      started_at TEXT,
      ended_at TEXT,
      duration_sec INTEGER,
      cwd TEXT,
      originator TEXT,
      cli_version TEXT,
      messages INTEGER NOT NULL,
      tool_calls INTEGER NOT NULL,
      errors INTEGER NOT NULL,
      tokens_total INTEGER NOT NULL DEFAULT 0,
      tokens_input INTEGER NOT NULL DEFAULT 0,
      tokens_output INTEGER NOT NULL DEFAULT 0,
      tokens_cached_input INTEGER NOT NULL DEFAULT 0,
      tokens_reasoning_output INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_files_session_id ON files(session_id);
    CREATE INDEX IF NOT EXISTS idx_files_daily_key ON files(daily_key);
    CREATE INDEX IF NOT EXISTS idx_files_started_at ON files(started_at);
    CREATE INDEX IF NOT EXISTS idx_files_cwd ON files(cwd);

    CREATE TABLE IF NOT EXISTS tool_counts (
      file TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      count INTEGER NOT NULL,
      PRIMARY KEY (file, tool_name),
      FOREIGN KEY(file) REFERENCES files(file) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tool_counts_tool_name ON tool_counts(tool_name);
  `);
}
