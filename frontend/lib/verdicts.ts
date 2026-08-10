/**
 * Local cache of the player's own decrypted verdicts.
 *
 * The chain never stores whether a Dig won — the win bit lives only inside
 * the encrypted handle, and `claimed` flips to true for wins and marked
 * misses alike. Without this cache a won Dig from a previous session would
 * read "Settled" in history and the player's wins become invisible.
 *
 * A verdict is private to the player by design, so the browser is exactly
 * the right place to remember it.
 */
const KEY = "gemhaven:verdicts";

type Cache = Record<string, boolean>;

function readCache(): Cache {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Cache) : {};
  } catch {
    return {};
  }
}

/** The cached verdict for a Dig, or `undefined` if this browser never decrypted it. */
export function readVerdict(betId: bigint): boolean | undefined {
  return readCache()[betId.toString()];
}

/** How many Digs this browser has decrypted as wins (the player's local win tally). */
export function countCachedWins(): number {
  return Object.values(readCache()).filter(Boolean).length;
}

export function storeVerdict(betId: bigint, won: boolean): void {
  try {
    const cache = readCache();
    cache[betId.toString()] = won;
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // A convenience cache only — never let storage issues break a Dig.
  }
}
