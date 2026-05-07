"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { DateRangeFields } from "@/components/DateRangeFields";
import { appendDateRangeSearchParams, normalizeDateRange } from "@/lib/date-range";
import { fetchJson } from "@/lib/fetcher";
import { formatDateTime, formatDuration, formatInt, truncateMiddle } from "@/lib/format";
import type { SessionsListResponse } from "@/lib/types";

export default function SessionsTable() {
  const [onlyWithTools, setOnlyWithTools] = useState(false);
  const [onlyWithErrors, setOnlyWithErrors] = useState(false);
  const [query, setQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 100;
  const filters = useMemo(() => normalizeDateRange({ start: startDate, end: endDate }), [endDate, startDate]);

  useEffect(() => {
    setOffset(0);
  }, [endDate, onlyWithErrors, onlyWithTools, query, startDate]);

  const key = useMemo(() => {
    const searchParams = appendDateRangeSearchParams(new URLSearchParams(), filters);
    if (query.trim()) searchParams.set("q", query.trim());
    if (onlyWithTools) searchParams.set("withTools", "1");
    if (onlyWithErrors) searchParams.set("withErrors", "1");
    searchParams.set("limit", String(limit));
    searchParams.set("offset", String(offset));
    return `/api/sessions?${searchParams.toString()}`;
  }, [filters, limit, offset, onlyWithErrors, onlyWithTools, query]);

  const { data, error, isLoading } = useSWR<SessionsListResponse>(key, fetchJson, {
    refreshInterval: 15_000
  });
  const hasRangeFilter = Boolean(filters.start || filters.end);
  const hasAnyFilter = hasRangeFilter || onlyWithErrors || onlyWithTools || query.trim();

  if (error) {
    return (
      <section className="surface p-4 text-sm text-red-700">
        会话列表加载失败：{String(error)}
      </section>
    );
  }

  if (isLoading || !data) {
    return (
      <section className="surface p-4 text-sm text-[var(--muted)]">
        正在加载会话列表...
      </section>
    );
  }

  return (
    <section className="surface p-4">
      <div className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2 text-sm text-[var(--muted)]">
              <input
                type="checkbox"
                checked={onlyWithTools}
                onChange={(event) => setOnlyWithTools(event.target.checked)}
                className="h-4 w-4 rounded border-[color:var(--line)]"
              />
              <span>仅含工具调用</span>
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-[var(--muted)]">
              <input
                type="checkbox"
                checked={onlyWithErrors}
                onChange={(event) => setOnlyWithErrors(event.target.checked)}
                className="h-4 w-4 rounded border-[color:var(--line)]"
              />
              <span>仅看错误会话</span>
            </label>
          </div>

          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索 session id / cwd / originator"
              className="h-11 w-full rounded-md border border-[color:var(--line)] bg-[var(--panel)] pl-10 pr-3 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--muted)] focus:border-[color:var(--line-strong)]"
            />
          </div>
        </div>

        <div className="rounded-lg border border-[color:var(--line)] bg-[var(--panel)] p-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">时间区间</div>
              <p className="mt-1 text-xs text-[var(--muted)]">按 started_at 过滤当前列表。</p>
            </div>
            <DateRangeFields
              start={startDate}
              end={endDate}
              onStartChange={setStartDate}
              onEndChange={setEndDate}
              onClear={() => {
                setStartDate("");
                setEndDate("");
              }}
              className="w-full xl:max-w-[520px]"
            />
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--muted)]">
        <div>
          总数 {formatInt(data.total)} / 当前展示 {formatInt(data.items.length)} / offset {formatInt(offset)}
          {hasRangeFilter ? ` / 区间 ${filters.start ?? "最早"} 至 ${filters.end ?? "今天"}` : ""}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOffset((current) => Math.max(0, current - limit))}
            disabled={offset === 0}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-[color:var(--line)] px-3 text-sm text-[var(--muted)] transition-colors hover:border-[color:var(--line-strong)] hover:bg-[var(--panel)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>上一页</span>
          </button>
          <button
            type="button"
            onClick={() => setOffset((current) => current + limit)}
            disabled={offset + limit >= data.total}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-[color:var(--line)] px-3 text-sm text-[var(--muted)] transition-colors hover:border-[color:var(--line-strong)] hover:bg-[var(--panel)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span>下一页</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[1120px] text-sm">
          <thead className="text-left text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
            <tr>
              <th className="pb-3 font-medium">开始时间</th>
              <th className="pb-3 font-medium">时长</th>
              <th className="pb-3 font-medium">cwd</th>
              <th className="pb-3 text-right font-medium">消息数</th>
              <th className="pb-3 text-right font-medium">工具数</th>
              <th className="pb-3 text-right font-medium">错误数</th>
              <th className="pb-3 text-right font-medium">Token</th>
              <th className="pb-3 font-medium">originator</th>
              <th className="pb-3 text-right font-medium">详情</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--line)]">
            {data.items.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-6 text-[var(--muted)]">
                  {hasAnyFilter ? "当前筛选条件下没有匹配会话。" : "没有匹配到会话。"}
                </td>
              </tr>
            ) : (
              data.items.map((session) => (
                <tr key={session.id}>
                  <td className="py-3 text-[var(--ink)]">{formatDateTime(session.startedAt)}</td>
                  <td className="mono py-3 text-[var(--muted)]">{formatDuration(session.durationSec)}</td>
                  <td className="py-3 text-[var(--muted)]" title={session.cwd ?? ""}>
                    {session.cwd ? truncateMiddle(session.cwd, 28, 14) : "—"}
                  </td>
                  <td className="mono py-3 text-right text-[var(--muted)]">{formatInt(session.messages)}</td>
                  <td className="mono py-3 text-right text-[var(--muted)]">{formatInt(session.toolCalls)}</td>
                  <td className="mono py-3 text-right text-[var(--muted)]">{formatInt(session.errors)}</td>
                  <td className="mono py-3 text-right text-[var(--muted)]">{formatInt(session.tokensTotal)}</td>
                  <td className="py-3 text-[var(--muted)]">{session.originator ?? "—"}</td>
                  <td className="py-3 text-right">
                    <Link
                      href={`/sessions/${encodeURIComponent(session.id)}`}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-[color:var(--line)] px-2.5 text-xs text-[var(--muted)] transition-colors hover:border-[color:var(--line-strong)] hover:bg-[var(--panel)] hover:text-[var(--ink)]"
                    >
                      <span>查看</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
