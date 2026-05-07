import SessionTimeline from "@/components/SessionTimeline";

export const dynamic = "force-dynamic";

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <main className="space-y-6">
      <section className="surface p-5">
        <div className="max-w-3xl">
          <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">时间线查看</div>
          <h2 className="mt-2 text-2xl font-semibold text-[var(--ink)]">会话详情</h2>
          <p className="mt-2 break-all text-sm leading-6 text-[var(--muted)]">
            按时间顺序回放单个会话里的用户消息、助手回复、工具调用、工具输出和 Token 计数变化。
          </p>
        </div>
      </section>

      <SessionTimeline sessionId={id} />
    </main>
  );
}
