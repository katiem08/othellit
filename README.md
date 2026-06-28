# Othellit

Othellit is an online Othello/Reversi app with computer play, friend rooms, move hints, and game analytics.

## Run locally

```bash
npm start
```

The app runs on `http://localhost:4173` by default.

The Expert bot and stronger review analysis use Egaroucid when it is installed in
`vendor/egaroucid`. The install step runs automatically during `npm install`; if
it cannot build Egaroucid, Othellit still starts with its built-in fallback bot.

## Deploy

Deploy as a Node web service with:

- Root directory: this repository
- Build command: `npm install`
- Start command: `npm start`
- Node version: 20 or newer

The server uses the host-provided `PORT` environment variable when available.

Optional engine settings:

- `EGAROUCID_EXPERT_LEVEL`: strength for the Expert computer player, default `12`
- `EGAROUCID_ANALYSIS_LEVEL`: strength for game review/analytics, default `10`
- `EGAROUCID_TIMEOUT_MS`: how long the server waits for one Egaroucid answer, default `6000`
- `REQUIRE_EGAROUCID=1`: fail the deploy if Egaroucid cannot be installed
