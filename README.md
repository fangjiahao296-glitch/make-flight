[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/fangjiahao296-glitch/make-flight/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/fangjiahao296-glitch/make-flight/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

# Sunset Red Canyon — a dusk flight through twelve stone arches

A complete, original flight game built for make.fun's
"Make the best flight game" bounty: fly a golden-dusk red canyon,
thread twelve stone-arch rings in order, mind your fuel, and land on
the runway. Keyboard only, runs offline from static files, no network
requests, no build step.

## How it plays

- **ARROWS** — pitch and roll · **A / D** — bank · **W / S** — throttle
- **C** — cockpit view · **P** — pause · **M** — mute
- 12 rings in order (rock arches and the steel bridge opening), a dam
  and a runway as landmarks, limited fuel, checkpoint respawns after a
  crash (3 crashes ends the flight).
- Dense HUD throughout: altitude, airspeed, heading with compass strip,
  vertical speed, throttle, fuel, wind, ring count, timer and score.
- Cockpit view with five lit gauges, an attitude indicator and a fuel bar.
- Full shell: title screen with saved best score, pause, and a flight-log
  end screen (rings, time, fuel left, crashes, score, rating).
- Synthesised WebAudio sounds (engine drone follows throttle, ring chime,
  crash, landing) — no audio files.

## How it runs

`main.ts` (Node 22, standard library only) copies `game/` and
`screenshots/` to the output directory and writes `dossier.json` with
the kit's `buildDossier`:

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts   # defaults to /output
```

The copy is byte-for-byte, so repeated runs produce identical output.

## Layout

- `game/` — the playable game as static files (`index.html` + `src/`)
- `screenshots/` — four real renders of the game (title, chase, cockpit, landing)
- `vendor/makefun-game.ts` — the kit's dossier library, copied unchanged
- `main.ts` — the hand-in program
