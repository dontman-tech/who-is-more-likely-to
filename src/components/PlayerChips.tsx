import type { PublicPlayer } from "@domain/types";

/**
 * Presence-aware player chips. The dot is driven by the server's heartbeat,
 * so a phone that drops off the network shows as disconnected without being
 * removed from the game.
 */
export function PlayerChips({
  players,
  highlightId,
  onKick,
  canKick,
}: {
  players: PublicPlayer[];
  highlightId?: string | null;
  onKick?: (playerId: string) => void;
  canKick?: boolean;
}) {
  return (
    <ul className="players" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {players.map((player) => (
        <li
          key={player.id}
          className="chip"
          style={
            player.id === highlightId
              ? { borderColor: "rgba(124,92,255,0.9)", background: "rgba(124,92,255,0.22)" }
              : undefined
          }
        >
          <span className={`dot${player.connected ? "" : " off"}`} aria-hidden="true" />
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
