import { FolderTree } from "lucide-react";
import { formatInt, truncateMiddle } from "@/lib/format";
import type { WorkspaceAgg } from "@/lib/types";

export function WorkspacePanel({ workspaces }: { workspaces: WorkspaceAgg[] }) {
  return (
    <section className="surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[var(--ink)]">热点工作目录</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">哪些 `cwd` 产生活动最多。</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-[color:var(--line)] bg-[var(--panel-strong)] text-[var(--ink)]">
          <FolderTree className="h-4 w-4" />
        </div>
      </div>

      <div className="mt-4 divide-y divide-[color:var(--line)]">
        {workspaces.length === 0 ? (
          <div className="rounded-md border border-dashed border-[color:var(--line)] p-3 text-sm text-[var(--muted)]">
            暂无工作目录数据。
          </div>
        ) : (
          workspaces.map((workspace) => (
            <div key={workspace.cwd} className="grid grid-cols-[minmax(0,1fr)_72px_96px] gap-3 py-3 text-sm">
              <div className="min-w-0 text-[var(--ink)]" title={workspace.cwd}>
                {truncateMiddle(workspace.cwd, 36, 18)}
              </div>
              <div className="mono text-right text-[var(--muted)]">{formatInt(workspace.sessions)}</div>
              <div className="mono text-right text-[var(--muted)]">{formatInt(workspace.tokensTotal)}</div>
            </div>
          ))
        )}
      </div>

      {workspaces.length > 0 ? (
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_72px_96px] gap-3 text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
          <div>工作目录</div>
          <div className="text-right">会话数</div>
          <div className="text-right">Token</div>
        </div>
      ) : null}
    </section>
  );
}
