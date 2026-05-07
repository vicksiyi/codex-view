"use client";

type DateRangeFieldsProps = {
  start: string;
  end: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onClear: () => void;
  className?: string;
};

export function DateRangeFields({
  start,
  end,
  onStartChange,
  onEndChange,
  onClear,
  className = ""
}: DateRangeFieldsProps) {
  const hasValue = Boolean(start || end);

  return (
    <div className={className}>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <label className="flex min-w-0 flex-col gap-1 text-xs text-[var(--muted)]">
          <span>开始日期</span>
          <input
            type="date"
            value={start}
            onChange={(event) => onStartChange(event.target.value)}
            className="h-10 rounded-md border border-[color:var(--line)] bg-[var(--panel)] px-3 text-sm text-[var(--ink)] outline-none transition-colors focus:border-[color:var(--line-strong)]"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-[var(--muted)]">
          <span>结束日期</span>
          <input
            type="date"
            value={end}
            onChange={(event) => onEndChange(event.target.value)}
            className="h-10 rounded-md border border-[color:var(--line)] bg-[var(--panel)] px-3 text-sm text-[var(--ink)] outline-none transition-colors focus:border-[color:var(--line-strong)]"
          />
        </label>
        <button
          type="button"
          onClick={onClear}
          disabled={!hasValue}
          className="mt-[22px] inline-flex h-10 items-center justify-center rounded-md border border-[color:var(--line)] px-3 text-sm text-[var(--muted)] transition-colors hover:border-[color:var(--line-strong)] hover:bg-[var(--panel)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          清除
        </button>
      </div>
    </div>
  );
}
