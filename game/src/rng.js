// Sunset Red Canyon — seeded random numbers.
//
// A tiny mulberry32 generator so the canyon, the wind gusts and the
// screenshot scenes are identical on every run with the same seed. The
// game never reads Math.random for anything the player can see.

export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A value in [min, max) from a generator.
export function range(rng, min, max) {
  return min + rng() * (max - min);
}

// A whole number in [min, max] from a generator.
export function intRange(rng, min, max) {
  return Math.floor(range(rng, min, max + 1));
}

// Pick one entry of an array.
export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

// Clamp a number into [min, max].
export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

// Linear interpolation.
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Smoothstep easing between 0 and 1.
export function smooth(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}
