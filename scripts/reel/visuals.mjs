// Original diagram frames for reels, 1080×1920. Colours from brand/tokens.json
// (ink #000000, editorial-gray #EEEEEE, reversed-text #FFFFFF) plus the blue-ink hex as the single accent.
import fs from 'node:fs';
import path from 'node:path';
import {ROOT} from '../core.mjs';

const tokens = JSON.parse(fs.readFileSync(path.join(ROOT, 'brand/tokens.json'), 'utf8'));
const INK = tokens.color.ink.value,
  GRAY = tokens.color['editorial-gray'].value,
  WHITE = tokens.color['reversed-text'].value;
const BLUE = JSON.stringify(tokens).match(/"inkHex":"(#[0-9A-Fa-f]{6})"/)[1];
// Instagram Reels UI-safe area (top bar, right action rail, bottom caption/buttons).
export const SAFE = {x0: 60, y0: 220, x1: 960, y1: 1500};

const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
const item = (beat, i, reveal, style = '', cls = 'lab') =>
  `<div class="${cls}" data-fact="${i}" style="${style};opacity:${i < reveal ? 1 : 0}">${esc(beat.onScreen[i].text)}</div>`;

const css = `*{margin:0;box-sizing:border-box}body{width:1080px;height:1920px;background:${GRAY};font-family:Manrope;color:${INK};position:relative;overflow:hidden}
.brand{position:absolute;left:80px;top:236px;font:500 30px Plex;letter-spacing:.04em}
.rule{position:absolute;left:80px;right:120px;top:286px;border-top:3px solid ${INK}}
.stage{position:absolute;left:0;top:310px;width:1080px;height:820px}
.lab{position:absolute;font-weight:800;font-size:58px;line-height:1.08;letter-spacing:-.01em}
.tag{position:absolute;font:500 34px Plex;background:${INK};color:${WHITE};padding:10px 18px}
#sub{position:absolute;left:80px;width:860px;top:1190px;text-align:center;font-weight:800;font-size:56px;line-height:1.36;color:${WHITE}}
#sub span{background:${INK};padding:6px 16px;box-decoration-break:clone;-webkit-box-decoration-break:clone}
#credit{position:absolute;left:80px;top:1086px;max-width:860px;font:500 22px Plex;color:${WHITE};background:rgba(0,0,0,.55);padding:4px 10px}`;

function photoStage(beat, reveal, ph, hook) {
  const title = hook
    ? `<div class="lab" style="left:80px;top:60px;width:820px;font-size:92px;background:${GRAY};padding:16px 22px"><span data-fact="0">${esc(beat.onScreen[0].text)}</span> kebanjiran <span data-fact="1" style="color:${BLUE}">${esc(beat.onScreen[1].text)}</span></div>`
    : beat.onScreen
        .map((o, i) => item(beat, i, reveal, `left:80px;top:${60 + i * 110}px;background:${GRAY};padding:12px 20px${i ? ';font-size:44px' : ''}`))
        .join('');
  return `<img src="${ph.src}" style="position:absolute;left:0;top:0;width:1080px;height:820px;object-fit:cover">${title}`;
}

function pile(beat, reveal) {
  const n = 3 + reveal * 3;
  const cards = Array.from(
    {length: n},
    (_, k) =>
      `<rect x="${640 + ((k * 37) % 90) - 45}" y="${640 - k * 34}" width="300" height="70" rx="6" fill="${k === n - 1 ? BLUE : WHITE}" stroke="${INK}" stroke-width="4" transform="rotate(${((k * 13) % 9) - 4} 790 ${675 - k * 34})"/>`
  ).join('');
  return `<svg width="1080" height="820" style="position:absolute;left:0;top:0">
<rect x="130" y="610" width="200" height="150" fill="${INK}"/><text x="230" y="700" fill="${WHITE}" font-family="Manrope" font-weight="800" font-size="34" text-anchor="middle">GRID</text>
<path d="M340 685 H600" stroke="${INK}" stroke-width="6"/>${cards}
<text x="790" y="790" font-family="Plex" font-size="28" text-anchor="middle">permohonan sambungan</text></svg>
${item(beat, 0, reveal, 'left:80px;top:40px', 'tag')}${item(beat, 1, reveal, 'left:80px;top:120px;font-size:96px')}${item(beat, 2, reveal, `left:80px;top:250px;width:470px;color:${BLUE}`)}`;
}

function queue(beat, reveal) {
  const dots = Array.from({length: 7}, (_, k) => `<circle cx="${140 + k * 70}" cy="250" r="24" fill="${INK}"/>`).join('');
  const lanes = [1, 2, 3, 4]
    .map(
      (g, k) =>
        `<rect x="140" y="${470 + k * 80}" width="680" height="60" fill="${WHITE}" stroke="${INK}" stroke-width="4"/><text x="170" y="${511 + k * 80}" font-family="Plex" font-size="30">${g}</text>`
    )
    .join('');
  return `<svg width="1080" height="820" style="position:absolute;left:0;top:0">${dots}
<path d="M120 250 H660" stroke="${BLUE}" stroke-width="10" opacity="${reveal >= 3 ? 1 : 0}"/>
<path d="M480 300 V420 M455 395 L480 425 L505 395" stroke="${INK}" stroke-width="6" fill="none" opacity="${reveal >= 3 ? 1 : 0}"/>
<g opacity="${reveal >= 3 ? 1 : 0}">${lanes}</g></svg>
${item(beat, 0, reveal, 'left:80px;top:40px', 'tag')}${item(beat, 1, reveal, 'left:80px;top:120px;font-size:48px')}${item(beat, 2, reveal, `left:140px;top:770px;font-size:44px;color:${BLUE}`)}`;
}

function lanes(beat, reveal) {
  const rows = [1, 2, 3, 4]
    .map(
      (g, k) =>
        `<rect x="140" y="${200 + k * 120}" width="760" height="96" fill="${k === 2 ? BLUE : WHITE}" stroke="${INK}" stroke-width="4"/><text x="175" y="${262 + k * 120}" font-family="Plex" font-size="36" fill="${k === 2 ? WHITE : INK}">Kelompok ${g}</text>`
    )
    .join('');
  const dc = `<g transform="translate(700 ${428})"><rect width="150" height="72" fill="${INK}"/>${[0, 1, 2].map(r => `<rect x="14" y="${10 + r * 20}" width="122" height="10" fill="${WHITE}"/>`).join('')}</g>`;
  return `<svg width="1080" height="820" style="position:absolute;left:0;top:0">${rows}${reveal >= 1 ? dc : ''}</svg>
${item(beat, 0, reveal, 'left:80px;top:40px;font-size:60px')}${item(beat, 1, reveal, 'left:140px;top:700px', 'tag')}`;
}

function bars(beat, reveal) {
  const base = 300,
    h2 = base * 1.4;
  return `<svg width="1080" height="820" style="position:absolute;left:0;top:0">
<rect x="560" y="${760 - base}" width="150" height="${base}" fill="${WHITE}" stroke="${INK}" stroke-width="4"/>
<rect x="760" y="${760 - h2}" width="150" height="${h2}" fill="${BLUE}" opacity="${reveal >= 2 ? 1 : 0}"/>
<text x="635" y="800" font-family="Plex" font-size="30" text-anchor="middle">2025</text>
<text x="835" y="800" font-family="Plex" font-size="30" text-anchor="middle" opacity="${reveal >= 2 ? 1 : 0}">potensi</text></svg>
${item(beat, 0, reveal, 'left:80px;top:40px;font-size:140px')}${item(beat, 1, reveal, `left:80px;top:250px;font-size:76px;color:${BLUE}`)}${item(beat, 2, reveal, 'left:80px;top:360px;font-size:36px;width:420px')}${item(beat, 3, reveal, 'left:80px;top:440px', 'tag')}`;
}

const STAGES = {pile, queue, lanes, bars};
export function visual(beat, reveal, ph, sub, hook) {
  const stage = beat.visual === 'photo' ? photoStage(beat, reveal, ph, hook) : STAGES[beat.visual](beat, reveal);
  return `<style>${css}</style><div class="brand">akalmesin</div><div class="rule"></div><div class="stage">${stage}</div>${ph ? `<div id="credit">${esc(ph.credit)}</div>` : ''}<div id="sub"><span>${esc(sub)}</span></div>`;
}
