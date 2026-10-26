import type { Room } from "./types";

/**
 * Rooms need two guarantees the naive "just fetch and put" API cannot give:
 *   1. serialised writes per room, so two simultaneous votes cannot clobber
 *      each other's read-modify-write;
 *   2. persistence that survives a process restart, because serverless
 *      functions are ephemeral and horizontally scaled.
 *
 * The store interface keeps the engine pure: the engine never knows whether
 * it is backed by a Map or Redis.
 */
export interface RoomStore {
  get(code: string): Promise<Room | null>;
  set(code: string, room: Room): Promise<void>;
  delete(code: string): Promise<void>;
  /**
   * Run `fn` while holding the lock for `code`. Implementations must be
   * mutual-exclusion safe across concurrent requests.
   */
  withLock<T>(code: string, fn: () => Promise<T>): Promise<T>;
}

/** Serialises async work per key inside a single process. */
class KeyedMutex {
  private chains = new Map<string, Promise<unknown>>();

  run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(key) ?? Promise.resolve();
    const next = previous.then(fn, fn);
    // Swallow rejections in the chain itself so one failure does not poison
    // every later operation on the same key.
    this.chains.set(
      key,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );
    return next;
  }
}

export class MemoryStore implements RoomStore {
  private rooms = new Map<string, Room>();
  private mutex = new KeyedMutex();

  async get(code: string): Promise<Room | null> {
    return this.rooms.get(code) ?? null;
  }

  async set(code: string, room: Room): Promise<void> {
    this.rooms.set(code, room);
  }

  async delete(code: string): Promise<void> {
    this.rooms.delete(code);
  }

  async withLock<T>(code: string, fn: () => Promise<T>): Promise<T> {
    return this.mutex.run(code, fn);
  }
}

/**
 * Upstash-compatible Redis REST store. Enabled when the two env vars are
 * present, which is the normal production setup on Vercel. Uses a short
 * distributed lock so concurrent lambdas serialise per room.
 */
export class RedisStore implements RoomStore {
  constructor(
    private url: string,
    private token: string,
    private ttlSeconds = 60 * 60 * 6,
  ) {}

  private async command<T = unknown>(args: (string | number)[]): Promise<T> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Redis command failed: ${res.status}`);
    const data = (await res.json()) as { result: T };
    return data.result;
  }

  async get(code: string): Promise<Room | null> {
    const raw = await this.command<string | null>(["GET", key(code)]);
    if (!raw) return null;
    return JSON.parse(raw) as Room;
  }

  async set(code: string, room: Room): Promise<void> {
    await this.command(["SET", key(code), JSON.stringify(room), "EX", this.ttlSeconds]);
  }

  async delete(code: string): Promise<void> {
    await this.command(["DEL", key(code)]);
  }

  async withLock<T>(code: string, fn: () => Promise<T>): Promise<T> {
    const lockKey = `${key(code)}:lock`;
    const lockValue = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const deadline = Date.now() + 5_000;

    while (Date.now() < deadline) {
      const acquired = await this.command<string | null>([
        "SET",
        lockKey,
        lockValue,
        "NX",
        "PX",
        5_000,
      ]);
      if (acquired === "OK") {
        try {
          return await fn();
        } finally {
          // Compare-and-delete must be atomic. A GET-then-DEL pair can race:
          // if this lock expires between the two calls, another process may
          // have taken it and we would delete their lock instead.
          await this.command([
            "EVAL",
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
            1,
            lockKey,
            lockValue,
          ]);
        }
      }
      await sleep(25 + Math.floor(Math.random() * 50));
    }
    throw new Error("Could not acquire room lock.");
  }
}

function key(code: string): string {
  return `room:${code.toUpperCase()}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The store is pinned to globalThis rather than a module-level variable.
 * Bundlers and Next.js dev give each route its own module instance, so a
 * module-scoped singleton would give every endpoint its own private Map and
 * rooms would vanish the moment another route looked them up.
 */
const GLOBAL_KEY = "__mlt_store__";

type GlobalWithStore = typeof globalThis & { [GLOBAL_KEY]?: RoomStore };

export function getStore(): RoomStore {
  const scope = globalThis as GlobalWithStore;
  if (scope[GLOBAL_KEY]) return scope[GLOBAL_KEY];

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const store = url && token ? new RedisStore(url, token) : new MemoryStore();
  scope[GLOBAL_KEY] = store;
  return store;
}

/** Test seam: swap the store between cases. */
export function setStore(store: RoomStore | null): void {
  const scope = globalThis as GlobalWithStore;
  if (store) scope[GLOBAL_KEY] = store;
  else delete scope[GLOBAL_KEY];
}
