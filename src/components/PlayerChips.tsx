import type { CSSProperties } from "react";
import type { PublicPlayer } from "@domain/types";

/** Alternating tilts so a row of chips looks hand-placed, never machined. */
const TILTS = ["-2.5deg", "1.8deg", "-1.2deg", "2.4deg", "-2deg", "1.4deg"];

/**
 * Presence-aware player chips. The dot is driven by the server's heartbeat,
 * so a phone that drops off the network shows as disconnected without being
 * removed from the game.
 */
export function PlayerChips({
  players,
  onKick,
  canKick,
}: {
  players: PublicPlayer[];
  onKick?: (playerId: string) => void;
  canKick?: boolean;
}) {
  return (
    <ul className="players" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {players.map((player, index) => (
        <li
          key={player.id}
          className={`chip${player.isHost ? " is-host" : ""}`}
          style={{ "--tilt": TILTS[index % TILTS.length] } as CSSProperties}
        >
          <span
            className={`dot${player.connected ? "" : " off"}`}
            aria-hidden="true"
            title={player.connected ? "Connected" : "Offline"}
          />
          <span>{player.name}</span>
          {player.isHost && <span className="badge">host</span>}
          {canKick && !player.isHost && onKick && (
            <button
              className="btn btn-ghost"
              style={{ padding: "2px 8px", fontSize: "0.72rem" }}
              onClick={() => onKick(player.id)}
              aria-label={`Remove ${player.name}`}
            >
              remove
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
