import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { RedisStore } from "../lib/store";
import { createRoom } from "../lib/engine";

/**
 * A tiny in-process stand-in for an Upstash REST endpoint. This is not a mock
 * of RedisStore: it is a real HTTP server, and the real RedisStore client code
 * talks to it over the network. That exercises fetch, response parsing, the
 * lock protocol, and the Lua release path exactly as production will.
 */
class FakeRedis {
  private data = new Map<string, { value: string; expiresAt: number | null }>();

  private alive(key: string): { value: string; expiresAt: number | null } | null {
    const entry = this.data.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.data.delete(key);
      return null;
    }
    return entry;
  }

  run(args: (string | number)[]): unknown {
    const [cmd, ...rest] = args.map(String);
    switch (cmd.toUpperCase()) {
      case "GET": {
        return this.alive(rest[0])?.value ?? null;
      }
      case "SET": {
        const [key, value, ...opts] = rest;
        const nx = opts.some((o) => o.toUpperCase() === "NX");
        if (nx && this.alive(key)) return null;
        let expiresAt: number | null = null;
        for (let i = 0; i < opts.length; i += 1) {
          const flag = opts[i].toUpperCase();
          if (flag === "EX") expiresAt = Date.now() + Number(opts[i + 1]) * 1000;
          if (flag === "PX") expiresAt = Date.now() + Number(opts[i + 1]);
        }
        this.data.set(key, { value, expiresAt });
        return "OK";
      }
      case "DEL": {
        const existed = this.alive(rest[0]) ? 1 : 0;
        this.data.delete(rest[0]);
        return existed;
      }
      case "EVAL": {
        // Layout is: EVAL <script> <numkeys> <key...> <arg...>
        const key = rest[2];
        const expected = rest[3];
        const entry = this.alive(key);
        if (entry && entry.value === expected) {
          this.data.delete(key);
          return 1;
        }
        return 0;
      }
      default:
        throw new Error(`unsupported command: ${cmd}`);
    }
  }
}

describe("RedisStore", () => {
  let server: Server;
  let store: RedisStore;
  let redis: FakeRedis;

  before(async () => {
    redis = new FakeRedis();
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const args = JSON.parse(Buffer.concat(chunks).toString() || "[]");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ result: redis.run(args) }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    store = new RedisStore(`http://127.0.0.1:${port}`, "test-token");
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("round-trips a room through the wire format", async () => {
    const { room } = createRoom({ hostName: "Ana", deck: ["a"] });
    await store.set(room.code, room);
    const loaded = await store.get(room.code);
    assert.ok(loaded);
    assert.equal(loaded.code, room.code);
    assert.equal(loaded.hostId, room.hostId);
  });

  it("returns null for a missing room", async () => {
    assert.equal(await store.get("NOPE"), null);
  });

  it("deletes a room", async () => {
    const { room } = createRoom({ hostName: "Ana", deck: ["a"] });
    await store.set(room.code, room);
    await store.delete(room.code);
    assert.equal(await store.get(room.code), null);
  });

  it("runs a critical section under the lock and releases it", async () => {
    let ran = false;
    await store.withLock("LOCK1", async () => {
      ran = true;
    });
    assert.ok(ran, "critical section should have run");
    // The lock must be gone, or the next caller would spin until the deadline.
    assert.equal(await store.get("LOCK1:lock"), null);
    // And it is immediately reusable, which proves the release worked.
    await store.withLock("LOCK1", async () => undefined);
  });

  it("serialises concurrent critical sections on the same room", async () => {
    let active = 0;
    let maxActive = 0;
    const work = Array.from({ length: 8 }, () =>
      store.withLock("LOCK2", async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 5));
        active -= 1;
      }),
    );
    await Promise.all(work);
    assert.equal(maxActive, 1, "lock must never admit two holders at once");
  });

  it("does not serialise different rooms against each other", async () => {
    let active = 0;
    let maxActive = 0;
    const work = ["A", "B", "C", "D"].map((code) =>
      store.withLock(code, async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 5));
        active -= 1;
      }),
    );
    await Promise.all(work);
    assert.ok(maxActive > 1, "independent rooms should not block each other");
  });

  it("releases the lock even when the critical section throws", async () => {
    await assert.rejects(
      store.withLock("LOCK3", async () => {
        throw new Error("boom");
      }),
      /boom/,
    );
    assert.equal(await store.get("LOCK3:lock"), null);
    // And the lock is reusable afterwards.
    await store.withLock("LOCK3", async () => undefined);
  });
});
