import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  castVote,
  createRoom,
  endRoom,
  GameError,
  heartbeat,
  joinRoom,
  kickPlayer,
  leaveRoom,
  markStale,
  openVoting,
  rejoinRoom,
  reveal,
  showScoreboard,
  startRound,
  tick,
  toPublicRoom,
} from "../lib/engine";

const DECK = ["a", "b", "c", "d"];

/** Build a room with `n` players and return their ids/tokens in join order. */
function setup(n: number, config = {}) {
  const { room, hostToken } = createRoom({ hostName: "P0", deck: DECK, config });
  const others: Array<{ playerId: string; token: string }> = [];
  for (let i = 1; i < n; i += 1) {
    others.push(joinRoom(room, `P${i}`));
  }
  const ids = [room.hostId, ...others.map((o) => o.playerId)];
  return { room, hostId: room.hostId, hostToken, ids, others };
}

/** Advance straight into the voting phase with everyone eligible. */
function toVoting(n: number, config = {}) {
  const ctx = setup(n, config);
  startRound(ctx.room, ctx.hostId);
  openVoting(ctx.room, ctx.hostId);
  return ctx;
}

describe("lobby", () => {
  it("rejects duplicate names case-insensitively", () => {
    const { room } = setup(2);
    assert.throws(() => joinRoom(room, "  p1  "), GameError);
  });

  it("enforces the player cap", () => {
    const { room, ids } = setup(3, { maxPlayers: 3 });
    assert.equal(ids.length, 3);
    assert.throws(() => joinRoom(room, "Late"), /full/i);
  });

  it("rejects names with control characters", () => {
    const { room } = setup(1);
    assert.throws(() => joinRoom(room, "bad\u0000name"), GameError);
  });

  it("refuses to start below the minimum player count", () => {
    const { room, hostId } = setup(2);
    assert.throws(() => startRound(room, hostId), /at least 3/);
  });
});

describe("voting rules", () => {
  it("blocks self-votes by default and allows them when configured", () => {
    const ctx = toVoting(3);
    assert.throws(() => castVote(ctx.room, ctx.ids[0], ctx.ids[0]), /yourself/);

    const open = toVoting(3, { selfVote: true });
    castVote(open.room, open.ids[0], open.ids[0]);
    assert.equal(open.room.votes[open.ids[0]], open.ids[0]);
  });

  it("lets a voter change their mind before the reveal", () => {
    const ctx = toVoting(3);
    castVote(ctx.room, ctx.ids[0], ctx.ids[1]);
    castVote(ctx.room, ctx.ids[0], ctx.ids[2]);
    assert.equal(ctx.room.votes[ctx.ids[0]], ctx.ids[2]);
  });

  it("accepts an explicit skip and counts it as no vote", () => {
    const ctx = toVoting(3);
    castVote(ctx.room, ctx.ids[0], null);
    assert.equal(ctx.room.votes[ctx.ids[0]], null);
  });

  it("rejects skips when the room disables them", () => {
    const ctx = toVoting(3, { skipsAllowed: false });
    assert.throws(() => castVote(ctx.room, ctx.ids[0], null), /Skipping is disabled/);
  });

  it("rejects votes from ineligible players", () => {
    const ctx = toVoting(3);
    const outsider = joinRoom(ctx.room, "Late");
    assert.throws(() => castVote(ctx.room, outsider.playerId, ctx.ids[0]), /not eligible/);
  });

  it("rejects a vote for a player who has left", () => {
    // Four players so the room stays above the minimum after one leaves.
    const ctx = toVoting(4);
    const target = ctx.ids[3];
    leaveRoom(ctx.room, target);
    assert.throws(() => castVote(ctx.room, ctx.ids[0], target), /left the room/);
  });

  it("auto-reveals once every eligible player has voted", () => {
    const ctx = toVoting(3);
    castVote(ctx.room, ctx.ids[0], ctx.ids[1]);
    castVote(ctx.room, ctx.ids[1], ctx.ids[0]);
    assert.equal(ctx.room.phase, "voting");
    castVote(ctx.room, ctx.ids[2], ctx.ids[0]);
    assert.equal(ctx.room.phase, "reveal");
  });
});

describe("reveal and scoring", () => {
  it("awards the point to the outright winner", () => {
    const ctx = toVoting(4);
    // Every eligible player votes, so the round auto-reveals.
    castVote(ctx.room, ctx.ids[0], ctx.ids[1]);
    castVote(ctx.room, ctx.ids[1], ctx.ids[0]);
    castVote(ctx.room, ctx.ids[2], ctx.ids[1]);
    castVote(ctx.room, ctx.ids[3], ctx.ids[1]);
    assert.equal(ctx.room.phase, "reveal");
    assert.equal(ctx.room.winners.length, 1);
    assert.equal(ctx.room.winners[0], ctx.ids[1]);
    assert.equal(ctx.room.players[ctx.ids[1]].score, 1);
  });

  it("surfaces a tie instead of breaking it arbitrarily", () => {
    const ctx = toVoting(4);
    castVote(ctx.room, ctx.ids[0], ctx.ids[1]);
    castVote(ctx.room, ctx.ids[1], ctx.ids[0]);
    castVote(ctx.room, ctx.ids[2], ctx.ids[1]);
    castVote(ctx.room, ctx.ids[3], ctx.ids[0]);
    assert.equal(ctx.room.winners.length, 2);
    const publicRoom = toPublicRoom(ctx.room, ctx.ids[0]);
    assert.equal(publicRoom.results?.isTie, true);
  });

  it("handles an all-skip round without inventing a winner", () => {
    const ctx = toVoting(3);
    for (const id of ctx.ids) castVote(ctx.room, id, null);
    assert.equal(ctx.room.phase, "reveal");
    assert.equal(ctx.room.winners.length, 0);
    assert.equal(ctx.room.maxVotes, 0);
  });

  it("never leaks tokens or the running tally to clients", () => {
    const ctx = toVoting(3);
    castVote(ctx.room, ctx.ids[0], ctx.ids[1]);
    const view = toPublicRoom(ctx.room, ctx.ids[0]);
    assert.equal(view.results, null);
    assert.equal(view.you.hasVoted, true);
    const serialized = JSON.stringify(view);
    assert.ok(!serialized.includes(ctx.room.players[ctx.ids[1]].token));
  });
});

describe("leaving mid-round", () => {
  it("discards the leaver's vote and eligibility", () => {
    const ctx = toVoting(4);
    castVote(ctx.room, ctx.ids[0], ctx.ids[1]);
    castVote(ctx.room, ctx.ids[2], ctx.ids[1]);
    castVote(ctx.room, ctx.ids[3], ctx.ids[1]);
    // P0 was about to decide the round; removing them must not leave a vote.
    leaveRoom(ctx.room, ctx.ids[0]);
    assert.equal(ctx.room.votes[ctx.ids[0]], undefined);
    assert.ok(!ctx.room.eligible.includes(ctx.ids[0]));
    assert.ok(!ctx.room.players[ctx.ids[0]]);
  });

  it("falls back to the lobby when too few players remain", () => {
    const ctx = toVoting(3);
    leaveRoom(ctx.room, ctx.ids[0]);
    assert.equal(ctx.room.phase, "lobby");
    assert.equal(ctx.room.eligible.length, 0);
  });

  it("migrates hosting to the longest-present player", () => {
    const ctx = setup(4);
    const successor = ctx.ids[1];
    leaveRoom(ctx.room, ctx.hostId);
    assert.equal(ctx.room.hostId, successor);
    // The new host can now act; the old host could not.
    assert.doesNotThrow(() => startRound(ctx.room, successor));
  });

  it("ends the room when the last player leaves", () => {
    const { room, hostId } = setup(1);
    leaveRoom(room, hostId);
    assert.equal(room.phase, "ended");
  });
});

describe("host controls", () => {
  it("lets only the host kick, and never themselves", () => {
    const ctx = setup(4);
    assert.throws(() => kickPlayer(ctx.room, ctx.ids[1], ctx.ids[2]), /Only the host/);
    assert.throws(() => kickPlayer(ctx.room, ctx.hostId, ctx.hostId), /themselves/);
    kickPlayer(ctx.room, ctx.hostId, ctx.ids[3]);
    assert.ok(!ctx.room.players[ctx.ids[3]]);
  });

  it("removes a kicked player's vote from the round", () => {
    const ctx = toVoting(4);
    castVote(ctx.room, ctx.ids[3], ctx.ids[1]);
    kickPlayer(ctx.room, ctx.hostId, ctx.ids[3]);
    assert.equal(ctx.room.votes[ctx.ids[3]], undefined);
  });
});

describe("timers", () => {
  it("auto-opens voting when the question window expires", () => {
    const ctx = setup(3, { questionSeconds: 10, votingSeconds: 30 });
    const t0 = 1_000_000;
    startRound(ctx.room, ctx.hostId, t0);
    assert.equal(ctx.room.phase, "question");
    assert.equal(tick(ctx.room, t0 + 9_000), false);
    assert.equal(tick(ctx.room, t0 + 10_001), true);
    assert.equal(ctx.room.phase, "voting");
    assert.equal(ctx.room.eligible.length, 3);
  });

  it("auto-reveals when the voting window expires", () => {
    const ctx = setup(3, { votingSeconds: 5 });
    const t0 = 2_000_000;
    startRound(ctx.room, ctx.hostId, t0);
    openVoting(ctx.room, ctx.hostId, t0);
    castVote(ctx.room, ctx.ids[0], ctx.ids[1], t0);
    assert.equal(tick(ctx.room, t0 + 4_000), false);
    assert.equal(tick(ctx.room, t0 + 5_001), true);
    assert.equal(ctx.room.phase, "reveal");
  });
});

describe("prompt rotation", () => {
  it("does not repeat a prompt until the deck is exhausted", () => {
    const ctx = setup(3);
    const seen: string[] = [];
    for (let i = 0; i < DECK.length; i += 1) {
      startRound(ctx.room, ctx.hostId);
      seen.push(ctx.room.prompt as string);
    }
    assert.equal(new Set(seen).size, DECK.length);
    startRound(ctx.room, ctx.hostId);
    assert.ok(DECK.includes(ctx.room.prompt as string));
  });
});

describe("revision counter", () => {
  it("increases on real mutations but not on heartbeats", () => {
    const ctx = setup(3);
    const before = ctx.room.revision;
    heartbeat(ctx.room, ctx.hostId);
    assert.equal(ctx.room.revision, before);
    startRound(ctx.room, ctx.hostId);
    assert.ok(ctx.room.revision > before);
  });
});

describe("reveal guards", () => {
  it("refuses to reveal outside the voting phase", () => {
    const { room, hostId } = setup(3);
    startRound(room, hostId);
    assert.throws(() => reveal(room), /not open/);
  });
});

describe("rejoin", () => {
  it("restores identity, score, and a cast vote from a token", () => {
    const ctx = toVoting(4);
    castVote(ctx.room, ctx.ids[0], ctx.ids[1]);
    // Simulate the phone locking: mark the player gone, then rejoin.
    ctx.room.players[ctx.ids[0]].connected = false;
    const { playerId } = rejoinRoom(ctx.room, ctx.hostToken);
    assert.equal(playerId, ctx.ids[0]);
    assert.equal(ctx.room.players[playerId].connected, true);
    assert.equal(ctx.room.votes[playerId], ctx.ids[1]);
  });

  it("rejects an unknown token", () => {
    const { room } = setup(3);
    assert.throws(() => rejoinRoom(room, "not-a-real-token"), /not recognised/);
  });
});

describe("scoreboard and end", () => {
  it("moves from reveal to scoreboard, host only", () => {
    const ctx = toVoting(3);
    for (const id of ctx.ids) castVote(ctx.room, id, null);
    assert.equal(ctx.room.phase, "reveal");
    assert.throws(() => showScoreboard(ctx.room, ctx.ids[1]), /Only the host/);
    showScoreboard(ctx.room, ctx.hostId);
    assert.equal(ctx.room.phase, "scoreboard");
  });

  it("refuses a scoreboard when nothing has been revealed", () => {
    const { room, hostId } = setup(3);
    assert.throws(() => showScoreboard(room, hostId), /Nothing to score/);
  });

  it("lets only the host end the room", () => {
    const ctx = setup(3);
    assert.throws(() => endRoom(ctx.room, ctx.ids[1]), /Only the host/);
    endRoom(ctx.room, ctx.hostId);
    assert.equal(ctx.room.phase, "ended");
  });
});

describe("presence", () => {
  it("marks silent players disconnected and revives them on heartbeat", () => {
    const ctx = setup(3);
    // Timestamps must be relative to the real clock the room was created with.
    const now = Date.now();
    markStale(ctx.room, 20_000, now + 30_000);
    assert.equal(ctx.room.players[ctx.ids[0]].connected, false);
    heartbeat(ctx.room, ctx.ids[0], now + 31_000);
    assert.equal(ctx.room.players[ctx.ids[0]].connected, true);
  });

  it("keeps a disconnected player in the room and eligible", () => {
    const ctx = toVoting(4);
    markStale(ctx.room, 20_000, Date.now() + 60_000);
    assert.equal(ctx.room.players[ctx.ids[0]].connected, false);
    assert.ok(ctx.room.eligible.includes(ctx.ids[0]));
    assert.doesNotThrow(() => castVote(ctx.room, ctx.ids[0], ctx.ids[1]));
  });
});
