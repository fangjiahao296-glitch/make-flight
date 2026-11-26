// Sunset Red Canyon — the renderer.
//
// A canvas 2D pseudo-3D chase view: the canyon is a chain of
// cross-sections projected from far to near, over a dusk sky. Warm
// orange rock and a teal river against a deep-teal sky, so the game
// never looks like a generic blue-sky flight game. Everything is drawn
// with plain canvas paths — no images, no network, nothing to load.

import { clamp, lerp } from './rng.js';
import { verticalSpeedFpm } from './flight.js';
import {
  SEGMENT,
  VIEW_DISTANCE,
  RINGS,
  BRIDGE_S,
  DAM_S,
  RUNWAY_S,
  RUNWAY_LENGTH,
  centreXAt,
  floorAt,
  halfWidthAt,
  wallTopAt,
} from './route.js';

// -- colour helpers -------------------------------------------------------

function rgb(c) {
  return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
}

function rgba(c, a) {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
}

// Mix colour `a` toward colour `b` by t (0 = a, 1 = b).
function mix(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

const SKY_TOP = [16, 44, 58];
const SKY_MID = [122, 74, 58];
const SKY_LOW = [232, 131, 58];
const SUN_CORE = [255, 214, 122];
const HAZE = [224, 138, 82];
const ROCK_FAR = [196, 118, 74];
const ROCK_NEAR = [138, 59, 34];
const ROCK_DARK = [94, 38, 24];
const RIVER = [38, 104, 104];
const RIVER_GLINT = [247, 200, 115];
const GOLD = [255, 201, 77];
const GREEN = [125, 220, 125];
const GREY = [150, 150, 150];

// -- camera and projection -----------------------------------------------

// A camera: position on the route, roll for banking, and a horizon line.
export function makeCamera(x, y, s, roll, horizonY) {
  return { x, y, s, roll, horizonY };
}

// Project a world point (x, y, s) to screen space. Returns null when the
// point is behind the camera or too close to see.
export function project(cam, focal, w, x, y, s) {
  const dz = s - cam.s;
  if (dz < 24) return null;
  const scale = focal / dz;
  let dx = x - cam.x;
  let dy = y - cam.y;
  if (cam.roll !== 0) {
    const c = Math.cos(cam.roll);
    const sn = Math.sin(cam.roll);
    const rx = dx * c - dy * sn;
    const ry = dx * sn + dy * c;
    dx = rx;
    dy = ry;
  }
  return { x: w / 2 + dx * scale, y: cam.horizonY - dy * scale, scale, dz };
}

// -- sky -----------------------------------------------------------------

export function drawSky(ctx, w, h, sunX, sunY) {
  const g = ctx.createLinearGradient(0, 0, 0, h * 0.62);
  g.addColorStop(0, rgb(SKY_TOP));
  g.addColorStop(0.45, rgb(SKY_MID));
  g.addColorStop(1, rgb(SKY_LOW));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h * 0.62 + 2);

  // Sun with a warm halo, big enough to light the whole dusk sky.
  const halo = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 230);
  halo.addColorStop(0, rgba(SUN_CORE, 0.95));
  halo.addColorStop(0.18, rgba([255, 170, 80], 0.55));
  halo.addColorStop(0.5, rgba([255, 150, 70], 0.18));
  halo.addColorStop(1, rgba([255, 140, 60], 0));
  ctx.fillStyle = halo;
  ctx.fillRect(sunX - 230, sunY - 230, 460, 460);
  ctx.fillStyle = rgb(SUN_CORE);
  ctx.beginPath();
  ctx.arc(sunX, sunY, 34, 0, Math.PI * 2);
  ctx.fill();

  // A warm glow band hugging the horizon, so the sky burns brightest
  // where the canyon meets it.
  const glow = ctx.createLinearGradient(0, h * 0.38, 0, h * 0.62);
  glow.addColorStop(0, rgba([255, 166, 88], 0));
  glow.addColorStop(0.55, rgba([255, 166, 88], 0.24));
  glow.addColorStop(1, rgba([255, 166, 88], 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, h * 0.38, w, h * 0.24);

  // Thin warm cloud bands.
  ctx.fillStyle = rgba([255, 190, 120], 0.16);
  for (let i = 0; i < 5; i++) {
    const cy = h * (0.12 + i * 0.07);
    const cw = w * (0.24 + ((i * 37) % 10) / 28);
    const cx = ((i * 271) % 100) / 100 * w;
    ctx.beginPath();
    ctx.ellipse(cx, cy, cw, 7 + (i % 3) * 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Distant mesa ridges, hazed.
  const ridges = [
    { y: 0.46, c: mix(ROCK_FAR, HAZE, 0.55), amp: 26 },
    { y: 0.52, c: mix(ROCK_FAR, HAZE, 0.35), amp: 40 },
  ];
  for (const r of ridges) {
    ctx.fillStyle = rgb(r.c);
    ctx.beginPath();
    ctx.moveTo(0, h * r.y + 30);
    for (let x = 0; x <= w; x += 40) {
      const yy = h * r.y + Math.sin(x * 0.006 + r.y * 40) * r.amp + Math.sin(x * 0.013) * 10;
      ctx.lineTo(x, yy);
    }
    ctx.lineTo(w, h * r.y + 30);
    ctx.closePath();
    ctx.fill();
  }

  // Flat-topped mesas on the horizon: desert silhouettes that read at a
  // glance, hazed so they sit far behind the canyon walls.
  const mesaCol = rgb(mix(ROCK_FAR, HAZE, 0.45));
  const mesas = [
    { cx: 0.10, topW: 0.075, baseW: 0.115, topY: 0.435, baseY: 0.52 },
    { cx: 0.44, topW: 0.11, baseW: 0.16, topY: 0.42, baseY: 0.52 },
    { cx: 0.90, topW: 0.06, baseW: 0.095, topY: 0.45, baseY: 0.52 },
  ];
  ctx.fillStyle = mesaCol;
  for (const m of mesas) {
    ctx.beginPath();
    ctx.moveTo(w * (m.cx - m.baseW), h * m.baseY);
    ctx.lineTo(w * (m.cx - m.topW), h * m.topY);
    ctx.lineTo(w * (m.cx + m.topW), h * m.topY);
    ctx.lineTo(w * (m.cx + m.baseW), h * m.baseY);
    ctx.closePath();
    ctx.fill();
  }
}

// -- canyon ---------------------------------------------------------------

// One canyon cross-section at distance s, projected.
function section(cam, focal, w, s) {
  const cx = centreXAt(s);
  const fl = floorAt(s);
  const half = halfWidthAt(s);
  const topL = wallTopAt(s, -1);
  const topR = wallTopAt(s, 1);
  const p = (x, y) => project(cam, focal, w, x, y, s);
  return {
    s,
    fl: p(cx - half, fl),
    fr: p(cx + half, fl),
    tl: p(cx - half, topL),
    tr: p(cx + half, topR),
    mid: p(cx, fl),
    cx,
    flY: fl,
    half,
  };
}

function poly(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  ctx.fill();
}

// The canyon, the river, the rings, the bridge, the dam and the runway.
export function drawCanyon(ctx, cam, w, h, flight) {
  const focal = h * 1.05;
  const startS = Math.floor(cam.s / SEGMENT) * SEGMENT;
  const sections = [];
  for (let s = startS + VIEW_DISTANCE; s > cam.s + 60; s -= SEGMENT) {
    sections.push(section(cam, focal, w, s));
  }
  sections.reverse(); // far to near

  for (let i = 0; i < sections.length; i++) {
    const a = sections[i];
    const b = sections[i + 1];
    if (!a.fl || !a.fr || !a.tl || !a.tr) continue;
    const t = clamp(a.s === undefined ? 0 : (a.s - cam.s) / VIEW_DISTANCE, 0, 1);
    const haze = Math.pow(t, 0.75);

    // River floor between this section and the next.
    if (b && b.fl && b.fr) {
      const river = mix(RIVER, HAZE, haze * 0.85);
      ctx.fillStyle = rgb(river);
      poly(ctx, [a.fl, a.fr, b.fr, b.fl]);
    }

    // Sun glitter on the water: a thin gold flash on each river
    // stretch, sun-side, brighter up close, so the river reads as
    // lit water instead of a flat teal floor.
    if (b && b.mid && a.mid) {
      const glintJit = ((((i + 7) * 2654435761) >>> 0) % 100) / 100;
      const riverHalf = (a.fr.x - a.fl.x) / 2;
      const gx = lerp(a.mid.x, b.mid.x, 0.5) + riverHalf * (0.18 + glintJit * 0.2);
      const gy = lerp(a.mid.y, b.mid.y, 0.5);
      const halfLen = Math.max(6, riverHalf * 0.09);
      ctx.strokeStyle = rgba(RIVER_GLINT, (1 - haze) * 0.4 + 0.08);
      ctx.lineWidth = Math.max(1.5, 2.5 * (1 - haze) + 0.5);
      ctx.beginPath();
      ctx.moveTo(gx - halfLen, gy);
      ctx.lineTo(gx + halfLen, gy);
      ctx.stroke();
    }

    // Left wall: two strata bands, darker toward the water. A small
    // deterministic shade jitter per section breaks up the banding so
    // the walls read as rock, not flat panels.
    const jit = 0.93 + 0.07 * ((((i + 1) * 2654435761) >>> 0) % 100) / 100;
    if (b && b.tl && b.fl) {
      const upper = mix(ROCK_NEAR, HAZE, haze).map((v) => v * jit);
      const lower = mix(ROCK_DARK, HAZE, haze).map((v) => v * jit);
      const midA = { x: lerp(a.tl.x, a.fl.x, 0.45), y: lerp(a.tl.y, a.fl.y, 0.45) };
      const midB = { x: lerp(b.tl.x, b.fl.x, 0.45), y: lerp(b.tl.y, b.fl.y, 0.45) };
      ctx.fillStyle = rgb(upper);
      poly(ctx, [a.tl, b.tl, midB, midA]);
      ctx.fillStyle = rgb(lower);
      poly(ctx, [midA, midB, b.fl, a.fl]);
    }
    // Right wall.
    if (b && b.tr && b.fr) {
      const upper = mix(ROCK_NEAR, HAZE, haze).map((v) => v * jit);
      const lower = mix(ROCK_DARK, HAZE, haze).map((v) => v * jit);
      const midA = { x: lerp(a.tr.x, a.fr.x, 0.45), y: lerp(a.tr.y, a.fr.y, 0.45) };
      const midB = { x: lerp(b.tr.x, b.fr.x, 0.45), y: lerp(b.tr.y, b.fr.y, 0.45) };
      ctx.fillStyle = rgb(upper);
      poly(ctx, [a.tr, b.tr, midB, midA]);
      ctx.fillStyle = rgb(lower);
      poly(ctx, [midA, midB, b.fr, a.fr]);
    }
  }

  drawBridge(ctx, cam, focal, w);
  drawDam(ctx, cam, focal, w);
  drawRunway(ctx, cam, focal, w);
  drawRings(ctx, cam, focal, w, flight);
}

// The suspension bridge across the canyon: a rust-red deck, two tall
// towers, a sagging main cable and suspenders. The towers rise far
// above the deck, so the bridge reads as a bridge even seen edge-on
// from the flight path, and the ring at its span is its opening.
function drawBridge(ctx, cam, focal, w) {
  const s = BRIDGE_S;
  if (s < cam.s + 40 || s > cam.s + VIEW_DISTANCE) return;
  const cx = centreXAt(s);
  const half = halfWidthAt(s);
  const deckY = 150;
  const towerTopY = deckY + 85;
  const xAt = (f) => cx - half - 30 + f * (2 * half + 60);
  const left = project(cam, focal, w, xAt(0), deckY, s);
  const right = project(cam, focal, w, xAt(1), deckY, s);
  if (!left || !right) return;
  const t = clamp((s - cam.s) / VIEW_DISTANCE, 0, 1);
  const hazed = (c) => rgb(mix(c, HAZE, Math.pow(t, 0.7)));
  const lw = (base) => Math.max(2, base + left.scale * 0.35);

  // Deck: a filled band, sunlit gold on top, dark rust underneath.
  const dl = project(cam, focal, w, xAt(0), deckY - 7, s);
  const dr = project(cam, focal, w, xAt(1), deckY - 7, s);
  if (dl && dr) {
    ctx.fillStyle = hazed([96, 62, 44]);
    poly(ctx, [left, right, dr, dl]);
    ctx.strokeStyle = hazed([255, 200, 110]);
    ctx.lineWidth = lw(4);
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(right.x, right.y);
    ctx.stroke();
  }

  // Towers: two legs each, with a crossbar, rust red with gold tips.
  for (const f of [0.28, 0.72]) {
    const tx = xAt(f);
    for (const leg of [-5, 5]) {
      const base = project(cam, focal, w, tx + leg, deckY, s);
      const top = project(cam, focal, w, tx + leg, towerTopY, s);
      if (!base || !top) continue;
      ctx.strokeStyle = hazed([198, 96, 54]);
      ctx.lineWidth = lw(5);
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(top.x, top.y);
      ctx.stroke();
    }
    const barA = project(cam, focal, w, tx - 5, towerTopY - 26, s);
    const barB = project(cam, focal, w, tx + 5, towerTopY - 26, s);
    if (barA && barB) {
      ctx.strokeStyle = hazed([198, 96, 54]);
      ctx.lineWidth = lw(2.5);
      ctx.beginPath();
      ctx.moveTo(barA.x, barA.y);
      ctx.lineTo(barB.x, barB.y);
      ctx.stroke();
    }
    const tip = project(cam, focal, w, tx, towerTopY + 4, s);
    if (tip) {
      ctx.fillStyle = rgb(GOLD);
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Main cable: up over both tower tops, sagging low at mid-span.
  const anchorL = project(cam, focal, w, xAt(0), deckY + 12, s);
  const anchorR = project(cam, focal, w, xAt(1), deckY + 12, s);
  const topL = project(cam, focal, w, xAt(0.28), towerTopY, s);
  const topR = project(cam, focal, w, xAt(0.72), towerTopY, s);
  const midLowY = deckY + 18;
  const ctrlY = 2 * midLowY - towerTopY; // quadratic control for the sag
  const midX = xAt(0.5);
  const ctrl = project(cam, focal, w, midX, ctrlY, s);
  if (anchorL && anchorR && topL && topR && ctrl) {
    ctx.strokeStyle = hazed([64, 54, 50]);
    ctx.lineWidth = lw(2.5);
    ctx.beginPath();
    ctx.moveTo(anchorL.x, anchorL.y);
    ctx.lineTo(topL.x, topL.y);
    ctx.quadraticCurveTo(ctrl.x, ctrl.y, topR.x, topR.y);
    ctx.lineTo(anchorR.x, anchorR.y);
    ctx.stroke();
  }

  // Suspenders: short verticals from the cable down to the deck.
  ctx.strokeStyle = hazed([90, 76, 66]);
  ctx.lineWidth = lw(1.5);
  for (let i = 1; i <= 9; i++) {
    const f = 0.28 + (i / 10) * 0.44;
    const u = (f - 0.28) / 0.44;
    const cableY = (1 - u) * (1 - u) * towerTopY + 2 * (1 - u) * u * ctrlY + u * u * towerTopY;
    const top = project(cam, focal, w, xAt(f), cableY, s);
    const bot = project(cam, focal, w, xAt(f), deckY, s);
    if (!top || !bot) continue;
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(bot.x, bot.y);
    ctx.stroke();
  }

  // Truss zig-zag under the deck, bolder than before.
  if (dl && dr) {
    ctx.strokeStyle = hazed([120, 84, 60]);
    ctx.lineWidth = lw(2);
    ctx.beginPath();
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const x = lerp(left.x, right.x, i / n);
      const y = left.y + (i % 2 === 0 ? 0 : 16 * left.scale * 0.05 + 6);
      if (i === 0) ctx.moveTo(x, left.y);
      else ctx.lineTo(x, y);
      ctx.lineTo(lerp(left.x, right.x, (i + 0.5) / n), left.y);
    }
    ctx.stroke();
  }

  // Deck lights, warm and a touch bigger.
  ctx.fillStyle = rgb(GOLD);
  for (let i = 0; i <= 8; i++) {
    const x = lerp(left.x, right.x, i / 8);
    ctx.beginPath();
    ctx.arc(x, left.y - 3, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

// The concrete dam wall: an arched crest, buttress pilasters, pour
// lines, three spillway gates pouring water, and a shadowed base, so
// it reads as a dam and not a blank slab.
function drawDam(ctx, cam, focal, w) {
  const s = DAM_S;
  if (s < cam.s + 40 || s > cam.s + VIEW_DISTANCE) return;
  const cx = centreXAt(s);
  const half = halfWidthAt(s);
  const fl = floorAt(s);
  const top = 190;
  const arch = 16; // the crest crowns higher in the middle
  const topAt = (f) => project(cam, focal, w, cx - half + f * 2 * half, top + arch * Math.sin(Math.PI * f), s);
  const botAt = (f) => project(cam, focal, w, cx - half + f * 2 * half, fl, s);
  const bl = botAt(0);
  const br = botAt(1);
  if (!bl || !br) return;
  const t = clamp((s - cam.s) / VIEW_DISTANCE, 0, 1);
  const hazeT = Math.pow(t, 0.7);
  const hazed = (c) => rgb(mix(c, HAZE, hazeT));

  // Wall body with its arched crest.
  const topPts = [];
  for (let k = 0; k <= 8; k++) {
    const p = topAt(k / 8);
    if (!p) return;
    topPts.push(p);
  }
  ctx.fillStyle = hazed([176, 158, 136]);
  poly(ctx, [bl, br, ...topPts.slice().reverse()]);

  // Rock shoulders where the wall keys into the canyon sides.
  ctx.fillStyle = hazed(ROCK_NEAR);
  const shL0 = topAt(0);
  const shL1 = project(cam, focal, w, cx - half - 46, top - 34, s);
  const shL2 = project(cam, focal, w, cx - half - 20, fl, s);
  if (shL0 && shL1 && shL2) poly(ctx, [shL0, shL1, shL2, bl]);
  const shR0 = topAt(1);
  const shR1 = project(cam, focal, w, cx + half + 46, top - 34, s);
  const shR2 = project(cam, focal, w, cx + half + 20, fl, s);
  if (shR0 && shR1 && shR2) poly(ctx, [shR0, shR1, shR2, br]);

  // Buttress pilasters: raised ribs down the wall, light on one edge,
  // dark on the other, so the face has rhythm and depth.
  for (let i = 1; i < 8; i++) {
    const f = i / 8;
    const tp = topAt(f);
    const bp = botAt(f);
    if (!tp || !bp) continue;
    const wdt = Math.max(2.5, (br.x - bl.x) * 0.008);
    ctx.fillStyle = rgba([120, 104, 86], 0.5);
    ctx.fillRect(tp.x - wdt / 2, tp.y, wdt, bp.y - tp.y);
    ctx.fillStyle = rgba([255, 235, 200], 0.35);
    ctx.fillRect(tp.x - wdt / 2, tp.y, 1.2, bp.y - tp.y);
  }

  // Horizontal pour lines, following the arch of the crest.
  ctx.strokeStyle = rgba([90, 78, 66], 0.4);
  ctx.lineWidth = 1;
  for (const q of [0.3, 0.55, 0.8]) {
    ctx.beginPath();
    for (let k = 0; k <= 8; k++) {
      const f = k / 8;
      const tp = topAt(f);
      const bp = botAt(f);
      if (!tp || !bp) continue;
      const x = lerp(tp.x, bp.x, q);
      const y = lerp(tp.y, bp.y, q);
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Three spillway gates near the crest, pouring white water.
  for (const gf of [0.38, 0.5, 0.62]) {
    const gw = 0.045; // gate half-width, as a fraction of the wall
    const gTopL = topAt(gf - gw);
    const gTopR = topAt(gf + gw);
    const gBotL = project(cam, focal, w, cx - half + (gf - gw) * 2 * half, top + arch * Math.sin(Math.PI * (gf - gw)) - 24, s);
    const gBotR = project(cam, focal, w, cx - half + (gf + gw) * 2 * half, top + arch * Math.sin(Math.PI * (gf + gw)) - 24, s);
    const bL = botAt(gf - gw * 0.7);
    const bR = botAt(gf + gw * 0.7);
    if (!gTopL || !gTopR || !gBotL || !gBotR || !bL || !bR) continue;
    ctx.fillStyle = rgb([52, 58, 62]);
    poly(ctx, [gTopL, gTopR, gBotR, gBotL]);
    ctx.fillStyle = rgba([196, 228, 238], 0.8);
    poly(ctx, [gBotL, gBotR, bR, bL]);
    ctx.fillStyle = rgba([240, 250, 252], 0.85);
    ctx.fillRect(lerp(gBotL.x, gBotR.x, 0.5) - 2, lerp(gBotL.y, gBotR.y, 0.5), 4, (bL.y - gBotL.y) * 0.9);
  }

  // Foam where the spillways hit the river.
  ctx.fillStyle = rgba([240, 250, 252], 0.5);
  const foamY = lerp(topAt(0.5).y, botAt(0.5).y, 0.94);
  ctx.beginPath();
  ctx.ellipse((bl.x + br.x) / 2, foamY, (br.x - bl.x) * 0.2, Math.max(3, (br.y - bl.y) * 0.03), 0, 0, Math.PI * 2);
  ctx.fill();

  // Shadowed base, so the wall sits in the water instead of floating.
  ctx.fillStyle = rgba([40, 32, 26], 0.28);
  ctx.beginPath();
  for (let k = 0; k <= 8; k++) {
    const f = k / 8;
    const tp = topAt(f);
    const bp = botAt(f);
    if (!tp || !bp) continue;
    const x = lerp(tp.x, bp.x, 0.85);
    const y = lerp(tp.y, bp.y, 0.85);
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let k = 8; k >= 0; k--) {
    const bp = botAt(k / 8);
    if (!bp) continue;
    ctx.lineTo(bp.x, bp.y);
  }
  ctx.closePath();
  ctx.fill();
}

// The runway in the flat valley past the dam.
function drawRunway(ctx, cam, focal, w) {
  const s0 = RUNWAY_S;
  const s1 = RUNWAY_S + RUNWAY_LENGTH;
  if (s1 < cam.s + 40 || s0 > cam.s + VIEW_DISTANCE) return;
  const cx = centreXAt(s0);
  const hw = 26;
  const a = project(cam, focal, w, cx - hw, 2, s0);
  const b = project(cam, focal, w, cx + hw, 2, s0);
  const c = project(cam, focal, w, cx + hw, 2, s1);
  const d = project(cam, focal, w, cx - hw, 2, s1);
  if (!a || !b || !c || !d) return;
  ctx.fillStyle = rgb([43, 43, 48]);
  poly(ctx, [a, b, c, d]);
  // Threshold bar at the runway start: a wide white stripe the pilot
  // (and the land screenshot) can read at a glance.
  const t1 = project(cam, focal, w, cx - hw, 2.4, s0 + 8);
  const t2 = project(cam, focal, w, cx + hw, 2.4, s0 + 8);
  const t3 = project(cam, focal, w, cx + hw, 2.4, s0 + 22);
  const t4 = project(cam, focal, w, cx - hw, 2.4, s0 + 22);
  if (t1 && t2 && t3 && t4) {
    ctx.fillStyle = rgb([240, 240, 230]);
    poly(ctx, [t1, t2, t3, t4]);
  }
  // Centreline dashes.
  ctx.fillStyle = rgb([240, 240, 230]);
  for (let s = s0 + 20; s < s1; s += 60) {
    const p1 = project(cam, focal, w, cx - 1.5, 2.4, s);
    const p2 = project(cam, focal, w, cx + 1.5, 2.4, s);
    const p3 = project(cam, focal, w, cx + 1.5, 2.4, s + 28);
    const p4 = project(cam, focal, w, cx - 1.5, 2.4, s + 28);
    if (p1 && p2 && p3 && p4) poly(ctx, [p1, p2, p3, p4]);
  }
  // Amber edge lights.
  ctx.fillStyle = rgb(GOLD);
  for (let s = s0; s <= s1; s += 50) {
    for (const side of [-1, 1]) {
      const p = project(cam, focal, w, cx + side * hw, 2.5, s);
      if (p) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

// The rings: gold for the next one, green for cleared, grey for missed.
function drawRings(ctx, cam, focal, w, flight) {
  for (const ring of RINGS) {
    if (ring.s < cam.s + 30 || ring.s > cam.s + VIEW_DISTANCE) continue;
    // The dam wall hides any ring behind it.
    if (cam.s < DAM_S && ring.s > DAM_S) continue;
    const c = project(cam, focal, w, ring.x, ring.y, ring.s);
    if (!c) continue;
    const r = Math.max(3, ring.r * c.scale * 0.92);
    const state = ring.index < flight.ringIndex
      ? (flight.ringsCleared > ring.index ? 'cleared' : 'missed')
      : ring.index === flight.ringIndex
        ? 'next'
        : 'later';
    let col = GOLD;
    if (state === 'cleared') col = GREEN;
    else if (state === 'missed') col = GREY;
    else if (state === 'later') col = [255, 220, 140];
    ctx.save();
    ctx.strokeStyle = rgb(col);
    ctx.shadowColor = rgb(col);
    ctx.shadowBlur = state === 'next' ? 18 : 6;
    ctx.lineWidth = Math.max(2.5, r * 0.1);
    ctx.globalAlpha = state === 'later' ? 0.55 : 0.95;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, r, r * 0.94, 0, 0, Math.PI * 2);
    ctx.stroke();
    // The next ring gets a second, wider halo so it reads as a lit
    // golden gate from far down the canyon.
    if (state === 'next') {
      ctx.globalAlpha = 0.28;
      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(2, r * 0.05);
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, r * 1.2, r * 1.13, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    // Ring number above the next ring.
    if (state === 'next') {
      ctx.fillStyle = rgb(GOLD);
      ctx.font = `bold ${Math.max(13, r * 0.22) | 0}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`${ring.index + 1}`, c.x, c.y - r - 8);
    }
  }
}

// -- the aircraft (chase view) -------------------------------------------

export function drawChasePlane(ctx, w, h, roll, throttle) {
  const px = w / 2;
  const py = h * 0.63;
  const size = Math.min(w, h) * 0.115;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(roll * 0.9);
  ctx.scale(1, 1);

  // Wings, swept back, teal underneath.
  ctx.fillStyle = rgb([232, 120, 52]);
  ctx.beginPath();
  ctx.moveTo(-size * 1.05, size * 0.08);
  ctx.lineTo(-size * 0.18, -size * 0.06);
  ctx.lineTo(-size * 0.14, size * 0.16);
  ctx.lineTo(-size * 0.95, size * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(size * 1.05, size * 0.08);
  ctx.lineTo(size * 0.18, -size * 0.06);
  ctx.lineTo(size * 0.14, size * 0.16);
  ctx.lineTo(size * 0.95, size * 0.3);
  ctx.closePath();
  ctx.fill();

  // Fuselage, cream with an orange spine.
  ctx.fillStyle = rgb([245, 230, 200]);
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.62);
  ctx.quadraticCurveTo(size * 0.16, -size * 0.2, size * 0.13, size * 0.42);
  ctx.quadraticCurveTo(size * 0.07, size * 0.58, 0, size * 0.58);
  ctx.quadraticCurveTo(-size * 0.07, size * 0.58, -size * 0.13, size * 0.42);
  ctx.quadraticCurveTo(-size * 0.16, -size * 0.2, 0, -size * 0.62);
  ctx.fill();
  ctx.fillStyle = rgb([232, 120, 52]);
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.62);
  ctx.quadraticCurveTo(size * 0.07, -size * 0.2, size * 0.05, size * 0.3);
  ctx.lineTo(-size * 0.05, size * 0.3);
  ctx.quadraticCurveTo(-size * 0.07, -size * 0.2, 0, -size * 0.62);
  ctx.fill();

  // Canopy.
  ctx.fillStyle = rgb([24, 64, 78]);
  ctx.beginPath();
  ctx.ellipse(0, -size * 0.28, size * 0.085, size * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba([160, 220, 235], 0.8);
  ctx.beginPath();
  ctx.ellipse(-size * 0.02, -size * 0.32, size * 0.03, size * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tail fin and stabilisers.
  ctx.fillStyle = rgb([38, 96, 104]);
  ctx.beginPath();
  ctx.moveTo(0, size * 0.5);
  ctx.lineTo(-size * 0.1, size * 0.78);
  ctx.lineTo(0, size * 0.72);
  ctx.lineTo(size * 0.1, size * 0.78);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = rgb([232, 120, 52]);
  ctx.beginPath();
  ctx.moveTo(-size * 0.3, size * 0.5);
  ctx.lineTo(-size * 0.06, size * 0.46);
  ctx.lineTo(-size * 0.06, size * 0.56);
  ctx.lineTo(-size * 0.3, size * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(size * 0.3, size * 0.5);
  ctx.lineTo(size * 0.06, size * 0.46);
  ctx.lineTo(size * 0.06, size * 0.56);
  ctx.lineTo(size * 0.3, size * 0.6);
  ctx.closePath();
  ctx.fill();

  // Engine glow at full throttle.
  if (throttle > 0.85) {
    ctx.fillStyle = rgba([255, 200, 90], 0.85);
    ctx.beginPath();
    ctx.ellipse(0, size * 0.62, size * 0.05, size * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// -- cockpit ---------------------------------------------------------------

// A round gauge: face, ticks, a needle and a digital readout.
function gauge(ctx, x, y, r, label, valueText, frac, accent) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = rgb([12, 22, 28]);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgb([120, 90, 60]);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = rgba([255, 210, 122], 0.85);
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78);
    ctx.lineTo(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92);
    ctx.stroke();
  }
  const a = -Math.PI * 0.75 + clamp(frac, 0, 1) * Math.PI * 1.5;
  ctx.strokeStyle = rgb(accent);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72);
  ctx.stroke();
  ctx.fillStyle = rgb([255, 210, 122]);
  ctx.font = `bold ${Math.max(9, r * 0.24) | 0}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(valueText, 0, r * 0.42);
  ctx.font = `${Math.max(8, r * 0.18) | 0}px sans-serif`;
  ctx.fillStyle = rgba([255, 210, 122], 0.75);
  ctx.fillText(label, 0, -r * 0.52);
  ctx.restore();
}

// The cockpit: glareshield, lit instruments, canopy pillars.
export function drawCockpit(ctx, w, h, flight) {
  const panelH = h * 0.24;
  const top = h - panelH;

  // Canopy pillars.
  ctx.fillStyle = rgb([16, 24, 30]);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w * 0.07, 0);
  ctx.lineTo(w * 0.1, top);
  ctx.lineTo(0, top);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w, 0);
  ctx.lineTo(w * 0.93, 0);
  ctx.lineTo(w * 0.9, top);
  ctx.lineTo(w, top);
  ctx.closePath();
  ctx.fill();

  // Instrument panel.
  const g = ctx.createLinearGradient(0, top, 0, h);
  g.addColorStop(0, rgb([26, 34, 40]));
  g.addColorStop(1, rgb([10, 16, 20]));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, top + 18);
  ctx.quadraticCurveTo(w / 2, top - 14, w, top + 18);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgba([255, 210, 122], 0.35);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, top + 18);
  ctx.quadraticCurveTo(w / 2, top - 14, w, top + 18);
  ctx.stroke();

  // Attitude indicator, centre.
  const ax = w / 2;
  const ay = top + panelH * 0.52;
  const ar = panelH * 0.42;
  ctx.save();
  ctx.translate(ax, ay);
  ctx.beginPath();
  ctx.arc(0, 0, ar, 0, Math.PI * 2);
  ctx.clip();
  ctx.rotate(-flight.roll * 0.7);
  ctx.fillStyle = rgb([46, 110, 120]);
  ctx.fillRect(-ar, -ar, ar * 2, ar);
  ctx.fillStyle = rgb([120, 74, 40]);
  ctx.fillRect(-ar, 0, ar * 2, ar);
  ctx.fillStyle = rgb([255, 210, 122]);
  ctx.fillRect(-ar, -1.5, ar * 2, 3);
  ctx.restore();
  ctx.strokeStyle = rgb([120, 90, 60]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(ax, ay, ar, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = rgb([255, 210, 122]);
  ctx.beginPath();
  ctx.moveTo(ax - 14, ay);
  ctx.lineTo(ax + 14, ay);
  ctx.lineTo(ax, ay + 5);
  ctx.closePath();
  ctx.fill();

  // Gauges left and right of the attitude indicator.
  const gr = panelH * 0.3;
  const gy = top + panelH * 0.5;
  gauge(ctx, w * 0.2, gy, gr, 'AIRSPEED kt', String(Math.round(flight.speed * 1.9)), flight.speed / 150, [125, 220, 125]);
  gauge(ctx, w * 0.32, gy, gr, 'ALT ft', String(Math.round(flight.y * 3.28)), clamp(flight.y / 350, 0, 1), [255, 210, 122]);
  gauge(ctx, w * 0.68, gy, gr, 'V/S fpm', String(verticalSpeedFpm(flight)), clamp(0.5 + flight.pitch * 0.5, 0, 1), [160, 220, 235]);
  gauge(ctx, w * 0.8, gy, gr, 'THR %', String(Math.round(flight.throttle * 100)), flight.throttle, [232, 120, 52]);

  // Fuel bar, far right.
  const fx = w * 0.9;
  const fh = panelH * 0.62;
  const fy = top + panelH * 0.2;
  ctx.fillStyle = rgb([12, 22, 28]);
  ctx.fillRect(fx, fy, 14, fh);
  const fuelFrac = clamp(flight.fuel / 100, 0, 1);
  ctx.fillStyle = fuelFrac < 0.25 ? rgb([220, 70, 50]) : rgb([125, 220, 125]);
  ctx.fillRect(fx, fy + fh * (1 - fuelFrac), 14, fh * fuelFrac);
  ctx.fillStyle = rgb([255, 210, 122]);
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('FUEL', fx + 7, fy - 6);
}

// -- top-level scene render ------------------------------------------------

// Render one frame of the world for a given view ('chase' | 'cockpit' |
// 'title'). The flight state is read, never changed.
export function renderWorld(ctx, w, h, flight, view, time) {
  let cam;
  if (view === 'cockpit') {
    cam = makeCamera(flight.x, flight.y, flight.s, flight.roll * 0.4, h * 0.46);
  } else if (view === 'title') {
    const ts = 2600 + time * 12;
    cam = makeCamera(centreXAt(ts), 215, ts, 0, h * 0.5);
  } else {
    cam = makeCamera(flight.x, flight.y + 24, Math.max(0, flight.s - 95), flight.roll * 0.55, h * 0.52);
  }

  // The sun sits high on the right so it never hides behind the
  // title text.
  const sunX = w * 0.82;
  const sunY = h * 0.22;
  drawSky(ctx, w, h, sunX, sunY);
  drawCanyon(ctx, cam, w, h, flight);

  if (view === 'chase') {
    drawChasePlane(ctx, w, h, flight.roll, flight.throttle);
  } else if (view === 'cockpit') {
    drawCockpit(ctx, w, h, flight);
  } else if (view === 'title') {
    // A lone aircraft silhouetted against the setting sun, out on the
    // right where the title text never reaches it, banking gently.
    ctx.save();
    ctx.translate(w * 0.79, h * 0.36);
    ctx.rotate(-0.14);
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = rgb([30, 18, 14]);
    ctx.beginPath();
    ctx.moveTo(-70, 6);
    ctx.lineTo(-12, -4);
    ctx.lineTo(-10, 10);
    ctx.lineTo(-64, 20);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(70, 6);
    ctx.lineTo(12, -4);
    ctx.lineTo(10, 10);
    ctx.lineTo(64, 20);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -34);
    ctx.quadraticCurveTo(10, -8, 8, 26);
    ctx.quadraticCurveTo(4, 34, 0, 34);
    ctx.quadraticCurveTo(-4, 34, -8, 26);
    ctx.quadraticCurveTo(-10, -8, 0, -34);
    ctx.fill();
    ctx.restore();
  }
}
