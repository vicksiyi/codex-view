import SessionsTable from "@/components/SessionsTable";

export const dynamic = "force-dynamic";

export default function SessionsPage() {
  return (
    <main className="space-y-6">
      <section className="surface p-5">
        <div className="max-w-3xl">
          <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">可检索会话归档</div>
          <h2 className="mt-2 text-2xl font-semibold text-[var(--ink)]">会话列表</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            可按时间区间、工具调用和错误状态过滤，也可按 session id 或工作目录搜索，并直接进入详细时间线。
          </p>
        </div>
      </section>

      <SessionsTable />
    </main>
  );
}
