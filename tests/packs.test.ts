import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startRound, toPublicRoom } from "../lib/engine";
import {
  CUSTOM_PACK_ID,
  DEFAULT_PACK_ID,
  getPack,
  listPacks,
  PACKS,
  resolveDeck,
  sanitizeCustomPrompts,
} from "../lib/packs";

/** Fill a room to the minimum player count so a round can legally start. */
function seedPlayers(room: ReturnType<typeof createRoom>["room"]): void {
  for (const name of ["Bo", "Cy"]) joinRoom(room, name);
}

describe("question packs", () => {
  it("exposes a non-empty catalogue with unique ids", () => {
    assert.ok(PACKS.length >= 2, "expected several packs to choose from");
    const ids = PACKS.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length, "pack ids must be unique");
    for (const pack of PACKS) {
      assert.ok(pack.prompts.length > 0, `${pack.id} must have prompts`);
      assert.ok(pack.name.length > 0);
      assert.ok(pack.description.length > 0);
    }
  });

  it("has no duplicate prompts within a pack", () => {
    for (const pack of PACKS) {
      assert.equal(
        new Set(pack.prompts).size,
        pack.prompts.length,
        `${pack.id} contains a duplicate prompt`,
      );
    }
  });

  it("falls back to the default deck for an unknown pack id", () => {
    const fallback = resolveDeck("does-not-exist");
    assert.deepEqual(fallback, resolveDeck(DEFAULT_PACK_ID));
    assert.ok(fallback.length > 0);
  });

  it("resolves each known pack to its own prompts", () => {
    for (const pack of PACKS) {
      assert.deepEqual(resolveDeck(pack.id), pack.prompts);
    }
  });

  it("returns copies so callers cannot mutate the catalogue", () => {
    const first = resolveDeck(DEFAULT_PACK_ID);
    first.push("injected prompt");
    assert.notEqual(resolveDeck(DEFAULT_PACK_ID).length, first.length);

    const listed = listPacks();
    listed[0].prompts.push("injected prompt");
    assert.notEqual(listPacks()[0].prompts.length, listed[0].prompts.length);
  });

  it("starts a room on the requested pack", () => {
    const chaos = getPack("chaos");
    assert.ok(chaos);
    const { room } = createRoom({ hostName: "Ana", packId: "chaos" });
    assert.equal(room.packId, "chaos");
    assert.deepEqual(room.deck, chaos.prompts);
  });

  it("defaults to the party pack when none is requested", () => {
    const { room } = createRoom({ hostName: "Ana" });
    assert.equal(room.packId, DEFAULT_PACK_ID);
  });

  it("draws only from the selected pack during a round", () => {
    const office = getPack("office");
    assert.ok(office);
    const { room } = createRoom({ hostName: "Ana", packId: "office" });
    seedPlayers(room);

    startRound(room, room.hostId);
    assert.ok(room.prompt);
    assert.ok(
      office.prompts.includes(room.prompt),
      "prompt must come from the selected pack",
    );
  });

  it("reports the pack name to clients so the lobby can label it", () => {
    const { room } = createRoom({ hostName: "Ana", packId: "spicy" });
    const view = toPublicRoom(room, room.hostId);
    assert.equal(view.packId, "spicy");
    assert.equal(view.packName, getPack("spicy")?.name);
  });

  it("canonicalises an unknown pack id so it never disagrees with the deck", () => {
    const { room } = createRoom({ hostName: "Ana", packId: "not-a-pack" });
    assert.equal(room.packId, DEFAULT_PACK_ID);
    assert.deepEqual(room.deck, resolveDeck(DEFAULT_PACK_ID));
    assert.equal(toPublicRoom(room, room.hostId).packName, getPack(DEFAULT_PACK_ID)?.name);
  });

  it("accepts a valid custom deck and labels the room as custom", () => {
    const prompts = [
      "eat the last slice without asking",
      "become a viral meme",
      "forget where they parked",
    ];
    const { room } = createRoom({ hostName: "Ana", packId: "party", customPrompts: prompts });
    assert.equal(room.packId, CUSTOM_PACK_ID);
    assert.deepEqual(room.deck, prompts);

    seedPlayers(room);
    startRound(room, room.hostId);
    assert.ok(prompts.includes(room.prompt ?? ""), "prompt must come from the custom deck");
    assert.equal(toPublicRoom(room, room.hostId).packName, "Custom pack");
  });

  it("falls back to the chosen pack when a custom deck is too small", () => {
    const { room } = createRoom({
      hostName: "Ana",
      packId: "office",
      customPrompts: ["too few", "really too few"],
    });
    assert.equal(room.packId, "office");
    assert.deepEqual(room.deck, resolveDeck("office"));
  });

  it("sanitises host-supplied prompts", () => {
    assert.deepEqual(sanitizeCustomPrompts("not an array"), []);
    assert.deepEqual(sanitizeCustomPrompts([1, null, {}, "  "]), []);
    const cleaned = sanitizeCustomPrompts([
      "  spaced   out  ",
      "SPACED OUT",
      "keep me",
      "and me too",
      "x".repeat(500),
      "no",
    ]);
    assert.equal(cleaned[0], "spaced out", "whitespace is collapsed and trimmed");
    assert.equal(
      cleaned.filter((p) => p.toLowerCase() === "spaced out").length,
      1,
      "duplicates are dropped case-insensitively",
    );
    assert.ok(cleaned.some((p) => p === "keep me"));
    assert.ok(cleaned.every((p) => p.length <= 120), "prompts are length-capped");
    assert.ok(cleaned.every((p) => p.length >= 3), "too-short prompts are dropped");
  });

  it("never leaks the full deck to a client", () => {
    const { room } = createRoom({ hostName: "Ana", packId: "chaos" });
    const view = toPublicRoom(room, room.hostId) as unknown as Record<string, unknown>;
    assert.equal(view.deck, undefined, "deck must stay server-side");
    assert.equal(view.usedPrompts, undefined);
  });
});
