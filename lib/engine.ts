import { DEFAULT_DECK } from "./deck";
import { newPlayerId, newRoomCode, newToken } from "./ids";
import {
  CUSTOM_PACK_ID,
  DEFAULT_PACK_ID,
  packName,
  resolveDeck,
  resolvePackId,
  sanitizeCustomPrompts,
} from "./packs";
import type {
  Phase,
  Player,
  PublicPlayer,
  PublicRoom,
  Room,
  RoomConfig,
} from "./types";

/**
 * A domain error carries an HTTP-ish status so API routes stay thin.
 */
export class GameError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "GameError";
    this.status = status;
  }
}

export const DEFAULT_CONFIG: RoomConfig = {
  maxPlayers: 12,
  questionSeconds: 0,
  votingSeconds: 30,
  selfVote: false,
  skipsAllowed: true,
};

const MIN_PLAYERS = 3;
const MAX_NAME_LENGTH = 18;

/**
 * Joining mid-round is allowed, but the newcomer is not eligible to vote
 * until the next round. This avoids the "join at the last second to swing
 * a vote" exploit while never blocking someone who wants to get in.
 */
export function createRoom(options: {
  hostName: string;
  config?: Partial<RoomConfig>;
  deck?: string[];
  /** Which question pack to draw prompts from. Ignored when `deck` is given. */
  packId?: string;
  /** Host-supplied prompts. When valid, they replace the pack and the room is
   * labelled as a custom pack. */
  customPrompts?: unknown;
  code?: string;
  now?: number;
}): { room: Room; hostToken: string } {
  const now = options.now ?? Date.now();
  const name = normalizeName(options.hostName);
  const config = { ...DEFAULT_CONFIG, ...options.config };
  validateConfig(config);

  // A custom deck wins over a named pack, but only when it is usable; a
  // rejected list silently falls back to the requested (or default) pack.
  const custom = options.customPrompts
    ? sanitizeCustomPrompts(options.customPrompts)
    : [];
  const useCustom = !options.deck && custom.length > 0;
  // Canonicalise here so an unknown pack id is never stored on the room.
  const packId = useCustom ? CUSTOM_PACK_ID : resolvePackId(options.packId);
  const deck = options.deck
    ? options.deck.slice()
    : useCustom
      ? custom
      : options.packId
        ? resolveDeck(options.packId)
        : DEFAULT_DECK.slice();

  const host: Player = {
    id: newPlayerId(),
    name,
    token: newToken(),
    joinedAt: now,
    connected: true,
    lastSeen: now,
    score: 0,
  };

  const room: Room = {
    code: options.code ?? newRoomCode(),
    hostId: host.id,
    phase: "lobby",
    players: { [host.id]: host },
    order: [host.id],
    config,
    revision: 1,
    round: 0,
    prompt: null,
    votes: {},
    eligible: [],
    tally: {},
    maxVotes: 0,
    winners: [],
    breakdown: [],
    deck,
    packId,
    usedPrompts: [],
    phaseEndsAt: null,
    createdAt: now,
    updatedAt: now,
    writeLog: [],
  };

  return { room, hostToken: host.token };
}

export function joinRoom(
  room: Room,
  name: string,
  now = Date.now(),
): { playerId: string; token: string } {
  const clean = normalizeName(name);
  assertUniqueName(room, clean);

  const activeCount = activePlayers(room).length;
  if (activeCount >= room.config.maxPlayers) {
    throw new GameError("This room is full.", 409);
  }

  const player: Player = {
    id: newPlayerId(),
    name: clean,
    token: newToken(),
    joinedAt: now,
    connected: true,
    lastSeen: now,
    score: 0,
  };

  room.players[player.id] = player;
  room.order.push(player.id);
  bump(room, now);

  return { playerId: player.id, token: player.token };
}

/**
 * Rejoin with a stored token. The player keeps their identity, score, and
 * any vote already cast, so a phone locking or a tunnel dropping the socket
 * does not eject them from the round.
 */
export function rejoinRoom(
  room: Room,
  token: string,
  now = Date.now(),
): { playerId: string } {
  const player = Object.values(room.players).find((p) => p.token === token);
  if (!player) throw new GameError("Session not recognised.", 401);
  player.connected = true;
  player.lastSeen = now;
  bump(room, now);
  return { playerId: player.id };
}

/**
 * Leave. Any vote this player cast is discarded and they are removed from
 * the eligible set for the current round, so a leaver cannot decide the
 * outcome they walked away from. If the host leaves, hosting migrates to
 * the longest-present remaining player.
 */
export function leaveRoom(room: Room, playerId: string, now = Date.now()): void {
  const player = room.players[playerId];
  if (!player) return;

  delete room.players[playerId];
  room.order = room.order.filter((id) => id !== playerId);
  delete room.votes[playerId];
  room.eligible = room.eligible.filter((id) => id !== playerId);

  if (room.hostId === playerId) {
    const successor = room.order[0];
    if (successor) {
      room.hostId = successor;
    } else {
      room.phase = "ended";
    }
  }

  // A room that drops below the minimum cannot run a meaningful vote.
  if (room.phase === "voting" && activePlayers(room).length < MIN_PLAYERS) {
    room.phase = "lobby";
    room.votes = {};
    room.eligible = [];
    room.phaseEndsAt = null;
  }

  bump(room, now);
}

/** Host removes another player. Same vote-invalidation semantics as leave. */
export function kickPlayer(
  room: Room,
  actorId: string,
  targetId: string,
  now = Date.now(),
): void {
  if (room.hostId !== actorId) throw new GameError("Only the host can remove players.", 403);
  if (actorId === targetId) throw new GameError("The host cannot remove themselves.", 400);
  if (!room.players[targetId]) throw new GameError("Player not found.", 404);
  leaveRoom(room, targetId, now);
}

/** Mark a player as disconnected after a heartbeat timeout, without removing them. */
export function markStale(room: Room, timeoutMs = 20_000, now = Date.now()): void {
  let changed = false;
  for (const player of Object.values(room.players)) {
    const stale = now - player.lastSeen > timeoutMs;
    if (player.connected === stale) {
      player.connected = !stale;
      changed = true;
    }
  }
  if (changed) bump(room, now);
}

export function heartbeat(room: Room, playerId: string, now = Date.now()): void {
  const player = room.players[playerId];
  if (!player) throw new GameError("Player not found.", 404);
  player.lastSeen = now;
  if (!player.connected) player.connected = true;
  // Heartbeats are cheap and frequent; they intentionally do not bump
  // `revision`, or every poll would invalidate every other client's cache.
}

export function startRound(room: Room, actorId: string, now = Date.now()): void {
  requireHost(room, actorId);
  if (activePlayers(room).length < MIN_PLAYERS) {
    throw new GameError(`You need at least ${MIN_PLAYERS} players to start.`, 400);
  }

  if (room.usedPrompts.length >= room.deck.length) {
    room.usedPrompts = [];
  }
  const remaining = room.deck
    .map((prompt, index) => ({ prompt, index }))
    .filter(({ index }) => !room.usedPrompts.includes(index));
  const picked = remaining[Math.floor(Math.random() * remaining.length)];

  room.usedPrompts.push(picked.index);
  room.prompt = picked.prompt;
  room.round += 1;
  room.phase = "question";
  room.votes = {};
  room.tally = {};
  room.maxVotes = 0;
  room.winners = [];
  room.breakdown = [];
  room.eligible = [];
  room.phaseEndsAt =
    room.config.questionSeconds > 0 ? now + room.config.questionSeconds * 1000 : null;
  bump(room, now);
}

/**
 * Open voting. The eligible list is frozen here: everyone present at this
 * instant may vote, and late joiners wait for the next round.
 */
export function openVoting(room: Room, actorId: string, now = Date.now()): void {
  requireHost(room, actorId);
  if (room.phase !== "question") throw new GameError("There is no open question.", 409);

  room.eligible = activePlayers(room).map((p) => p.id);
  room.votes = {};
  room.phase = "voting";
  room.phaseEndsAt =
    room.config.votingSeconds > 0 ? now + room.config.votingSeconds * 1000 : null;
  bump(room, now);
}

/**
 * Cast a vote. Re-voting before the reveal is allowed and overwrites the
 * previous choice, which removes the "I fat-fingered it" frustration that
 * plagues one-shot voting party games.
 */
export function castVote(
  room: Room,
  voterId: string,
  targetId: string | null,
  now = Date.now(),
): void {
  if (room.phase !== "voting") throw new GameError("Voting is not open.", 409);
  if (!room.eligible.includes(voterId)) {
    throw new GameError("You are not eligible to vote this round.", 403);
  }
  if (targetId !== null) {
    if (!room.players[targetId]) throw new GameError("That player has left the room.", 404);
    if (targetId === voterId && !room.config.selfVote) {
      throw new GameError("You cannot vote for yourself in this room.", 400);
    }
  } else if (!room.config.skipsAllowed) {
    throw new GameError("Skipping is disabled in this room.", 400);
  }

  room.votes[voterId] = targetId;
  bump(room, now);

  // Optional quality-of-life: close early once everyone has answered.
  if (room.eligible.every((id) => id in room.votes)) {
    reveal(room, now);
  }
}

/**
 * Compute the result. Ties are surfaced rather than broken arbitrarily,
 * because a shared win is a better social outcome than a coin flip.
 */
export function reveal(room: Room, now = Date.now()): void {
  if (room.phase !== "voting") throw new GameError("Voting is not open.", 409);

  const tally: Record<string, number> = {};
  for (const targetId of Object.values(room.votes)) {
    if (targetId === null) continue; // explicit skip
    tally[targetId] = (tally[targetId] ?? 0) + 1;
  }

  let maxVotes = 0;
  for (const count of Object.values(tally)) maxVotes = Math.max(maxVotes, count);

  const winners =
    maxVotes === 0
      ? []
      : Object.keys(tally).filter((id) => tally[id] === maxVotes && room.players[id]);

  for (const id of winners) room.players[id].score += 1;

  room.tally = tally;
  room.maxVotes = maxVotes;
  room.winners = winners;
  room.breakdown = room.eligible.map((voter) => ({
    voter,
    target: room.votes[voter] ?? null,
  }));
  room.phase = "reveal";
  room.phaseEndsAt = null;
  bump(room, now);
}

export function showScoreboard(room: Room, actorId: string, now = Date.now()): void {
  requireHost(room, actorId);
  if (room.phase !== "reveal") throw new GameError("Nothing to score yet.", 409);
  room.phase = "scoreboard";
  bump(room, now);
}

export function endRoom(room: Room, actorId: string, now = Date.now()): void {
  requireHost(room, actorId);
  room.phase = "ended";
  room.phaseEndsAt = null;
  bump(room, now);
}

/**
 * Auto-advance for timed phases. Called on every read so the room keeps
 * moving even when nobody is holding a timer, and it is idempotent.
 */
export function tick(room: Room, now = Date.now()): boolean {
  if (!room.phaseEndsAt || now < room.phaseEndsAt) return false;
  if (room.phase === "question") {
    room.eligible = activePlayers(room).map((p) => p.id);
    room.votes = {};
    room.phase = "voting";
    room.phaseEndsAt =
      room.config.votingSeconds > 0 ? now + room.config.votingSeconds * 1000 : null;
    bump(room, now);
    return true;
  }
  if (room.phase === "voting") {
    reveal(room, now);
    return true;
  }
  return false;
}

/** Build the projection a specific client is allowed to see. */
export function toPublicRoom(room: Room, viewerId: string): PublicRoom {
  const players = room.order
    .map((id) => toPublicPlayer(room, room.players[id]))
    .filter(isPublicPlayer);

  const revealReady = room.phase === "reveal" || room.phase === "scoreboard";
  const tally = revealReady
    ? Object.entries(room.tally)
        .map(([id, votes]) => ({ player: toPublicPlayer(room, room.players[id]), votes }))
        .filter(
          (entry): entry is { player: PublicPlayer; votes: number } =>
            entry.player !== null,
        )
        .sort((a, b) => b.votes - a.votes || a.player.name.localeCompare(b.player.name))
    : null;

  const winners = revealReady
    ? room.winners
        .map((id) => toPublicPlayer(room, room.players[id]))
        .filter(isPublicPlayer)
    : [];

  return {
    code: room.code,
    phase: room.phase,
    revision: room.revision,
    round: room.round,
    prompt: room.prompt,
    players,
    config: room.config,
    packId: room.packId ?? DEFAULT_PACK_ID,
    packName: packName(room.packId),
    hostId: room.hostId,
    votesSubmitted: room.eligible.filter((id) => id in room.votes).length,
    eligibleCount: room.eligible.length,
    results:
      revealReady && tally
        ? {
            tally,
            maxVotes: room.maxVotes,
            winners,
            breakdown: room.breakdown,
            isTie: winners.length > 1,
          }
        : null,
    phaseEndsAt: room.phaseEndsAt,
    you: {
      id: viewerId,
      name: room.players[viewerId]?.name ?? "",
      hasVoted: viewerId in room.votes,
      votedFor: room.votes[viewerId] ?? null,
    },
  };
}

function isPublicPlayer(player: PublicPlayer | null): player is PublicPlayer {
  return player !== null;
}

export function toPublicPlayer(
  room: Room,
  player: Player | undefined,
): PublicPlayer | null {
  if (!player) return null;
  return {
    id: player.id,
    name: player.name,
    connected: player.connected,
    score: player.score,
    isHost: player.id === room.hostId,
  };
}

export function findPlayerByToken(room: Room, token: string | null | undefined): Player | null {
  if (!token) return null;
  return Object.values(room.players).find((p) => p.token === token) ?? null;
}

function activePlayers(room: Room): Player[] {
  return room.order.map((id) => room.players[id]).filter(Boolean);
}

function requireHost(room: Room, actorId: string): void {
  if (room.hostId !== actorId) throw new GameError("Only the host can do that.", 403);
}

function bump(room: Room, now: number): void {
  room.revision += 1;
  room.updatedAt = now;
  room.writeLog.push(now);
  if (room.writeLog.length > 200) room.writeLog.splice(0, room.writeLog.length - 200);
}

function normalizeName(raw: string): string {
  const name = (raw ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 1) throw new GameError("Please enter a name.", 400);
  if (name.length > MAX_NAME_LENGTH) {
    throw new GameError(`Names are limited to ${MAX_NAME_LENGTH} characters.`, 400);
  }
  if (!/^[\p{L}\p{N} .'\-]+$/u.test(name)) {
    throw new GameError("Names can use letters, numbers, spaces, and . ' -", 400);
  }
  return name;
}

function assertUniqueName(room: Room, name: string): void {
  const taken = Object.values(room.players).some(
    (p) => p.name.toLowerCase() === name.toLowerCase(),
  );
  if (taken) throw new GameError("That name is already taken in this room.", 409);
}

function validateConfig(config: RoomConfig): void {
  if (config.maxPlayers < MIN_PLAYERS || config.maxPlayers > 20) {
    throw new GameError(`maxPlayers must be between ${MIN_PLAYERS} and 20.`, 400);
  }
  if (config.votingSeconds < 0 || config.votingSeconds > 300) {
    throw new GameError("votingSeconds must be between 0 and 300.", 400);
  }
  if (config.questionSeconds < 0 || config.questionSeconds > 300) {
    throw new GameError("questionSeconds must be between 0 and 300.", 400);
  }
}

export const PHASES: Phase[] = ["lobby", "question", "voting", "reveal", "scoreboard", "ended"];
export { MIN_PLAYERS };
