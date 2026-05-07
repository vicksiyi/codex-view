import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { formatDateTime, formatDuration, formatInt, truncateMiddle } from "@/lib/format";
import type { SessionSummary } from "@/lib/types";

export function RecentSessions({
  sessions,
  description
}: {
  sessions: SessionSummary[];
  description?: string;
}) {
  return (
    <section className="surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[var(--ink)]">最近会话</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {description ?? "最近索引到的运行记录，可快速进入详情。"}
          </p>
        </div>
        <Link
          href="/sessions"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-[color:var(--line)] px-3 text-sm text-[var(--muted)] transition-colors hover:border-[color:var(--line-strong)] hover:bg-[var(--panel)] hover:text-[var(--ink)]"
        >
          <span>全部会话</span>
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
            <tr>
              <th className="pb-3 font-medium">开始时间</th>
              <th className="pb-3 font-medium">时长</th>
              <th className="pb-3 font-medium">工作目录</th>
              <th className="pb-3 text-right font-medium">消息数</th>
              <th className="pb-3 text-right font-medium">工具数</th>
              <th className="pb-3 text-right font-medium">Token</th>
              <th className="pb-3 text-right font-medium">详情</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--line)]">
            {sessions.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-[var(--muted)]">
                  暂无已索引会话。
                </td>
              </tr>
            ) : (
              sessions.map((session) => (
                <tr key={session.id}>
                  <td className="py-3 text-[var(--ink)]">{formatDateTime(session.startedAt)}</td>
                  <td className="mono py-3 text-[var(--muted)]">{formatDuration(session.durationSec)}</td>
                  <td className="py-3 text-[var(--muted)]" title={session.cwd ?? ""}>
                    {session.cwd ? truncateMiddle(session.cwd, 24, 14) : "—"}
                  </td>
                  <td className="mono py-3 text-right text-[var(--muted)]">{formatInt(session.messages)}</td>
                  <td className="mono py-3 text-right text-[var(--muted)]">{formatInt(session.toolCalls)}</td>
                  <td className="mono py-3 text-right text-[var(--muted)]">{formatInt(session.tokensTotal)}</td>
                  <td className="py-3 text-right">
                    <Link
                      href={`/sessions/${encodeURIComponent(session.id)}`}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-[color:var(--line)] px-2.5 text-xs text-[var(--muted)] transition-colors hover:border-[color:var(--line-strong)] hover:bg-[var(--panel)] hover:text-[var(--ink)]"
                    >
                      <span>查看</span>
                      <ArrowUpRight className="h-3.5 w-3.5" />
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
