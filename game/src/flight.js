// Sunset Red Canyon — the flight model and the game state.
//
// Arcade flight: throttle sets speed, pitch sets climb, roll banks the
// aircraft and turns it. Fuel is limited, rings are checked in order,
// and a crash sends the pilot back to the last ring cleared. The state
// machine is: 'title' -> 'flying' -> 'paused' -> 'landed' | 'crashed'.

import { clamp } from './rng.js';
import {
  RINGS,
  RING_COUNT,
  RUNWAY_S,
  RUNWAY_LENGTH,
  centreXAt,
  floorAt,
  halfWidthAt,
  wallTopAt,
  windAt,
} from './route.js';

export const MAX_SPEED = 150; // units per second at full throttle
export const MIN_SPEED = 38; // below this the aircraft sinks
export const START_FUEL = 100;
export const RING_POINTS = 250;
export const LANDING_POINTS = 500;
export const CRASH_PENALTY = 100;

// A fresh flight, already airborne over the canyon mouth at cruise
// speed: the game starts in the air, and the runway is for the landing
// at the end of the route, not a takeoff roll.
export function createFlight() {
  return {
    screen: 'title', // title | flying | paused | landed | crashed
    s: 0, // distance along the route
    x: centreXAt(0), // lateral position (world)
    y: 110, // altitude above the river
    pitch: 0, // -1 nose down .. +1 nose up
    roll: 0, // -1 left .. +1 right
    speed: 95, // already at cruise; a standing start would sink
    throttle: 0.6,
    fuel: START_FUEL,
    time: 0,
    score: 0,
    ringIndex: 0, // next ring to fly through
    ringsCleared: 0,
    ringsMissed: 0,
    crashes: 0,
    checkpoint: 0, // distance of the last ring cleared
    message: '',
    messageUntil: 0,
    crashReason: '',
    rating: '',
    best: 0,
    wind: 9,
  };
}

// Show a toast message for a few seconds.
export function toast(flight, text, seconds = 2.2) {
  flight.message = text;
  flight.messageUntil = flight.time + seconds;
}

// The ring the pilot is flying toward, or null when all are cleared.
export function nextRing(flight) {
  return flight.ringIndex < RING_COUNT ? RINGS[flight.ringIndex] : null;
}

// Score rating for the flight log.
function rateFlight(flight) {
  const cleared = flight.ringsCleared;
  if (cleared >= 12 && flight.fuel > 25) return 'S — CANYON ACE';
  if (cleared >= 10) return 'A — SHARP PILOT';
  if (cleared >= 7) return 'B — STEADY HAND';
  if (cleared >= 4) return 'C — ROOKIE';
  return 'D — BACK TO SCHOOL';
}

// One physics step. `input` is { pitch, roll, throttleUp, throttleDown }
// with pitch/roll in -1..1. `dt` is seconds.
export function updateFlight(flight, input, dt) {
  if (flight.screen !== 'flying') return;

  flight.time += dt;

  // Throttle eases toward its target; the pilot nudges it with W/S.
  if (input.throttleUp) flight.throttle = clamp(flight.throttle + dt * 0.55, 0, 1);
  if (input.throttleDown) flight.throttle = clamp(flight.throttle - dt * 0.7, 0, 1);

  // Speed chases the throttle setting.
  const targetSpeed = MIN_SPEED + (MAX_SPEED - MIN_SPEED) * flight.throttle;
  flight.speed += (targetSpeed - flight.speed) * Math.min(1, dt * 0.9);

  // Pitch and roll ease toward the stick.
  flight.pitch += (input.pitch - flight.pitch) * Math.min(1, dt * 5);
  flight.roll += (input.roll - flight.roll) * Math.min(1, dt * 5);

  // Climb from pitch and speed; a slow aircraft sinks.
  const climb = flight.pitch * flight.speed * 0.42;
  const sink = flight.speed < 62 ? (62 - flight.speed) * 0.55 : 0;
  flight.y += (climb - sink) * dt;

  // Roll banks the aircraft and turns it sideways; the wind pushes too.
  const wind = windAt(flight.time);
  flight.wind = wind.speed;
  const lateral = flight.roll * flight.speed * 0.62 + wind.speed * 0.55;
  flight.x += lateral * dt;
  flight.s += flight.speed * dt;

  // Fuel burns with throttle; a cleared ring tops the tank up a little.
  flight.fuel = Math.max(0, flight.fuel - (0.5 + flight.throttle * 0.62) * dt);

  // Ring crossing: the aircraft passes a ring's distance this step.
  const ring = nextRing(flight);
  if (ring && flight.s >= ring.s) {
    const dx = flight.x - ring.x;
    const dy = flight.y - ring.y;
    const dist = Math.hypot(dx, dy);
    if (dist < ring.r * 0.92) {
      flight.ringsCleared++;
      flight.score += RING_POINTS;
      flight.fuel = Math.min(START_FUEL, flight.fuel + 2);
      flight.checkpoint = ring.s;
      toast(flight, `RING ${flight.ringsCleared}/12  +${RING_POINTS}`);
    } else {
      flight.ringsMissed++;
      toast(flight, `MISSED RING ${flight.ringIndex + 1}`, 2.6);
    }
    flight.ringIndex++;
  }

  // Out of fuel: the engine quits and the aircraft glides down.
  if (flight.fuel <= 0 && flight.speed > MIN_SPEED) {
    flight.throttle = 0;
    toast(flight, 'FUEL EMPTY — GLIDING', 2.0);
  }

  // Landing: past the runway threshold, low, slow and near the centreline.
  const runwayX = centreXAt(RUNWAY_S);
  if (flight.s >= RUNWAY_S && flight.s <= RUNWAY_S + RUNWAY_LENGTH) {
    const onCentre = Math.abs(flight.x - runwayX) < 60;
    if (flight.y <= 14 && flight.speed < 95 && onCentre) {
      flight.screen = 'landed';
      flight.score += LANDING_POINTS + Math.round(flight.fuel) * 10;
      flight.rating = rateFlight(flight);
      return;
    }
  }

  // Crash checks: the river, the canyon walls, and running out of runway.
  const floor = floorAt(flight.s);
  const half = halfWidthAt(flight.s);
  const wall = Math.min(wallTopAt(flight.s, -1), wallTopAt(flight.s, 1));
  if (flight.y <= floor + 3) {
    crash(flight, 'DITCHED IN THE RIVER');
  } else if (Math.abs(flight.x - centreXAt(flight.s)) > half - 12 && flight.y < wall) {
    crash(flight, 'CLIPPED THE CANYON WALL');
  } else if (flight.s > RUNWAY_S + RUNWAY_LENGTH + 60) {
    crash(flight, 'OVERSHOT THE RUNWAY');
  }
}

// Vertical speed in feet per minute, for the HUD and the V/S gauge.
export function verticalSpeedFpm(flight) {
  return Math.round(flight.pitch * flight.speed * 27);
}

// A crash: lose points and fuel, restart from the last ring cleared.
// Three crashes end the flight with the log.
function crash(flight, reason) {
  flight.crashes++;
  flight.score = Math.max(0, flight.score - CRASH_PENALTY);
  flight.crashReason = reason;
  if (flight.crashes >= 3) {
    flight.screen = 'crashed';
    flight.rating = rateFlight(flight);
    toast(flight, reason, 2.6);
    return;
  }
  const back = Math.max(0, flight.checkpoint - 60);
  flight.s = back;
  const ring = nextRing(flight);
  flight.x = ring ? ring.x : centreXAt(back);
  flight.y = ring ? ring.y : 110;
  flight.speed = 95;
  flight.pitch = 0;
  flight.roll = 0;
  flight.throttle = 0.6;
  flight.fuel = Math.max(28, flight.fuel - 15);
  toast(flight, `${reason} — BACK TO RING ${flight.ringIndex + 1}`, 2.6);
}

// The pilot quits to the end screen (after landing, or by choice).
export function finishFlight(flight, landed) {
  flight.screen = landed ? 'landed' : 'crashed';
  flight.rating = rateFlight(flight);
}
