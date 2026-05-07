"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { ArrowLeft, Bot, CircleAlert, Hammer, MessageSquare, TerminalSquare } from "lucide-react";
import { fetchJson } from "@/lib/fetcher";
import { formatDateTime, formatInt } from "@/lib/format";
import type { SessionTimelineResponse, TokenUsage, TokenUsageInfo } from "@/lib/types";

function kindLabel(kind: string) {
  switch (kind) {
    case "user":
      return "用户";
    case "assistant":
      return "助手";
    case "tool_call":
      return "工具调用";
    case "tool_output":
      return "工具输出";
    case "error":
      return "错误";
    default:
      return "其他";
  }
}

function bubbleClass(kind: string) {
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
  const output: (SessionTimelineResponse["events"][number] & { tokenUsageMeta?: TokenUsageInfo })[] = [];
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

export default function SessionTimeline({ sessionId }: { sessionId: string }) {
  const { data, error, isLoading } = useSWR<SessionTimelineResponse>(
    `/api/session/${encodeURIComponent(sessionId)}`,
    fetchJson
  );
  const [filters, setFilters] = useState({
    user: true,
    assistant: true,
    tool_call: true,
    tool_output: true,
    error: true,
    other: false
  });

  const displayItems = useMemo(() => attachTokenCounters(data?.events ?? []), [data?.events]);
  const counts = useMemo(() => {
    const stats = {
      user: 0,
      assistant: 0,
      tool_call: 0,
      tool_output: 0,
      error: 0,
      other: 0
    };
    for (const item of displayItems) {
      stats[item.kind as keyof typeof stats] += 1;
    }
    return stats;
  }, [displayItems]);

  const filteredItems = useMemo(() => {
    return displayItems.filter((item) => filters[item.kind as keyof typeof filters]);
  }, [displayItems, filters]);

  if (error) {
    return (
      <section className="surface p-4 text-sm text-red-700">
        时间线加载失败：{String(error)}
      </section>
    );
  }

  if (isLoading || !data) {
    return (
      <section className="surface p-4 text-sm text-[var(--muted)]">
        正在加载时间线...
      </section>
    );
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
              { key: "tool_call", label: "工具调用", icon: Hammer },
              { key: "tool_output", label: "工具输出", icon: TerminalSquare },
              { key: "error", label: "错误", icon: CircleAlert },
              { key: "other", label: "其他", icon: MessageSquare }
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
            事件过多，当前只渲染前 {formatInt(displayItems.length)} 条。
          </div>
        ) : null}

        <div className="mt-4 space-y-4">
          {filteredItems.map((item, index) => {
            const text = item.text ?? "";
            const preview = previewText(text);
            const isLong = preview !== text;
            const deltaLabel = formatTokenUsage("增量", item.tokenUsageMeta?.delta);
            const totalLabel = formatTokenUsage("累计", item.tokenUsageMeta?.total);

            return (
              <div key={`${item.ts}-${index}`} className="rounded-lg border border-[color:var(--line)] bg-white/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2 rounded-md border border-[color:var(--line)] bg-[var(--panel)] px-2.5 py-1 text-xs font-medium text-[var(--ink)]">
                    <span className={`h-2 w-2 rounded-full ${item.kind === "error" ? "bg-red-500" : item.kind === "assistant" ? "bg-teal-500" : item.kind === "user" ? "bg-blue-500" : item.kind === "tool_call" ? "bg-amber-500" : "bg-slate-400"}`} />
                    <span>{kindLabel(item.kind)}</span>
                    {item.name ? <span className="text-[var(--muted)]">/ {item.name}</span> : null}
                  </div>
                  <div className="mono text-xs text-[var(--muted)]">{formatDateTime(item.ts)}</div>
                </div>

                {text ? (
                  isLong ? (
                    <details className="mt-3">
                      <summary className={`cursor-pointer rounded-lg border p-3 text-sm text-[var(--ink)] ${bubbleClass(item.kind)}`}>
                        <pre className="whitespace-pre-wrap break-words font-sans">{preview}</pre>
                      </summary>
                      <div className={`mt-2 rounded-lg border p-3 text-sm text-[var(--ink)] ${bubbleClass(item.kind)}`}>
                        <pre className="whitespace-pre-wrap break-words font-sans">{text}</pre>
                      </div>
                    </details>
                  ) : (
                    <div className={`mt-3 rounded-lg border p-3 text-sm text-[var(--ink)] ${bubbleClass(item.kind)}`}>
                      <pre className="whitespace-pre-wrap break-words font-sans">{text}</pre>
                    </div>
                  )
                ) : (
                  <div className="mt-3 rounded-lg border border-dashed border-[color:var(--line)] p-3 text-sm text-[var(--muted)]">
                    无文本内容。
                  </div>
                )}

                {deltaLabel || totalLabel ? (
                  <div className="mt-3 space-y-1 text-xs text-[var(--muted)]">
                    {deltaLabel ? <div>{deltaLabel}</div> : null}
                    {totalLabel ? <div>{totalLabel}</div> : null}
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
