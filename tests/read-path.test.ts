import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, seePlayer, tick } from "../lib/engine";
import { withRoomRead } from "../lib/server";
import { MemoryStore, setStore, type RoomStore } from "../lib/store";
import type { Room } from "../lib/types";

/**
 * A store that counts operations, wrapped around the real MemoryStore.
 *
 * The read path's whole purpose is to spend fewer store commands, and that is
 * a claim worth testing rather than asserting in a comment. This counts the
 * real calls the real `withRoomRead` makes.
 */
class CountingStore implements RoomStore {
  gets = 0;
  sets = 0;
  locks = 0;
  constructor(private inner: RoomStore) {}

  async get(code: string): Promise<Room | null> {
    this.gets += 1;
    return this.inner.get(code);
  }

  async set(code: string, room: Room): Promise<void> {
    this.sets += 1;
    await this.inner.set(code, room);
  }

  async delete(code: string): Promise<void> {
    await this.inner.delete(code);
  }

  async withLock<T>(code: string, fn: () => Promise<T>): Promise<T> {
    this.locks += 1;
    return this.inner.withLock(code, fn);
  }
}

/** The read the GET route performs, minus auth and projection. */
function readRoom(room: Room, viewerId: string) {
  return withRoomRead(room.code, (loaded) => {
    const presenceChanged = seePlayer(loaded, viewerId);
    const phaseChanged = tick(loaded);
    return {
      result: loaded.revision,
      changed: presenceChanged || phaseChanged,
    };
  });
}

function seeded() {
  const { room } = createRoom({ hostName: "Ana", deck: ["a", "b", "c"], code: "READ" });
  const bo = joinRoom(room, "Bo");
  const cy = joinRoom(room, "Cy");
  return { room, ids: [room.hostId, bo.playerId, cy.playerId] };
}

describe("read path cost", () => {
  it("does not write when a poll finds nothing new", async () => {
    const counting = new CountingStore(new MemoryStore());
    setStore(counting);
    try {
      const { room, ids } = seeded();
      // Age this player's persisted presence so the first read has something
      // real to record; a freshly created room would need no write at all.
      room.players[ids[0]].lastSeen = Date.now() - 30_000;
      await counting.set(room.code, room);
      counting.gets = 0;
      counting.sets = 0;
      counting.locks = 0;

      await readRoom(room, ids[0]);
      assert.equal(counting.sets, 1, "an aged sighting is persisted");
      assert.equal(counting.locks, 1, "a real change takes the lock");
      // One probe read, then one more inside the lock to redo the work.
      assert.equal(counting.gets, 2);

      counting.gets = 0;
      counting.sets = 0;
      counting.locks = 0;

      // Now poll repeatedly the way a client would, well inside the persist
      // interval. None of these may write, and none may take the lock.
      for (let i = 0; i < 5; i += 1) {
        await readRoom(room, ids[0]);
      }
      assert.equal(counting.sets, 0, "idle polls must not write");
      assert.equal(counting.locks, 0, "idle polls must not take the lock");
      assert.equal(counting.gets, 5, "each idle poll is a single read");
    } finally {
      setStore(null);
    }
  });

  it("does not write at all for a freshly seen player", async () => {
    const counting = new CountingStore(new MemoryStore());
    setStore(counting);
    try {
      const { room, ids } = seeded();
      await counting.set(room.code, room);
      counting.gets = 0;
      counting.sets = 0;
      counting.locks = 0;

      await readRoom(room, ids[0]);
      assert.equal(counting.sets, 0, "a recent timestamp needs no refresh");
      assert.equal(counting.locks, 0);
      assert.equal(counting.gets, 1);
    } finally {
      setStore(null);
    }
  });

  it("writes when a timer actually fires", async () => {
    const counting = new CountingStore(new MemoryStore());
    setStore(counting);
    try {
      const { room, ids } = seeded();
      // Put the room in a voting window that has already expired.
      room.phase = "voting";
      room.eligible = ids;
      room.votes = {};
      room.phaseEndsAt = Date.now() - 1;
      await counting.set(room.code, room);
      counting.sets = 0;
      counting.locks = 0;

      await readRoom(room, ids[0]);
      assert.equal(counting.sets, 1, "an expired timer must be persisted");
      assert.equal(counting.locks, 1);
      const stored = await counting.get(room.code);
      assert.equal(stored?.phase, "reveal", "the timer advanced the room");
    } finally {
      setStore(null);
    }
  });

  it("still advances the room when the fast path finds a change", async () => {
    const counting = new CountingStore(new MemoryStore());
    setStore(counting);
    try {
      const { room, ids } = seeded();
      room.phase = "question";
      room.eligible = ids;
      room.phaseEndsAt = Date.now() - 1;
      room.config.votingSeconds = 30;
      await counting.set(room.code, room);

      await readRoom(room, ids[0]);
      const stored = await counting.get(room.code);
      assert.equal(stored?.phase, "voting", "question window elapsed into voting");
      assert.ok(stored?.phaseEndsAt, "a voting deadline was set");
    } finally {
      setStore(null);
    }
  });

  it("returns the stored room untouched when the fast path skips the write", async () => {
    const counting = new CountingStore(new MemoryStore());
    setStore(counting);
    try {
      const { room, ids } = seeded();
      const before = structuredClone(room);
      await counting.set(room.code, room);
      await readRoom(room, ids[0]);
      await readRoom(room, ids[0]);

      const stored = await counting.get(room.code);
      // The probe runs against a clone, so the caller's own presence refresh
      // must not leak into the stored room when no write is issued.
      assert.equal(stored?.revision, before.revision, "revision is unchanged");
      assert.deepEqual(
        Object.keys(stored!.players).sort(),
        Object.keys(before.players).sort(),
        "no players added or dropped",
      );
    } finally {
      setStore(null);
    }
  });

  it("throws for a missing room without writing", async () => {
    const counting = new CountingStore(new MemoryStore());
    setStore(counting);
    try {
      await assert.rejects(
        () => withRoomRead("NONE", () => ({ result: null, changed: false })),
        /Room not found/,
      );
      assert.equal(counting.sets, 0);
    } finally {
      setStore(null);
    }
  });
});

describe("MemoryStore housekeeping", () => {
  it("drops rooms that have been idle past the ttl", async () => {
    const store = new MemoryStore(1_000);
    try {
      const { room } = createRoom({ hostName: "Ana", deck: ["a"], code: "OLD" });
      room.updatedAt = Date.now() - 5_000;
      await store.set(room.code, room);
      // Reach the private sweeper through the public surface it exists for.
      (store as unknown as { sweep(): void }).sweep();
      assert.equal(await store.get("OLD"), null, "the idle room was dropped");
    } finally {
      store.dispose();
    }
  });

  it("keeps a room that is still active", async () => {
    const store = new MemoryStore(60_000);
    try {
      const { room } = createRoom({ hostName: "Ana", deck: ["a"], code: "LIVE" });
      await store.set(room.code, room);
      (store as unknown as { sweep(): void }).sweep();
      assert.ok(await store.get("LIVE"), "a fresh room survives the sweep");
    } finally {
      store.dispose();
    }
  });
});
