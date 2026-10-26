# Who Is Most Likely To

A party game for phones. Everyone joins with a room code, one question lands on
every screen, votes are secret, and the winner's own phone flashes **YOU**.

Built with React, Vite, and TypeScript, with the realtime API as Vercel Node
functions backed by Upstash Redis.

---

## What it does

- **Room codes.** One person creates a room, picks a question pack, and reads out
  a 4-character code. Codes skip look-alike glyphs (no `0/O`, `1/I/L`) so they
  are easy to say out loud.
- **One question, every screen.** Prompts advance from the host's phone, and
  every device renders the same question at the same time.
- **Secret voting.** Votes are hidden until the reveal. Nobody can see who
  picked whom, and the running tally is withheld until the round ends.
- **The YOU splash.** Only the winner's device shows the full-screen `YOU`
  moment, so the payoff stays personal instead of being a label everyone sees.
- **Clean leaving.** Leave or get removed and your name, your seat, and your
  vote all disappear. If too few players remain, the room falls back to the
  lobby rather than starting a broken round.
- **Survives a locked phone.** A refresh, a background tab, or a phone lock does
  not cost you your seat or your vote. The session is restored from local
  storage on the next visit.
- **Glassmorphic UI** with smooth transitions and an animated aurora backdrop.

## Question packs

Four curated packs ship with the game, and hosts can write their own.

| Pack | Questions | For |
| --- | --- | --- |
| Party Starter | 32 | Any group, safe for everyone |
| Chaos Mode | 28 | People who know each other well |
| Work Mode | 24 | Team socials and icebreakers |
| After Hours | 18 | Close friends only |
| Custom | yours | Anything you type |

In the custom pack, type one "most likely to…" ending per line. The server
trims whitespace, collapses repeated spaces, drops duplicates and too-short
lines, and caps each prompt at 120 characters. A custom pack needs at least
3 usable prompts; if fewer survive, the room quietly falls back to the pack you
had selected instead of starting empty.

## How a round works

1. The host creates a room and shares the code.
2. Everyone joins on their own phone and picks a name. Three players minimum.
3. The host starts the round. The question appears on every screen.
4. The host opens voting (or a timer does). Votes are cast in secret.
5. Voting closes automatically once everyone has voted, or when the host
   reveals early.
6. The tally appears, and the winner's phone flashes **YOU**.
7. The host starts the next round or opens the standings.

Scoring is **one point per round won**. A tie is a shared win, and every tied
player scores. A round where nobody votes has no winner rather than an
arbitrary one.

---

## Project layout

```
api/            Vercel Node functions — the whole HTTP surface
  packs.ts                    GET  /api/packs
  rooms/index.ts              POST /api/rooms
  rooms/[code]/index.ts       GET  /api/rooms/:code
  rooms/[code]/join.ts        POST /api/rooms/:code/join
  rooms/[code]/actions.ts     POST /api/rooms/:code/actions
lib/            Framework-free game domain (no React, no HTTP)
  engine.ts                   All game rules and phase transitions
  packs.ts                    Question packs and custom-prompt sanitising
  store.ts                    RoomStore: memory for dev, Redis for production
  server.ts                   Lock / persist / validate / error helpers
  types.ts                    Domain and public (wire) types
src/            React client
  pages/Home.tsx              Create or join, pack picker, custom pack editor
  pages/Room.tsx              Every game phase, rendered from the server snapshot
  hooks/useRoom.ts            Adaptive polling
  lib/client.ts               Typed API client and session storage
  components/                 Player chips and the winner splash
scripts/        dev-server.ts — runs the real handlers locally, no Redis
tests/          Engine, packs, and Redis-store tests
```

The important split is `lib/` versus `api/`. The engine never imports React or
anything HTTP-specific, so every rule is unit-testable without a server, and the
route files stay thin.

---

## Local development

Requires Node 20 or newer.

```bash
npm install
```

There are two ways to run it.

### 1. Full stack, one command (recommended)

This builds the client and serves both the frontend and the real API handlers
from one process, using an in-memory store. No Redis needed.

```bash
npm run build
npm run dev:server
```

Open <http://localhost:12000>. Rooms live in memory, so they reset when the
process stops.

### 2. Vite dev server with hot reload

```bash
npm run dev
```

This serves the client with hot reload but **not** the API, so the game itself
will not function. Use it for pure UI work. To play, use option 1.

### Checks

```bash
npm run typecheck   # tsc --noEmit
npm test            # engine, packs, and store tests
npm run build       # typecheck, then production bundle
```

---

## Deploying to Vercel

### Step 1 — Push the repository

```bash
git add -A
git commit -m "Optimised party game build"
git push origin main
```

### Step 2 — Import the project

1. Go to <https://vercel.com/new>.
2. Select the `who-is-more-likely-to` repository.
3. Vercel detects Vite from `vercel.json`. Leave the build settings alone:
   - Build command: `npm run build`
   - Output directory: `dist`
4. Click **Deploy**.

The first deploy works, but rooms will not persist between requests, because
each serverless invocation gets its own memory. Do Step 3 to fix that.

### Step 3 — Add Upstash Redis (required for real play)

Vercel functions are ephemeral and scale horizontally. Without a shared store,
two players can land on different instances and see different rooms.

1. In the Vercel dashboard, open your project.
2. Go to **Storage** → **Create Database** → **Upstash Redis**.
3. Choose a region close to your players and create it.
4. Click **Connect Project** and select this project for **all** environments.
5. Redeploy (Vercel usually triggers this automatically).

This injects `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. The store
switches to Redis automatically when both are present — there is no code change
and no flag to flip.

To confirm it took effect, open a room, then check the function logs: a Redis
store logs no in-memory warning, and rooms survive a new deployment.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `UPSTASH_REDIS_REST_URL` | Yes, for production | Shared room storage |
| `UPSTASH_REDIS_REST_TOKEN` | Yes, for production | Auth for the above |

Set them by hand under **Settings → Environment Variables**, or with the CLI:

```bash
vercel env add UPSTASH_REDIS_REST_URL
vercel env add UPSTASH_REDIS_REST_TOKEN
```

### Deploying from the CLI instead

```bash
npm i -g vercel
vercel          # preview deployment
vercel --prod   # production deployment
```

### Preview deployments and deployment protection

If your preview URLs require a Vercel login, that is deployment protection.
To let an automated check reach a protected preview, add a bypass secret under
**Settings → Deployment Protection → Protection Bypass for Automation**, then:

```bash
curl -H "x-vercel-protection-bypass: $SECRET" https://your-preview-url.vercel.app
```

Or disable it for previews only, by setting **Vercel Authentication** to
*Only Production Deployments*.

---

## How to play

1. One person opens the site and enters their name.
2. They optionally tap the pack button to pick a question pack, or choose
   **Write your own** and type their questions, one per line.
3. They tap **Create a room** and read the 4-character code out loud.
4. Everyone else opens the same site, taps **I have a code**, and enters the
   code and their name. Each player needs their own phone.
5. Once at least 3 players are in, the host taps **Start the round**.
6. The question appears on every screen. Talk it out.
7. The host taps **Open voting now**, or a 30-second timer opens it.
8. Everyone taps a name. Votes are secret, and you can change yours until the
   reveal. Tapping **Skip this one** abstains.
9. Voting closes by itself once everyone has voted. The host can also tap
   **Reveal now**.
10. The tally appears on every screen. If you won, your own phone fills with
    **YOU**.
11. The host taps **Next round**, or **Standings** to see the scores.

### Tips for a good game

- Play with 4 or more. Three works, but more names make the votes funnier.
- Read the question out loud before voting. Half the fun is the argument.
- Use **Work Mode** for team events. It is written to be safe in that setting.
- **After Hours** is for close friends only. Read the room before you pick it.
- The host can remove a player from the lobby with the **remove** button next to
  their name, and can end the whole game with **End game**.

---

## API reference

All rooms are addressed by a 4-character code. Anything that acts as a player
sends `Authorization: Bearer <token>`, where the token comes from creating or
joining a room.

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/packs` | — | Pack catalogue, cached for an hour |
| `POST` | `/api/rooms` | `{ hostName, packId?, customPrompts?, config? }` | Returns the room and the host's token |
| `POST` | `/api/rooms/:code/join` | `{ name }` or `{ token }` | New seat, or rejoin with a token |
| `GET` | `/api/rooms/:code` | — | Current snapshot for the calling player |
| `POST` | `/api/rooms/:code/actions` | `{ type, ... }` | Every mutation |

Action types: `startRound`, `openVoting`, `reveal`, `vote` (`targetId`, or
`null` to skip), `scoreboard`, `kick` (`playerId`), `leave`, `end`.

Reads are not free: a read settles any expired timer, so the room keeps moving
even if every phone is backgrounded and no client holds the clock.

### Room config

| Field | Default | Meaning |
| --- | --- | --- |
| `maxPlayers` | 12 | Seats per room (3–20) |
| `questionSeconds` | 0 | Discussion window; `0` means the host advances |
| `votingSeconds` | 30 | Voting window; `0` means the host advances |
| `selfVote` | false | Whether you may vote for yourself |
| `skipsAllowed` | true | Whether abstaining is allowed |

---

## Design notes

**The server owns the truth.** Clients send intents and render whatever snapshot
comes back. Scoring, eligibility, tie-breaking, and phase changes are decided in
one place, `lib/engine.ts`, so a modified client cannot change the outcome.

**Polling, not websockets.** Vercel functions cannot hold a long-lived socket,
so a socket server would be an extra moving part to host and pay for. Adaptive
polling — about 1.1s while a round is live, 3s in the lobby — is
indistinguishable from realtime for a turn-based party game, costs one small
JSON response per tick, and survives every cold start. A revision counter means
the client only re-renders when something actually changed.

**Sessions persist locally.** The session token is kept in `localStorage`, which
is the client half of the rejoin contract the server already supports. A locked
phone is a non-event.

**Writes are serialised per room.** Every mutation runs under a per-room lock and
is persisted before the response is sent, so two simultaneous votes cannot
clobber each other. On Redis the lock is a short-lived key with an atomic
compare-and-delete release.

**Tokens never leak.** The player's session secret is excluded from every
broadcast, and the running tally is withheld until the reveal, so nobody can
snipe a vote at the last second.

---

## License

Released for personal and party use.
