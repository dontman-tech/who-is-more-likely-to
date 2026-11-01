# Who Is Most Likely To

A party game for phones. Everyone joins with a room code, one question lands on
every screen, votes are secret, and the winner's own phone flashes **YOU**.

Built with React, Vite, and TypeScript, with the realtime API as Vercel Node
functions. It runs for free: no database is required, and the recommended setup
uses Upstash's free tier, which needs no credit card. See
[Deploying — free, with no card](#deploying--free-with-no-card).

---

## What it does

- **Room codes.** One person creates a room, picks a question pack, and reads out
  a 4-character code. Codes skip look-alike glyphs (no `0/O`, `1/I/L`) so they
  are easy to say out loud.
- **One question, every screen.** Prompts advance from the host's phone, and
  every device renders the same question at the same time.
- **Secret voting.** Votes are hidden until the reveal. Nobody can see who
  picked whom, and the running tally is withheld until the round ends.
- **A live countdown.** Timed phases show the seconds remaining on every screen.
  The timer is computed from the server's clock, so a phone with the wrong time
  still counts down correctly.
- **The vote map.** At the reveal you can see who voted for whom — including who
  skipped. A host who would rather not know can switch it off in house rules.
- **House rules.** Seats, discussion time, voting time, self-voting, skipping,
  and vote visibility are all settable before the room is created.
- **The YOU splash.** Only the winner's device shows the full-screen `YOU`
  moment, so the payoff stays personal instead of being a label everyone sees.
- **Clean leaving.** Leave or get removed and your name, your seat, and your
  vote all disappear. If too few players remain, the room falls back to the
  lobby rather than starting a broken round.
- **Survives a locked phone.** A refresh, a background tab, or a phone lock does
  not cost you your seat or your vote. The session is restored from local
  storage on the next visit.
- **A risograph look.** Cream paper, flat saturated inks, thick black keylines,
  and hard offset shadows that sit beside a shape the way ink sits beside a
  screen print. The winner's `YOU` is drawn three times and deliberately
  misregistered, like a cheap print job.

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
  store.ts                    RoomStore: memory by default, Redis when configured
  server.ts                   Lock / persist / validate / error helpers
  types.ts                    Domain and public (wire) types
src/            React client
  pages/Home.tsx              Create or join, pack picker, custom pack editor
  pages/Room.tsx              Every game phase, rendered from the server snapshot
  hooks/useRoom.ts            Adaptive polling
  lib/client.ts               Typed API client and session storage
  components/                 Player chips and the winner splash
scripts/        serve.ts — runs the real handlers locally and in production
tests/          Engine, packs, store, and read-path tests
Dockerfile      Zero-database deployment (see below)
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
npm run serve
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

## Deploying — free, with no card

Rooms have to live somewhere both players and the server can reach. There are
three ways to do that, all of them $0. Pick the first one unless you have a
reason not to.

| Option | Cost | Card needed | Rooms survive restart? | Best for |
| --- | --- | --- | --- | --- |
| **A. Free Upstash Redis + Vercel** | $0 | No | Yes | Recommended. Zero setup cost, survives deploys. |
| **B. Vercel alone** | $0 | No | No | Trying it out; single-instance traffic. |
| **C. Docker on any free host** | $0 | No | No (yes with Redis) | You want one process you control. |

### Why a store is needed at all

Vercel runs each request in a function that may be a fresh, separate instance.
If rooms only lived in one instance's memory, two players in the same room could
be routed to different instances and see different games. A shared store fixes
that. `lib/store.ts` picks one automatically:

- both `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` set → Redis
- otherwise → in-memory, which is correct for a single process

There is no flag to flip and no code change. Setting the two variables is the
whole switch.

---

### Option A — Vercel + free Upstash Redis (recommended)

Upstash's free tier is genuinely free: **500,000 commands per month**, 256 MB,
and **no credit card**. You only need to add a card if you choose to upgrade.

**1. Create the database.**

Easiest: in the Vercel dashboard, open your project and go to
**Storage → Create Database → Upstash Redis**, then **Connect Project** and
select this project for all environments. Vercel injects both variables for you.

Or create it directly at <https://console.upstash.com> → **Create Database**,
choose the region closest to your players, and copy the REST URL and token.

**2. Add the variables.**

```bash
vercel env add UPSTASH_REDIS_REST_URL
vercel env add UPSTASH_REDIS_REST_TOKEN
```

Or paste them under **Settings → Environment Variables**. Set them for
Production, Preview, and Development.

**3. Redeploy.**

```bash
vercel --prod
```

**4. Confirm it worked.** Create a room, then check the function logs. The
server prints which store it chose at startup. Rooms now survive redeploys.

#### Staying inside the free tier

The free tier is counted in commands, not requests, so the design keeps command
usage low on purpose:

- **Reads do not write unless something changed.** A poll that finds nothing new
  costs one read and zero writes. This is enforced by `withRoomRead` in
  `lib/server.ts` and covered by `tests/read-path.test.ts`.
- **Idle polls skip the lock.** The common case is a single `GET`. A
  lock-and-write cycle costs four commands, so avoiding it is the main saving.
- **Presence is recorded at most once per player per 10 seconds**, not on every
  poll. Because of this, faster polling is actually *cheaper per poll* — the
  writes amortise over more reads.
- **Hidden tabs stop polling.** A phone in a pocket stops spending commands, and
  refreshes once when it comes back.
- **Rooms expire after 6 hours** of inactivity, in memory and in Redis.

Measured against a real Upstash database, with four players:

| Situation | Commands | Per poll |
| --- | --- | --- |
| Setting up a room (create + 3 joins) | 13 | — |
| Idle lobby, polling every 3s for 60s | 165 | 2.1 |
| A live voting round, polling every 1.1s for 30s | 167 | 1.6 |

A live round runs at roughly 20,000 commands per hour. A typical evening — say
twenty rounds over twenty minutes — lands around 7,000 commands, so the free
tier's 500,000 per month covers on the order of **70 game sessions**. That is
plenty for a party game; the limit is not something you will hit by accident.

If you ever do approach it, raise the polling interval in
`src/hooks/useRoom.ts` (the `1100` and `3000` values).

---

### Option B — Vercel alone, no database

If you just want to try it, deploy to Vercel and skip the store. This works, but
with an important caveat: because each request may hit a different instance,
players can occasionally fail to see each other. Fine for a solo demo, not for
a real party.

Set **nothing**. The store falls back to memory. Rooms vanish on redeploy.

---

### Option C — Docker, one process, no database

Any host that keeps a Node process alive will do. One process means the
in-memory store is shared by every request, so the game is fully correct with no
database at all.

```bash
docker build -t who-is-more-likely-to .
docker run -p 12000:12000 who-is-more-likely-to
```

Open <http://localhost:12000>. To keep rooms across restarts, pass the two
Upstash variables with `-e`; the container switches to Redis on its own.

Without Docker:

```bash
npm ci
npm run build
npm start
```

Hosts that keep a process alive on a free plan include Railway, Render,
Fly.io, and a plain VPS. Set `PORT` if the host requires a specific one.

---

### Deploying to Vercel from scratch

**1. Push the repository.**

```bash
git add -A
git commit -m "Optimised party game build"
git push origin main
```

**2. Import the project.** Go to <https://vercel.com/new>, select the
repository, and let Vercel read `vercel.json`. Leave the build settings alone:
build command `npm run build`, output directory `dist`. Click **Deploy**.

**3. Add a store** if you want rooms to persist. See Option A above.

### Deploying from the CLI

```bash
npm i -g vercel
vercel          # preview
vercel --prod   # production
```

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `UPSTASH_REDIS_REST_URL` | No | Shared room storage. Omit for single-process use. |
| `UPSTASH_REDIS_REST_TOKEN` | No | Auth for the above. |
| `PORT` | No | Port for `npm start` / Docker. Defaults to 12000. |

Both Redis variables must be set together. Setting only one is treated as "no
store configured" and falls back to memory.

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
| `revealVotes` | true | Show who voted for whom at the reveal |

All six are settable from the **House rules** panel before creating a room, and
the panel is a thin wrapper over this same config — there is no second source of
truth.

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
the client only re-renders when something actually changed. Polling stops while
the tab is hidden, so a phone in a pocket costs nothing.

**Reads are cheap by design.** A poll can advance a timer, so a read is allowed
to change the room — that is what keeps the game moving when phones are
backgrounded. But it only writes when something actually changed, and skips the
lock entirely when nothing did. An idle poll is a single read. This is what
keeps a real game inside the free command budget.

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

**Timers trust the server.** A snapshot carries both the deadline
(`phaseEndsAt`) and the server's own clock (`serverNow`). The client renders
`phaseEndsAt - serverNow` and applies the offset between the two clocks, so a
phone whose time is wrong — or a laptop that slept through the round — still
shows the real seconds remaining. The ticker runs locally between polls, so the
number moves without spending a request per second.

**Presence is honest.** A player who stops polling is marked disconnected after
20 seconds and their chip dims, but they stay in the room and stay eligible.
Their votes are not thrown away because their screen slept.

**The store is pluggable.** `lib/store.ts` exposes one small interface with two
implementations, in-memory and Redis, chosen from the environment. The engine
never knows which is in use, so the game runs with no database at all, and
gaining persistence is two environment variables rather than a rewrite.

---

## License

Released for personal and party use.
