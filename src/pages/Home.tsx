import { useEffect, useState } from "react";
import { Rule, Stepper, Switch } from "@/components/Controls";
import {
  createRoom,
  joinRoom,
  listPacks,
  loadSession,
  saveSession,
} from "@/lib/client";
import type { QuestionPack } from "@domain/packs";
import type { RoomConfig } from "@domain/types";

/** Host-tunable rules, with the copy the panel shows for each. */
const DEFAULT_RULES: RoomConfig = {
  maxPlayers: 12,
  questionSeconds: 0,
  votingSeconds: 30,
  selfVote: false,
  skipsAllowed: true,
  revealVotes: true,
};

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
  const [showPacks, setShowPacks] = useState(true);
  const [customText, setCustomText] = useState("");
  const [customMode, setCustomMode] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [rules, setRules] = useState<RoomConfig>(DEFAULT_RULES);

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
        config: rules,
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
  const setRule = <K extends keyof RoomConfig>(key: K, value: RoomConfig[K]) =>
    setRules((current) => ({ ...current, [key]: value }));

  return (
    <main className="shell">
      <header className="stack" style={{ paddingTop: 22 }}>
        <span className="sticker pink" style={{ alignSelf: "flex-start" }}>
          Party mode
        </span>
        <h1>Who is most likely to&hellip;</h1>
        <p className="lead">
          One question on every phone. Everyone votes in secret. One person gets
          the spotlight.
        </p>
      </header>

      {resume && (
        <section className="glass card row spread">
          <div className="stack" style={{ gap: 2 }}>
            <strong>Welcome back, {resume.name}</strong>
            <span className="muted tiny" style={{ borderBottom: "none" }}>
              Room {resume.code}
            </span>
          </div>
          <button className="btn btn-blue" onClick={() => navigate(`/room/${resume.code}`)}>
            Rejoin
          </button>
        </section>
      )}

      <section className="glass card card-tabbed stack" data-tab="Set up">
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
          <div className="stack" style={{ gap: 10 }}>
            <div className="spread">
              <span className="tiny">Packs</span>
              <button
                className="btn btn-ghost pack-toggle"
                onClick={() => setShowPacks((v) => !v)}
                aria-expanded={showPacks}
                disabled={busy}
              >
                {customMode
                  ? `Custom (${customPrompts.length})`
                  : selectedPack
                    ? selectedPack.name
                    : "Choose a pack"}
                <span className="pack-caret" aria-hidden="true">
                  {showPacks ? "−" : "+"}
                </span>
              </button>
            </div>

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
                      <span className="badge quiet">{pack.prompts.length} q</span>
                    </span>
                    <span className="muted" style={{ fontSize: "0.86rem" }}>
                      {pack.description}
                    </span>
                    <span className="muted pack-sample" style={{ fontSize: "0.86rem" }}>
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
                    <span className="badge quiet">custom</span>
                  </span>
                  <span className="muted" style={{ fontSize: "0.86rem" }}>
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
                <span className="muted" style={{ fontSize: "0.86rem" }}>
                  {customPrompts.length} question{customPrompts.length === 1 ? "" : "s"}
                  {customPrompts.length < 3 ? " — add at least 3" : ""}
                </span>
              </label>
            )}

            <button
              className="btn btn-ghost"
              onClick={() => setShowRules((v) => !v)}
              aria-expanded={showRules}
              disabled={busy}
            >
              House rules
            </button>

            {showRules && (
              <div className="rules pulse-in">
                <Rule title="Seats" hint="How many can join this room.">
                  <Stepper
                    value={rules.maxPlayers}
                    min={3}
                    max={20}
                    label="seats"
                    onChange={(v) => setRule("maxPlayers", v)}
                  />
                </Rule>
                <Rule title="Discussion time" hint="0 means the host advances by hand.">
                  <Stepper
                    value={rules.questionSeconds}
                    min={0}
                    max={120}
                    step={15}
                    suffix="s"
                    label="discussion seconds"
                    onChange={(v) => setRule("questionSeconds", v)}
                  />
                </Rule>
                <Rule title="Voting time" hint="0 means the host reveals by hand.">
                  <Stepper
                    value={rules.votingSeconds}
                    min={0}
                    max={120}
                    step={15}
                    suffix="s"
                    label="voting seconds"
                    onChange={(v) => setRule("votingSeconds", v)}
                  />
                </Rule>
                <Rule title="Vote for yourself" hint="Off keeps it fair. On keeps it funny.">
                  <Switch
                    checked={rules.selfVote}
                    label="vote for yourself"
                    onChange={(v) => setRule("selfVote", v)}
                  />
                </Rule>
                <Rule title="Allow skipping" hint="Players may abstain on a question.">
                  <Switch
                    checked={rules.skipsAllowed}
                    label="allow skipping"
                    onChange={(v) => setRule("skipsAllowed", v)}
                  />
                </Rule>
                <Rule title="Reveal the votes" hint="Show who voted for whom at the end.">
                  <Switch
                    checked={rules.revealVotes}
                    label="reveal the votes"
                    onChange={(v) => setRule("revealVotes", v)}
                  />
                </Rule>
              </div>
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
          <p role="alert" className="muted" style={{ color: "#c81f5b", fontWeight: 500 }}>
            {error}
          </p>
        )}
      </section>

      <section className="glass card stack">
        <h2>How it works</h2>
        <ol className="lead" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.75 }}>
          <li>Someone creates a room, picks a pack, and reads out the code.</li>
          <li>Everyone joins on their own phone and picks a name.</li>
          <li>The question lands on every screen at the same time.</li>
          <li>Votes are secret, then the top name is revealed.</li>
          <li>The winner&rsquo;s own phone flashes the word YOU.</li>
        </ol>
        <p className="muted" style={{ fontSize: "0.88rem" }}>
          Best with 3 or more players. Leave any time — your name and your vote are
          removed cleanly.
        </p>
      </section>
    </main>
  );
}
