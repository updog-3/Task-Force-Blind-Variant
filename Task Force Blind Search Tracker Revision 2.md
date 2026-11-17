# Task Force Blind Search Tracker: Revision 2

Nov 16, 2026 · @Owen

A sighting no longer moves a Task Force to the board: it becomes a one-time, zone-level report, and the Task Force stays hidden in the app. Only contact and raids put a Task Force on the board. This document lists every change to make to the built app; anything not mentioned stays as in the original build spec.

## What changes and why

A Midway test showed zone searches were overpowered: nearly every Task Force was sighted in the first recon turn and then tracked on the board for the rest of the day. The fix follows the scenario book's blind-game rules (12.4) more closely.

| Area | Before | After |
| --- | --- | --- |
| Sighted Task Force | Becomes Reported and goes on the board with a Report marker | Stays hidden in the app and keeps moving hidden |
| Search report | Exact hex and type for each Task Force | Counts by type for the whole zone, with no hexes |
| Re-searching board markers | Ticked zones and a board-pick step | Removed |
| Misdirect cap | Hidden carriers plus Reported carriers in the zone | Hidden carriers only |
| Raids | Only against sighted markers on the board | Against any hex, with an adjacent-hex fallback, played on the board |
| Launching a raid | Not tracked | Reveals the launching Task Force |
| Special search | A general tool offered every turn | Replaced by an optional Midway PBY rule chosen at session creation |

**Still true:** a Task Force is tracked in exactly one place. It is in the app while hidden and on the board once revealed, until the dusk reset.

## Sightings

A zone search now tells the searcher how many Carrier and Fleet Task Forces are in the zone, and nothing else.

**Resolving one zone**

1. Draw one chit, even if the zone is empty. The cup rules are unchanged.
2. The targets are the enemy hidden Task Forces in the zone's seven hexes. Revealed Task Forces are on the board and are never targets.
3. Apply the chit.

| Chit | Report to the searcher |
| --- | --- |
| No Contact | "No contact" |
| Detected | The true count of Carrier and Fleet Task Forces in the zone |
| Misdirect | The count with types swapped, subject to the cap |

4. No Task Force changes status. Every target stays hidden at its hex.

**The Misdirect cap**

- Every true carrier in the zone is counted as a Fleet.
- The cap is the owner's hidden Carrier Task Forces anywhere on the map. Revealed carriers do not count.
- If the zone holds F true fleets, min(F, cap) of them are counted as Carriers and the rest as Fleets.

**What each player sees**

- **Searcher.** One line per zone, for example "Zone 1207: 1 Carrier Task Force, 2 Fleet Task Forces sighted". No hexes within the zone, no Task Force numbers, and never which chit was drawn. An empty zone and a No Contact read the same.
- **Owner.** A notice naming which of their Task Forces were sighted this turn, for example "TF 3 and TF 8 were sighted". It does not say what type was reported or where the zone was. It reminds the owner to tell the opponent if a sighted Task Force holds only one ship.
- **Sighting pins.** The searcher's map keeps each report as a zone outline labelled with its turn and counts. Pins are private to the searcher, can be toggled off, and last until the end of the game.

**Overlapping zones.** Each zone resolves on its own chit. A Task Force inside two zones can be reported by both, one, or neither.

**Worked examples.** In each, the IJN has hidden carriers TF 1 and TF 2 and hidden fleets TF 7, TF 8 and TF 9 unless stated.

| Zone contains | Chit | Cap | Report |
| --- | --- | --- | --- |
| TF 7, TF 8, TF 9 | Detected | n/a | 3 Fleets |
| TF 7, TF 8, TF 9 | Misdirect | 2 | 2 Carriers, 1 Fleet |
| TF 1, TF 7 | Detected | n/a | 1 Carrier, 1 Fleet |
| TF 1, TF 7 | Misdirect | 2 | 1 Carrier, 1 Fleet |
| TF 1 alone | Misdirect | 2 | 1 Fleet |
| TF 7, TF 8; TF 1 and TF 2 are Revealed on the board | Misdirect | 0 | 2 Fleets |
| TF 7 | No Contact | n/a | No contact |
| Empty zone | Any | n/a | No contact; the chit is still spent |

**Unchanged:** sources, zone counts, the 8-hex range, entering the hex for a source that is on the board, lock order, and initiative-first resolution.

## Raids

Raids are played entirely on the physical board; the app only reveals Task Forces and offers one lookup to help the defender.

**The rules players follow** (scenario book 12.4.2; the app shows these as a reminder in the Board phases and enforces none of them)

1. Roll for raid order as in the rulebook.
2. The attacker places aircraft on any hex in range. The rulebook's limit to sighted markers (4.3.1) no longer applies.
3. Launching reveals the launching Task Force. Its owner reveals it in the app with the reason "Launched raid" and places it on the board, where range is checked.
4. The defender reveals every hidden Task Force in the target hex, and the raid resolves against that hex.
5. If the target hex is empty, the defender reveals every hidden Task Force in the six adjacent hexes. The attacker picks one of those hexes to attack.
6. If nothing is in or next to the hex, the raid misses. The aircraft are spent and go to Landing.

**App change 1: new reveal reasons**

The manual reveal's reasons become Contact, Blocked, Raided, Launched raid and Voluntary. "Raided" now covers any Task Force exposed by an enemy raid, in the target hex or next to it.

**App change 2: raid check**

A private lookup for the defender, available during the Board phases.

1. The defender taps the raided hex and chooses **Raid check**.
2. The app lists their hidden Task Forces in that hex. If there are none, it lists those in the six adjacent hexes, grouped by hex. If there are none there either, it says "Nothing in or next to this hex".
3. A **Reveal all** button reveals every listed Task Force with the reason "Raided". The opponent gets the usual reveal notice with numbers and hexes.
4. The lookup alone sends nothing to the opponent. Each use is logged for the end-of-game review.

**Unchanged:** revealed Task Forces stay on the board until the dusk reset, and the on-board list still records Task Forces that are sunk, merged or gone.

## Midway PBY search (optional rule)

The PBY night search is a special rule of the Midway scenario (6.5.2), not of the Midway map, so it becomes an option chosen when the session is created.

**Choosing it**

- Each map's data file lists its optional rules. Midway lists one: "PBY night search (Midway scenario 6.5.2)".
- The create form shows a map's optional rules as checkboxes once that map is selected. All are off by default.
- A custom game on the Midway map simply leaves it off.

**Map data** (added to `maps/midway.json`)

```json
"optionalRules": [
  {
    "id": "midwayPby",
    "label": "PBY night search (Midway scenario 6.5.2)",
    "side": "allies",
    "turns": [1, 2],
    "center": "1409",
    "radius": 8
  }
]
```

**How it runs when enabled**

1. On turns 1 and 2, after the Board phases, the Allied player sees a **Run PBY search** button. It can be used once per turn and can be skipped.
2. The server draws one chit for each IJN hidden Task Force within 8 hexes of hex 1409.
3. Detected or Misdirect: the Allied player is told "Fleet sighted" with that Task Force's exact hex and no type.
4. No Contact: nothing is reported for that Task Force.
5. No Task Force changes status. The report is one-time and shows as a sighting pin on the Allied player's map.
6. The IJN player gets a notice naming which of their Task Forces were sighted.
7. Chits drawn return to the cup at the end of the turn, as for any night turn.

**The general special-search tool is removed.** The PBY option is the only search outside the Recon phase. Other scenarios' special searches can be added later as further entries in a map's `optionalRules`.

## Removals and data changes

Most of this revision is deletion: the Reported status and everything built to support it go away.

**Remove**

- The Reported status. Task Forces are now Hidden, Revealed or Gone.
- The "shown report" field and all Report-marker instructions to the owner.
- The **Includes board markers** checkbox on zones.
- The board-pick step and screen.
- The "mark as Revealed" action in the on-board list, since nothing is Reported any more.
- The general special-search tool and its screen.
- The rule that a later zone ignores a Task Force sighted earlier in the same phase.

**Change**

| Entity | Change |
| --- | --- |
| Session | Add `optionalRules`: the ids enabled at creation |
| Task Force | Status loses `reported`; drop the shown-report field |
| Search order | Drop the includes-board-markers field |
| Board pick | Delete the entity |
| Search result | Store the zone, chit number, cap used, each target's true type, and the Carrier and Fleet counts reported |
| Sighting pin (new) | Side, turn, kind (zone or PBY), center or hex, Carrier and Fleet counts or "Fleet sighted" |
| Map | Add `optionalRules` |
| Log | Add raid-check and PBY entries |

**View filter**

- A search result sent to the searcher holds only the zone and the reported counts. It must not hold Task Force numbers, hexes, true types or the chit.
- The owner's sighting notice holds only their own Task Force numbers.
- Sighting pins go only to the side that owns them.
- A raid check goes only to the player who ran it.

**Existing sessions** created before this revision can be discarded; no migration is needed.

**Dusk reset** is unchanged, except that it now only ever handles Revealed Task Forces.

## Screen changes

Five screens change and two are deleted.

| Screen | Change |
| --- | --- |
| Home | After a map is picked, show its optional rules as checkboxes, off by default |
| Board phases | Add the raid rules reminder; add **Raid check** to the hex list; add "Launched raid" to the reveal reasons; show **Run PBY search** to the Allied player on turns 1 and 2 when the option is on |
| Recon | Remove the board-markers checkbox; results read as counts per zone |
| Map (all game states) | Draw the player's own sighting pins, with a toggle to hide them |
| Notices | Replace "place this marker with a Report marker" with "these Task Forces were sighted"; add the single-ship reminder there |
| Board pick | Delete |
| Special search | Delete |

## Tests

Update the rules tests first, then the code, so the old behavior fails loudly before it is removed.

**Delete**

- Tests for Reported targets, ticked zones and the board pick.
- The test that No Contact never changes a Reported Task Force's shown report.
- Tests for the general special search.

**Add or change**

- [ ] After any zone search, every target is still Hidden at the same hex.
- [ ] Each row of the worked-examples table under Sightings, with the chit forced.
- [ ] The Misdirect cap counts hidden carriers only; a Revealed carrier does not raise it.
- [ ] A Misdirect never reports more Carriers than the cap, across 1,000 seeded runs.
- [ ] Two overlapping zones over one Task Force draw two chits and resolve independently.
- [ ] The searcher's view of a result contains counts only: no Task Force numbers, no hexes inside the zone, no chit.
- [ ] The owner's notice lists exactly the Task Forces that were in a zone whose chit was Detected or Misdirect.
- [ ] Raid check lists hidden Task Forces in the tapped hex; if none, those in adjacent hexes; if none, reports nothing.
- [ ] Raid check alone sends nothing to the opponent; **Reveal all** sets each listed Task Force to Revealed with the reason "Raided".
- [ ] With the PBY option off, no PBY action exists on any turn.
- [ ] With it on, the action exists only for the Allied side on turns 1 and 2, once per turn.
- [ ] A PBY search draws one chit per IJN hidden Task Force within 8 hexes of 1409, reports exact hexes with no type, and leaves every Task Force Hidden.
- [ ] Optional rules appear on the create form only for the map that lists them.
- [ ] The scripted two-seat Midway run still passes, updated so that a force is sighted on one turn, moves, and is found by a raid check on the next.
