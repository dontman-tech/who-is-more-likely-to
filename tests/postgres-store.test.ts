import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PostgresStore } from "../lib/store";
import { createRoom } from "../lib/engine";

/**
 * These run against a **real Postgres**, not a fake. A hand-written stand-in
 * would only prove the SQL string matches my own assumptions; a real server
 * proves the JSONB round-trip, the ON CONFLICT upsert, the interval arithmetic
 * in the sweeper, and — most importantly — that `pg_try_advisory_lock` actually
 * excludes a second session.
 *
 * Set TEST_DATABASE_URL to run them; without it they are skipped so the suite
 * stays green on a machine with no database. Locally:
 *
 *   initdb -D /tmp/pgdata -A trust -U postgres
 *   pg_ctl -D /tmp/pgdata -o "-p 5433" start
 *   createdb -h 127.0.0.1 -p 5433 -U postgres mlt_test
 *   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5433/mlt_test npm test
 *
 * CI uses a service container, so this path is exercised there too.
 */
const url = process.env.TEST_DATABASE_URL;

describe("PostgresStore", { skip: url ? false : "TEST_DATABASE_URL not set" }, () => {
  let store: PostgresStore;

  before(async () => {
    store = new PostgresStore(url as string, 6 * 60 * 60 * 1000, 4, 3_000);
    // Fail loudly and early if the connection string is wrong, rather than
    // letting every case report a confusing timeout.
    await store.get("__probe__");
  });

  after(async () => {
    await store.dispose();
  });

  it("round-trips a room through JSONB", async () => {
    const { room } = createRoom({ hostName: "Ana", deck: ["a"] });
    await store.set(room.code, room);
    const loaded = await store.get(room.code);
    assert.ok(loaded, "room should come back");
    assert.equal(loaded.code, room.code);
    assert.equal(loaded.hostId, room.hostId);
    assert.equal(loaded.players.length, room.players.length);
    // Nested structure must survive, not just top-level scalars.
    assert.equal(loaded.players[0]?.name, room.players[0]?.name);
  });

  it("returns null for a missing room", async () => {
    assert.equal(await store.get("ZZZZ"), null);
  });

  it("deletes a room", async () => {
    const { room } = createRoom({ hostName: "Ana", deck: ["a"] });
    await store.set(room.code, room);
    await store.delete(room.code);
    assert.equal(await store.get(room.code), null);
  });

  it("upserts on a repeated write rather than failing on the primary key", async () => {
    const { room } = createRoom({ hostName: "Ana", deck: ["a"] });
    await store.set(room.code, room);
    const changed = { ...room, round: 7 };
    await store.set(room.code, changed);
    const loaded = await store.get(room.code);
    assert.equal(loaded?.round, 7, "second write should overwrite, not collide");
  });

  it("runs a critical section under the lock and releases it", async () => {
    let ran = false;
    await store.withLock("LOCK1", async () => {
      ran = true;
    });
    assert.ok(ran, "critical section should have run");
    // Immediately reusable proves the unlock actually happened; if it had not,
    // this second call would spin until its deadline and throw.
    await store.withLock("LOCK1", async () => undefined);
  });

  it("releases the lock even when the critical section throws", async () => {
    await assert.rejects(
      store.withLock("LOCK2", async () => {
        throw new Error("boom");
      }),
      /boom/,
    );
    await store.withLock("LOCK2", async () => undefined);
  });

  it("serialises concurrent critical sections on the same room", async () => {
    let active = 0;
    let maxActive = 0;
    await Promise.all(
      Array.from({ length: 6 }, () =>
        store.withLock("LOCK3", async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await new Promise((r) => setTimeout(r, 10));
          active -= 1;
        }),
      ),
    );
    assert.equal(maxActive, 1, "advisory lock must never admit two holders");
  });

  /**
   * The interesting case: two *separate* store instances, standing in for two
   * concurrent serverless instances with no shared memory. An in-process mutex
   * would pass the test above and fail this one, which is exactly why the lock
   * is taken in the database.
   */
  it("serialises across two independent store instances", async () => {
    const other = new PostgresStore(url as string, 6 * 60 * 60 * 1000, 4, 3_000);
    try {
      let active = 0;
      let maxActive = 0;
      const critical = () => async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 10));
        active -= 1;
      };
      await Promise.all([
        store.withLock("LOCK4", critical()),
        other.withLock("LOCK4", critical()),
        store.withLock("LOCK4", critical()),
        other.withLock("LOCK4", critical()),
      ]);
      assert.equal(maxActive, 1, "two instances must not hold the lock at once");
    } finally {
      await other.dispose();
    }
  });

  it("does not serialise different rooms against each other", async () => {
    let active = 0;
    let maxActive = 0;
    await Promise.all(
      ["A1", "B1", "C1", "D1"].map((code) =>
        store.withLock(code, async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await new Promise((r) => setTimeout(r, 10));
          active -= 1;
        }),
      ),
    );
    assert.ok(maxActive > 1, "independent rooms should not block each other");
  });

  it("survives a store instance being replaced, as a redeploy would", async () => {
    const { room } = createRoom({ hostName: "Ana", deck: ["a"] });
    await store.set(room.code, room);

    const fresh = new PostgresStore(url as string, 6 * 60 * 60 * 1000, 2, 3_000);
    try {
      const loaded = await fresh.get(room.code);
      assert.equal(loaded?.code, room.code, "data must outlive the process");
    } finally {
      await fresh.dispose();
    }
  });

  /**
   * The read-modify-write inside `withLock` has to happen on the *locked*
   * connection, otherwise the write would not see the row the lock protects
   * and would commit outside the transaction. A later read would then return
   * stale data even though the write reported success.
   */
  it("persists a write made inside the lock, and reads it back", async () => {
    const { room } = createRoom({ hostName: "Ana", deck: ["a"] });
    await store.set(room.code, room);

    await store.withLock(room.code, async () => {
      const loaded = await store.get(room.code);
      assert.ok(loaded, "read inside the lock should see the row");
      await store.set(room.code, { ...loaded, round: 42 });
    });

    const after = await store.get(room.code);
    assert.equal(after?.round, 42, "the locked write must have committed");
  });

  /**
   * A rejected action is an ordinary outcome — a bad vote, a missing room — so
   * the connection must go back to the pool on that path too. With a pool of
   * one, leaking on error would wedge every later request, which is exactly
   * what this asserts against.
   */
  it("returns the connection to the pool after a failed critical section", async () => {
    const tiny = new PostgresStore(url as string, 6 * 60 * 60 * 1000, 1, 500);
    try {
      for (let i = 0; i < 5; i += 1) {
        await assert.rejects(
          tiny.withLock(`LEAK${i}`, async () => {
            throw new Error("rejected action");
          }),
          /rejected action/,
        );
      }
      // If any of those leaked, this would time out instead of succeeding.
      await tiny.withLock("LEAK-OK", async () => undefined);
    } finally {
      await tiny.dispose();
    }
  });

  /**
   * If the lock is held by someone else, the wait must end with an error rather
   * than hanging until the platform kills the function.
   */
  it("gives up rather than waiting forever on a contended lock", async () => {
    const holder = new PostgresStore(url as string, 6 * 60 * 60 * 1000, 1, 400);
    try {
      let release!: () => void;
      const holding = new Promise<void>((resolve) => {
        release = resolve;
      });
      const first = holder.withLock("LOCK9", async () => {
        await holding;
      });
      // Give the first caller time to take the lock before contending.
      await new Promise((r) => setTimeout(r, 150));
      await assert.rejects(
        holder.withLock("LOCK9", async () => undefined),
        /Could not acquire room lock/,
      );
      release();
      await first;
    } finally {
      await holder.dispose();
    }
  });
});
