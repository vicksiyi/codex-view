import { Wrench } from "lucide-react";
import { formatInt } from "@/lib/format";

export function ToolLeaderboard({ tools }: { tools: [string, number][] }) {
  const total = tools.reduce((sum, [, count]) => sum + count, 0);

  return (
    <section className="surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[var(--ink)]">工具排行</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">按工具调用事件聚合统计。</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-[color:var(--line)] bg-[var(--panel-strong)] text-[var(--ink)]">
          <Wrench className="h-4 w-4" />
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {tools.length === 0 ? (
          <div className="rounded-md border border-dashed border-[color:var(--line)] p-3 text-sm text-[var(--muted)]">
            暂无工具调用数据。
          </div>
        ) : (
          tools.map(([name, count], index) => {
            const percent = total > 0 ? Math.max(6, Math.round((count / total) * 100)) : 0;
            return (
              <div key={name} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0 text-[var(--ink)]">
                    <span className="mr-2 text-xs text-[var(--muted)]">{String(index + 1).padStart(2, "0")}</span>
                    <span className="truncate">{name}</span>
                  </div>
                  <div className="mono shrink-0 text-[var(--muted)]">{formatInt(count)}</div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--track)]">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#2563EB_0%,#14B8A6_100%)]"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
