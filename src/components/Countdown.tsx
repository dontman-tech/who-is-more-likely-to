import { useEffect, useMemo, useRef, useState } from "react";

/**
 * A phase countdown that trusts the server, not the phone.
 *
 * The server sends both the deadline (`phaseEndsAt`) and its own clock at the
 * moment of the snapshot (`serverNow`). The offset between that clock and this
 * device's is applied once, so a phone with the wrong time — or a laptop that
 * slept for an hour — still counts down the real remaining seconds instead of
 * whatever the local clock claims.
 *
 * The ticker runs locally between polls, so the number moves smoothly without
 * spending a request per second.
 */
export function Countdown({
  endsAt,
  serverNow,
  label = "left",
}: {
  endsAt: number | null;
  serverNow: number;
  label?: string;
}) {
  // How far this device's clock sits from the server's. Recomputing on every
  // snapshot keeps a long-lived tab honest as the two clocks drift.
  const skew = useMemo(() => Date.now() - serverNow, [serverNow]);

  // The deadline expressed in local-clock terms.
  const localDeadline = endsAt === null ? null : endsAt + skew;

  const [remaining, setRemaining] = useState(() => msLeft(localDeadline));
  const deadlineRef = useRef(localDeadline);
  deadlineRef.current = localDeadline;

  useEffect(() => {
    setRemaining(msLeft(localDeadline));
    if (localDeadline === null) return;
    const id = setInterval(() => setRemaining(msLeft(deadlineRef.current)), 250);
    return () => clearInterval(id);
  }, [localDeadline]);

  if (localDeadline === null || remaining === null) return null;

  const seconds = Math.ceil(remaining / 1000);
  const urgent = seconds <= 5;

  return (
    <span
      className={`timer${urgent ? " urgent" : ""}`}
      role="timer"
      aria-live={urgent ? "assertive" : "off"}
      aria-label={`${seconds} seconds ${label}`}
    >
      {seconds}
      <span className="unit">{label}</span>
    </span>
  );
}

/** Milliseconds until `deadline`, floored at zero. Null in, null out. */
function msLeft(deadline: number | null): number | null {
  if (deadline === null) return null;
  return Math.max(0, deadline - Date.now());
}
