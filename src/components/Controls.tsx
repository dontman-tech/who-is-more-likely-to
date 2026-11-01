import type { ReactNode } from "react";

/**
 * A chunky physical toggle. Rendered as a real `role="switch"` button so it is
 * reachable and announces its state, rather than a styled checkbox that has to
 * be reverse-engineered by a screen reader.
 */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch"
      onClick={() => onChange(!checked)}
    />
  );
}

/**
 * A numeric stepper with hard limits. Both ends disable rather than silently
 * clamping, so the player can see that a value is at its edge.
 */
export function Stepper({
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (next: number) => void;
  label: string;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <div className="stepper">
      <button
        type="button"
        onClick={() => onChange(clamp(value - step))}
        disabled={value <= min}
        aria-label={`Decrease ${label}`}
      >
        &minus;
      </button>
      <span className="value" aria-live="polite" aria-label={label}>
        {value === 0 ? "off" : `${value}${suffix}`}
      </span>
      <button
        type="button"
        onClick={() => onChange(clamp(value + step))}
        disabled={value >= max}
        aria-label={`Increase ${label}`}
      >
        +
      </button>
    </div>
  );
}

/** One labelled row in the house-rules panel. */
export function Rule({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <div className="rule">
      <span className="rule-text">
        <strong>{title}</strong>
        <span>{hint}</span>
      </span>
      {children}
    </div>
  );
}
