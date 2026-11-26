// Sunset Red Canyon — the heads-up display.
//
// Every readout the brief asks for, always visible while flying:
// altitude, speed, heading, vertical speed, throttle, fuel, ring count,
// timer, score and wind. The HUD is drawn on the canvas so it shows in
// screenshots exactly as the player sees it.

import { clamp } from './rng.js';
import { nextRing, verticalSpeedFpm } from './flight.js';

const AMBER = 'rgb(255,210,122)';
const DIM = 'rgba(255,210,122,0.65)';
const PANEL = 'rgba(10,20,26,0.62)';
const GREEN = 'rgb(125,220,125)';
const RED = 'rgb(230,90,70)';

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PANEL;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6);
  ctx.fill();
}

function label(ctx, x, y, text, size = 10) {
  ctx.fillStyle = DIM;
  ctx.font = `${size}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText(text, x, y);
}

function value(ctx, x, y, text, size = 20, color = AMBER) {
  ctx.fillStyle = color;
  ctx.font = `bold ${size}px monospace`;
  ctx.textAlign = 'left';
  ctx.fillText(text, x, y);
}

function fmtTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Heading in degrees from the route direction and the bank angle.
function headingOf(flight) {
  return Math.round(((flight.roll * 28 + 360) % 360));
}

// The compass strip across the top centre.
function drawCompass(ctx, w, flight) {
  const cx = w / 2;
  const hdg = headingOf(flight);
  ctx.save();
  ctx.fillStyle = PANEL;
  ctx.beginPath();
  ctx.roundRect(cx - 160, 10, 320, 30, 6);
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = AMBER;
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  for (let d = -45; d <= 45; d += 15) {
    const deg = (hdg + d + 360) % 360;
    const x = cx + d * 2.4;
    const name = deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : String(deg).padStart(3, '0');
    ctx.fillText(name, x, 30);
    ctx.fillRect(x - 0.5, 12, 1, 5);
  }
  ctx.restore();
  // Centre caret.
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.moveTo(cx - 6, 10);
  ctx.lineTo(cx + 6, 10);
  ctx.lineTo(cx, 18);
  ctx.closePath();
  ctx.fill();
}

export function drawHud(ctx, w, h, flight) {
  // Left block: altitude, speed, heading, vertical speed.
  panel(ctx, 14, 14, 168, 118);
  label(ctx, 26, 32, 'ALTITUDE');
  value(ctx, 26, 54, `${Math.round(flight.y * 3.28)} ft`);
  label(ctx, 26, 74, 'AIRSPEED');
  value(ctx, 26, 96, `${Math.round(flight.speed * 1.9)} kt`);
  label(ctx, 26, 116, `HDG ${String(headingOf(flight)).padStart(3, '0')}°  V/S ${verticalSpeedFpm(flight) >= 0 ? '+' : ''}${verticalSpeedFpm(flight)} fpm`, 11);

  // Right block: throttle, fuel, wind.
  panel(ctx, w - 182, 14, 168, 118);
  label(ctx, w - 170, 32, 'THROTTLE');
  const thr = Math.round(flight.throttle * 100);
  value(ctx, w - 170, 54, `${thr}%`, 20, thr > 85 ? RED : AMBER);
  label(ctx, w - 170, 74, 'FUEL');
  const fuelColor = flight.fuel < 25 ? RED : flight.fuel < 50 ? AMBER : GREEN;
  value(ctx, w - 170, 96, `${Math.round(flight.fuel)}`, 20, fuelColor);
  ctx.fillStyle = 'rgba(255,210,122,0.25)';
  ctx.fillRect(w - 170, 102, 144, 6);
  ctx.fillStyle = fuelColor;
  ctx.fillRect(w - 170, 102, 144 * clamp(flight.fuel / 100, 0, 1), 6);
  label(ctx, w - 170, 126, `WIND ${Math.round(flight.wind)} kt ←`, 11);

  drawCompass(ctx, w, flight);

  // Ring progress, top right under the fuel block.
  const ring = nextRing(flight);
  panel(ctx, w - 182, 140, 168, 64);
  label(ctx, w - 170, 158, 'RINGS');
  value(ctx, w - 170, 182, `${flight.ringsCleared}/12`, 22, flight.ringsCleared >= 12 ? GREEN : AMBER);
  ctx.fillStyle = DIM;
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(ring ? `NEXT: RING ${ring.index + 1}` : 'ROUTE CLEAR', w - 96, 178);

  // Timer and score, bottom left.
  panel(ctx, 14, h - 58, 190, 44);
  label(ctx, 26, h - 40, 'TIME');
  value(ctx, 26, h - 20, fmtTime(flight.time), 18);
  label(ctx, 118, h - 40, 'SCORE');
  value(ctx, 118, h - 20, String(flight.score), 18);

  // Throttle bar, bottom centre.
  const bw = 220;
  const bx = w / 2 - bw / 2;
  ctx.fillStyle = PANEL;
  ctx.beginPath();
  ctx.roundRect(bx - 10, h - 40, bw + 20, 26, 6);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,210,122,0.25)';
  ctx.fillRect(bx, h - 30, bw, 6);
  ctx.fillStyle = AMBER;
  ctx.fillRect(bx, h - 30, bw * clamp(flight.throttle, 0, 1), 6);
  ctx.fillStyle = DIM;
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('THR', bx - 22, h - 21);
  ctx.fillText('W/S', bx + bw + 24, h - 21);

  // Toast message, centre.
  if (flight.message && flight.time < flight.messageUntil) {
    ctx.save();
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = AMBER;
    ctx.fillText(flight.message, w / 2, h * 0.32);
    ctx.restore();
  }
}
