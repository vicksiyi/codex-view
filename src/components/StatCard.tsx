import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  meta,
  icon,
  tone
}: {
  label: string;
  value: string;
  meta: string;
  icon: ReactNode;
  tone: "blue" | "teal" | "amber" | "rose";
}) {
  const toneClass = {
    blue: "border-l-[var(--accent)]",
    teal: "border-l-[#14B8A6]",
    amber: "border-l-[#F59E0B]",
    rose: "border-l-[#EF4444]"
  }[tone];

  return (
    <section className={`surface border-l-4 p-4 ${toneClass}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">{label}</div>
          <div className="mono mt-3 text-3xl font-semibold text-[var(--ink)]">{value}</div>
          <div className="mt-2 text-xs text-[var(--muted)]">{meta}</div>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-md border border-[color:var(--line)] bg-[var(--panel-strong)] text-[var(--ink)]">
          {icon}
        </div>
      </div>
    </section>
  );
}
