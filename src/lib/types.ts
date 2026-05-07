export type TokenUsage = {
  total: number;
  input: number;
  output: number;
  cachedInput: number;
  reasoningOutput: number;
};

export type TokenUsageInfo = {
  total: TokenUsage | null;
  delta: TokenUsage | null;
};

export type DailyAgg = {
  sessions: number;
  messages: number;
  toolCalls: number;
  errors: number;
  tokensTotal: number;
  tokensInput: number;
  tokensOutput: number;
  tokensCachedInput: number;
  tokensReasoningOutput: number;
};

export type SessionSummary = {
  id: string;
  file: string;
  startedAt: string | null;
  endedAt: string | null;
  durationSec: number | null;
  cwd: string | null;
  originator: string | null;
  cliVersion: string | null;
  messages: number;
  toolCalls: number;
  errors: number;
  tokensTotal: number;
  tokensInput: number;
  tokensOutput: number;
  tokensCachedInput: number;
  tokensReasoningOutput: number;
};

export type WorkspaceAgg = {
  cwd: string;
  sessions: number;
  tokensTotal: number;
};

export type IndexSnapshot = {
  version: number;
  generatedAt: string;
  sessionsDir: string;
  cacheDir: string;
  totals: {
    files: number;
    sessions: number;
    messages: number;
    toolCalls: number;
    errors: number;
    tokensTotal: number;
    tokensInput: number;
    tokensOutput: number;
    tokensCachedInput: number;
    tokensReasoningOutput: number;
  };
  tools: Record<string, number>;
  daily: Record<string, DailyAgg>;
  workspaces: WorkspaceAgg[];
};

export type SessionsListResponse = {
  generatedAt: string;
  total: number;
  items: SessionSummary[];
};

export type TimelineEvent = {
  ts: string;
  kind: "user" | "assistant" | "tool_call" | "tool_output" | "error" | "other" | "token_count";
  name?: string;
  text?: string;
  tokenUsage?: TokenUsageInfo;
};

export type SessionTimelineResponse = {
  summary: SessionSummary;
  truncated: boolean;
  events: TimelineEvent[];
};
