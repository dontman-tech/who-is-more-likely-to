import { useEffect, useState } from "react";
import {
  createRoom,
  joinRoom,
  listPacks,
  loadSession,
  saveSession,
} from "@/lib/client";
import type { QuestionPack } from "@domain/packs";

/**
 * Landing screen: one decision, two paths. The "resume" banner appears only
 * when a previous session is still on this device, which turns an accidental
 * refresh into a one-tap recovery instead of a lost game.
 */
export function Home({ navigate }: { navigate: (to: string) => void }) {
  const [mode, setMode] = useState<"home" | "join">("home");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resume, setResume] = useState<{ code: string; name: string } | null>(null);
  const [packs, setPacks] = useState<QuestionPack[]>([]);
  const [packId, setPackId] = useState<string>("party");
  const [showPacks, setShowPacks] = useState(false);
  const [customText, setCustomText] = useState("");
  const [customMode, setCustomMode] = useState(false);

  // One prompt per line. Blank lines are dropped client-side for immediate
  // feedback; the server trims, de-dupes, and caps the list again on arrival.
  const customPrompts = customText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  useEffect(() => {
    const session = loadSession();
    if (session) setResume({ code: session.code, name: session.name });
  }, []);

  // The catalogue is small and cached, so a failure here is not fatal: the
  // server falls back to the default pack when `packId` is unknown.
  useEffect(() => {
    let cancelled = false;
    listPacks()
      .then(({ packs: list }) => {
        if (cancelled || list.length === 0) return;
        setPacks(list);
        setPackId((current) =>
          list.some((p) => p.id === current) ? current : list[0].id,
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate() {
    if (!name.trim()) return setError("Enter your name to start a room.");
    if (customMode && customPrompts.length < 3) {
      return setError("Add at least 3 questions for your custom pack.");
    }
    setBusy(true);
    setError(null);
    try {
      const { room, token } = await createRoom(name.trim(), {
        packId: customMode ? undefined : packId,
        customPrompts: customMode ? customPrompts : undefined,
      });
      saveSession({ code: room.code, token, name: name.trim(), playerId: room.you.id });
      navigate(`/room/${room.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the room.");
      setBusy(false);
    }
  }

  async function handleJoin() {
    if (!name.trim()) return setError("Enter your name to join.");
    if (code.trim().length < 4) return setError("Enter the 4-character room code.");
    setBusy(true);
    setError(null);
    try {
      const { room, token } = await joinRoom(code.trim().toUpperCase(), {
        name: name.trim(),
      });
      saveSession({ code: room.code, token, name: name.trim(), playerId: room.you.id });
      navigate(`/room/${room.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join that room.");
      setBusy(false);
    }
  }

  const selectedPack = packs.find((p) => p.id === packId);

  return (
    <main className="shell">
      <header className="stack pulse-in" style={{ paddingTop: 26 }}>
        <span className="tiny">Party mode</span>
        <h1>Who is most likely to&hellip;</h1>
        <p className="lead">
          One question on every phone. Everyone votes in secret. One person gets the
          spotlight.
        </p>
      </header>

      {resume && (
        <section className="glass card row spread pulse-in">
          <div className="stack" style={{ gap: 2 }}>
            <strong>Welcome back, {resume.name}</strong>
            <span className="muted tiny">Room {resume.code}</span>
          </div>
          <button className="btn" onClick={() => navigate(`/room/${resume.code}`)}>
            Rejoin
          </button>
        </section>
      )}

      <section className="glass card stack pulse-in">
        <label className="stack" style={{ gap: 6 }}>
          <span className="tiny">Your name</span>
          <input
            type="text"
            value={name}
            maxLength={18}
            placeholder="e.g. Sam"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && mode === "home" && handleCreate()}
            autoComplete="off"
          />
        </label>

        {mode === "join" && (
          <label className="stack pulse-in" style={{ gap: 6 }}>
            <span className="tiny">Room code</span>
            <input
              className="code-input"
              type="text"
              value={code}
              maxLength={4}
              placeholder="ABCD"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            />
          </label>
        )}

        {mode === "home" && (
          <div className="stack pulse-in" style={{ gap: 8 }}>
            <button
              className="btn btn-ghost"
              onClick={() => setShowPacks((v) => !v)}
              aria-expanded={showPacks}
              disabled={busy}
            >
              {customMode
                ? `Pack: Custom (${customPrompts.length})`
                : selectedPack
                  ? `Pack: ${selectedPack.name}`
                  : "Choose a pack"}
              <span className="muted tiny" style={{ marginLeft: 8 }}>
                {showPacks ? "hide" : "change"}
              </span>
            </button>

            {showPacks && (
              <div className="pack-list pulse-in">
                {packs.map((pack) => (
                  <button
                    key={pack.id}
                    className="pack"
                    aria-pressed={!customMode && pack.id === packId}
                    onClick={() => {
                      setPackId(pack.id);
                      setCustomMode(false);
                      setShowPacks(false);
                    }}
                  >
                    <span className="pack-head">
                      <strong>{pack.name}</strong>
                      <span className="muted tiny">{pack.prompts.length} questions</span>
                    </span>
                    <span className="muted tiny">{pack.description}</span>
                    <span className="muted tiny pack-sample">
                      e.g. &ldquo;{pack.prompts[0]}&rdquo;
                    </span>
                  </button>
                ))}

                <button
                  className="pack"
                  aria-pressed={customMode}
                  onClick={() => setCustomMode(true)}
                >
                  <span className="pack-head">
                    <strong>Write your own</strong>
                    <span className="muted tiny">custom</span>
                  </span>
                  <span className="muted tiny">
                    Type your own &ldquo;most likely to&hellip;&rdquo; questions, one per line.
                  </span>
                </button>
              </div>
            )}

            {customMode && (
              <label className="stack pulse-in" style={{ gap: 6 }}>
                <span className="tiny">Your questions — one per line</span>
                <textarea
                  className="custom-input"
                  rows={5}
                  maxLength={4000}
                  value={customText}
                  placeholder={"get rich and forget their friends\nbecome a karaoke legend\nsleep through their own alarm"}
                  onChange={(e) => setCustomText(e.target.value)}
                  disabled={busy}
                />
                <span className="muted tiny">
                  {customPrompts.length} question{customPrompts.length === 1 ? "" : "s"}
                  {customPrompts.length < 3 ? " — add at least 3" : ""}
                </span>
              </label>
            )}
          </div>
        )}

        <div className="stack" style={{ gap: 10 }}>
          {mode === "home" ? (
            <>
              <button className="btn btn-primary" onClick={handleCreate} disabled={busy}>
                {busy ? "Creating\u2026" : "Create a room"}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setMode("join");
                  setError(null);
                }}
                disabled={busy}
              >
                I have a code
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-primary" onClick={handleJoin} disabled={busy}>
                {busy ? "Joining\u2026" : "Join room"}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setMode("home");
                  setError(null);
                }}
                disabled={busy}
              >
                Back
              </button>
            </>
          )}
        </div>

        {error && (
          <p role="alert" className="muted" style={{ color: "#ffb3c8", margin: 0 }}>
            {error}
          </p>
        )}
      </section>

      <section className="glass card stack pulse-in">
        <h2>How it works</h2>
        <ol className="lead" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Someone creates a room, picks a pack, and reads out the code.</li>
          <li>Everyone joins on their own phone and picks a name.</li>
          <li>The question lands on every screen at the same time.</li>
          <li>Votes are secret, then the top name is revealed.</li>
          <li>The winner&rsquo;s own phone flashes the word YOU.</li>
        </ol>
        <p className="muted" style={{ margin: 0, fontSize: "0.86rem" }}>
          Best with 3 or more players. Leave any time — your name and your vote are
          removed cleanly.
        </p>
      </section>
    </main>
  );
}
