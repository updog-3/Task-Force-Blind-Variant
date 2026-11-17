# Task Force Blind Search Tracker

Referee app for hidden Task Forces in an in-person, two-player blind game of
*Task Force: Carrier Battles in the Pacific* (Midway map). The full brief is in
`Task Force Blind Search Tracker Build Spec.md`.

## Run

```
npm install
npm start          # builds the client, then serves on http://localhost:3000
```

The server prints a LAN URL for the other player's device (same Wi-Fi).
`PORT` and `TFB_DB` (SQLite file, default `data/tfb.sqlite`) can be set in the environment.

## Map art

`maps/midway.json` holds the map data and grid calibration. The image it names
(`maps/midway.png`) is git-ignored: it belongs to VUCA and must not be committed
or published. Without it the app draws a plain numbered hex grid.

Calibration is stored as fractions of the image, so any resolution (or a
different image) works. To recalibrate, open **Calibrate the map grid** on the
home page, tap the centres of hexes 0201, 2801 and 0219, check the overlay and save.

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
