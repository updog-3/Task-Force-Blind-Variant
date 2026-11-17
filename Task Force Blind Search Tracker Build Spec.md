# Task Force Blind Search Tracker: Build Spec

Nov 16, 2026 · @Owen

The app is a referee for hidden Task Forces in an in-person, two-player game of *Task Force: Carrier Battles in the Pacific*. It holds each side's hidden positions, resolves hidden movement, contact and searches, and leaves everything else to the physical board. Version 1 targets the Midway map.

This spec replaces the Nov 9 design doc. It is written to be handed to Claude Code as the build brief.

## Summary and scope

The variant is the scenario book's blind game (section 12.4) with the app as referee and no dummy markers.

**The one rule that shapes everything:** a Task Force is tracked in exactly one place. While hidden it lives only in the app. Once it is sighted or revealed it lives only on the physical board, and the app stops tracking its position until the dusk reset.

**In scope**

- Sessions for two seats, with no accounts.
- Setup: each side places its Task Forces by number.
- Hidden movement, drafted privately and resolved in initiative order, with night splits and merges.
- Contact detection between hidden Task Forces, and manual reveals.
- Zone searches with a shared 54-chit cup, including re-searching markers already on the board.
- A special search for scenario rules such as Midway's night PBY search.
- The dusk reset, a log, and a full reveal at game end.

**Out of scope**

- Fleet composition, aircraft, combat, damage and victory points; these stay on the paper sheets and the board.
- Air raids. A raid may only target a sighted marker (rulebook 4.3.1), and sighted markers are on the board, so the app runs nothing for raids.
- Scenario rules: setup zones, movement restrictions, victory conditions. Players follow the scenario book.
- Positions of anything on the physical board.
- Remote play, accounts, lobbies.
- Coral Sea and Eastern Solomons maps, which need terrain data.

## Stack and project layout

One Node/TypeScript process serves the client, holds all game state and pushes updates over WebSockets. It runs on a laptop on the same Wi-Fi as both players' devices.

- **Runtime:** Node 20 or later, TypeScript throughout, one `npm start`. On start, print the LAN URL for the other device to open.
- **Server:** an HTTP server for the static client and session creation, plus the `ws` library for live updates.
- **Storage:** SQLite through `better-sqlite3`. Store each session as one JSON state blob plus an append-only log table. Save after every accepted action, so a restart loses nothing.
- **Client:** React with Vite. The map is the image with an SVG hex overlay on top. It must work on a phone in portrait and on a laptop.
- **Rules engine:** a pure TypeScript package with no I/O, shared types, and an injectable random source. All rules run on the server; the client only drafts orders and displays its seat's view.
- **Randomness:** `crypto.randomInt` in production, a seeded generator in tests.
- **Secrecy:** the server builds a separate view per seat and never sends the other side's hidden data. Whoever runs the server could read the database; players accept this.
- **Map art:** images are read from a local `maps/` folder that is git-ignored. They belong to VUCA and must not be committed or published.

**Suggested layout**

```
/rules      hex.ts, turnTable.ts, movement.ts, contact.ts, recon.ts, cup.ts, view.ts
/server     index.ts, sessions.ts, store.ts, protocol.ts
/client     React app
/maps       midway.json (committed), midway.png (git-ignored)
/tests      rules and view-filter tests (Vitest)
```

**Feature flags** (per session, set at creation, defaults shown)

| Flag | Default | Effect |
| --- | --- | --- |
| `enforceTransports` | off | Adds a "has transports" flag per Task Force and limits flagged ones to 1 hex, and to 0 hexes on even day turns |
| `cupEmpty` | `reshuffle` | When the cup is empty, reshuffle all 54 chits. The alternative, `noContact`, makes every further draw read No Contact |
| `defaultZones` | IJN 2, Allies 3 | Starting zone count per carrier, editable per Task Force at setup (scenario book 12.4.1) |

## Sessions and seats

Anyone can create a session, and the two seat links are the only credentials.

1. **Create.** The creator picks a map, a starting turn (1–24) and a side (IJN or Allies). The server returns the creator's seat link and an invite link for the other side.
2. **Join.** The invite link claims the other seat on first open. Each seat stores its token in the browser, so reopening the link on the same device resumes the seat.
3. **Recover.** Either player can re-issue a seat from the menu. The old token stops working and both players see a notice, so it can't happen silently.
4. **Clean up.** Sessions with no activity for 30 days are deleted on server start.

A seat that reconnects gets its full current view, so a refresh or a dropped connection is harmless.

## Game states and turn table

The game is a strict state machine: every state ends when both players confirm, and the server alone advances it.

1. **Waiting.** The creator sees the invite link and a prompt to set up their paper fleet and aircraft sheets. Ends when the second seat joins.
2. **Setup.** Both players place Task Forces and register search sources. Ends when both press **Setup complete**.
3. **Turn N, Naval Movement.** Draft, lock, resolve, then acknowledge contacts. Ends when both press **Movement complete**.
4. **Turn N, Board phases.** Naval Combat and Aircraft Operations happen on the physical board. The app stands by, offering only manual reveals and the on-board list. Ends when both press **Go to Reconnaissance**, or **End turn** on turns without recon.
5. **Turn N, Reconnaissance.** Only on turns the table allows. Draft zones, lock, resolve. Ends when both press **End turn**.
6. **Turn N, Administrative.** Automatic. Runs the dusk reset on turns 10 and 22, returns night-turn chits to the cup, advances the turn and flips initiative. Play returns to state 3.
7. **Ended.** One player requests the end and the other confirms. Both then see everything.

The first turn is the starting turn chosen at creation; there is no turn 0. The app does not know when a scenario ends, so players end the game themselves.

**Turn table.** This is the app's only rules data and matches the printed turn track.

| Turns | Period | Move (hexes) | Transports move | Recon | Splits |
| --- | --- | --- | --- | --- | --- |
| 1–2 | Night | 2 | Yes | No | Yes |
| 3–8 | Day | 1 | Odd turns only | Yes | No |
| 9–10 | Day | 1 | Turn 9 only | No | No |
| 11–14 | Night | 2 | Yes | No | Yes |
| 15–20 | Day | 1 | Odd turns only | Yes | No |
| 21–22 | Day | 1 | Turn 21 only | No | No |
| 23–24 | Night | 2 | Yes | No | Yes |

- **Initiative:** IJN on odd turns, Allies on even turns.
- **Merges:** allowed on every turn.
- **Dusk reset:** runs in the Administrative state of turns 10 and 22.
- **Reminders:** the turn header shows the transport rule for the turn, and that raids are barred at night and on turns 10 and 22. These are text only unless `enforceTransports` is on.

## Setup

Each player places their Task Forces by number on their own private map; nothing about placement is enforced.

- **Numbers.** TF 1–6 are always Carrier Task Forces and TF 7–13 are always Fleet Task Forces. Each number can be used once per side.
- **Placing.** Pick a number, then tap a hex. Any number of Task Forces may share a hex. A placed Task Force can be moved or removed until setup is complete.
- **Scenario placement rules.** Players follow the scenario book for start lines and zones. The app shows a reminder and checks only that the hex exists on the map.
- **Zone counts.** Each carrier Task Force gets a search zone count, prefilled from `defaultZones` and editable.
- **Land bases.** The map lists its bases with an owner. Each has a zone count, prefilled to 0 on Midway, because the Midway base does no regular recon (scenario 6.5.2).
- **Transports.** If `enforceTransports` is on, each Task Force has a "has transports" checkbox.
- **Finish.** Each player presses **Setup complete**. A player can undo this until the other has also pressed it. When both have, play starts at Naval Movement of the starting turn.

## Naval Movement

Both players draft hidden moves privately, and the server resolves them in initiative order, as the rulebook does.

**Task Force status.** Every Task Force is in one of four states, and only hidden ones have a hex in the app.

| Status | Where it lives | Meaning |
| --- | --- | --- |
| Hidden | App | Position known only to its owner and the server |
| Reported | Board | Sighted by a search; marker is flag side up with a Carrier or Fleet Report marker |
| Revealed | Board | Marker is numbered side up after contact, a block, a raid or naval combat |
| Gone | Nowhere | Sunk, withdrawn, absorbed in a merge, or off the map |

**Order within the phase**

1. Players move their on-board markers on the physical board, initiative player first.
2. Each player drafts arrangements and hidden moves in the app, then ticks **Movement complete** to lock. A lock can be undone until the other player has also locked.
3. When both have locked, the server resolves the turn (below) and shows each player their results.
4. Both players acknowledge any contact notices and place those markers on the board.
5. A prompt reminds each player to compare their hidden Task Forces with enemy markers on the board and declare any contact by hand.

**Drafting moves**

- Tap a hex to list your hidden Task Forces there, then pick one and tap its path, one hex per tap.
- A path has at most 1 step on day turns and 2 on night turns. Each step must be to an adjacent hex on the map. Staying put is allowed.
- From an edge hex, a step may leave the map. The Task Force becomes Gone, and both players are told that a Task Force of that side left the map, without its number.
- With `enforceTransports` on, a flagged Task Force is limited to 1 step, and to 0 steps on even day turns.
- The app does not know where board markers are. Players must not draft a hidden move into a hex holding an enemy marker.

**Splits and merges**

These are numbering changes; the ships themselves move on the paper fleet sheet.

- **Split (night turns only).** Choose a hidden Task Force and a free number from 7–13. The new Task Force appears in the same hex and gets its own move this turn. A combined Task Force can instead split back into its original numbers.
- **Merge (any turn).** Choose two hidden Task Forces in the same hex and which number to keep. By default the other is absorbed and becomes Gone, freeing its number. "Keep both formations" instead combines them under one marker (rulebook 3.7.1).
- **Limits.** A Carrier Task Force cannot be absorbed into a Fleet Task Force, and two Carrier Task Forces can only combine.
- **Type.** A Task Force reports as a carrier if it is TF 1–6 with its carrier present, or is combined with one that is.
- **Checklist on lock.** The app lists each change, such as "TF 9 split off from TF 3", so the paper sheet gets updated to match.

**Resolution**

The server applies these steps in order when both players have locked.

1. Apply both sides' splits and merges.
2. Move the initiative player's Task Forces, in number order, one step at a time. A step into a hex that holds an enemy hidden Task Force is blocked: the Task Force stops where it is and loses the rest of its move. The enemy has not moved yet, so this checks enemy starting hexes.
3. Move the second player's Task Forces the same way. This checks the initiative player's final hexes.
4. Passing through a hex the enemy has left, or will later enter, is legal. Friendly Task Forces never block each other.
5. A blocked Task Force's owner is told it stopped short and where. It will be adjacent to the blocker, so the contact check below reveals both.

**Contact check**

- After movement, any two opposing hidden Task Forces in adjacent hexes are in contact. Both become Revealed.
- A hidden Task Force in the hex of an enemy land base also becomes Revealed.
- Both screens show each contact with Task Force numbers and hexes. Players place the markers numbered side up and tap **Placed**.
- The adjacency check goes through one function that later maps can extend with blocked hexsides. Midway has none.

**Manual reveals**

A hidden Task Force's owner can reveal it at any time, choosing a reason. The opponent sees its number, hex and the reason, and the status becomes Revealed.

| Reason | When to use it |
| --- | --- |
| Contact | It is adjacent to an enemy marker on the board |
| Blocked | An enemy board marker tried to move into its hex |
| Raided | It shares a hex with a friendly marker that is being raided (rulebook 4.3.2) |
| Voluntary | Any other reason |

**On-board list**

Each player has a list of their Reported and Revealed Task Forces, without positions, so the app's register stays in step with the board.

- Mark a Reported Task Force as Revealed when a raid or naval combat flips its marker.
- Mark a Task Force as Gone when it is sunk, withdraws, or leaves the map.
- Record a merge or a night split done on the board, so numbers are freed or taken correctly.
- Update the "carrier present" flag if a carrier is sunk.

## Reconnaissance

A search covers a zone of seven hexes and draws one chit for the whole zone; the chit decides whether everything in the zone is reported truthfully, reported with types swapped, or missed.

**The cup**

- The cup holds chits numbered 1–54: 1–30 are Detected, 31–42 are Misdirect, 43–54 are No Contact.
- Both sides draw from the same cup. A drawn chit stays out until the cup refills.
- The cup refills to 54 at the dusk reset (end of turns 10 and 22) and at the end of every night turn.
- If the cup is empty, apply the `cupEmpty` flag.
- Every draw is logged with its chit number.

**Sources and zones**

- A source is a Carrier Task Force with its carrier present that was not Gone at the start of the turn, or a land base with a zone count above 0.
- Each source may place up to its zone count. Placing fewer, or none, is allowed.
- A zone is a center hex plus its six neighbors. The center must be a map hex within 8 hexes of its source. Neighbors that fall off the map are dropped.
- For a hidden source, the server measures range from its hex. For a source on the board, the searcher enters its current hex, which the opponent can already see.
- Each zone has a checkbox, **Includes board markers**. The searcher ticks it when the zone covers enemy markers on the board that they want re-searched.

**Phase order**

1. Both players draft their zones and lock.
2. For each ticked zone, the marker owner sees the zone and taps which of their Reported Task Forces are inside it. Revealed ones are not offered, since their identity is already known. The owner answers before any result is shown.
3. The server resolves the initiative player's zones in the order drafted, then the second player's.
4. Both players see their results and press **End turn**.

**Resolving one zone**

1. Draw one chit, even if the zone turns out to be empty.
2. Collect the targets: enemy hidden Task Forces in the zone's hexes. If the zone is ticked, add the Reported Task Forces the owner tapped, plus any that were sighted earlier this phase and sit in the zone.
3. Apply the chit to all targets at once.

| Chit | Hidden targets | Reported targets (ticked zones only) |
| --- | --- | --- |
| No Contact | Stay hidden; searcher is told "No contact" | No change; a sighting is never downgraded |
| Detected | Each is sighted with its true type | Each shows its true type |
| Misdirect | Each is sighted with its type swapped, subject to the cap | Each shows its swapped type, subject to the cap |

**The Misdirect cap**

A Misdirect must stay plausible, so it never reports more carriers than could really be in the zone.

- Every true carrier among the targets reports as a Fleet.
- The cap is the owner's hidden Carrier Task Forces anywhere on the map, plus their Reported Carrier Task Forces among this zone's targets.
- If the zone holds F true fleets, then min(F, cap) of them, chosen at random, report as Carriers. The rest report as Fleets.
- The cap is computed once per zone, before any target changes status.

**What each player sees**

- **Hidden target sighted.** It becomes Reported. The searcher sees its hex and reported type, never its number. The owner is told to place that Task Force flag side up at its hex with the matching Report marker, and to say so if it holds only one ship.
- **Reported target.** The owner is told what each tapped Task Force should now show, for example "TF 3: Carrier report. TF 8: Fleet report". On No Contact the owner is told "No change".
- **Searcher, ticked zone.** The screen lists any new sightings and says the opponent will update board markers if needed. It never says which chit was drawn.
- **Searched side, otherwise.** A player learns nothing about enemy zones that were not ticked and sighted nothing.

**Overlapping zones.** A Task Force sighted by an earlier zone in the same phase is ignored by later unticked zones. A later ticked zone that covers its hex includes it automatically and can change its report.

**Worked examples.** In each, the IJN has hidden carriers TF 1 and TF 2 and hidden fleets TF 7, TF 8 and TF 9 unless stated.

| Zone contains | Chit | Cap | Result |
| --- | --- | --- | --- |
| TF 7, TF 8, TF 9 (hidden) | Misdirect | 2 | Two of the three, picked at random, are sighted as Carriers; the third as a Fleet |
| TF 1, TF 7 (hidden) | Misdirect | 2 | TF 1 sighted as a Fleet, TF 7 as a Carrier |
| TF 1, TF 7 (hidden) | Detected | n/a | TF 1 sighted as a Carrier, TF 7 as a Fleet |
| TF 7, TF 8 (hidden); TF 1 and TF 2 are on the board elsewhere | Misdirect | 0 | Both sighted as Fleets |
| TF 1 (Reported, showing Fleet), zone ticked | Detected | n/a | Owner told: TF 1 shows Carrier |
| TF 1 (Reported, showing Carrier), zone ticked | No Contact | n/a | Owner told: no change |
| TF 7 (Reported, showing Fleet), zone ticked; TF 1 and TF 2 Reported elsewhere | Misdirect | 0 | TF 7 still shows Fleet |
| Empty zone | Any | n/a | "No contact"; the chit is still spent |

## Special search, dusk reset and end of game

These three cover everything outside the normal turn loop.

**Special search**

This tool handles scenario searches that break the normal rules, such as Midway's night PBY search on turns 1 and 2 (scenario 6.5.2).

- It is offered to both players at the end of the Board phases on every turn. Players decide from the scenario book when it is allowed.
- The searcher picks a center hex and a radius. For Midway's PBY search that is hex 1409 and radius 8.
- The server draws one chit for each enemy hidden Task Force within the radius. This follows the scenario rule, not the zone rule.
- Detected or Misdirect: the searcher is told "Fleet sighted" with the hex and no type. The Task Force becomes Reported, and its owner places it flag side up with either Report marker.
- No Contact: the Task Force stays hidden and the searcher is told nothing about it.
- Board markers are not affected.
- Both players get a notice that a special search was run, with its center and radius, and it is logged.

**Dusk reset**

At the end of turns 10 and 22, every Task Force on the board goes back into the app.

1. Each player sees a list of their Reported and Revealed Task Forces.
2. For each one, the owner enters its current hex from the board, confirms the carrier is still present for TF 1–6, and marks any that are Gone.
3. Both players press **Dusk complete**. Those Task Forces become Hidden and their markers come off the board.
4. The cup refills and the next turn begins.

Withdrawing ships outside a Task Force stay on the board and are never tracked.

**End of game**

- Either player requests the end and the other confirms.
- Both screens then show every Task Force's final status and hex, and the full log from both sides, including every chit drawn and every zone searched.
- Players use this to check setup, moves and victory conditions against the scenario book.

## Data model and visibility

State stays small because fleet composition lives on paper and board positions live on the board.

| Entity | Fields |
| --- | --- |
| Session | id, map id, starting turn, current turn, state, flags, cup (remaining chit numbers), seat tokens (hashed), created and last-active times |
| Task Force | side, number (1–13), status (hidden, reported, revealed, gone), hex (hidden only), carrier present (TF 1–6), has transports, combined with (numbers), zone count, shown report (carrier, fleet or untyped; reported only) |
| Land base | side, hex, zone count |
| Movement order | side, turn, splits, merges, moves (Task Force and path), locked |
| Search order | side, turn, zones (source, source hex if on board, center, includes board markers), locked |
| Board pick | zone, the Reported Task Forces the owner tapped |
| Search result | zone, chit number, cap used, each target with true type and reported type |
| Log entry | sequence, turn, state, side, action, detail, visibility (own side, both, or end of game) |

**Derived, not stored:** initiative, day or night, move allowance and recon eligibility all come from the turn table. A Task Force's type comes from its number, its carrier flag and what it is combined with.

**What each seat receives**

| Data | Own seat | Opponent |
| --- | --- | --- |
| Hidden Task Force numbers and hexes | Yes | Never before the end |
| Count of hidden Task Forces | Yes | Never before the end |
| Draft and locked orders | Yes | Only whether they are locked |
| Reported Task Force | Number, last hex, shown report | Hex and shown report at the moment of sighting |
| Revealed Task Force | Number | Number, hex and reason at the moment of reveal |
| Search zones placed | Yes | Only ticked zones, and only to pick board markers |
| Chit drawn | Never before the end | Never before the end |
| Log | Own entries and shared notices | Shared notices only |

The view filter is one pure function, `viewFor(state, side)`, and is the only path from state to the network.

## Maps and hex grid

A map is a data file plus an image, so adding a map later needs no new code beyond terrain support.

**Numbering and distance**

- Hexes are flat-topped and numbered column then row, so 2011 is column 20, row 11.
- Even printed columns sit half a hex lower than odd ones. Hex 2011 touches 2010, 2012, 1911, 1912, 2111 and 2112.
- Distance uses cube coordinates:

```typescript
// printed number 2011 -> col 20, row 11
function toCube(col: number, row: number) {
  const q = col - 1, r = row - 1;
  const z = r - (q - (q & 1)) / 2;
  return { x: q, y: -q - z, z };
}
const dist = (a, b) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
```

**Midway data** (`maps/midway.json`)

| Field | Value |
| --- | --- |
| Columns | 01–29 |
| Rows, odd columns | 02–19 |
| Rows, even columns | 01–19 |
| Total hexes | 536 |
| Land bases | Midway, hex 1409, Allied |
| Terrain | None |
| Image | `midway.png`, the file supplied as `6_Midway.png` |

- An edge hex is any hex with fewer than six neighbors on the map. Task Forces may exit only from edge hexes.
- The printed IJN and USN start lines are for the players' reference and are not encoded.

**Grid calibration**

- Hex centers follow `x = x0 + (col - 1) * dx` and `y = y0 + (row - 1) * dy`, plus `dy / 2` for even columns.
- Include a small calibration page: the user taps the centers of hexes 0201, 2801 and 0219, and the page solves for `x0`, `y0`, `dx` and `dy`.
- Store the four values in the map file as fractions of the image's width and height, so any image resolution works.
- After calibrating, draw the overlay with hex numbers so the user can check it against the printed numbers.

**Later maps.** Coral Sea runs from 0101 across 33 columns, and Eastern Solomons uses Midway's layout with north to the left. Both need land hexes and blocked hexsides for contact checks, which is why they are not in version 1.

## Screens

There is one main game screen whose lower panel changes with the state, plus a home page and a few overlays.

| Screen | Shows | Main actions |
| --- | --- | --- |
| Home | Create form: map, starting turn, side, flags | Create session; open a seat link |
| Waiting | Invite link, prompt to set up paper sheets | Copy link |
| Setup | Private map, list of numbers 1–13, zone counts, land bases | Place, move, remove; Setup complete |
| Movement | Header, private map with hidden Task Forces, hex list, draft paths | Move, Split, Merge, Reveal; Movement complete |
| Board phases | Header, private map, reminder to check contacts against the board | Reveal; Special search; Go to Reconnaissance or End turn |
| Recon | Map with zones drawn, source list with zones left | Pick source, place zones, tick board markers; Lock; End turn |
| Board pick | The enemy's ticked zone, list of own Reported Task Forces | Tap those inside the zone; Confirm |
| Dusk | List of own Task Forces on the board | Enter hex, confirm carrier, mark gone; Dusk complete |
| End | Both sides' final positions and the full log | None |

- **Header.** Turn number, clock time, day or night, initiative side, current state, the turn's reminders, and whether the opponent has locked.
- **Hex list.** Tapping a hex lists your Task Forces there, since stacked tokens are hard to tap on a phone.
- **Notices overlay.** Contacts, sightings, reveals, blocked moves and special searches, each with a **Placed** or **OK** button. Unacknowledged notices block the state's confirm button.
- **On-board overlay.** The on-board list described under Naval Movement, reachable from every game state.
- **Map.** Pinch or scroll to zoom, drag to pan. Own hidden Task Forces show as numbered tokens. Enemy pieces are never drawn, because the board shows them.

## Build order and tests

Build the rules engine first and test it before any screen exists; the rules are where mistakes would spoil a game.

**Build order**

1. Rules package: hex math, Midway map data, turn table, cup.
2. Rules package: movement resolution, contact, recon resolution, special search, dusk reset, view filter. All with tests.
3. Server: sessions, seats, storage, WebSocket protocol, state machine.
4. Client: home, waiting, setup, and the calibration page.
5. Client: movement, notices, manual reveals, on-board list.
6. Client: recon, board pick, special search, dusk, end.
7. A scripted two-seat run through turns 1–11 of a Midway game as an end-to-end test.

**Tests the rules package must pass**

- [ ] Hex 2011 is at distance 1 from 2010, 2012, 1911, 1912, 2111 and 2112, and at distance 2 from 2110.
- [ ] Midway has 536 hexes; 0101 and 0120 are not on the map; 0201 and 2919 are.
- [ ] The turn table gives the right period, move allowance, recon flag and initiative for all 24 turns.
- [ ] Night move: the initiative player's Task Force stepping into a hex where an enemy starts is blocked and stops one hex short.
- [ ] Night move: the second player's Task Force stepping into a hex the initiative player ended in is blocked.
- [ ] Two Task Forces that swap hexes: the initiative player's is blocked, then the second player's is blocked by its new position.
- [ ] Passing through a hex the enemy vacated earlier in the same resolution is legal.
- [ ] Adjacent opposing hidden Task Forces are both Revealed; a hidden Task Force in an enemy base hex is Revealed.
- [ ] A split is rejected on day turns and when no number is free; absorbing a Carrier Task Force into a Fleet Task Force is rejected.
- [ ] A zone center 9 hexes from its source is rejected; 8 is accepted.
- [ ] Each row of the worked-examples table under Reconnaissance, with the chit forced.
- [ ] No Contact never changes a Reported Task Force's shown report.
- [ ] A Misdirect never reports more carriers than the cap, across 1,000 seeded runs.
- [ ] The cup never yields the same chit twice between refills, and refills at dusk and after night turns.
- [ ] The special search draws one chit per hidden Task Force in range and never reports a type.
- [ ] After the dusk reset, every Task Force that was on the board is Hidden at the entered hex.
- [ ] `viewFor` for one side never contains the other side's hidden hexes, hidden count, draft orders or chit numbers, in any state before the end.

**Decisions made while writing this spec**

These were not settled in discussion. Each is one line to change.

- [ ] **Empty cup reshuffles.** With seven or more carriers searching two or three zones each, 54 chits can run out around the fourth recon turn of a day. Reshuffling keeps searches meaningful; the `cupEmpty` flag switches it to No Contact.
- [ ] **Night chits return at the end of the turn**, as the printed turn track shows.
- [ ] **Zone counts default to IJN 2 and Allies 3 per carrier**, from the blind-game rule, and are editable at setup.
- [ ] **An exit from the map is announced** to both players without the Task Force number.
- [ ] **Ending the game needs both players to confirm**, to avoid an accidental full reveal.
- [ ] **Special search ignores board markers.**
