/**
 * Question packs.
 *
 * Every prompt in the game is a "Who is most likely to ___?" fill-in, so a
 * pack is just a list of endings plus a label. Packs are kept server-side
 * alongside the deck so a client cannot read questions ahead of time.
 */

export interface QuestionPack {
  id: string;
  name: string;
  description: string;
  prompts: string[];
}

const PARTY: QuestionPack = {
  id: "party",
  name: "Party Starter",
  description: "Broad, safe-for-any-group questions that get people talking.",
  prompts: [
    "become famous for something completely accidental",
    "reply to a group chat three days later",
    "start a business and forget to tell anyone",
    "cry at a commercial",
    "get lost in their own neighbourhood",
    "win an argument they were definitely wrong about",
    "show up an hour late and act normal about it",
    "become a millionaire and still haggle at the market",
    "send a message to the wrong group chat",
    "fall asleep during their own party",
    "adopt five pets on the same day",
    "get recognised in public for something embarrassing",
    "quit their job to travel and actually do it",
    "give a two-hour answer to a yes-or-no question",
    "forget their own birthday",
    "become a local legend for the strangest reason",
    "survive a zombie apocalypse by pure luck",
    "get banned from a buffet",
    "accidentally become someone's mentor",
    "run for office as a joke and win",
    "sing karaoke like it is a stadium tour",
    "get into a fight with a vending machine",
    "know every word to a song they claim to hate",
    "plan a surprise party and spoil it themselves",
    "move countries because of a TV show",
    "become the reason a family group chat has rules",
    "be the last one standing at every party",
    "invent a holiday that catches on",
    "get a tattoo they immediately regret",
    "talk their way out of a speeding ticket",
    "become best friends with a stranger on a train",
    "start a rumour that turns out to be true",
  ],
};

const CHAOS: QuestionPack = {
  id: "chaos",
  name: "Chaos Mode",
  description: "Sharper, sillier, and a little mean. Play with people who know each other well.",
  prompts: [
    "text an ex at 3am and call it closure",
    "eat something off the floor and tell nobody",
    "start a feud over the last slice of pizza",
    "narrate their own life out loud in public",
    "buy a pet on impulse from a stranger online",
    "get kicked out of a karaoke bar for enthusiasm",
    "spend rent money on something shiny",
    "lie about their age to get a discount",
    "become a cult leader by accident",
    "crash a wedding and give a speech",
    "get into a road rage argument with a cyclist",
    "fake an injury to skip a group holiday",
    "become the villain of their own story",
    "reply-all to a company-wide email",
    "get banned from a shop for asking too many questions",
    "start a podcast nobody asked for",
    "win a fight with a seagull",
    "confidently mispronounce a word for a decade",
    "start a rumour about themselves for attention",
    "order the same meal for eleven years straight",
    "get married on a dare",
    "live in a van and call it a lifestyle",
    "become a meme within their own friendship group",
    "argue with a referee at a children's match",
    "break a world record by mistake",
    "tell a story that gets longer every time",
    "get scammed and compliment the scammer",
    "become obsessed with a hobby for exactly nine days",
  ],
};

const OFFICE: QuestionPack = {
  id: "office",
  name: "Work Mode",
  description: "Office-safe. Good for team socials and standup icebreakers.",
  prompts: [
    "reply to a Slack message in 4 seconds flat",
    "schedule a meeting that could have been an email",
    "fall asleep in a video call with the camera on",
    "say the phrase 'circle back' unironically",
    "bring cake to the office and eat most of it",
    "become everyone's unofficial IT support",
    "leave a passive-aggressive note in the kitchen",
    "make a spreadsheet for a personal decision",
    "reply-all to a 200-person thread",
    "use a corporate buzzword in a serious argument",
    "work from a beach and post about it",
    "get promoted and immediately become a different person",
    "eat someone else's clearly labelled lunch",
    "volunteer the team for extra work",
    "use the phrase 'quick question' before a 40-minute talk",
    "be the last to notice a company-wide restructure",
    "become the person who actually reads the policy document",
    "set their status to busy for three straight days",
    "organise a team event nobody can decline",
    "know the printer's quirks better than their own phone",
    "be the reason the office gets a new rule",
    "send a message meant for a friend to the team channel",
    "get emotional during a performance review",
    "ask for a raise in the most awkward way possible",
  ],
};

const SPICY: QuestionPack = {
  id: "spicy",
  name: "After Hours",
  description: "For close friends only. Suggestive, never explicit. Read the room first.",
  prompts: [
    "send a risky text and regret it instantly",
    "fall in love on holiday and never mention it again",
    "get caught staring and refuse to look away",
    "have a crush on someone in this room",
    "kiss a stranger on a dare",
    "keep a secret from this whole group",
    "ghost someone and still feel fine about it",
    "be the first to pass out at a party",
    "flirt their way out of trouble",
    "have the most chaotic dating history",
    "get married first",
    "admit a crush on a friend's partner",
    "become the group's designated bad influence",
    "text their crush and screenshot it for us",
    "start a rumour about their own love life",
    "date someone everyone else warned them about",
    "still be friends with every ex",
    "be the worst wingman imaginable",
  ],
};

export const PACKS: QuestionPack[] = [PARTY, CHAOS, OFFICE, SPICY];

export const DEFAULT_PACK_ID = PARTY.id;

/** Sentinel id for a host-supplied deck. Never appears in `PACKS`. */
export const CUSTOM_PACK_ID = "custom";

export const CUSTOM_PACK_NAME = "Custom pack";

/** How many host-supplied prompts a room may carry, and their size limits. */
export const CUSTOM_PROMPT_LIMITS = { min: 3, max: 60, minLength: 3, maxLength: 120 };

export function getPack(id: string): QuestionPack | undefined {
  return PACKS.find((p) => p.id === id);
}

/**
 * Clean a host-supplied prompt list.
 *
 * Prompts arrive from an untrusted client, so they are trimmed, length-capped,
 * and de-duplicated. Returning an empty array (rather than throwing) lets the
 * caller fall back to a curated pack instead of failing the request.
 */
export function sanitizeCustomPrompts(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const text = raw.replace(/\s+/g, " ").trim();
    if (text.length < CUSTOM_PROMPT_LIMITS.minLength) continue;
    const capped = text.slice(0, CUSTOM_PROMPT_LIMITS.maxLength);
    const key = capped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push(capped);
    if (clean.length >= CUSTOM_PROMPT_LIMITS.max) break;
  }
  return clean.length >= CUSTOM_PROMPT_LIMITS.min ? clean : [];
}

/**
 * The pack id that {@link resolveDeck} will actually draw from. An unknown or
 * empty pack resolves to the default, so the id stored on a room always names
 * the prompts really in play and can never disagree with the reported name.
 */
export function resolvePackId(packId?: string): string {
  if (packId === CUSTOM_PACK_ID) return CUSTOM_PACK_ID;
  const pack = packId ? getPack(packId) : undefined;
  return pack && pack.prompts.some((p) => p.trim().length > 0) ? pack.id : DEFAULT_PACK_ID;
}

/** Display name for a pack id, falling back to the default pack's name. */
export function packName(packId?: string): string {
  if (packId === CUSTOM_PACK_ID) return CUSTOM_PACK_NAME;
  return getPack(resolvePackId(packId))?.name ?? PARTY.name;
}

/**
 * Resolve a request for a pack into a concrete prompt list. Unknown ids and
 * packs with no usable prompts fall back to the default pack rather than
 * starting a room with an empty deck.
 */
export function resolveDeck(packId?: string): string[] {
  const pack = getPack(resolvePackId(packId));
  return pack ? pack.prompts.slice() : PARTY.prompts.slice();
}

/** Public catalogue for the picker. Prompt text is included on purpose: the
 * picker shows a preview, and the deck is only hidden once a round starts. */
export function listPacks(): QuestionPack[] {
  return PACKS.map((p) => ({ ...p, prompts: p.prompts.slice() }));
}
