export type DateRangeValue = {
  start?: string | null;
  end?: string | null;
};

function parseDateParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

export function normalizeDateInput(value: string | null | undefined) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return parseDateParts(trimmed) ? trimmed : undefined;
}

export function normalizeDateRange(range: DateRangeValue) {
  const start = normalizeDateInput(range.start);
  const end = normalizeDateInput(range.end);

  if (start && end && start > end) {
    return { start: end, end: start };
  }

  return { start, end };
}

export function hasDateRange(range: DateRangeValue) {
  const normalized = normalizeDateRange(range);
  return Boolean(normalized.start || normalized.end);
}

export function appendDateRangeSearchParams(searchParams: URLSearchParams, range: DateRangeValue) {
  const normalized = normalizeDateRange(range);
  if (normalized.start) searchParams.set("start", normalized.start);
  if (normalized.end) searchParams.set("end", normalized.end);
  return searchParams;
}

export function dayStartToIso(day: string) {
  const parsed = parseDateParts(day);
  if (!parsed) return null;
  return new Date(parsed.year, parsed.month - 1, parsed.day).toISOString();
}

export function nextDayStartToIso(day: string) {
  const parsed = parseDateParts(day);
  if (!parsed) return null;
  return new Date(parsed.year, parsed.month - 1, parsed.day + 1).toISOString();
}
