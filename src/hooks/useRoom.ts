import { useCallback, useEffect, useRef, useState } from "react";
import { act as sendAction, ApiError, fetchRoom, type Action } from "@/lib/client";
import type { PublicRoom } from "@domain/types";

/**
 * Adaptive polling.
 *
 * Polling is chosen deliberately over websockets: Vercel's serverless
 * functions cannot hold a long-lived socket, so a self-hosted socket server
 * would be an extra moving part. Polling at 1.1s (fast) and 3s (idle) is
 * indistinguishable from realtime for a turn-based party game, costs one
 * tiny JSON response per tick, and survives every cold start. The revision
 * counter means we only re-render when something actually changed.
 *
 * Polling stops entirely while the tab is hidden, which is the single biggest
 * saver in practice: a phone in a pocket, or a backgrounded tab, would
 * otherwise poll for the whole game and spend store commands for nothing. On
 * return the room is refreshed once immediately, so the screen is never stale.
 */
export function useRoom(code: string | null, token: string | null) {
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const revision = useRef(-1);
  const phase = useRef<string>("lobby");

  const apply = useCallback((next: PublicRoom, force = false) => {
    // A poll that returns the same revision carries no new information, so
    // skip the state write and the re-render it would cause. Actions pass
    // `force` because their response is authoritative for the acting player.
    if (!force && next.revision === revision.current) return;
    revision.current = next.revision;
    phase.current = next.phase;
    setRoom(next);
  }, []);

  const refresh = useCallback(async () => {
    if (!code || !token) return;
    try {
      const { room: next } = await fetchRoom(code, token);
      apply(next);
      setConnected(true);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Your session expired. Please rejoin the room.");
      } else {
        setConnected(false);
      }
    }
  }, [code, token, apply]);

  useEffect(() => {
    if (!code || !token) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const loop = async () => {
      await refresh();
      if (cancelled) return;
      // Hidden tabs stop polling: a phone in a pocket should not spend store
      // commands. The visibility handler below restarts the loop on return.
      if (document.visibilityState === "hidden") return;
      const fast = phase.current === "voting" || phase.current === "question";
      timer = setTimeout(loop, fast ? 1100 : 3000);
    };

    // Coming back to the tab refreshes once right away, so a phone that was
    // asleep shows the current phase immediately instead of one tick later.
    const onVisible = () => {
      if (document.visibilityState !== "visible" || cancelled) return;
      clearTimeout(timer);
      void loop();
    };

    document.addEventListener("visibilitychange", onVisible);
    loop();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [code, token, refresh]);

  const act = useCallback(
    async (action: Action) => {
      if (!code || !token) return null;
      try {
        const result = await sendAction(code, token, action);
        if (result.room) apply(result.room, true);
        setError(null);
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
        // Re-sync so a rejected action does not leave a stale view.
        void refresh();
        return null;
      }
    },
    [code, token, apply, refresh],
  );

  return { room, error, connected, act, refresh, setError };
}
