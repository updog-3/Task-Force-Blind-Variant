# Task Force Blind Search Tracker

Referee app for hidden Task Forces in an in-person, two-player blind game of
*Task Force: Carrier Battles in the Pacific*.

The rules of the variant, written for players, are in
[BLIND_VARIANT_RULES.md](BLIND_VARIANT_RULES.md). The original build brief and its
revision are in `Task Force Blind Search Tracker Build Spec.md` and
`Task Force Blind Search Tracker Revision 2.md`.

## Run

```
npm install
npm start          # builds the client, then serves on http://localhost:3000
```

The server prints a LAN URL for the other player's device (same Wi-Fi).
`PORT` and `TFB_DB` (SQLite file, default `data/tfb.sqlite`) can be set in the environment.

## Scenarios and maps

A game is created from a scenario (`rules/scenarios.ts`): Sc 5 to Sc 10, plus a
Custom game. The scenario decides the map (or offers a choice), the starting turn,
search zones per carrier, which land bases are in play and who owns them, optional
rules such as the Midway PBY search, and the reminders shown to the players.

Each map is a data file in `maps/` (`midway`, `coralSea`, `easternSolomons`,
`fleetVsFleet`) holding the grid, calibration, printed base sites and terrain
(all-land hexes and the land or reef hexsides that block ships). The image it names
is git-ignored: it belongs to VUCA and must not be committed or published. Without
it the app draws a plain numbered hex grid.

Calibration is stored as fractions of the image, so any resolution (or a different
image) works. To recalibrate, open **Calibrate the map grid and check terrain** on
the home page, tap the centres of the three hexes it asks for, check the overlay and
save. The same page draws the terrain data over the map, so it can be checked
against the printed coastlines and reefs and corrected in the JSON file.

## Develop

```
npm test           # rules, view-filter and two-seat end-to-end tests (Vitest)
npm run typecheck
npm run dev:server # server with reload, plus
npm run dev:client # Vite dev server on :5173, proxying to :3000
```

- `rules/`  pure rules engine: no I/O, injectable random source, shared with the client
- `server/` HTTP + WebSocket server, sessions, SQLite store
- `client/` React app
- `tests/`  rules tests and a scripted two-seat run through turns 1-11
