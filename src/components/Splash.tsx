import { useEffect } from "react";

/** Flecks scattered behind the word. Deterministic so they do not jump. */
const FLECKS = [
  { left: "8%", delay: "0s", color: "var(--pink)" },
  { left: "22%", delay: "0.5s", color: "var(--blue)" },
  { left: "37%", delay: "1.1s", color: "var(--yellow)" },
  { left: "54%", delay: "0.2s", color: "var(--green)" },
  { left: "68%", delay: "1.5s", color: "var(--purple)" },
  { left: "81%", delay: "0.8s", color: "var(--orange)" },
  { left: "93%", delay: "1.9s", color: "var(--pink)" },
];

/**
 * The full-screen spotlight. It is shown only on the winning player's own
 * device and only when they actually won, so the "YOU" moment stays private
 * and personal rather than being a label everyone else sees.
 *
 * The word is drawn three times — white, pink, blue — offset by a few pixels,
 * the way a cheap screen print misregisters its ink plates.
 */
export function Splash({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 4200);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div
      className="splash"
      role="status"
      aria-live="assertive"
      onClick={onDone}
    >
      <div className="confetti" aria-hidden="true">
        {FLECKS.map((f) => (
          <i key={f.left} style={{ left: f.left, animationDelay: f.delay, background: f.color }} />
        ))}
      </div>
      <div className="stack" style={{ alignItems: "center", gap: 16 }}>
        <span className="tiny">Most likely to</span>
        <span className="splash-word" data-word="YOU">
          YOU
        </span>
        <span className="lead">Tap to continue</span>
      </div>
    </div>
  );
}
