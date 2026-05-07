export function formatInt(value: number | null | undefined) {
  return Intl.NumberFormat("zh-CN").format(value ?? 0);
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN");
}

export function formatDuration(seconds: number | null | undefined) {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}秒`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const restSeconds = seconds % 60;
  if (hours > 0) return `${hours}小时 ${minutes}分钟`;
  if (minutes > 0 && restSeconds > 0) return `${minutes}分钟 ${restSeconds}秒`;
  return `${minutes}分钟`;
}

export function truncateMiddle(value: string, head = 24, tail = 12) {
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}
