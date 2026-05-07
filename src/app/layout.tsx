import type { Metadata } from "next";
import { IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import { AppHeader } from "@/components/AppHeader";
import "./globals.css";

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap"
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-mono",
  display: "swap"
});

export const metadata: Metadata = {
  title: "codex-view",
  description: "Codex 会话可视化面板"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className={`${sans.variable} ${mono.variable}`}>
        <div className="mx-auto min-h-dvh w-full max-w-[1440px] px-4 py-6 lg:px-8">
          <AppHeader />
          {children}
          <footer className="mt-10 border-t border-[color:var(--line)] pt-4 text-xs text-[var(--muted)]">
            {"codex-view · 本地 JSONL 历史 -> SQLite 缓存 -> 可视化查看界面"}
          </footer>
        </div>
      </body>
    </html>
  );
}
