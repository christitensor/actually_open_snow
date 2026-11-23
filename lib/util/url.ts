/** Links built from third-party feed data are restricted to http(s); anything else gets the fallback. */
export function safeHttpUrl(value: unknown, fallback: string): string {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : fallback;
  } catch {
    return fallback;
  }
}
