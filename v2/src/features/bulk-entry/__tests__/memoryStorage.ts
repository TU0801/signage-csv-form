/**
 * テスト用の localStorage（Node の組み込み localStorage が jsdom のものを隠すことがあるので差し替える）。
 * `vi.stubGlobal('localStorage', createMemoryStorage())` で使う。
 */
export function createMemoryStorage(): Storage {
  let map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => {
      map = new Map();
    },
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    key: (i: number) => [...map.keys()][i] ?? null,
  };
}
