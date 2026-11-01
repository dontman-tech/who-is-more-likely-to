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
    "arrive late to their own birthday party",
    "dance like nobody is watching",
    "get drunk first",
    "start dancing on a table",
    "disappear from a party without telling anyone",
    "know everyone at the party",
    "start a dance battle",
    "steal the DJ's attention",
    "flirt with a complete stranger",
    "turn a small gathering into a massive party",
    "forget how they got home",
    "be the last person standing at a party",
    "take 100 selfies in one night",
    "start singing loudly in public",
    "become best friends with a stranger at a party",
    "spend the entire party taking pictures",
    "embarrass their friends on the dance floor",
    "sneak extra drinks",
    "organize an after-party",
    "fall asleep at a party",
    "show up overdressed",
    "show up wearing something completely inappropriate",
    "get kicked out of a party",
    "make a dramatic entrance",
    "start a party game nobody understands",
    "spend the entire night near the food",
    "accidentally spill a drink on someone",
    "become the unofficial party photographer",
    "start a conga line",
    "convince everyone to go clubbing",
    "forget someone's name immediately after meeting them",
    "make an embarrassing speech",
    "get caught dancing in front of a mirror",
    "leave the party with a new crush",
    "become emotional after a few drinks",
    "challenge the DJ to play their favorite song",
    "spend the night gossiping in a corner",
    "accidentally break something at a party",
    "turn a birthday celebration into their own show",
    "invite people nobody else knows",
    "get everyone singing along to a song",
    "lose their phone during a party",
    "start a spontaneous road trip after a party",
    "be the life of the party",
    "fall in love at a party",
    "spend more money partying than they planned",
    "get caught taking food home",
    "start an argument over music",
    "turn a quiet evening into an unforgettable night",
    "have the most embarrassing party story",
  ],
};

const CHAOS: QuestionPack = {
  id: "chaos",
  name: "Chaos Mode",
  description: "Sharper, sillier, and a little mean. Play with people who know each other well.",
  prompts: [
    "accidentally start a fight",
    "get lost in their own neighborhood",
    "make a terrible decision and defend it confidently",
    "send a message to the wrong person",
    "laugh at the worst possible moment",
    "create a problem and disappear",
    "get arrested for something ridiculous",
    "start an argument just for entertainment",
    "accidentally expose someone's secret",
    "spend their entire salary in one day",
    "lie about something completely unnecessary",
    "break something and blame someone else",
    "make a spontaneous decision that affects everyone",
    "get into trouble while trying to help",
    "accidentally go viral",
    "start laughing during a serious meeting",
    "create a fake emergency just to avoid plans",
    "get into an argument with a stranger online",
    "disappear for three days without explanation",
    "make a group chat unnecessarily dramatic",
    "forget why they entered a room",
    "turn a minor inconvenience into a full-blown crisis",
    "accidentally ruin a surprise",
    "start a rumor without realizing it",
    "get scammed despite being warned",
    "book a trip without checking their finances",
    "challenge someone twice their size",
    "have beef with someone they've never met",
    "get into trouble because of a dare",
    "make an impulsive purchase they regret",
    "accidentally expose themselves while trying to expose someone else",
    "turn a simple conversation into an argument",
    "send a voice note longer than a podcast",
    "make a dramatic exit and return five minutes later",
    "create unnecessary drama in a peaceful environment",
    "get caught doing something they swore they would never do",
    "forget an important appointment",
    "start a business without knowing what they're doing",
    "make a bad situation ten times worse",
    "accidentally become someone's enemy",
    "prank someone and end up getting pranked harder",
    "start a competition nobody agreed to",
    "have the most questionable search history",
    "make a decision based entirely on vibes",
    "get into a situation they cannot explain",
    "turn a small misunderstanding into a family meeting",
    "start laughing while being scolded",
    "have the police called on them for something ridiculous",
    "cause chaos and somehow convince everyone they're innocent",
    "be the reason everyone has a story to tell tomorrow",
  ],
};

const OFFICE: QuestionPack = {
  id: "office",
  name: "Work Mode",
  description: "Office-safe. Good for team socials and standup icebreakers.",
  prompts: [
    "arrive late and still complain about being tired",
    "pretend to be busy when the boss walks by",
    "sleep during a meeting",
    "accidentally send an embarrassing email to the entire company",
    "know all the office gossip",
    "flirt with a coworker",
    "become the boss's favorite",
    "resign dramatically",
    "spend the entire day looking forward to lunch",
    "complain about their salary every day",
    "take the longest lunch break",
    "secretly look for another job while at work",
    "fall asleep at their desk",
    "organize an office party",
    "forget an important deadline",
    "blame the Wi-Fi for not completing their work",
    "have a secret office crush",
    "accidentally insult the boss",
    "become CEO someday",
    "spend more time chatting than working",
    "steal someone else's lunch from the fridge",
    "know everyone's salary",
    "start office drama",
    "be caught watching movies during work hours",
    "send a passive-aggressive email",
    "volunteer for work and regret it immediately",
    "leave exactly at closing time",
    "work overtime just to impress the boss",
    "forget to unmute themselves during a virtual meeting",
    "accidentally share their screen with something embarrassing open",
    "turn every meeting into a motivational speech",
    "become everyone's unofficial therapist",
    "take credit for someone else's idea",
    "bring the best snacks to work",
    "get caught gossiping about the person standing behind them",
    "send a resignation letter and regret it",
    "argue with HR",
    "be promoted despite doing the bare minimum",
    "have the most ridiculous excuse for being late",
    "accidentally delete an important company file",
    "organize a secret office gift exchange",
    "have a different personality when the boss is around",
    "turn a five-minute task into a three-hour project",
    "get caught shopping online during work",
    "know everyone's business but share nothing about themselves",
    "start a workplace romance",
    "get promoted because of their connections",
    "send a message complaining about the boss to the boss",
    "quit their job and become an influencer",
    "survive an entire workday doing absolutely nothing productive",
  ],
};

const SPICY: QuestionPack = {
  id: "spicy",
  name: "After Hours",
  description: "For close friends only. Suggestive, never explicit. Read the room first.",
  prompts: [
    "kiss someone on the first date",
    "have a secret admirer",
    "date two people at the same time",
    "fall in love with their best friend",
    "make the first move",
    "have a crush on someone in this room",
    "go back to their ex",
    "send a risky text at 2 a.m.",
    "flirt their way out of trouble",
    "have a friends-with-benefits situation",
    "stalk their crush's social media",
    "fall for someone they just met",
    "have a secret relationship",
    "get caught flirting with someone",
    "kiss more than one person in a week",
    "have a crush on their friend's ex",
    "send a provocative picture",
    "have a one-night stand",
    "date someone twice their age",
    "have a romantic relationship nobody knows about",
    "get jealous but pretend not to care",
    "have the most people sliding into their DMs",
    "fall for someone emotionally unavailable",
    "have a secret hookup story",
    "kiss someone just because of a dare",
    "have a crush on two people at once",
    "get caught sneaking out to meet someone",
    "have an ex who still wants them back",
    "flirt with someone just to get free things",
    "have a romantic encounter in an unexpected place",
    "accidentally send a flirty message to the wrong person",
    "have a secret situationship",
    "make someone fall in love without realizing it",
    "date someone their friends absolutely dislike",
    "have a crush on a married person",
    "be caught making out in public",
    "kiss someone in this room",
    "have a secret list of people they find attractive",
    "have a romantic getaway with someone they barely know",
    "fall for someone after one conversation",
    "have the most complicated love life",
    "keep texting someone they know is bad for them",
    "have a secret relationship with a coworker",
    "break someone's heart",
    "get caught checking someone out",
    "have a crush on their best friend's sibling",
    "have the wildest dating history",
    "confess their feelings after a few drinks",
    "have a secret romantic fantasy",
    "have a story about their love life that nobody would believe",
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
