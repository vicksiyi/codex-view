"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, FolderKanban, Github, MoveRight } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";

const navItems = [
  { href: "/", label: "总览", icon: BarChart3 },
  { href: "/sessions", label: "会话", icon: FolderKanban }
];

function navClass(active: boolean) {
  return active
    ? "border-[color:var(--line-strong)] bg-[var(--panel-strong)] text-[var(--ink)]"
    : "border-[color:var(--line)] bg-transparent text-[var(--muted)] hover:border-[color:var(--line-strong)] hover:bg-[var(--panel)] hover:text-[var(--ink)]";
}

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="mb-8 border-b border-[color:var(--line)] pb-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start gap-4">
          <BrandMark className="h-12 w-12 shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
              Codex 会话看板
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-[var(--ink)]">codex-view</h1>
            <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
              读取本机 Codex JSONL 历史，建立 SQLite 索引，在一个页面里查看会话趋势、Token 消耗、工具使用和详细时间线。
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <nav className="flex flex-wrap items-center gap-2">
            {navItems.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm transition-colors ${navClass(active)}`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <Link
            href="https://github.com/vicksiyi/codex-view"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-[color:var(--line)] px-3 text-sm text-[var(--muted)] transition-colors hover:border-[color:var(--line-strong)] hover:bg-[var(--panel)] hover:text-[var(--ink)]"
          >
            <Github className="h-4 w-4" />
            <span>GitHub</span>
            <MoveRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}
