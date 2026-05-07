import type { SVGProps } from "react";

export function BrandMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" {...props}>
      <rect x="6" y="6" width="52" height="52" rx="12" className="fill-[var(--panel-strong)] stroke-[var(--line)]" />
      <path
        d="M22 20.5C18.5 23.6 16.5 28 16.5 32.7C16.5 42 24.2 49.5 33.7 49.5C40.4 49.5 46.1 45.8 48.9 40"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        className="text-[var(--ink)]"
      />
      <rect x="24" y="31" width="4.5" height="11" rx="2" fill="#F59E0B" />
      <rect x="32" y="25" width="4.5" height="17" rx="2" fill="#14B8A6" />
      <rect x="40" y="19" width="4.5" height="23" rx="2" fill="#2563EB" />
    </svg>
  );
}
