// `pg` is CommonJS, so the named exports are not available to ESM. The default
// export carries the whole module.
import { AsyncLocalStorage } from "node:async_hooks";
import pg from "pg";
import type { Room } from "./types";

const { Pool } = pg;
type Pool = pg.Pool;
type PoolClient = pg.PoolClient;

/**
 * Rooms need two guarantees the naive "just fetch and put" API cannot give:
 *   1. serialised writes per room, so two simultaneous votes cannot clobber
 *      each other's read-modify-write;
 *   2. persistence that survives a process restart, because serverless
 *      functions are ephemeral and horizontally scaled.
 *
 * The store interface keeps the engine pure: the engine never knows whether
 * it is backed by a Map or by Postgres.
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
  private sweeper: ReturnType<typeof setInterval> | null = null;

  /**
   * Rooms are dropped once they have been idle for `ttlMs`. In the
   * long-running server mode this process may stay up for weeks, and a party
   * game leaves a room behind after every evening, so without this the Map
   * would grow forever. Postgres gets the same behaviour from the sweeper in
   * `PostgresStore`.
   */
  constructor(private ttlMs = 6 * 60 * 60 * 1000) {
    this.sweeper = setInterval(() => this.sweep(), 10 * 60 * 1000);
    // Do not hold the event loop open just for housekeeping.
    this.sweeper.unref?.();
  }

  private sweep(): void {
    const cutoff = Date.now() - this.ttlMs;
    for (const [code, room] of this.rooms) {
      if (room.updatedAt < cutoff) this.rooms.delete(code);
    }
  }

  /** Test seam: stop the background sweeper. */
  dispose(): void {
    if (this.sweeper) clearInterval(this.sweeper);
    this.sweeper = null;
  }

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
 * Postgres store, for Neon or any Postgres over a plain connection string.
 *
 * Enabled when `DATABASE_URL` is set. Three things this has to get right:
 *
 *   1. **Cross-instance serialisation.** Vercel runs each request in a
 *      function that may be a separate, concurrent instance, so an in-process
 *      mutex is not enough. We take a Postgres advisory lock keyed on the room
 *      code, which the server enforces globally.
 *
 *   2. **Working behind a connection pooler.** Neon's pooled endpoint (and
 *      pgbouncer generally) runs in *transaction* mode, where consecutive
 *      statements may be served by different backend connections. A
 *      session-level advisory lock would therefore be taken on one connection
 *      and released on another, silently failing to exclude anyone. So the
 *      lock is `pg_advisory_xact_lock`: it is taken and released by the
 *      transaction itself, and a transaction is pinned to one backend, which
 *      makes it correct through a pooler. The read, the engine's mutation, and
 *      the write all happen inside that one transaction.
 *
 *   3. **Not holding a socket per request.** Neon suspends compute when idle,
 *      so the pool is small and lets idle clients go.
 *
 * No SDK: this is the `pg` driver talking to the database directly.
 */
export class PostgresStore implements RoomStore {
  private pool: Pool;
  private schema: Promise<void> | null = null;
  private lastSweep = 0;

  constructor(
    connectionString: string,
    private ttlMs = 6 * 60 * 60 * 1000,
    poolMax = 10,
    private lockWaitMs = 5_000,
  ) {
    this.pool = new Pool({
      connectionString,
      max: poolMax,
      // Neon suspends idle compute; holding idle sockets just makes the first
      // query after a pause race a dead connection.
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      // Neon requires TLS and its certificates chain to a public CA, so the
      // default verification is correct. Set PGSSL_NO_VERIFY=1 only if you hit
      // a certificate-chain error on an unusual runtime.
      ssl: needsSsl(connectionString)
        ? { rejectUnauthorized: process.env.PGSSL_NO_VERIFY !== "1" }
        : undefined,
    });
  }

  /**
   * Create the table on first use. Memoised per instance, but two instances
   * can still race the DDL on a cold start, and `CREATE TABLE IF NOT EXISTS`
   * is not atomic against that race — one of them can lose with a unique
   * violation on the system catalogue. Losing that race is harmless, so it is
   * swallowed rather than allowed to fail the first player's request.
   */
  private ready(): Promise<void> {
    this.schema ??= (async () => {
      try {
        await this.pool.query(
          `CREATE TABLE IF NOT EXISTS rooms (
             code       text PRIMARY KEY,
             data       jsonb NOT NULL,
             updated_at timestamptz NOT NULL DEFAULT now()
           )`,
        );
        await this.pool.query(
          `CREATE INDEX IF NOT EXISTS rooms_updated_at_idx ON rooms (updated_at)`,
        );
      } catch (error) {
        if (!isConcurrentDdlRace(error)) throw error;
      }
    })();
    return this.schema;
  }

  /** Run a query on the transaction's connection when inside a lock. */
  private runner(): Pool | PoolClient {
    return this.inTx.getStore() ?? this.pool;
  }

  /**
   * Drop rooms nobody has touched for `ttlMs`, so a party every weekend does
   * not accumulate rows forever. Rate-limited in-process to at most one sweep
   * an hour, which is plenty for a table holding a handful of live rooms.
   */
  private async sweep(): Promise<void> {
    const now = Date.now();
    if (now - this.lastSweep < 60 * 60 * 1000) return;
    this.lastSweep = now;
    await this.runner().query(`DELETE FROM rooms WHERE updated_at < now() - $1::interval`, [
      `${Math.round(this.ttlMs / 1000)} seconds`,
    ]);
  }

  async get(code: string): Promise<Room | null> {
    await this.ready();
    const { rows } = await this.runner().query<{ data: Room }>(
      `SELECT data FROM rooms WHERE code = $1`,
      [code],
    );
    return rows[0]?.data ?? null;
  }

  async set(code: string, room: Room): Promise<void> {
    await this.ready();
    await this.runner().query(
      `INSERT INTO rooms (code, data, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (code) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [code, JSON.stringify(room)],
    );
    await this.sweep();
  }

  async delete(code: string): Promise<void> {
    await this.ready();
    await this.runner().query(`DELETE FROM rooms WHERE code = $1`, [code]);
  }

  async withLock<T>(code: string, fn: () => Promise<T>): Promise<T> {
    await this.ready();
    // The lock, the read and the write must share one connection, so this
    // takes a dedicated client and publishes it to `runner()` for the duration
    // of the critical section. The checkout is raced against a deadline: a
    // request queued behind a full pool would otherwise wait indefinitely and
    // be killed by the platform rather than failing where we can report it.
    const client = await this.connectWithin(this.lockWaitMs);
    let committed = false;
    let released = false;
    // Every exit path must return the connection exactly once. A rejected vote
    // or a missing room is an ordinary outcome, not an exceptional one, so
    // leaking a connection on the error path would exhaust the pool after a
    // handful of them and wedge the whole app.
    const release = (destroy = false): void => {
      if (released) return;
      released = true;
      client.release(destroy);
    };
    try {
      await client.query("BEGIN");
      // `pg_try_advisory_xact_lock` rather than the blocking variant: a
      // serverless function has a hard time limit, so waiting forever on a
      // contended lock would burn the whole invocation and then be killed.
      // Failing after a bounded wait lets the client retry cheaply.
      const deadline = Date.now() + this.lockWaitMs;
      for (;;) {
        const { rows } = await client.query<{ ok: boolean }>(
          `SELECT pg_try_advisory_xact_lock($1::bigint) AS ok`,
          [lockKey(code)],
        );
        if (rows[0]?.ok) break;
        if (Date.now() >= deadline) {
          throw new Error("Could not acquire room lock.");
        }
        await sleep(20 + Math.floor(Math.random() * 40));
      }
      const result = await this.inTx.run(client, fn);
      await client.query("COMMIT");
      committed = true;
      release();
      return result;
    } catch (error) {
      if (!committed) {
        // A failed ROLLBACK leaves the connection in an unknown state, so it
        // is destroyed instead of being handed to the next caller.
        await client.query("ROLLBACK").then(
          () => release(),
          () => release(true),
        );
      }
      throw error;
    }
  }

  /**
   * Take a connection from the pool, giving up after `ms`.
   *
   * `pg` does not put a deadline on a pool checkout, and the wait can outlive
   * the caller: if we simply raced a timeout and moved on, the abandoned
   * checkout would still resolve later and leak that connection for the life
   * of the process. So a late arrival is released rather than dropped.
   */
  private connectWithin(ms: number): Promise<PoolClient> {
    return new Promise<PoolClient>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("Could not acquire room lock."));
      }, ms);
      timer.unref?.();
      void this.pool
        .connect()
        .then((client) => {
          if (settled) {
            client.release();
            return;
          }
          settled = true;
          clearTimeout(timer);
          resolve(client);
        })
        .catch((error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /** Test seam: close pooled connections so the process can exit cleanly. */
  async dispose(): Promise<void> {
    await this.pool.end();
  }

  /**
   * The connection the current critical section is running on, if any. Lets
   * `get`/`set` join the transaction without the `RoomStore` interface — and
   * therefore the engine and every route — knowing anything about it.
   */
  private inTx = new AsyncLocalStorage<PoolClient>();
}

/**
 * A stable 64-bit lock key for a room code.
 *
 * Computed here rather than with Postgres' `hashtext()` so the key does not
 * depend on a server-internal function. FNV-1a is not cryptographic and does
 * not need to be: a collision between two room codes would only make two
 * unrelated rooms share a lock, costing a little concurrency. It can never let
 * two writers into the *same* room, because the same code always hashes the
 * same way.
 */
function lockKey(code: string): string {
  const FNV_OFFSET = 1469598103934665603n;
  const FNV_PRIME = 1099511628211n;
  const MASK = (1n << 64n) - 1n;
  let hash = FNV_OFFSET;
  for (const char of `room:${code.toUpperCase()}`) {
    hash ^= BigInt(char.codePointAt(0) as number);
    hash = (hash * FNV_PRIME) & MASK;
  }
  return BigInt.asIntN(64, hash).toString();
}

/**
 * `CREATE TABLE IF NOT EXISTS` can lose a race between two cold-starting
 * instances. The loser sees a unique violation on the catalogue, which is the
 * same outcome as winning, so it is safe to ignore.
 */
function isConcurrentDdlRace(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "23505" || code === "42P07";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Neon (and most managed Postgres) requires TLS; local Postgres usually does not. */
function needsSsl(connectionString: string): boolean {
  if (/sslmode=(disable|allow|prefer)/.test(connectionString)) return false;
  if (/sslmode=(require|verify-ca|verify-full)/.test(connectionString)) return true;
  return /neon\.tech|neon\.build|supabase\.(co|com)|render\.com|amazonaws\.com/.test(
    connectionString,
  );
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

  const url = process.env.DATABASE_URL;
  const store = url ? new PostgresStore(url) : new MemoryStore();
  scope[GLOBAL_KEY] = store;
  return store;
}

/** Test seam: swap the store between cases. */
export function setStore(store: RoomStore | null): void {
  const scope = globalThis as GlobalWithStore;
  if (store) scope[GLOBAL_KEY] = store;
  else delete scope[GLOBAL_KEY];
}
