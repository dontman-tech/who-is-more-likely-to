/**
 * Backwards-compatible default deck. New code should use `lib/packs.ts`,
 * which supports multiple selectable question packs.
 */
import { resolveDeck } from "./packs";

export const DEFAULT_DECK: string[] = resolveDeck();

