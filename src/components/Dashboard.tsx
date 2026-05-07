"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import {
  Activity,
  Bot,
  CalendarRange,
  CircleAlert,
  Database,
  FolderGit2,
  MessageSquareText
} from "lucide-react";
import { DateRangeFields } from "@/components/DateRangeFields";
import { StatCard } from "@/components/StatCard";
import { ToolLeaderboard } from "@/components/ToolLeaderboard";
import { WorkspacePanel } from "@/components/WorkspacePanel";
import { RecentSessions } from "@/components/RecentSessions";
import { appendDateRangeSearchParams, normalizeDateRange } from "@/lib/date-range";
import { fetchJson } from "@/lib/fetcher";
import { formatDateTime, formatInt } from "@/lib/format";
import type { IndexSnapshot, SessionsListResponse } from "@/lib/types";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function sumSlice(values: number[], start: number, end: number) {
  let total = 0;
  for (let index = start; index <= end; index += 1) total += values[index] ?? 0;
  return total;
}

export default function Dashboard() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [zoom, setZoom] = useState<{ start: number; end: number } | null>(null);
  const filters = useMemo(() => normalizeDateRange({ start: startDate, end: endDate }), [endDate, startDate]);
  const hasRangeFilter = Boolean(filters.start || filters.end);

  const indexKey = useMemo(() => {
    const searchParams = appendDateRangeSearchParams(new URLSearchParams(), filters);
    const query = searchParams.toString();
    return query ? `/api/index?${query}` : "/api/index";
  }, [filters]);

  const recentKey = useMemo(() => {
    const searchParams = appendDateRangeSearchParams(new URLSearchParams(), filters);
    searchParams.set("limit", "8");
    return `/api/sessions?${searchParams.toString()}`;
  }, [filters]);

  const { data, error, isLoading } = useSWR<IndexSnapshot>(indexKey, fetchJson, {
    refreshInterval: 15_000
  });
  const { data: recentData } = useSWR<SessionsListResponse>(recentKey, fetchJson, {
    refreshInterval: 15_000
  });

  useEffect(() => {
    setZoom(null);
  }, [indexKey]);

  if (error) {
    return (
      <section className="surface p-4 text-sm text-red-700">
        索引加载失败：{String(error)}
      </section>
    );
  }

  if (isLoading || !data) {
    return (
      <section className="surface p-4 text-sm text-[var(--muted)]">
        正在索引本地会话历史...
      </section>
    );
  }

  const dailyKeys = Object.keys(data.daily).sort();
  const dailySessions = dailyKeys.map((day) => data.daily[day]?.sessions ?? 0);
  const dailyMessages = dailyKeys.map((day) => data.daily[day]?.messages ?? 0);
  const dailyTools = dailyKeys.map((day) => data.daily[day]?.toolCalls ?? 0);
  const dailyErrors = dailyKeys.map((day) => data.daily[day]?.errors ?? 0);
  const dailyTokens = dailyKeys.map((day) => data.daily[day]?.tokensTotal ?? 0);

  const totalPoints = dailyKeys.length || 1;
  const startIndex = zoom
    ? clamp(Math.floor((zoom.start / 100) * (totalPoints - 1)), 0, totalPoints - 1)
    : 0;
  const endIndex = zoom
    ? clamp(Math.ceil((zoom.end / 100) * (totalPoints - 1)), startIndex, totalPoints - 1)
    : totalPoints - 1;

  const rangeLabel = dailyKeys.length
    ? `${dailyKeys[startIndex] ?? "—"} 至 ${dailyKeys[endIndex] ?? "—"}`
    : "暂无每日数据";
  const rangeSessions = sumSlice(dailySessions, startIndex, endIndex);
  const rangeMessages = sumSlice(dailyMessages, startIndex, endIndex);
  const rangeTools = sumSlice(dailyTools, startIndex, endIndex);
  const rangeErrors = sumSlice(dailyErrors, startIndex, endIndex);
  const rangeTokens = sumSlice(dailyTokens, startIndex, endIndex);
  const topTools = Object.entries(data.tools)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8);
  const filterLabel =
    filters.start || filters.end
      ? `${filters.start ?? "最早"} 至 ${filters.end ?? "今天"}`
      : "全部时间";

  return (
    <section className="space-y-6">
      <section className="surface p-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <div>
            <div className="inline-flex h-7 items-center rounded-md border border-[color:var(--line)] bg-[var(--panel-strong)] px-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--accent)]">
              会话分析
            </div>
            <h2 className="mt-4 text-2xl font-semibold text-[var(--ink)]">Codex CLI 会话总览</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              `codex-view` 会读取本机 JSONL 历史并写入 SQLite 缓存，提供总览、会话列表和事件时间线。界面结构和视觉
              已按 `codex-view` 重新组织，并支持按时间区间过滤当前内容。
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-[color:var(--line)] bg-[var(--panel)] p-4 sm:col-span-2">
              <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">时间区间筛选</div>
              <DateRangeFields
                start={startDate}
                end={endDate}
                onStartChange={setStartDate}
                onEndChange={setEndDate}
                onClear={() => {
                  setStartDate("");
                  setEndDate("");
                }}
                className="mt-3"
              />
              <div className="mt-2 text-xs text-[var(--muted)]">按会话开始时间过滤总览、图表和最近会话。</div>
            </div>
            <div className="rounded-lg border border-[color:var(--line)] bg-[var(--panel)] p-4">
              <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">当前筛选</div>
              <div className="mono mt-2 text-lg font-semibold text-[var(--ink)]">{filterLabel}</div>
              <div className="mt-2 text-xs text-[var(--muted)]">图表缩放区间：{rangeLabel}</div>
            </div>
            <div className="rounded-lg border border-[color:var(--line)] bg-[var(--panel)] p-4">
              <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">最近生成时间</div>
              <div className="mt-2 text-sm font-medium text-[var(--ink)]">{formatDateTime(data.generatedAt)}</div>
              <div className="mt-2 text-xs text-[var(--muted)]">索引会按 10 到 15 秒节奏增量刷新。</div>
            </div>
            <div className="rounded-lg border border-[color:var(--line)] bg-[var(--panel)] p-4 sm:col-span-2">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">会话目录</div>
                  <div className="mt-2 break-all text-sm text-[var(--ink)]">{data.sessionsDir}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">缓存目录</div>
                  <div className="mt-2 break-all text-sm text-[var(--ink)]">{data.cacheDir}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <StatCard
          label="会话数"
          value={formatInt(rangeSessions)}
          meta={`${hasRangeFilter ? "当前筛选" : "累计已索引"} ${formatInt(data.totals.sessions)} 条`}
          icon={<CalendarRange className="h-4 w-4" />}
          tone="blue"
        />
        <StatCard
          label="消息数"
          value={formatInt(rangeMessages)}
          meta={`当前区间工具调用 ${formatInt(rangeTools)} 次`}
          icon={<MessageSquareText className="h-4 w-4" />}
          tone="teal"
        />
        <StatCard
          label="Token"
          value={formatInt(rangeTokens)}
          meta={`输入 ${formatInt(data.totals.tokensInput)} / 输出 ${formatInt(data.totals.tokensOutput)}`}
          icon={<Bot className="h-4 w-4" />}
          tone="amber"
        />
        <StatCard
          label="错误数"
          value={formatInt(rangeErrors)}
          meta={`累计扫描文件 ${formatInt(data.totals.files)} 个`}
          icon={<CircleAlert className="h-4 w-4" />}
          tone="rose"
        />
      </div>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.85fr)]">
        <section className="surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-[var(--ink)]">趋势图</h3>
              <p className="mt-1 text-xs text-[var(--muted)]">
                按日展示当前筛选范围内的会话数、消息数、工具调用、错误数和 Token 消耗。
              </p>
            </div>
            <div className="inline-flex h-9 items-center gap-2 rounded-md border border-[color:var(--line)] bg-[var(--panel-strong)] px-3 text-xs text-[var(--muted)]">
              <Activity className="h-4 w-4" />
              <span>{rangeLabel}</span>
            </div>
          </div>

          <ReactECharts
            style={{ height: 360, marginTop: 16 }}
            onEvents={{
              dataZoom: (params: any) => {
                const payload = Array.isArray(params?.batch) ? params.batch[0] : params;
                const start = typeof payload?.start === "number" ? payload.start : null;
                const end = typeof payload?.end === "number" ? payload.end : null;
                if (start == null || end == null) return;
                setZoom({ start, end });
              }
            }}
            option={{
              color: ["#2563EB", "#14B8A6", "#F59E0B", "#EF4444", "#0F172A"],
              animationDuration: 450,
              tooltip: {
                trigger: "axis",
                backgroundColor: "rgba(15, 23, 42, 0.94)",
                borderColor: "rgba(148, 163, 184, 0.28)",
                textStyle: { color: "#F8FAFC" }
              },
              legend: {
                top: 0,
                textStyle: { color: "#475569" },
                data: ["会话数", "消息数", "工具调用", "错误数", "Token"]
              },
              grid: { left: 36, right: 20, top: 42, bottom: 56 },
              xAxis: {
                type: "category",
                data: dailyKeys,
                axisLabel: { color: "#64748B" },
                axisLine: { lineStyle: { color: "rgba(148, 163, 184, 0.28)" } }
              },
              yAxis: [
                {
                  type: "value",
                  axisLabel: { color: "#64748B" },
                  splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.18)" } }
                },
                {
                  type: "value",
                  axisLabel: { color: "#64748B" },
                  splitLine: { show: false }
                }
              ],
              dataZoom: [
                { type: "inside", xAxisIndex: 0, start: zoom?.start, end: zoom?.end },
                {
                  type: "slider",
                  xAxisIndex: 0,
                  bottom: 10,
                  height: 18,
                  borderColor: "rgba(148, 163, 184, 0.28)",
                  fillerColor: "rgba(37, 99, 235, 0.12)",
                  handleStyle: { color: "rgba(37, 99, 235, 0.55)" },
                  start: zoom?.start,
                  end: zoom?.end
                }
              ],
              series: [
                { name: "会话数", type: "bar", barWidth: 14, data: dailySessions },
                { name: "消息数", type: "line", smooth: true, data: dailyMessages },
                { name: "工具调用", type: "line", smooth: true, data: dailyTools },
                { name: "错误数", type: "line", smooth: true, data: dailyErrors },
                { name: "Token", type: "line", smooth: true, yAxisIndex: 1, data: dailyTokens }
              ]
            }}
          />
        </section>

        <div className="space-y-6">
          <ToolLeaderboard tools={topTools} />
          <WorkspacePanel workspaces={data.workspaces} />
        </div>
      </section>

      <RecentSessions
        sessions={recentData?.items ?? []}
        description={hasRangeFilter ? "当前筛选区间内按开始时间倒序展示最近会话。" : undefined}
      />

      <section className="surface p-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-[color:var(--line)] bg-[var(--panel)] p-4">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
              <Database className="h-4 w-4" />
              索引结构
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
              JSONL 文件按增量方式扫描。会话摘要和工具统计都会写入 SQLite，保证查询速度。
            </p>
          </div>
          <div className="rounded-lg border border-[color:var(--line)] bg-[var(--panel)] p-4">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
              <FolderGit2 className="h-4 w-4" />
              会话详情
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
              详情页会把消息事件、工具调用、工具输出和 Token 计数统一串成一条时间线。
            </p>
          </div>
          <div className="rounded-lg border border-[color:var(--line)] bg-[var(--panel)] p-4">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
              <CircleAlert className="h-4 w-4" />
              兼容性
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
              缓存目录使用 `~/.codex-view/cache`，也可以通过 `CODEX_VIEW_CACHE_DIR` 自定义覆盖。
            </p>
          </div>
        </div>
      </section>
    </section>
  );
}
