import { useEffect, useMemo, useState } from "react";
import { PlayerChips } from "@/components/PlayerChips";
import { Splash } from "@/components/Splash";
import { clearSession, loadSession, type Session } from "@/lib/client";
import { useRoom } from "@/hooks/useRoom";

/**
 * The game screen. Every phase is rendered from the server's snapshot, so
 * this component never decides who won, who may vote, or whose turn it is.
 */
export function Room({
  code,
  navigate,
}: {
  code: string;
  navigate: (to: string) => void;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [showSplash, setShowSplash] = useState(false);

  useEffect(() => {
    const stored = loadSession();
    setSession(stored);
    setReady(true);
    // A device with no session for this room cannot be trusted to be a player,
    // so send it home rather than showing a half-broken screen.
    if (!stored || stored.code !== code) navigate("/");
  }, [code, navigate]);

  const token = session?.token ?? null;
  const { room, error, connected, act, setError } = useRoom(code, token);

  const you = room?.you;
  const isHost = Boolean(room && you && room.hostId === you.id);
  const isWinner = useMemo(
    () => Boolean(room?.results?.winners.some((w) => w.id === you?.id)),
    [room?.results, you?.id],
  );

  // Fire the splash once per round, only for the winner.
  useEffect(() => {
    if (room?.phase === "reveal" && isWinner) setShowSplash(true);
    if (room?.phase !== "reveal") setShowSplash(false);
  }, [room?.phase, room?.round, isWinner]);

  async function handleLeave() {
    await act({ type: "leave" });
    clearSession();
    navigate("/");
  }

  if (!ready) {
    return (
      <main className="shell">
        <p className="lead">Loading&hellip;</p>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="shell">
        <section className="glass card stack">
          <h1>Connecting&hellip;</h1>
          <p className="lead">
            {connected ? "Fetching the room." : "No connection yet. Retrying automatically."}
          </p>
          {error && <p className="lead">{error}</p>}
        </section>
      </main>
    );
  }

  const voteProgress =
    room.eligibleCount > 0
      ? Math.round((room.votesSubmitted / room.eligibleCount) * 100)
      : 0;

  return (
    <>
      {showSplash && <Splash onDone={() => setShowSplash(false)} />}

      <main className="shell">
        <header className="spread">
          <div className="stack" style={{ gap: 2 }}>
            <span className="tiny">Room</span>
            <strong style={{ fontSize: "1.5rem", letterSpacing: "0.18em" }}>
              {room.code}
            </strong>
          </div>
          <div className="row">
            {room.round > 0 && <span className="chip">Round {room.round}</span>}
            <span className="chip">{room.packName}</span>
            {!connected && <span className="chip">reconnecting</span>}
          </div>
        </header>

        {room.phase === "lobby" && (
          <section className="glass card stack pulse-in">
            <div className="spread">
              <h2>Players in the room</h2>
              <span className="muted tiny">
                {room.players.length}/{room.config.maxPlayers}
              </span>
            </div>
            <PlayerChips
              players={room.players}
              onKick={(playerId) => act({ type: "kick", playerId })}
              canKick={isHost}
            />
            <p className="muted" style={{ margin: 0, fontSize: "0.86rem" }}>
              Share the code <strong>{room.code}</strong>. You need at least 3 players to
              start.
            </p>
            {isHost ? (
              <button
                className="btn btn-primary"
                onClick={() => act({ type: "startRound" })}
                disabled={room.players.length < 3}
              >
                {room.players.length < 3 ? "Waiting for players\u2026" : "Start the round"}
              </button>
            ) : (
              <p className="lead" style={{ margin: 0 }}>
                Waiting for the host to start&hellip;
              </p>
            )}
          </section>
        )}

        {room.phase === "question" && (
          <section className="glass card stack pulse-in" key={`q-${room.round}`}>
            <span className="tiny">Who is most likely to</span>
            <p className="question">
              <em>{room.prompt}</em>
            </p>
            <p className="lead">Talk it out. Voting opens in a moment.</p>
            {isHost && (
              <button className="btn btn-primary" onClick={() => act({ type: "openVoting" })}>
                Open voting now
              </button>
            )}
          </section>
        )}

        {room.phase === "voting" && (
          <section className="glass card stack pulse-in" key={`v-${room.round}`}>
            <span className="tiny">Who is most likely to</span>
            <p className="question">
              <em>{room.prompt}</em>
            </p>
            <div className="stack" style={{ gap: 6 }}>
              <div className="spread">
                <span className="muted tiny">Votes in</span>
                <span className="muted tiny">
                  {room.votesSubmitted}/{room.eligibleCount}
                </span>
              </div>
              <div className="bar">
                <i style={{ width: `${voteProgress}%` }} />
              </div>
            </div>

            <div className="choices">
              {room.players.map((player, index) => {
                const mine = room.you.votedFor === player.id;
                const selfBlocked = player.id === room.you.id && !room.config.selfVote;
                return (
                  <button
                    key={player.id}
                    className="choice"
                    aria-pressed={mine}
                    disabled={selfBlocked}
                    style={{ animationDelay: `${index * 45}ms` }}
                    onClick={() => act({ type: "vote", targetId: player.id })}
                  >
                    <span>
                      {player.name}
                      {player.id === room.you.id ? " (you)" : ""}
                    </span>
                    {mine && <span className="badge">your vote</span>}
                  </button>
                );
              })}
              {room.config.skipsAllowed && (
                <button
                  className="choice"
                  aria-pressed={room.you.hasVoted && room.you.votedFor === null}
                  onClick={() => act({ type: "vote", targetId: null })}
                >
                  <span>Skip this one</span>
                  {room.you.hasVoted && room.you.votedFor === null && (
                    <span className="badge">your vote</span>
                  )}
                </button>
              )}
            </div>

            <p className="muted" style={{ margin: 0, fontSize: "0.84rem" }}>
              You can change your vote until the reveal. Nobody sees who you picked.
            </p>
            {isHost && (
              <button className="btn btn-ghost" onClick={() => act({ type: "reveal" })}>
                Reveal now
              </button>
            )}
          </section>
        )}

        {room.phase === "reveal" && room.results && (
          <section className="glass card stack pulse-in" key={`r-${room.round}`}>
            <span className="tiny">
              {room.results.isTie ? "It is a tie" : "Most likely to"} — round {room.round}
            </span>

            {room.results.maxVotes === 0 ? (
              <p className="question">Nobody voted. Suspicious.</p>
            ) : (
              <p className="reveal-name">
                {room.results.winners.map((w) => w.name).join(" & ")}
              </p>
            )}

            <p className="lead">
              {isWinner
                ? "That is you. Own it."
                : room.results.isTie
                  ? "A shared crown. Even better."
                  : `Voted by ${room.results.maxVotes} of ${room.eligibleCount}.`}
            </p>

            <div>
              {room.results.tally.map((entry, index) => (
                <div
                  className="tally-row"
                  key={entry.player.id}
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  <span className="who">{entry.player.name}</span>
                  <span className="bar">
                    <i
                      style={{
                        // maxVotes is 0 when nobody voted, which would make
                        // every bar NaN; an empty tally means this never runs,
                        // but the guard keeps a skip-only round safe.
                        width: `${Math.round((entry.votes / (room.results!.maxVotes || 1)) * 100)}%`,
                      }}
                    />
                  </span>
                  <span className="count">{entry.votes}</span>
                </div>
              ))}
            </div>

            {isHost ? (
              <div className="row" style={{ gap: 10 }}>
                <button
                  className="btn btn-primary grow"
                  onClick={() => act({ type: "startRound" })}
                >
                  Next round
                </button>
                <button className="btn" onClick={() => act({ type: "scoreboard" })}>
                  Standings
                </button>
              </div>
            ) : (
              <p className="lead" style={{ margin: 0 }}>
                Waiting for the host&hellip;
              </p>
            )}
          </section>
        )}

        {room.phase === "scoreboard" && (
          <section className="glass card stack pulse-in">
            <h2>Standings</h2>
            {[...room.players]
              .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
              .map((player, index) => (
                <div className="tally-row" key={player.id}>
                  <span className="who">
                    {index + 1}. {player.name}
                  </span>
                  <span className="count">{player.score}</span>
                </div>
              ))}
            {room.results && room.results.winners.length > 0 && (
              <p className="muted" style={{ margin: 0, fontSize: "0.86rem" }}>
                Last round: {room.results.winners.map((w) => w.name).join(" & ")}
              </p>
            )}
            {isHost && (
              <button className="btn btn-primary" onClick={() => act({ type: "startRound" })}>
                Next round
              </button>
            )}
          </section>
        )}

        {room.phase === "ended" && (
          <section className="glass card stack pulse-in">
            <h2>The host ended the game</h2>
            <p className="lead">Thanks for playing.</p>
            <button
              className="btn btn-primary"
              onClick={() => {
                clearSession();
                navigate("/");
              }}
            >
              Back to start
            </button>
          </section>
        )}

        <footer className="spread">
          <button className="btn btn-ghost" onClick={handleLeave}>
            Leave room
          </button>
          {isHost && room.phase !== "ended" && (
            <button className="btn btn-ghost btn-danger" onClick={() => act({ type: "end" })}>
              End game
            </button>
          )}
        </footer>
      </main>

      {error && (
        <div className="toast" role="alert" onClick={() => setError(null)}>
          {error}
        </div>
      )}
    </>
  );
}
