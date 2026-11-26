// Sunset Red Canyon — the canyon route: its bends, its walls, its rings
// and its landmarks (a steel bridge, a dam, a runway). Everything here is
// a pure function of distance along the route, so the world is identical
// on every run and every screenshot.
//
// Units: 1 unit is roughly 1 metre. The route is about 9.6 km long.
// Lateral x is measured from the canyon centreline, altitude y from the
// river surface (y = 0 is the water).

import { clamp } from './rng.js';

export const SEGMENT = 150; // metres of route per canyon cross-section
export const ROUTE_LENGTH = 9600;
export const RING_COUNT = 12;

// The centreline bends gently: two slow sines so the canyon ahead is
// always visibly curving without ever turning back on itself.
export function centreXAt(s) {
  return 260 * Math.sin(s * 0.00011) + 140 * Math.sin(s * 0.00029 + 1.7);
}

// The canyon floor stays at river level, with a slow swell.
export function floorAt(s) {
  return 6 * Math.sin(s * 0.0004 + 0.6);
}

// Half-width of the canyon at distance s: wide open stretches and
// narrow squeezes where the walls close in.
export function halfWidthAt(s) {
  return 300 + 130 * Math.sin(s * 0.00021 + 2.1) + 60 * Math.sin(s * 0.00053);
}

// Wall-top height on one side (side is -1 left, +1 right).
export function wallTopAt(s, side) {
  const base = 210 + 90 * Math.sin(s * 0.00017 + (side < 0 ? 0.9 : 3.4));
  const pinch = 60 * Math.sin(s * 0.00043 + (side < 0 ? 2.2 : 0.4));
  return base + pinch;
}

// The twelve rings. Each sits on the centreline at a fair altitude, so
// the pilot threads arches and bridge openings down the whole canyon.
export const RINGS = (() => {
  const rings = [];
  for (let i = 0; i < RING_COUNT; i++) {
    const s = 700 + i * 700;
    const x = centreXAt(s);
    const y = 95 + 55 * Math.sin(i * 1.35 + 0.5);
    const r = i === 11 ? 70 : 62;
    rings.push({ s, x, y, r, index: i });
  }
  return rings;
})();

// Landmarks, by distance along the route.
export const BRIDGE_S = 4200; // steel truss bridge across the canyon
export const DAM_S = 7900; // concrete dam wall
export const RUNWAY_S = 9200; // runway threshold, end of the route
export const RUNWAY_LENGTH = 400;

// The runway sits in a flat valley past the dam.
export function runwayCentreX() {
  return centreXAt(RUNWAY_S);
}

// How far the camera can see before the haze swallows the canyon.
export const VIEW_DISTANCE = 4600;

// The wind along the route: a steady crosswind from the left with slow
// gusts. Shown on the HUD and felt as a small lateral drift.
export function windAt(time) {
  const gust = 4 * Math.sin(time * 0.23) + 2.5 * Math.sin(time * 0.071 + 1.3);
  return { speed: 9 + gust, fromDeg: 270 }; // blowing from the west
}

// Clamp a lateral position inside the canyon at distance s, leaving a
// margin for the aircraft's wingspan.
export function clampInside(x, s, margin = 26) {
  const half = halfWidthAt(s) - margin;
  return clamp(x, -half, half);
}
