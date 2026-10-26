import { useEffect } from "react";

/**
 * The full-screen spotlight. It is shown only on the winning player's own
 * device and only when they actually won, so the "YOU" moment stays private
 * and personal rather than being a label everyone else sees.
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
      style={{ cursor: "pointer" }}
    >
      <div className="stack" style={{ alignItems: "center", gap: 14 }}>
        <span className="tiny">Most likely to</span>
        <span className="splash-word">YOU</span>
        <span className="lead">Tap to continue</span>
      </div>
    </div>
  );
}
