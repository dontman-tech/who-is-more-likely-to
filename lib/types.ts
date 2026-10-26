/**
 * Core domain types for "Most Likely To".
 *
 * Design principle: the server owns the truth. Clients send intents
 * (join / vote / leave) and render whatever snapshot the server returns.
 * Nothing about scoring, eligibility, or tie-breaking is decided on a phone.
 */

export type Phase =
  | "lobby" // collecting players
  | "question" // prompt is on screen, discussion window
  | "voting" // secret simultaneous voting
  | "reveal" // results for the current round
  | "scoreboard" // standings between rounds
  | "ended"; // host closed the room

export interface Player {
  id: string;
  name: string;
  /** Private session secret. Never included in any broadcast payload. */
  token: string;
  joinedAt: number;
  connected: boolean;
  lastSeen: number;
  score: number;
}

export interface RoomConfig {
  maxPlayers: number;
  /** Discussion window before voting opens. 0 = host advances manually. */
  questionSeconds: number;
  /** Voting window. 0 = host advances manually. */
  votingSeconds: number;
  /** Allow voting for yourself. Off by default. */
  selfVote: boolean;
  /** Allow abstaining ("skip"). On by default. */
  skipsAllowed: boolean;
}

export interface Room {
  code: string;
  hostId: string;
  phase: Phase;
  players: Record<string, Player>;
  /** Join order, used for deterministic iteration and host migration. */
  order: string[];
  config: RoomConfig;
  /** Bumped on every mutation so clients can long-poll cheaply. */
  revision: number;
  round: number;
  prompt: string | null;
  /** Voter id -> target id, or null for an explicit skip. */
  votes: Record<string, string | null>;
  /** Player ids allowed to vote this round, frozen when voting opens. */
  eligible: string[];
  /** Computed at reveal time. */
  tally: Record<string, number>;
  maxVotes: number;
  winners: string[];
  /** Populated at reveal so the UI can show who voted for whom. */
  breakdown: Array<{ voter: string; target: string | null }>;
  deck: string[];
  /** Which question pack this room draws from. Shown in the lobby. */
  packId: string;
  usedPrompts: number[];
  /** Epoch ms when the current timed phase auto-advances, else null. */
  phaseEndsAt: number | null;
  createdAt: number;
  updatedAt: number;
  /** Timestamps of recent writes, for lightweight abuse control. */
  writeLog: number[];
}

export interface PublicPlayer {
  id: string;
  name: string;
  connected: boolean;
  score: number;
  isHost: boolean;
}

/**
 * The only shape a client ever receives. Deliberately excludes tokens and,
 * while voting is open, excludes the running tally so players cannot snipe.
 */
export interface PublicRoom {
  code: string;
  phase: Phase;
  revision: number;
  round: number;
  prompt: string | null;
  players: PublicPlayer[];
  config: RoomConfig;
  /** Active question pack id and display name, for the lobby label. */
  packId: string;
  packName: string;
  hostId: string;
  /** Number of eligible voters who have submitted (no per-player detail). */
  votesSubmitted: number;
  eligibleCount: number;
  /** Only present from `reveal` onward. */
  results: null | {
    tally: Array<{ player: PublicPlayer; votes: number }>;
    maxVotes: number;
    winners: PublicPlayer[];
    breakdown: Array<{ voter: string; target: string | null }>;
    /** True when two or more players tied for the top. */
    isTie: boolean;
  };
  /** Epoch ms when the current timed phase auto-advances, else null. */
  phaseEndsAt: number | null;
  /** Present only for the requesting player. */
  you: { id: string; name: string; hasVoted: boolean; votedFor: string | null };
}
