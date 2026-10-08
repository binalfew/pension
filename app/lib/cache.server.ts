// Short-lived in-memory cache for expensive read-only queries, so busy pages
// don't rerun them on every visit. Per server process; entries expire after
// their TTL or when invalidated after the app changes the data.

type Entry = { value: Promise<unknown>; at: string; expires: number };

const entries = new Map<string, Entry>();

export async function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>
): Promise<{ value: T; at: string }> {
  let entry = entries.get(key);
  if (!entry || entry.expires <= Date.now()) {
    const value = load();
    entry = {
      value,
      at: new Date().toISOString(),
      expires: Date.now() + ttlMs,
    };
    entries.set(key, entry);
    // Don't keep a failure around for the whole TTL
    const stored = entry;
    value.catch(() => {
      if (entries.get(key) === stored) {
        entries.delete(key);
      }
    });
  }
  return { value: (await entry.value) as T, at: entry.at };
}

export function invalidate(...keys: string[]) {
  for (const key of keys) {
    entries.delete(key);
  }
}
