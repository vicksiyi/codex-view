export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const text = await response.text();

  if (!response.ok) {
    const message = text.trim() || `HTTP ${response.status}`;
    throw new Error(message);
  }

  if (!text.trim()) {
    throw new Error("接口返回空响应");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("接口返回了非 JSON 内容");
  }
}
