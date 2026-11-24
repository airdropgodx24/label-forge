/** The slice of the Web Storage API the session needs. `localStorage` satisfies it. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** In-memory store for tests and dummy runs. */
export function memoryStore(initial: Record<string, string> = {}): KeyValueStore & {
  data: Map<string, string>;
} {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

/** The browser's localStorage. Throws if it is not available, so a session never silently loses its state. */
export function browserStore(): KeyValueStore {
  if (typeof localStorage === "undefined") {
    throw new Error("localStorage is not available in this environment");
  }
  return localStorage;
}
