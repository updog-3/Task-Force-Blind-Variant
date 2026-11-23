# TASK FORCE: BLIND GAMES WITH A DIGITAL REFEREE

A variant for *Task Force: Carrier Battles in the Pacific*, two players, one board.

This variant replaces section 12.4 of the scenario book (Blind Games, or Games with Two Boards). There the players need a second board, a partition and a human referee. Here an app on each player's laptop or phone is the referee, and one physical board is shared. Everything not mentioned below is played by the rulebook and the scenario being used.

**Formatting**

> **Note:** useful notes and additional information are styled this way.

**Exceptions to the rulebook are styled this way.**

*Examples are styled this way.*

---

## 1. THE IDEA

What information does a fleet commander have to base his decisions on? He knows his own position. For the enemy's he relies on guesswork and hit-and-miss scout reports.

**1.1. One place at a time.** A Task Force is tracked in exactly one place.

- While it is **Hidden** it exists only in the app. It has no marker on the board.
- Once it is **Revealed** it exists only on the board, numbered side up, and the app stops tracking where it is.
- At dusk every Task Force on the board goes back into the app (see 8).

**1.2. What a search gives you.** A search never puts a Task Force on the board. It gives a one-time report of how many Carrier and Fleet Task Forces are in a zone, and the enemy keeps moving unseen. Only contact and raids reveal a Task Force.

**1.3. What stays on the table.** The fleet formation sheets, the aircraft status sheets, combat, damage and victory points are all played as usual, with the sheets kept hidden from the opponent (12.4.3). The app knows nothing about ships or aircraft.

**Dummy markers and Report markers are not used.**

---

## 2. TASK FORCES

**2.1. Numbers.** Each side has Task Forces numbered 1 to 13. TF 1 to 6 are Carrier Task Forces and TF 7 to 13 are Fleet Task Forces. A number is used once per side at a time.

**2.2. Type.** A Task Force counts as a **Carrier** Task Force if it is TF 1 to 6 with its carrier still present, or is combined with one that is (2.5). Otherwise it is a **Fleet** Task Force.

> **Note:** when a carrier is sunk, its owner unticks "carrier present" in the app. That Task Force then reports as a Fleet and stops being a search source from the next turn.

**2.3. Status.** A Task Force is always in one of three states.

| Status | Where it lives | Meaning |
| --- | --- | --- |
| Hidden | The app | Position known only to its owner |
| Revealed | The board | Marker numbered side up, after contact, a raid or a voluntary reveal |
| Gone | Nowhere | Sunk, withdrawn, absorbed in a merge, or off the map |

**2.4. Splits (night turns only).** A hidden Task Force may split off a new Task Force using any free number from 7 to 13. The new Task Force starts in the same hex and moves separately this turn. The ships are moved on the fleet formation sheet.

**2.5. Merges (any turn).** Two hidden Task Forces in the same hex may merge. Choose which number is kept.

1. **Absorb:** the other number is removed and becomes free again.
2. **Keep both formations:** both stay as formations under the one marker (rulebook 3.7.1). A combined Task Force may split back into its original numbers on a later night turn.

**A Carrier Task Force is never absorbed. It may only be combined.**

> **Note:** splits and merges made to markers already on the board are done on the board, then recorded in the app so the numbers stay correct.

---

## 3. SETUP

1. Choose a scenario (see 9). It decides the map, the starting turn, the search zones per carrier and the land bases in play.
2. Each player prepares their fleet formation and aircraft status sheets in secret.
3. Each player places their Task Forces by number on their own private map, following the scenario's start lines and setup zones. Any number of Task Forces may share a hex. No Task Force may be placed on an all-land hex.
4. Each player sets the number of search zones for each of their Carrier Task Forces and land bases, if the scenario gives one a different number.
5. When both players are ready, play begins with the Naval Movement phase of the starting turn. Nothing is on the board yet.

> **Note:** the app only checks that a hex exists and is not all land. Start lines and setup zones are the players' responsibility.

---

## 4. SEQUENCE OF PLAY

The turn track is unchanged.

| Turns | Period | Move (hexes) | Transports move | Recon phase | Splits |
| --- | --- | --- | --- | --- | --- |
| 1–2 | Night | 2 | Yes | No | Yes |
| 3–8 | Day | 1 | Odd turns only | Yes | No |
| 9–10 | Day | 1 | Turn 9 only | No | No |
| 11–14 | Night | 2 | Yes | No | Yes |
| 15–20 | Day | 1 | Odd turns only | Yes | No |
| 21–22 | Day | 1 | Turn 21 only | No | No |
| 23–24 | Night | 2 | Yes | No | Yes |

The IJN has the initiative on odd turns and the Allies on even turns.

Each turn runs as follows.

1. **Naval Movement phase** (5).
2. **Naval Combat and Aircraft Operations phases**, on the board, with the raid rules in 6.
3. **Reconnaissance phase**, on the turns that have one (7).
4. **Administrative phase.** The dusk reset is carried out at the end of turns 10 and 22 (8). The chit cup is refilled at the end of every night turn and at each dusk reset.

---

## 5. NAVAL MOVEMENT

**5.1. Order.**

1. Both players move their markers on the board as usual, initiative player first.
2. Both players secretly plot the moves of their hidden Task Forces in the app, along with any splits and merges, and lock them.
3. When both have locked, the app resolves all hidden movement (5.3) and checks for contact (5.4).

**5.2. Plotting.** A hidden Task Force moves up to 1 hex on a day turn and up to 2 on a night turn, one adjacent hex at a time. It may stay where it is.

- It may not enter an all-land hex, nor cross a hexside wholly covered by land or by coral reef (rulebook 2.1.1).
- From a hex on the map edge it may leave the map. It is then Gone, and both players are told that a Task Force of that side left the map, without its number.
- A player must not plot a move into a hex holding an enemy marker on the board.

**5.3. Resolution.** Splits and merges take effect first. Then the initiative player's Task Forces move, in number order, followed by the second player's.

1. A step into a hex that holds an enemy hidden Task Force is **blocked**. The moving Task Force stops in the hex it was leaving and loses the rest of its move. Its owner is told where it stopped.
2. The initiative player is blocked by where the enemy *started* the turn. The second player is blocked by where the initiative player *ended* it.
3. Passing through a hex the enemy has already left is allowed. Friendly Task Forces never block each other.

*Example: it is a night turn and the IJN has the initiative. IJN TF 1 moves 1005 → 1105 → 1205, but Allied TF 1 starts the turn in 1205. TF 1 is blocked, stops in 1105, and the two are now adjacent: both are revealed (5.4).*

**5.4. Contact.** After movement:

1. Any two opposing hidden Task Forces in adjacent hexes are in contact. **Both are revealed.** Both players are told the numbers and hexes and place the markers on the board, numbered side up.
2. A hidden Task Force in the hex of an enemy land base is revealed.
3. There is no contact across a land or reef hexside (rulebook 3.4).

**5.5. Contact with markers on the board.** The app does not know where markers on the board are. After movement each player compares their hidden Task Forces with the enemy markers on the board and **must reveal** any hidden Task Force that:

- is adjacent to an enemy marker (reason: **Contact**), or
- sits in a hex an enemy marker tried to enter (reason: **Blocked**).

**5.6. Voluntary reveal.** A player may reveal one of their own hidden Task Forces at any point in a turn, for any reason.

> **Note:** a revealed Task Force stays on the board, and is moved on the board, until the dusk reset. Record in the app when it is sunk, withdraws or leaves the map.

---

## 6. RAIDS

Raids are played on the board. The app only reveals Task Forces, and offers the defender a private lookup of what is in or next to a hex.

**The rulebook's limit of raids to sighted markers (4.3.1) does not apply. A raid may be sent against any hex in range.**

1. Roll for raid order as in the rulebook.
2. The attacker places their aircraft on any hex in range.
3. **Launching reveals the launching Task Force** (reason: **Launched raid**). It is placed on the board, where range is checked.
4. The defender reveals every hidden Task Force in the target hex (reason: **Raided**), and the raid is resolved against that hex.
5. If the target hex is empty, the defender reveals every hidden Task Force in the six adjacent hexes. The attacker picks one of those hexes to attack (see 6.7, Off-target raids).
6. If nothing is in or next to the hex, the raid misses. The aircraft are spent and go to Landing.

**6.7. Off-target raids.** When the target hex is empty and the attacker switches to an adjacent hex (step 5), the attacker rolls 1D6 for each attack group (all aircraft from the same base attacking the same hex), just before interception. On a 4–6, a third of that group’s aircraft counters fail to locate the target, rounded to the nearest whole number (0.5 is 1). At least one counter fails. Those counters are not intercepted and do not attack, but return to base with the others. The attacking player chooses which counters fail to find the target.

> **Note:** on-target raids keep whatever the scenario says, so Midway’s USN-only inexperience roll still applies there. The inexperience roll does not stack with the off-target roll.

> **Note:** raids are flown, so land and reefs make no difference to steps 4 and 5.

> **Note:** a hidden Task Force that shares a hex with a friendly marker being raided is exposed too, and is revealed as Raided (rulebook 4.3.2).

*Example: last turn a US search reported "1 Carrier Task Force sighted" around hex 1207. This turn the US player sends a raid to 1207. The IJN carrier has since moved to 1208. Hex 1207 is empty, so the IJN player reveals TF 2 in 1208, the only Task Force adjacent, and the raid goes in against it.*

---

## 7. RECONNAISSANCE

A search covers a zone of seven hexes and draws one chit for the whole zone. The searcher learns how many Carrier and Fleet Task Forces are in the zone, and nothing else.

**7.1. The cup.** The cup holds 54 chits, shared by both sides.

| Chits | Result |
| --- | --- |
| 1–30 | Detected |
| 31–42 | Misdirect |
| 43–54 | No Contact |

A drawn chit stays out until the cup is refilled (4). If the cup runs dry, all 54 chits go back in.

**7.2. Sources.** The following may search:

- a Carrier Task Force with its carrier present, provided it was not Gone at the start of the turn, hidden or revealed;
- a land base that the scenario gives search zones.

Each source may place up to its number of zones. The blind-game standard is **2 zones per IJN carrier and 3 per Allied carrier** (12.4.1); a scenario may set other numbers (9). Placing fewer zones, or none, is allowed.

**7.3. Zones.** A zone is one hex and its six neighbours. The centre hex must be within 8 hexes of the source. Searches are flown, so land does not restrict them.

> **Note:** range is measured from a hidden Task Force's true position. For a source that is on the board, the searcher states its hex, which the opponent can see anyway.

**7.4. Procedure.**

1. Both players secretly place their zones and lock them.
2. The initiative player's zones are resolved in the order placed, then the second player's.
3. For each zone one chit is drawn, even if the zone turns out to be empty.

| Chit | Report to the searcher |
| --- | --- |
| No Contact | "No contact" |
| Detected | The true number of Carrier and Fleet Task Forces in the zone |
| Misdirect | The numbers with the types swapped, subject to the cap (7.5) |

**No Task Force changes status. Every Task Force in the zone stays Hidden where it is.** Revealed Task Forces are on the board and are never part of a search.

**7.5. The Misdirect cap.** A Misdirect must stay plausible, so it never reports more carriers than the enemy could have there.

1. Every Carrier Task Force in the zone is counted as a Fleet.
2. The cap is the number of the owner's **hidden** Carrier Task Forces anywhere on the map. Revealed carriers do not count.
3. If the zone holds F Fleet Task Forces, the lower of F and the cap are counted as Carriers, and the rest as Fleets.

**7.6. What each player learns.**

- **The searcher** gets one line per zone, such as "Zone 1207: 1 Carrier Task Force, 2 Fleet Task Forces sighted". No hexes within the zone, no Task Force numbers, and never which chit was drawn. An empty zone and a No Contact read the same.
- **The owner** is told which of their Task Forces were sighted this turn, but not what was reported or where the zone was.
- The searcher's reports stay pinned on their own map for the rest of the game.

**7.7. Overlapping zones.** Each zone is resolved on its own chit. A Task Force inside two zones may be reported by both, by one, or by neither.

**7.8. Examples.** In each, the IJN has hidden carriers TF 1 and TF 2 and hidden fleets TF 7, TF 8 and TF 9 unless stated.

| The zone contains | Chit | Cap | Report |
| --- | --- | --- | --- |
| TF 7, TF 8, TF 9 | Detected | n/a | 3 Fleets |
| TF 7, TF 8, TF 9 | Misdirect | 2 | 2 Carriers, 1 Fleet |
| TF 1, TF 7 | Detected | n/a | 1 Carrier, 1 Fleet |
| TF 1, TF 7 | Misdirect | 2 | 1 Carrier, 1 Fleet |
| TF 1 alone | Misdirect | 2 | 1 Fleet |
| TF 7, TF 8; TF 1 and TF 2 are revealed on the board | Misdirect | 0 | 2 Fleets |
| TF 7 | No Contact | n/a | No contact |
| Nothing | Any | n/a | No contact; the chit is still spent |

> **Note:** a report tells you something was there this turn. By the time your raid arrives it will have moved up to one hex by day, which is exactly what the adjacent-hex rule in 6 is for.

---

## 8. THE DUSK RESET

At the end of turns 10 and 22 the fleets slip back into the dark.

1. For each of their Task Forces on the board, the owner enters its current hex into the app, confirms whether its carrier is still present, and marks any that are Gone.
2. When both players have done so, those Task Forces become Hidden again and their markers come off the board.
3. The cup is refilled and the next turn begins.

Withdrawing ships that are not in a Task Force stay on the board and are never tracked.

---

## 9. SCENARIOS

A game is created from a scenario. The scenario's own special rules still apply; the table shows what changes for the blind game.

| Scenario | Map | Start | Zones per carrier (IJN / Allies) | Land bases (zones) |
| --- | --- | --- | --- | --- |
| 5. Battle of the Coral Sea | Coral Sea | Turn 1 | 2 / 3 | None |
| 6. Battle of Midway | Midway | Turn 1 | 2 / 3 | Midway, Allied (0) |
| 7. Battle of the Eastern Solomons | Eastern Solomons | Turn 3 | 2 / 2 | Henderson, Allied (1) |
| 8. Combined Fleet vs Pacific Fleet | Combined Fleet vs Pacific Fleet | Turn 1 | 1 / 2 | None |
| 9. Indian Ocean Raid | Combined Fleet vs Pacific Fleet | Turn 3 | 1 / 2 | None |
| 10. Santa Cruz Islands (Battle 1) | Eastern Solomons | Turn 3 | 2 / 2 | Henderson, Allied (2); Buka, IJN (1) |
| 10. Second Guadalcanal (Battle 2) | See 9.4 | Turn 3 | 2 / 2 | See 9.4 |
| Custom game | Any | Turn 1 | 2 / 3 | None |

> **Note:** where a scenario gives a light carrier fewer searches (Ryūjō in scenario 7, all light carriers in scenario 10, Hermes in scenario 9), set that Task Force's zones by hand at setup.

**9.1. Land bases.** A base's zones are measured from its hex. A hidden Task Force that enters the hex of an enemy base is revealed (5.4). A base with 0 zones does no reconnaissance.

**9.2. Scenario 6: PBY night search (6.5.2).** On turns 1 and 2, during the Board phases, the Allied player may run the PBY search once per turn.

1. One chit is drawn for each IJN hidden Task Force within 8 hexes of Midway (hex 1409).
2. Detected or Misdirect: the Allied player is told "Fleet sighted" with that Task Force's exact hex, and no type. No Contact: nothing is reported for it.
3. No Task Force changes status. The IJN player is told the search was run and which of their Task Forces were sighted.

> **Note:** this is the one search in the game that gives an exact hex.

**9.3. Scenario 9: Ceylon patrol (9.5.2).** In every Reconnaissance phase, one chit is drawn for each IJN hidden Task Force within 4 hexes of hexes 2107 to 2110. The Royal Navy player is told the number of Carrier and Fleet Task Forces sighted in that area, with the Misdirect cap of 7.5, and no hexes. This is in addition to the Royal Navy's own zones.

**9.4. Scenario 10, Battle 2.** The map depends on Battle 1 (10.2.1).

| Result of Battle 1 | Map | Land bases (zones) |
| --- | --- | --- |
| The USN still holds Guadalcanal | Eastern Solomons | Henderson, Allied (2); Buka, IJN (1) |
| The IJN captured Guadalcanal | Coral Sea | Rabaul, Buka, Gasmata, Lae and Henderson, IJN (1 each); Port Moresby, Allied (2) |

**9.5. Rules about sightings.** Some scenario rules lift "when an enemy fleet is sighted" (for example Task Force 18's course in scenario 7, or the IJN's heading in scenario 9). In the blind game a sighting is any search report that shows at least one Task Force. The players should agree this before starting.

**9.6. Raids from anywhere.** Where a scenario lets aircraft attack "any enemy Task Force" (the B-17s of scenarios 6 and 7), the attacker names a hex and the raid is resolved as in 6.

---

## 10. ENDING THE GAME

The scenario says when the game ends. Either player proposes the end and the other confirms. The app then shows both players every Task Force's final status and position, and the full record of both sides: every move, every zone searched, every chit drawn and every raid lookup.

> **Note:** use this to check setup, movement restrictions and victory conditions, and to settle any argument about who was where.

---

## 11. A MATTER OF HONOUR

The app enforces hidden movement, terrain, contact between hidden Task Forces, search ranges and zone counts. Everything else rests on the players, as it does in any blind game. In particular:

- start lines, setup zones and scenario movement restrictions;
- not plotting a move into a hex holding an enemy marker;
- revealing a hidden Task Force that touches, or is blocked by, an enemy marker on the board (5.5);
- revealing the Task Force that launches a raid, and everything exposed by an enemy raid (6);
- keeping the app's register in step with the board when a revealed Task Force sinks, merges, splits or leaves.

All of it can be checked against the record at the end of the game.

---

## 12. OPTIONAL RULES

**12.1. Transports.** When this option is on, a Task Force marked as carrying transports is held to the transport movement limits: 1 hex on night turns and odd day turns, and none on even day turns. When it is off, the limits are a reminder only.

**12.2. Empty cup.** Instead of refilling when the cup runs dry, every further draw until the next refill reads No Contact.

**12.3. Search zones.** The zones per carrier may be changed when the game is created, and for each Task Force and base at setup.
