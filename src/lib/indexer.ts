import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { dayStartToIso, hasDateRange, nextDayStartToIso, normalizeDateRange } from "@/lib/date-range";
import { getCacheDir, getSessionsDir } from "@/lib/paths";
import { getDb, migrateDb } from "@/lib/sqlite";
import type {
  DailyAgg,
  IndexSnapshot,
  SessionSummary,
  SessionTimelineResponse,
  SessionsListResponse,
  TimelineEvent,
  TokenUsage,
  WorkspaceAgg
} from "@/lib/types";

const INDEX_VERSION = 1;
const TIMELINE_CACHE_DIR = "timeline";
const MAX_TIMELINE_EVENTS = 5000;
const REFRESH_INTERVAL_MS = 10_000;

let snapshotCache: IndexSnapshot | null = null;
let refreshPromise: Promise<void> | null = null;
let lastRefreshMs = 0;

function buildWhereSql(conditions: string[]) {
  return conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
}

function buildStartedAtFilter(range: { start?: string | null; end?: string | null }, column = "started_at") {
  const normalized = normalizeDateRange(range);
  const conditions: string[] = [];
  const params: any[] = [];

  if (normalized.start) {
    const startIso = dayStartToIso(normalized.start);
    if (startIso) {
      conditions.push(`${column} >= ?`);
      params.push(startIso);
    }
  }

  if (normalized.end) {
    const endIso = nextDayStartToIso(normalized.end);
    if (endIso) {
      conditions.push(`${column} < ?`);
      params.push(endIso);
    }
  }

  return { conditions, params };
}

function safeJsonParse(line: string) {
  try {
    return JSON.parse(line) as Record<string, any>;
  } catch {
    return null;
  }
}

function toIso(value: unknown) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function dayKeyFromIso(iso: string | null) {
  return iso ? iso.slice(0, 10) : "unknown";
}

function toNum(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeTokenUsage(usage: any): TokenUsage {
  return {
    total: toNum(usage?.total_tokens),
    input: toNum(usage?.input_tokens),
    output: toNum(usage?.output_tokens),
    cachedInput: toNum(usage?.cached_input_tokens),
    reasoningOutput: toNum(usage?.reasoning_output_tokens)
  };
}

function hasTokenUsageData(usage: TokenUsage | null | undefined) {
  if (!usage) return false;
  return (
    usage.total > 0 ||
    usage.input > 0 ||
    usage.output > 0 ||
    usage.cachedInput > 0 ||
    usage.reasoningOutput > 0
  );
}

async function ensureDir(target: string) {
  await fsp.mkdir(target, { recursive: true });
}

async function readJsonFile<T>(target: string): Promise<T | null> {
  try {
    const raw = await fsp.readFile(target, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(target: string, data: unknown) {
  const temp = `${target}.tmp`;
  await fsp.writeFile(temp, JSON.stringify(data, null, 2), "utf8");
  await fsp.rename(temp, target);
}

async function listJsonlFiles(root: string) {
  const files: string[] = [];

  async function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(fullPath);
      }
    }
  }

  await walk(root);
  return files;
}

function summarizeFromMeta(sessionId: string, file: string, meta: any): SessionSummary {
  const payload = meta?.payload ?? {};

  return {
    id: payload?.id ?? sessionId,
    file,
    startedAt: toIso(meta?.timestamp) ?? toIso(payload?.timestamp),
    endedAt: null,
    durationSec: null,
    cwd: typeof payload?.cwd === "string" ? payload.cwd : null,
    originator: typeof payload?.originator === "string" ? payload.originator : null,
    cliVersion: typeof payload?.cli_version === "string" ? payload.cli_version : null,
    messages: 0,
    toolCalls: 0,
    errors: 0,
    tokensTotal: 0,
    tokensInput: 0,
    tokensOutput: 0,
    tokensCachedInput: 0,
    tokensReasoningOutput: 0
  };
}

function extractMessageText(payload: any) {
  const content = payload?.content;
  if (!Array.isArray(content)) return null;

  const parts: string[] = [];
  for (const chunk of content) {
    if (typeof chunk?.text === "string") parts.push(chunk.text);
  }

  const text = parts.join("\n").trim();
  return text || null;
}

async function buildFileIndex(file: string) {
  const sessionId = path.basename(file, ".jsonl");
  const tools: Record<string, number> = {};
  const tokenUsage: TokenUsage = {
    total: 0,
    input: 0,
    output: 0,
    cachedInput: 0,
    reasoningOutput: 0
  };

  let lastTotalUsage: TokenUsage | null = null;
  let firstTs: string | null = null;
  let lastTs: string | null = null;
  let summary: SessionSummary = {
    id: sessionId,
    file,
    startedAt: null,
    endedAt: null,
    durationSec: null,
    cwd: null,
    originator: null,
    cliVersion: null,
    messages: 0,
    toolCalls: 0,
    errors: 0,
    tokensTotal: 0,
    tokensInput: 0,
    tokensOutput: 0,
    tokensCachedInput: 0,
    tokensReasoningOutput: 0
  };

  const stream = fs.createReadStream(file, "utf8");
  const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of reader) {
    const event = safeJsonParse(line);
    if (!event) continue;

    const timestamp = toIso(event.timestamp);
    if (timestamp) {
      if (!firstTs) firstTs = timestamp;
      lastTs = timestamp;
    }

    if (event.type === "session_meta") {
      summary = summarizeFromMeta(sessionId, file, event);
      if (!firstTs && summary.startedAt) firstTs = summary.startedAt;
      continue;
    }

    if (event.type === "event_msg") {
      const payloadType = event.payload?.type;
      if (payloadType === "turn_aborted") {
        summary.errors += 1;
      } else if (payloadType === "token_count") {
        const totalUsage = normalizeTokenUsage(event.payload?.info?.total_token_usage);
        const lastUsage = normalizeTokenUsage(event.payload?.info?.last_token_usage);
        const hasTotal = hasTokenUsageData(totalUsage);
        const hasLast = hasTokenUsageData(lastUsage);

        if (hasTotal) {
          if (lastTotalUsage) {
            const delta = {
              total: Math.max(0, totalUsage.total - lastTotalUsage.total),
              input: Math.max(0, totalUsage.input - lastTotalUsage.input),
              output: Math.max(0, totalUsage.output - lastTotalUsage.output),
              cachedInput: Math.max(0, totalUsage.cachedInput - lastTotalUsage.cachedInput),
              reasoningOutput: Math.max(0, totalUsage.reasoningOutput - lastTotalUsage.reasoningOutput)
            };

            tokenUsage.total += delta.total;
            tokenUsage.input += delta.input;
            tokenUsage.output += delta.output;
            tokenUsage.cachedInput += delta.cachedInput;
            tokenUsage.reasoningOutput += delta.reasoningOutput;

            if (totalUsage.total < lastTotalUsage.total && hasLast) {
              tokenUsage.total += lastUsage.total;
              tokenUsage.input += lastUsage.input;
              tokenUsage.output += lastUsage.output;
              tokenUsage.cachedInput += lastUsage.cachedInput;
              tokenUsage.reasoningOutput += lastUsage.reasoningOutput;
            }
          } else if (hasLast) {
            tokenUsage.total += lastUsage.total;
            tokenUsage.input += lastUsage.input;
            tokenUsage.output += lastUsage.output;
            tokenUsage.cachedInput += lastUsage.cachedInput;
            tokenUsage.reasoningOutput += lastUsage.reasoningOutput;
          }

          lastTotalUsage = totalUsage;
        } else if (hasLast) {
          tokenUsage.total += lastUsage.total;
          tokenUsage.input += lastUsage.input;
          tokenUsage.output += lastUsage.output;
          tokenUsage.cachedInput += lastUsage.cachedInput;
          tokenUsage.reasoningOutput += lastUsage.reasoningOutput;
        }
      }

      continue;
    }

    if (event.type !== "response_item") continue;

    const payload = event.payload ?? {};
    const payloadType = payload.type;
    if (payloadType === "message") {
      const role = payload.role;
      if (role === "user" || role === "assistant") summary.messages += 1;
      continue;
    }

    if (payloadType === "function_call" || payloadType === "custom_tool_call") {
      const toolName = typeof payload.name === "string" ? payload.name : "unknown";
      summary.toolCalls += 1;
      tools[toolName] = (tools[toolName] ?? 0) + 1;
      continue;
    }

    if (payloadType === "function_call_output" || payloadType === "custom_tool_call_output") {
      const output = typeof payload.output === "string" ? payload.output : null;

      if (output) {
        if (/error|exception|traceback/i.test(output)) summary.errors += 1;
        if (output.startsWith("{")) {
          try {
            const parsed = JSON.parse(output);
            const exitCode = parsed?.metadata?.exit_code;
            if (typeof exitCode === "number" && exitCode !== 0) summary.errors += 1;
          } catch {
            // ignore bad output json
          }
        }
      }

    }
  }

  summary.startedAt = summary.startedAt ?? firstTs;
  summary.endedAt = lastTs;
  summary.tokensTotal = tokenUsage.total;
  summary.tokensInput = tokenUsage.input;
  summary.tokensOutput = tokenUsage.output;
  summary.tokensCachedInput = tokenUsage.cachedInput;
  summary.tokensReasoningOutput = tokenUsage.reasoningOutput;

  if (summary.startedAt && summary.endedAt) {
    const startMs = new Date(summary.startedAt).getTime();
    const endMs = new Date(summary.endedAt).getTime();
    if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs >= startMs) {
      summary.durationSec = Math.floor((endMs - startMs) / 1000);
    }
  }

  return {
    sessionId,
    summary,
    dailyKey: dayKeyFromIso(summary.startedAt ?? firstTs),
    tokenUsage,
    tools
  };
}

async function refreshSqliteIndex() {
  migrateDb();
  const database = getDb();
  const sessionsDir = getSessionsDir();
  const cacheDir = getCacheDir();

  await ensureDir(cacheDir);
  await ensureDir(path.join(cacheDir, TIMELINE_CACHE_DIR));

  const files = await listJsonlFiles(sessionsDir);
  const knownFiles = new Set(files);
  const storedVersion = Number((database.prepare("SELECT value FROM meta WHERE key='version'").get() as any)?.value ?? 0);
  const rebuild = storedVersion !== INDEX_VERSION;

  const selectPrev = database.prepare("SELECT mtime_ms as mtimeMs, size FROM files WHERE file = ?");
  const deleteFile = database.prepare("DELETE FROM files WHERE file = ?");
  const deleteTools = database.prepare("DELETE FROM tool_counts WHERE file = ?");
  const upsertFile = database.prepare(`
    INSERT INTO files (
      file, mtime_ms, size, session_id, daily_key, started_at, ended_at, duration_sec,
      cwd, originator, cli_version, messages, tool_calls, errors,
      tokens_total, tokens_input, tokens_output, tokens_cached_input, tokens_reasoning_output
    ) VALUES (
      @file, @mtimeMs, @size, @sessionId, @dailyKey, @startedAt, @endedAt, @durationSec,
      @cwd, @originator, @cliVersion, @messages, @toolCalls, @errors,
      @tokensTotal, @tokensInput, @tokensOutput, @tokensCachedInput, @tokensReasoningOutput
    )
    ON CONFLICT(file) DO UPDATE SET
      mtime_ms = excluded.mtime_ms,
      size = excluded.size,
      session_id = excluded.session_id,
      daily_key = excluded.daily_key,
      started_at = excluded.started_at,
      ended_at = excluded.ended_at,
      duration_sec = excluded.duration_sec,
      cwd = excluded.cwd,
      originator = excluded.originator,
      cli_version = excluded.cli_version,
      messages = excluded.messages,
      tool_calls = excluded.tool_calls,
      errors = excluded.errors,
      tokens_total = excluded.tokens_total,
      tokens_input = excluded.tokens_input,
      tokens_output = excluded.tokens_output,
      tokens_cached_input = excluded.tokens_cached_input,
      tokens_reasoning_output = excluded.tokens_reasoning_output
  `);
  const upsertTool = database.prepare(`
    INSERT INTO tool_counts (file, tool_name, count)
    VALUES (?, ?, ?)
    ON CONFLICT(file, tool_name) DO UPDATE SET count = excluded.count
  `);

  database.exec("BEGIN IMMEDIATE");
  try {
    if (rebuild) {
      database.exec("DELETE FROM tool_counts; DELETE FROM files;");
    }

    const existingRows = database.prepare("SELECT file FROM files").all() as { file: string }[];
    for (const row of existingRows) {
      if (knownFiles.has(row.file)) continue;
      deleteTools.run(row.file);
      deleteFile.run(row.file);
    }

    for (const file of files) {
      let stats: fs.Stats;
      try {
        stats = await fsp.stat(file);
      } catch {
        continue;
      }

      const previous = selectPrev.get(file) as { mtimeMs: number; size: number } | undefined;
      if (previous && previous.mtimeMs === stats.mtimeMs && previous.size === stats.size) {
        continue;
      }

      const built = await buildFileIndex(file);

      upsertFile.run({
        file,
        mtimeMs: stats.mtimeMs,
        size: stats.size,
        sessionId: built.sessionId,
        dailyKey: built.dailyKey,
        startedAt: built.summary.startedAt,
        endedAt: built.summary.endedAt,
        durationSec: built.summary.durationSec,
        cwd: built.summary.cwd,
        originator: built.summary.originator,
        cliVersion: built.summary.cliVersion,
        messages: built.summary.messages,
        toolCalls: built.summary.toolCalls,
        errors: built.summary.errors,
        tokensTotal: built.tokenUsage.total,
        tokensInput: built.tokenUsage.input,
        tokensOutput: built.tokenUsage.output,
        tokensCachedInput: built.tokenUsage.cachedInput,
        tokensReasoningOutput: built.tokenUsage.reasoningOutput
      });

      deleteTools.run(file);
      for (const [toolName, count] of Object.entries(built.tools)) {
        upsertTool.run(file, toolName, count);
      }
    }

    database.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES ('sessionsDir', ?)").run(sessionsDir);
    database.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES ('generatedAt', ?)").run(new Date().toISOString());
    database.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES ('version', ?)").run(String(INDEX_VERSION));

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function queryIndexSnapshot(range: { start?: string | null; end?: string | null } = {}): IndexSnapshot {
  migrateDb();
  const database = getDb();
  const cacheDir = getCacheDir();

  const sessionsDir =
    (database.prepare("SELECT value FROM meta WHERE key='sessionsDir'").get() as any)?.value ?? getSessionsDir();
  const generatedAt =
    (database.prepare("SELECT value FROM meta WHERE key='generatedAt'").get() as any)?.value ?? new Date().toISOString();
  const fileRange = buildStartedAtFilter(range);
  const toolRange = buildStartedAtFilter(range, "f.started_at");
  const workspaceWhere = buildWhereSql([...fileRange.conditions, "cwd IS NOT NULL AND cwd != ''"]);

  const totals = database
    .prepare(`
      SELECT
        COUNT(*) as files,
        COUNT(*) as sessions,
        COALESCE(SUM(messages), 0) as messages,
        COALESCE(SUM(tool_calls), 0) as toolCalls,
        COALESCE(SUM(errors), 0) as errors,
        COALESCE(SUM(tokens_total), 0) as tokensTotal,
        COALESCE(SUM(tokens_input), 0) as tokensInput,
        COALESCE(SUM(tokens_output), 0) as tokensOutput,
        COALESCE(SUM(tokens_cached_input), 0) as tokensCachedInput,
        COALESCE(SUM(tokens_reasoning_output), 0) as tokensReasoningOutput
      FROM files
      ${buildWhereSql(fileRange.conditions)}
    `)
    .get(...fileRange.params) as any;

  const dailyRows = database
    .prepare(`
      SELECT
        daily_key as day,
        COUNT(*) as sessions,
        COALESCE(SUM(messages), 0) as messages,
        COALESCE(SUM(tool_calls), 0) as toolCalls,
        COALESCE(SUM(errors), 0) as errors,
        COALESCE(SUM(tokens_total), 0) as tokensTotal,
        COALESCE(SUM(tokens_input), 0) as tokensInput,
        COALESCE(SUM(tokens_output), 0) as tokensOutput,
        COALESCE(SUM(tokens_cached_input), 0) as tokensCachedInput,
        COALESCE(SUM(tokens_reasoning_output), 0) as tokensReasoningOutput
      FROM files
      ${buildWhereSql(fileRange.conditions)}
      GROUP BY daily_key
    `)
    .all(...fileRange.params) as any[];

  const toolRows = database
    .prepare(`
      SELECT tc.tool_name as name, COALESCE(SUM(tc.count), 0) as count
      FROM tool_counts tc
      JOIN files f ON f.file = tc.file
      ${buildWhereSql(toolRange.conditions)}
      GROUP BY tool_name
    `)
    .all(...toolRange.params) as any[];

  const workspaceRows = database
    .prepare(`
      SELECT
        cwd,
        COUNT(*) as sessions,
        COALESCE(SUM(tokens_total), 0) as tokensTotal
      FROM files
      ${workspaceWhere}
      GROUP BY cwd
      ORDER BY sessions DESC, tokensTotal DESC
      LIMIT 8
    `)
    .all(...fileRange.params) as any[];

  const daily: Record<string, DailyAgg> = {};
  for (const row of dailyRows) {
    daily[String(row.day)] = {
      sessions: Number(row.sessions ?? 0),
      messages: Number(row.messages ?? 0),
      toolCalls: Number(row.toolCalls ?? 0),
      errors: Number(row.errors ?? 0),
      tokensTotal: Number(row.tokensTotal ?? 0),
      tokensInput: Number(row.tokensInput ?? 0),
      tokensOutput: Number(row.tokensOutput ?? 0),
      tokensCachedInput: Number(row.tokensCachedInput ?? 0),
      tokensReasoningOutput: Number(row.tokensReasoningOutput ?? 0)
    };
  }

  const tools: Record<string, number> = {};
  for (const row of toolRows) {
    tools[String(row.name)] = Number(row.count ?? 0);
  }

  const workspaces: WorkspaceAgg[] = workspaceRows.map((row) => ({
    cwd: String(row.cwd),
    sessions: Number(row.sessions ?? 0),
    tokensTotal: Number(row.tokensTotal ?? 0)
  }));

  return {
    version: INDEX_VERSION,
    generatedAt,
    sessionsDir,
    cacheDir,
    totals: {
      files: Number(totals.files ?? 0),
      sessions: Number(totals.sessions ?? 0),
      messages: Number(totals.messages ?? 0),
      toolCalls: Number(totals.toolCalls ?? 0),
      errors: Number(totals.errors ?? 0),
      tokensTotal: Number(totals.tokensTotal ?? 0),
      tokensInput: Number(totals.tokensInput ?? 0),
      tokensOutput: Number(totals.tokensOutput ?? 0),
      tokensCachedInput: Number(totals.tokensCachedInput ?? 0),
      tokensReasoningOutput: Number(totals.tokensReasoningOutput ?? 0)
    },
    tools,
    daily,
    workspaces
  };
}

async function ensureFreshIndex() {
  if (Date.now() - lastRefreshMs < REFRESH_INTERVAL_MS && snapshotCache) {
    return;
  }

  if (refreshPromise) {
    await refreshPromise;
    return;
  }

  refreshPromise = (async () => {
    await refreshSqliteIndex();
    snapshotCache = queryIndexSnapshot();
    lastRefreshMs = Date.now();
  })().finally(() => {
    refreshPromise = null;
  });

  await refreshPromise;
}

export async function getIndex(range: { start?: string | null; end?: string | null } = {}) {
  await ensureFreshIndex();

  if (!hasDateRange(range)) {
    return snapshotCache ?? queryIndexSnapshot();
  }

  return queryIndexSnapshot(normalizeDateRange(range));
}

export async function listSessions(options: {
  q?: string;
  withTools?: boolean;
  withErrors?: boolean;
  start?: string;
  end?: string;
  limit?: number;
  offset?: number;
}): Promise<SessionsListResponse> {
  await ensureFreshIndex();
  const database = getDb();

  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const offset = Math.max(options.offset ?? 0, 0);
  const where: string[] = [];
  const params: any[] = [];
  const startedAtRange = buildStartedAtFilter(options);

  where.push(...startedAtRange.conditions);
  params.push(...startedAtRange.params);

  if (options.withTools) where.push("tool_calls > 0");
  if (options.withErrors) where.push("errors > 0");

  const q = options.q?.trim();
  if (q) {
    where.push("(session_id LIKE ? OR IFNULL(cwd, '') LIKE ? OR IFNULL(originator, '') LIKE ?)");
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  const whereSql = buildWhereSql(where);
  const totalRow = database.prepare(`SELECT COUNT(*) as count FROM files ${whereSql}`).get(...params) as any;
  const rows = database
    .prepare(`
      SELECT
        session_id as id,
        file,
        started_at as startedAt,
        ended_at as endedAt,
        duration_sec as durationSec,
        cwd,
        originator,
        cli_version as cliVersion,
        messages,
        tool_calls as toolCalls,
        errors,
        tokens_total as tokensTotal,
        tokens_input as tokensInput,
        tokens_output as tokensOutput,
        tokens_cached_input as tokensCachedInput,
        tokens_reasoning_output as tokensReasoningOutput
      FROM files
      ${whereSql}
      ORDER BY (started_at IS NULL), started_at DESC
      LIMIT ? OFFSET ?
    `)
    .all(...params, limit, offset) as any[];

  return {
    generatedAt: new Date().toISOString(),
    total: Number(totalRow.count ?? 0),
    items: rows.map((row) => ({
      id: String(row.id),
      file: String(row.file),
      startedAt: row.startedAt ?? null,
      endedAt: row.endedAt ?? null,
      durationSec: row.durationSec ?? null,
      cwd: row.cwd ?? null,
      originator: row.originator ?? null,
      cliVersion: row.cliVersion ?? null,
      messages: Number(row.messages ?? 0),
      toolCalls: Number(row.toolCalls ?? 0),
      errors: Number(row.errors ?? 0),
      tokensTotal: Number(row.tokensTotal ?? 0),
      tokensInput: Number(row.tokensInput ?? 0),
      tokensOutput: Number(row.tokensOutput ?? 0),
      tokensCachedInput: Number(row.tokensCachedInput ?? 0),
      tokensReasoningOutput: Number(row.tokensReasoningOutput ?? 0)
    }))
  };
}

async function getSessionById(sessionId: string) {
  await ensureFreshIndex();
  const database = getDb();
  const row = database
    .prepare(`
      SELECT
        session_id as id,
        file,
        started_at as startedAt,
        ended_at as endedAt,
        duration_sec as durationSec,
        cwd,
        originator,
        cli_version as cliVersion,
        messages,
        tool_calls as toolCalls,
        errors,
        tokens_total as tokensTotal,
        tokens_input as tokensInput,
        tokens_output as tokensOutput,
        tokens_cached_input as tokensCachedInput,
        tokens_reasoning_output as tokensReasoningOutput
      FROM files
      WHERE session_id = ?
      LIMIT 1
    `)
    .get(sessionId) as any;

  if (!row) return null;

  return {
    id: String(row.id),
    file: String(row.file),
    startedAt: row.startedAt ?? null,
    endedAt: row.endedAt ?? null,
    durationSec: row.durationSec ?? null,
    cwd: row.cwd ?? null,
    originator: row.originator ?? null,
    cliVersion: row.cliVersion ?? null,
    messages: Number(row.messages ?? 0),
    toolCalls: Number(row.toolCalls ?? 0),
    errors: Number(row.errors ?? 0),
    tokensTotal: Number(row.tokensTotal ?? 0),
    tokensInput: Number(row.tokensInput ?? 0),
    tokensOutput: Number(row.tokensOutput ?? 0),
    tokensCachedInput: Number(row.tokensCachedInput ?? 0),
    tokensReasoningOutput: Number(row.tokensReasoningOutput ?? 0)
  } satisfies SessionSummary;
}

function timelineCachePath(cacheDir: string, sessionId: string) {
  return path.join(cacheDir, TIMELINE_CACHE_DIR, `${encodeURIComponent(sessionId)}.json`);
}

async function findFileForSession(sessionId: string) {
  const files = await listJsonlFiles(getSessionsDir());
  const byFilename = files.find((file) => path.basename(file, ".jsonl") === sessionId);
  if (byFilename) return byFilename;

  for (const file of files) {
    const stream = fs.createReadStream(file, "utf8");
    const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of reader) {
      const event = safeJsonParse(line);
      if (event?.type === "session_meta" && event?.payload?.id === sessionId) {
        return file;
      }
      break;
    }
  }

  return null;
}

async function buildTimeline(file: string, summary: SessionSummary): Promise<SessionTimelineResponse> {
  const events: TimelineEvent[] = [];
  const callIdToTool = new Map<string, string>();
  let truncated = false;
  let lastTotalUsage: TokenUsage | null = null;

  const stream = fs.createReadStream(file, "utf8");
  const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of reader) {
    const event = safeJsonParse(line);
    if (!event) continue;

    const ts = toIso(event.timestamp) ?? "";

    if (event.type === "event_msg") {
      const payloadType = event.payload?.type;
      if (payloadType === "turn_aborted") {
        events.push({ ts, kind: "error", text: "turn_aborted" });
      } else if (payloadType === "token_count") {
        const totalUsage = normalizeTokenUsage(event.payload?.info?.total_token_usage);
        const lastUsage = normalizeTokenUsage(event.payload?.info?.last_token_usage);
        const hasTotal = hasTokenUsageData(totalUsage);
        const hasLast = hasTokenUsageData(lastUsage);
        let deltaUsage: TokenUsage | null = null;

        if (hasTotal) {
          if (lastTotalUsage) {
            deltaUsage = {
              total: Math.max(0, totalUsage.total - lastTotalUsage.total),
              input: Math.max(0, totalUsage.input - lastTotalUsage.input),
              output: Math.max(0, totalUsage.output - lastTotalUsage.output),
              cachedInput: Math.max(0, totalUsage.cachedInput - lastTotalUsage.cachedInput),
              reasoningOutput: Math.max(0, totalUsage.reasoningOutput - lastTotalUsage.reasoningOutput)
            };
            if (totalUsage.total < lastTotalUsage.total && hasLast) {
              deltaUsage.total += lastUsage.total;
              deltaUsage.input += lastUsage.input;
              deltaUsage.output += lastUsage.output;
              deltaUsage.cachedInput += lastUsage.cachedInput;
              deltaUsage.reasoningOutput += lastUsage.reasoningOutput;
            }
          } else if (hasLast) {
            deltaUsage = { ...lastUsage };
          }

          lastTotalUsage = totalUsage;
        } else if (hasLast) {
          deltaUsage = { ...lastUsage };
        }

        const totalUsageForEvent = hasTotal ? totalUsage : null;
        const deltaUsageForEvent = deltaUsage && hasTokenUsageData(deltaUsage) ? deltaUsage : null;
        if (totalUsageForEvent || deltaUsageForEvent) {
          events.push({
            ts,
            kind: "token_count",
            tokenUsage: {
              total: totalUsageForEvent,
              delta: deltaUsageForEvent
            }
          });
        }
      }
    }

    if (event.type === "response_item") {
      const payload = event.payload ?? {};
      const payloadType = payload.type;

      if (payloadType === "message") {
        const role = payload.role;
        const text = extractMessageText(payload) ?? "";
        if (role === "user") events.push({ ts, kind: "user", text });
        else if (role === "assistant") events.push({ ts, kind: "assistant", text });
        else events.push({ ts, kind: "other", text });
      } else if (payloadType === "function_call" || payloadType === "custom_tool_call") {
        const name = typeof payload.name === "string" ? payload.name : "unknown";
        const callId = typeof payload.call_id === "string" ? payload.call_id : null;
        if (callId) callIdToTool.set(callId, name);
        const text =
          (typeof payload.arguments === "string" && payload.arguments) ||
          (typeof payload.input === "string" && payload.input) ||
          "";
        events.push({ ts, kind: "tool_call", name, text });
      } else if (payloadType === "function_call_output" || payloadType === "custom_tool_call_output") {
        const callId = typeof payload.call_id === "string" ? payload.call_id : null;
        const name =
          typeof payload.name === "string" ? payload.name : callId ? callIdToTool.get(callId) : undefined;
        const text = typeof payload.output === "string" ? payload.output : "";
        events.push({ ts, kind: "tool_output", name, text });
      }
    }

    if (events.length >= MAX_TIMELINE_EVENTS) {
      truncated = true;
      break;
    }
  }

  return { summary, truncated, events };
}

export async function getSessionTimeline(sessionId: string): Promise<SessionTimelineResponse> {
  const index = await getIndex();
  const summary = await getSessionById(sessionId);
  const file = summary?.file ?? (await findFileForSession(sessionId));

  if (!file) {
    return {
      summary: {
        id: sessionId,
        file: "",
        startedAt: null,
        endedAt: null,
        durationSec: null,
        cwd: null,
        originator: null,
        cliVersion: null,
        messages: 0,
        toolCalls: 0,
        errors: 1,
        tokensTotal: 0,
        tokensInput: 0,
        tokensOutput: 0,
        tokensCachedInput: 0,
        tokensReasoningOutput: 0
      },
      truncated: false,
      events: [
        {
          ts: new Date().toISOString(),
          kind: "error",
          text: "session file not found"
        }
      ]
    };
  }

  const stats = await fsp.stat(file);
  const cachePath = timelineCachePath(index.cacheDir, sessionId);
  const cached = await readJsonFile<
    SessionTimelineResponse & { fileMtimeMs?: number; fileSize?: number }
  >(cachePath);

  const cachedIsFresh =
    cached &&
    cached.fileMtimeMs === stats.mtimeMs &&
    cached.fileSize === stats.size &&
    typeof cached.summary?.tokensTotal === "number" &&
    !cached.events.some((event) => event.kind === "token_count" && !event.tokenUsage?.delta);

  if (cachedIsFresh) {
    return {
      summary: cached.summary,
      truncated: cached.truncated,
      events: cached.events
    };
  }

  const resolvedSummary = summary ?? (await buildFileIndex(file)).summary;
  const timeline = await buildTimeline(file, resolvedSummary);
  await writeJsonFile(cachePath, {
    ...timeline,
    fileMtimeMs: stats.mtimeMs,
    fileSize: stats.size
  });

  return timeline;
}
