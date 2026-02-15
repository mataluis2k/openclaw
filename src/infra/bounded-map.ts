/**
 * Bounded Map with LRU eviction to prevent memory leaks in long-running processes.
 *
 * When the map reaches maxSize, the least-recently-used entry is evicted.
 * Optional TTL support for automatic expiration.
 */
export class BoundedMap<K, V> extends Map<K, V> {
  private readonly maxSize: number;
  private readonly ttlMs?: number;
  private readonly timestamps = new Map<K, number>();

  constructor(maxSize: number, ttlMs?: number) {
    super();
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  set(key: K, value: V): this {
    // Remove expired entries if TTL is enabled
    if (this.ttlMs !== undefined) {
      this.evictExpired();
    }

    // Evict LRU entry if at capacity
    if (this.size >= this.maxSize && !this.has(key)) {
      const firstKey = this.keys().next().value;
      if (firstKey !== undefined) {
        this.delete(firstKey);
      }
    }

    super.set(key, value);
    if (this.ttlMs !== undefined) {
      this.timestamps.set(key, Date.now());
    }
    return this;
  }

  get(key: K): V | undefined {
    if (this.ttlMs !== undefined) {
      const timestamp = this.timestamps.get(key);
      if (timestamp !== undefined && Date.now() - timestamp > this.ttlMs) {
        // Entry expired
        this.delete(key);
        return undefined;
      }
    }
    return super.get(key);
  }

  delete(key: K): boolean {
    this.timestamps.delete(key);
    return super.delete(key);
  }

  clear(): void {
    this.timestamps.clear();
    super.clear();
  }

  private evictExpired(): void {
    if (this.ttlMs === undefined) {
      return;
    }

    const now = Date.now();
    const toDelete: K[] = [];

    for (const [key, timestamp] of this.timestamps.entries()) {
      if (now - timestamp > this.ttlMs) {
        toDelete.push(key);
      }
    }

    for (const key of toDelete) {
      this.delete(key);
    }
  }
}
