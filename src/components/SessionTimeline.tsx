"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { ArrowLeft, Bot, CircleAlert, Hammer, MessageSquare, TerminalSquare } from "lucide-react";
import { fetchJson } from "@/lib/fetcher";
import { formatDateTime, formatInt } from "@/lib/format";
import type { SessionTimelineResponse, TokenUsage, TokenUsageInfo } from "@/lib/types";

type DisplayEvent = SessionTimelineResponse["events"][number] & {
  tokenUsageMeta?: TokenUsageInfo;
};

type ToolPair = {
  key: string;
  name: string;
  callId?: string;
  call?: DisplayEvent;
  output?: DisplayEvent;
};

type DisplayBlock =
  | {
      kind: "user" | "error" | "other";
      event: DisplayEvent;
    }
  | {
      kind: "assistant_group";
      assistant: DisplayEvent | null;
      tools: ToolPair[];
    };

function kindLabel(kind: DisplayBlock["kind"] | "assistant" | "tool") {
  switch (kind) {
    case "user":
      return "用户";
    case "assistant":
      return "助手";
    case "tool":
      return "工具";
    case "error":
      return "错误";
    default:
      return "其他";
  }
}

function bubbleClass(kind: "user" | "assistant" | "tool_call" | "tool_output" | "error" | "other") {
  switch (kind) {
    case "user":
      return "border-blue-200 bg-blue-50";
    case "assistant":
      return "border-teal-200 bg-teal-50";
    case "tool_call":
      return "border-amber-200 bg-amber-50";
    case "tool_output":
      return "border-slate-200 bg-slate-50";
    case "error":
      return "border-red-200 bg-red-50";
    default:
      return "border-[color:var(--line)] bg-[var(--panel)]";
  }
}

function previewText(text: string, maxChars = 900, maxLines = 14) {
  const lines = text.split("\n");
  const limitedLines = lines.slice(0, maxLines);
  const joined = limitedLines.join("\n");
  if (lines.length > maxLines || joined.length > maxChars) {
    return `${joined.slice(0, maxChars)}\n...`;
  }
  return joined;
}

function formatTokenUsage(prefix: string, usage: TokenUsage | null | undefined) {
  if (!usage) return null;
  return `${prefix}：总量 ${formatInt(usage.total)} / 输入 ${formatInt(usage.input)} / 输出 ${formatInt(usage.output)} / 缓存 ${formatInt(usage.cachedInput)} / 推理 ${formatInt(usage.reasoningOutput)}`;
}

function attachTokenCounters(events: SessionTimelineResponse["events"]) {
  const output: DisplayEvent[] = [];
  let lastIndex = -1;

  for (const event of events) {
    if (event.kind === "token_count") {
      if (lastIndex >= 0) {
        output[lastIndex] = { ...output[lastIndex], tokenUsageMeta: event.tokenUsage };
      }
      continue;
    }
    output.push(event);
    lastIndex = output.length - 1;
  }

  return output;
}

function buildDisplayBlocks(events: DisplayEvent[]) {
  const blocks: DisplayBlock[] = [];
  const toolByCallId = new Map<string, ToolPair>();
  let currentAssistantGroup: Extract<DisplayBlock, { kind: "assistant_group" }> | null = null;
  let orphanToolIndex = 0;

  function createAssistantGroup(assistant: DisplayEvent | null) {
    const group: Extract<DisplayBlock, { kind: "assistant_group" }> = {
      kind: "assistant_group",
      assistant,
      tools: []
    };
    blocks.push(group);
    currentAssistantGroup = group;
    return group;
  }

  function ensureAssistantGroup() {
    return currentAssistantGroup ?? createAssistantGroup(null);
  }

  for (const event of events) {
    if (event.kind === "user" || event.kind === "error" || event.kind === "other") {
      blocks.push({ kind: event.kind, event });
      currentAssistantGroup = null;
      continue;
    }

    if (event.kind === "assistant") {
      createAssistantGroup(event);
      continue;
    }

    if (event.kind === "tool_call") {
      const group = ensureAssistantGroup();
      const pair: ToolPair = {
        key: event.callId ?? `tool-call-${orphanToolIndex++}`,
        name: event.name ?? "unknown",
        callId: event.callId,
        call: event
      };
      group.tools.push(pair);
      if (event.callId) toolByCallId.set(event.callId, pair);
      continue;
    }

    if (event.kind === "tool_output") {
      const existing = event.callId ? toolByCallId.get(event.callId) : undefined;
      if (existing) {
        existing.output = event;
        if (!existing.name && event.name) existing.name = event.name;
        continue;
      }

      const group = ensureAssistantGroup();
      const pair: ToolPair = {
        key: event.callId ?? `tool-output-${orphanToolIndex++}`,
        name: event.name ?? "unknown",
        callId: event.callId,
        output: event
      };
      group.tools.push(pair);
      if (event.callId) toolByCallId.set(event.callId, pair);
    }
  }

  return blocks;
}

function EventText({
  kind,
  text,
  emptyLabel
}: {
  kind: "user" | "assistant" | "tool_call" | "tool_output" | "error" | "other";
  text: string;
  emptyLabel: string;
}) {
  if (!text) {
    return (
      <div className="rounded-lg border border-dashed border-[color:var(--line)] p-3 text-sm text-[var(--muted)]">
        {emptyLabel}
      </div>
    );
  }

  const preview = previewText(text);
  const isLong = preview !== text;

  if (isLong) {
    return (
      <details>
        <summary className={`cursor-pointer rounded-lg border p-3 text-sm text-[var(--ink)] ${bubbleClass(kind)}`}>
          <pre className="whitespace-pre-wrap break-words font-sans">{preview}</pre>
        </summary>
        <div className={`mt-2 rounded-lg border p-3 text-sm text-[var(--ink)] ${bubbleClass(kind)}`}>
          <pre className="whitespace-pre-wrap break-words font-sans">{text}</pre>
        </div>
      </details>
    );
  }

  return (
    <div className={`rounded-lg border p-3 text-sm text-[var(--ink)] ${bubbleClass(kind)}`}>
      <pre className="whitespace-pre-wrap break-words font-sans">{text}</pre>
    </div>
  );
}

function TokenUsageMeta({ usage }: { usage?: TokenUsageInfo }) {
  const deltaLabel = formatTokenUsage("增量", usage?.delta);
  const totalLabel = formatTokenUsage("累计", usage?.total);

  if (!deltaLabel && !totalLabel) return null;

  return (
    <div className="mt-3 space-y-1 text-xs text-[var(--muted)]">
      {deltaLabel ? <div>{deltaLabel}</div> : null}
      {totalLabel ? <div>{totalLabel}</div> : null}
    </div>
  );
}

export default function SessionTimeline({ sessionId }: { sessionId: string }) {
  const { data, error, isLoading } = useSWR<SessionTimelineResponse>(
    `/api/session/${encodeURIComponent(sessionId)}`,
    fetchJson
  );
  const [filters, setFilters] = useState({
    user: true,
    assistant: true,
    tool: true,
    error: true,
    other: false
  });

  const displayEvents = useMemo(() => attachTokenCounters(data?.events ?? []), [data?.events]);
  const displayBlocks = useMemo(() => buildDisplayBlocks(displayEvents), [displayEvents]);

  const counts = useMemo(() => {
    const stats = {
      user: 0,
      assistant: 0,
      tool: 0,
      error: 0,
      other: 0
    };

    for (const block of displayBlocks) {
      if (block.kind === "assistant_group") {
        stats.assistant += block.assistant ? 1 : 0;
        stats.tool += block.tools.length;
        continue;
      }

      stats[block.kind] += 1;
    }

    return stats;
  }, [displayBlocks]);

  const filteredBlocks = useMemo(() => {
    return displayBlocks.filter((block) => {
      if (block.kind === "user") return filters.user;
      if (block.kind === "error") return filters.error;
      if (block.kind === "other") return filters.other;
      if (block.kind !== "assistant_group") return false;

      const hasAssistant = Boolean(block.assistant) && filters.assistant;
      const hasTools = filters.tool && block.tools.length > 0;
      return hasAssistant || hasTools;
    });
  }, [displayBlocks, filters]);

  if (error) {
    return <section className="surface p-4 text-sm text-red-700">时间线加载失败：{String(error)}</section>;
  }

  if (isLoading || !data) {
    return <section className="surface p-4 text-sm text-[var(--muted)]">正在加载时间线...</section>;
  }

  const summary = data.summary;
  const metrics = [
    { label: "消息数", value: summary.messages, icon: MessageSquare },
    { label: "工具数", value: summary.toolCalls, icon: Hammer },
    { label: "错误数", value: summary.errors, icon: CircleAlert },
    { label: "Token", value: summary.tokensTotal, icon: Bot }
  ];

  return (
    <section className="space-y-6">
      <section className="surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">session ID</div>
            <h2 className="mt-2 break-all text-xl font-semibold text-[var(--ink)]">{summary.id}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-[var(--muted)]">
              <span>开始：{formatDateTime(summary.startedAt)}</span>
              <span>结束：{formatDateTime(summary.endedAt)}</span>
              <span>cwd：{summary.cwd ?? "—"}</span>
            </div>
          </div>
          <Link
            href="/sessions"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-[color:var(--line)] px-3 text-sm text-[var(--muted)] transition-colors hover:border-[color:var(--line-strong)] hover:bg-[var(--panel)] hover:text-[var(--ink)]"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>返回列表</span>
          </Link>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <div key={metric.label} className="rounded-lg border border-[color:var(--line)] bg-[var(--panel)] p-3">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
                  <Icon className="h-4 w-4" />
                  <span>{metric.label}</span>
                </div>
                <div className="mono mt-3 text-2xl font-semibold text-[var(--ink)]">{formatInt(metric.value)}</div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 text-xs text-[var(--muted)]">
          输入 {formatInt(summary.tokensInput)} / 输出 {formatInt(summary.tokensOutput)} / 缓存{" "}
          {formatInt(summary.tokensCachedInput)} / 推理 {formatInt(summary.tokensReasoningOutput)}
        </div>
      </section>

      <section className="surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { key: "user", label: "用户", icon: MessageSquare },
              { key: "assistant", label: "助手", icon: Bot },
              { key: "tool", label: "工具", icon: Hammer },
              { key: "error", label: "错误", icon: CircleAlert },
              { key: "other", label: "其他", icon: TerminalSquare }
            ] as const
          ).map((filter) => {
            const Icon = filter.icon;
            const active = filters[filter.key];
            return (
              <button
                key={filter.key}
                type="button"
                onClick={() => setFilters((current) => ({ ...current, [filter.key]: !current[filter.key] }))}
                className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition-colors ${
                  active
                    ? "border-[color:var(--line-strong)] bg-[var(--panel-strong)] text-[var(--ink)]"
                    : "border-[color:var(--line)] text-[var(--muted)] hover:border-[color:var(--line-strong)] hover:bg-[var(--panel)]"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>
                  {filter.label} {counts[filter.key]}
                </span>
              </button>
            );
          })}
        </div>

        {data.truncated ? (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            事件过多，当前只渲染前 {formatInt(displayEvents.length)} 条。
          </div>
        ) : null}

        <div className="mt-4 space-y-4">
          {filteredBlocks.map((block, index) => {
            if (block.kind === "user" || block.kind === "error" || block.kind === "other") {
              const event = block.event;

              return (
                <div key={`${block.kind}-${event.ts}-${index}`} className="rounded-lg border border-[color:var(--line)] bg-white/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-2 rounded-md border border-[color:var(--line)] bg-[var(--panel)] px-2.5 py-1 text-xs font-medium text-[var(--ink)]">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          block.kind === "error" ? "bg-red-500" : block.kind === "user" ? "bg-blue-500" : "bg-slate-400"
                        }`}
                      />
                      <span>{kindLabel(block.kind)}</span>
                    </div>
                    <div className="mono text-xs text-[var(--muted)]">{formatDateTime(event.ts)}</div>
                  </div>

                  <div className="mt-3">
                    <EventText
                      kind={block.kind}
                      text={event.text ?? ""}
                      emptyLabel={block.kind === "error" ? "无错误详情。" : "无文本内容。"}
                    />
                  </div>

                  <TokenUsageMeta usage={event.tokenUsageMeta} />
                </div>
              );
            }

            const assistantBlock = block as Extract<DisplayBlock, { kind: "assistant_group" }>;
            const assistantVisible = Boolean(assistantBlock.assistant) && filters.assistant;
            const tools = filters.tool ? assistantBlock.tools : [];
            const groupTs =
              assistantBlock.assistant?.ts ??
              tools[0]?.call?.ts ??
              tools[0]?.output?.ts ??
              summary.startedAt ??
              new Date().toISOString();

            return (
              <div key={`assistant-group-${groupTs}-${index}`} className="rounded-lg border border-[color:var(--line)] bg-white/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2 rounded-md border border-[color:var(--line)] bg-[var(--panel)] px-2.5 py-1 text-xs font-medium text-[var(--ink)]">
                    <span className={`h-2 w-2 rounded-full ${assistantVisible ? "bg-teal-500" : "bg-amber-500"}`} />
                    <span>{assistantVisible ? kindLabel("assistant") : "工具链"}</span>
                    {assistantVisible && assistantBlock.assistant?.phase ? (
                      <span className="text-[var(--muted)]">/ {assistantBlock.assistant.phase}</span>
                    ) : null}
                  </div>
                  <div className="mono text-xs text-[var(--muted)]">{formatDateTime(groupTs)}</div>
                </div>

                {assistantVisible && assistantBlock.assistant ? (
                  <div className="mt-3">
                    <EventText
                      kind="assistant"
                      text={assistantBlock.assistant.text ?? ""}
                      emptyLabel="无文本内容。"
                    />
                    <TokenUsageMeta usage={assistantBlock.assistant.tokenUsageMeta} />
                  </div>
                ) : null}

                {tools.length ? (
                  <div className="mt-4 space-y-3">
                    {tools.map((tool: ToolPair, toolIndex: number) => {
                      const callTs = tool.call?.ts ?? "—";
                      const outputTs = tool.output?.ts ?? null;

                      return (
                        <div
                          key={`${tool.key}-${toolIndex}`}
                          className="rounded-lg border border-[color:var(--line)] bg-[var(--panel)] p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900">
                              <Hammer className="h-4 w-4" />
                              <span>{tool.name}</span>
                              {tool.callId ? <span className="mono text-[10px] text-amber-700">{tool.callId}</span> : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]">
                              <span className="mono">调用 {formatDateTime(callTs)}</span>
                              <span className="mono">输出 {formatDateTime(outputTs)}</span>
                            </div>
                          </div>

                          <div className="mt-3 grid gap-3 xl:grid-cols-2">
                            <div className="space-y-2">
                              <div className="text-xs font-medium text-[var(--muted)]">调用</div>
                              <EventText kind="tool_call" text={tool.call?.text ?? ""} emptyLabel="无调用参数。" />
                              <TokenUsageMeta usage={tool.call?.tokenUsageMeta} />
                            </div>

                            <div className="space-y-2">
                              <div className="text-xs font-medium text-[var(--muted)]">输出</div>
                              <EventText kind="tool_output" text={tool.output?.text ?? ""} emptyLabel="尚未记录工具输出。" />
                              <TokenUsageMeta usage={tool.output?.tokenUsageMeta} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </section>
  );
}
