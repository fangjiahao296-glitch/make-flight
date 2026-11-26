// Sunset Red Canyon — bootstrap, input, screens and the game loop.
//
// The game runs on one canvas. Screens: title, flying, paused, landed
// and crashed (the flight log). Keyboard flies the aircraft; the mouse
// nudges the view. URL parameters stage deterministic scenes for
// screenshots: ?shot=title|chase|cockpit|land&seed=1 renders one fixed
// frame and sets window.__shotReady so a screenshot tool can capture it.

import { makeRng, clamp } from './rng.js';
import { centreXAt, RUNWAY_S, RUNWAY_LENGTH, DAM_S, RINGS } from './route.js';
window.__route = { centreXAt, RINGS, RUNWAY_S, RUNWAY_LENGTH, DAM_S };
import { createFlight, updateFlight, toast, nextRing } from './flight.js';
import { renderWorld } from './render.js';
import { drawHud } from './hud.js';
import { createSound } from './sound.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const SEED = Number(params.get('seed') || 1);
makeRng(SEED); // the seed pins the world; the route itself is fixed

const flight = createFlight();
const sound = createSound();
window.__flight = flight; // debug hook: automated checks read the live state
let best = 0;
try {
  best = Number(localStorage.getItem('sunset-red-canyon-best') || 0);
} catch {
  best = 0;
}
flight.best = best;

let view = 'chase'; // chase | cockpit
let mouseX = 0;
let mouseY = 0;
let lastFrame = performance.now();

const keys = new Set();

function readInput() {
  // Arrows fly the aircraft: Up climbs, Down descends, Left/Right bank.
  // A/D also bank. W/S are the throttle only — they never touch pitch.
  const pitch = (keys.has('ArrowUp') ? 1 : 0)
    + (keys.has('ArrowDown') ? -1 : 0);
  const roll = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0)
    + (keys.has('ArrowLeft') || keys.has('KeyA') ? -1 : 0);
  return {
    pitch,
    roll,
    throttleUp: keys.has('KeyW'),
    throttleDown: keys.has('KeyS'),
  };
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function saveBest() {
  if (flight.score > flight.best) {
    flight.best = flight.score;
    try {
      localStorage.setItem('sunset-red-canyon-best', String(flight.best));
    } catch {
      // Storage may be unavailable; the best score is a bonus, not a rule.
    }
  }
}

// -- screens ---------------------------------------------------------------

function drawTitle(time) {
  renderWorld(ctx, canvas.clientWidth, canvas.clientHeight, flight, 'title', time);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.fillStyle = 'rgba(10,18,24,0.28)';
  ctx.fillRect(0, 0, w, h);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd27a';
  ctx.font = `bold ${Math.round(w * 0.052)}px Georgia, serif`;
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 16;
  ctx.fillText('SUNSET RED CANYON', w / 2, h * 0.3);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffe9bd';
  ctx.font = `${Math.round(w * 0.016)}px Georgia, serif`;
  ctx.fillText('— a dusk flight through twelve stone arches —', w / 2, h * 0.3 + 34);

  ctx.fillStyle = 'rgba(10,20,26,0.72)';
  ctx.beginPath();
  ctx.roundRect(w / 2 - 260, h * 0.46, 520, 190, 10);
  ctx.fill();
  ctx.fillStyle = '#ffd27a';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('▶  NEW GAME — press ENTER', w / 2, h * 0.46 + 44);
  ctx.fillStyle = '#ffe9bd';
  ctx.font = '15px sans-serif';
  ctx.fillText('ARROWS — pitch and roll      A / D — bank      W / S — throttle', w / 2, h * 0.46 + 82);
  ctx.fillText('C — cockpit view      P — pause      M — mute', w / 2, h * 0.46 + 108);
  ctx.fillText('Fly all 12 rings, mind your fuel, land on the runway.', w / 2, h * 0.46 + 134);
  ctx.fillStyle = '#7ddc7d';
  ctx.font = 'bold 15px monospace';
  ctx.fillText(`BEST SCORE  ${flight.best}`, w / 2, h * 0.46 + 168);
}

function drawPaused() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.fillStyle = 'rgba(10,18,24,0.55)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd27a';
  ctx.font = 'bold 44px Georgia, serif';
  ctx.fillText('PAUSED', w / 2, h * 0.42);
  ctx.fillStyle = '#ffe9bd';
  ctx.font = '17px sans-serif';
  ctx.fillText('P — resume      R — restart from the last ring      ENTER — resume', w / 2, h * 0.42 + 40);
}

function drawFlightLog() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.fillStyle = 'rgba(10,18,24,0.45)';
  ctx.fillRect(0, 0, w, h);
  const landed = flight.screen === 'landed';
  ctx.textAlign = 'center';
  ctx.fillStyle = landed ? '#7ddc7d' : '#e65a46';
  ctx.font = 'bold 40px Georgia, serif';
  ctx.fillText(landed ? 'FLIGHT LOG — LANDED' : 'FLIGHT LOG — DOWN', w / 2, h * 0.22);
  ctx.fillStyle = '#ffd27a';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(flight.rating, w / 2, h * 0.22 + 34);

  const rows = [
    ['RINGS CLEARED', `${flight.ringsCleared} / 12`],
    ['RINGS MISSED', String(flight.ringsMissed)],
    ['FLIGHT TIME', `${Math.floor(flight.time / 60)}:${String(Math.floor(flight.time % 60)).padStart(2, '0')}`],
    ['FUEL LEFT', `${Math.round(flight.fuel)}`],
    ['CRASHES', String(flight.crashes)],
    ['SCORE', String(flight.score)],
    ['BEST SCORE', String(flight.best)],
  ];
  ctx.fillStyle = 'rgba(10,20,26,0.62)';
  ctx.beginPath();
  ctx.roundRect(w / 2 - 240, h * 0.32, 480, rows.length * 34 + 28, 10);
  ctx.fill();
  rows.forEach((row, i) => {
    const y = h * 0.32 + 34 + i * 34;
    ctx.fillStyle = 'rgba(255,210,122,0.7)';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(row[0], w / 2 - 210, y);
    ctx.fillStyle = '#ffd27a';
    ctx.font = 'bold 17px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(row[1], w / 2 + 210, y);
  });
  ctx.fillStyle = '#ffe9bd';
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ENTER — fly again      (your best score is saved on this machine)', w / 2, h * 0.32 + rows.length * 34 + 62);
}

// -- deterministic screenshot scenes ---------------------------------------

function stageShot(shot) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (shot === 'title') {
    flight.screen = 'title';
    renderWorld(ctx, w, h, flight, 'title', 4.2);
    drawTitle(4.2);
  } else if (shot === 'chase') {
    // Diving toward ring 5 — the bridge opening — HUD fully lit.
    flight.screen = 'flying';
    flight.s = 4200 - 320;
    flight.x = centreXAt(flight.s) + 18;
    flight.y = 128;
    flight.pitch = -0.25;
    flight.roll = 0.35;
    flight.speed = 132;
    flight.throttle = 0.86;
    flight.fuel = 61;
    flight.time = 38;
    flight.score = 1500;
    flight.ringIndex = 5;
    flight.ringsCleared = 5;
    flight.message = 'RING 5/12  +250';
    flight.messageUntil = flight.time + 1.8;
    renderWorld(ctx, w, h, flight, 'chase', 0);
    drawHud(ctx, w, h, flight);
  } else if (shot === 'cockpit') {
    // Low over the river, the dam dead ahead, instruments lit.
    flight.screen = 'flying';
    flight.s = DAM_S - 700;
    flight.x = centreXAt(flight.s);
    flight.y = 62;
    flight.pitch = -0.05;
    flight.roll = -0.08;
    flight.speed = 118;
    flight.throttle = 0.72;
    flight.fuel = 44;
    flight.time = 68;
    flight.score = 2250;
    flight.ringIndex = 10;
    flight.ringsCleared = 10;
    renderWorld(ctx, w, h, flight, 'cockpit', 0);
    drawHud(ctx, w, h, flight);
  } else if (shot === 'land') {
    // Just past the runway threshold, wheels down, flight log up.
    flight.screen = 'landed';
    flight.s = RUNWAY_S + 60;
    flight.x = centreXAt(RUNWAY_S) + 4;
    flight.y = 6;
    flight.speed = 42;
    flight.throttle = 0.15;
    flight.fuel = 31;
    flight.time = 96;
    flight.score = 3750;
    flight.ringIndex = 12;
    flight.ringsCleared = 12;
    flight.ringsMissed = 0;
    flight.crashes = 0;
    flight.rating = 'S — CANYON ACE';
    flight.best = 3750;
    renderWorld(ctx, w, h, flight, 'chase', 0);
    drawFlightLog();
  }
  window.__shotReady = true;
}

// -- the loop ---------------------------------------------------------------

function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  if (flight.screen === 'title') {
    drawTitle(now / 1000);
  } else if (flight.screen === 'flying') {
    const input = readInput();
    // The mouse nudges the view a little, never the aircraft.
    input.roll += clamp(mouseX * 0.25, -0.2, 0.2);
    const before = flight.ringsCleared;
    const crashesBefore = flight.crashes;
    const prevScreen = flight.screen;
    updateFlight(flight, input, dt);
    if (flight.ringsCleared > before) sound.ring();
    if (flight.crashes > crashesBefore) sound.crash();
    if (flight.screen === 'flying' && flight.message.startsWith('MISSED')) sound.miss();
    if (flight.screen === 'landed' && prevScreen === 'flying') {
      sound.land();
      saveBest();
    }
    if (flight.screen === 'crashed' && prevScreen === 'flying') {
      saveBest();
    }
    sound.engine(flight.throttle, flight.screen === 'flying');
    renderWorld(ctx, w, h, flight, view, now / 1000);
    drawHud(ctx, w, h, flight);
  } else if (flight.screen === 'paused') {
    renderWorld(ctx, w, h, flight, view, now / 1000);
    drawHud(ctx, w, h, flight);
    drawPaused();
  } else if (flight.screen === 'landed' || flight.screen === 'crashed') {
    renderWorld(ctx, w, h, flight, 'chase', now / 1000);
    drawFlightLog();
  }

  if (!SHOT) requestAnimationFrame(frame);
}

function startGame() {
  sound.start();
  const fresh = createFlight();
  fresh.best = flight.best;
  Object.assign(flight, fresh);
  flight.screen = 'flying';
  toast(flight, 'RING 1 AHEAD — FLY THE CANYON', 3);
}

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  sound.start();
  if (e.code === 'Enter') {
    if (flight.screen === 'title' || flight.screen === 'landed' || flight.screen === 'crashed') startGame();
    else if (flight.screen === 'paused') flight.screen = 'flying';
  } else if (e.code === 'KeyP' || e.code === 'Escape') {
    if (flight.screen === 'flying') flight.screen = 'paused';
    else if (flight.screen === 'paused') flight.screen = 'flying';
  } else if (e.code === 'KeyC') {
    view = view === 'chase' ? 'cockpit' : 'chase';
  } else if (e.code === 'KeyM') {
    sound.toggleMute();
  } else if (e.code === 'KeyR' && flight.screen === 'paused') {
    startGame();
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('mousemove', (e) => {
  mouseX = (e.clientX / window.innerWidth) * 2 - 1;
  mouseY = (e.clientY / window.innerHeight) * 2 - 1;
});
window.addEventListener('resize', resize);
canvas.addEventListener('click', () => {
  sound.start();
  if (flight.screen === 'title') startGame();
});

resize();
if (SHOT) {
  // One fixed frame, then stop: screenshots must be reproducible.
  requestAnimationFrame(() => stageShot(SHOT));
} else {
  requestAnimationFrame(frame);
}
