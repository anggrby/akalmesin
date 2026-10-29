// Reusable 2 s akalmesin logo outro (config: scripts/reel/outro.json).
// News-layout reels append it automatically unless reel.json sets "outro": false.
// Standalone: node scripts/reel/outro.mjs <out.mp4>
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {ROOT, launchBrowser, readJSON, isMain} from '../core.mjs';

export const OUTRO = readJSON(path.join(ROOT, 'scripts/reel/outro.json'));
const tokens = readJSON(path.join(ROOT, 'brand/tokens.json'));
const INK = tokens.color.ink.value,
  WHITE = tokens.color['reversed-text'].value,
  GRAY = tokens.color['editorial-gray'].value;
const BLUE = JSON.stringify(tokens).match(/"inkHex":"(#[0-9A-Fa-f]{6})"/)[1];
const b64 = f => fs.readFileSync(f).toString('base64');
const clamp = x => Math.min(1, Math.max(0, x));
const ease = x => 1 - Math.pow(1 - clamp(x), 3); // easeOutCubic
const seg = (t, a, b) => ease((t - a) / (b - a));

// Person-plus (follow) and paper-plane (share) icons, drawn here; no third-party logos.
const followIcon = c =>
  `<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><path d="M19 8v6M16 11h6"/></svg>`;
const sendIcon = c =>
  `<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/></svg>`;

export function outroHTML(t, cfg = OUTRO) {
  const font = (f, n) => `@font-face{font-family:${n};src:url(data:font/ttf;base64,${b64(path.join(ROOT, 'brand/fonts', f))})}`;
  const wm = 'data:image/png;base64,' + b64(path.join(ROOT, cfg.wordmark));
  const reveal = seg(t, 0.05, 0.6); // mask wipe
  const scale = 1.08 - 0.08 * seg(t, 0.05, 0.85); // scale settle
  const bar = seg(t, 0.35, 0.8);
  const f1 = seg(t, 0.6, 0.95),
    f2 = seg(t, 0.8, 1.15);
  const nudge = Math.sin(clamp((t - 1.15) / 0.5) * Math.PI) * 10; // send-arrow nudge
  const pop = 1 + 0.12 * Math.sin(clamp((t - 0.95) / 0.35) * Math.PI); // follow icon pop
  return `<!doctype html><style>${font('Manrope.ttf', 'Manrope')}${font('IBMPlexMono-Regular.ttf', 'Plex')}
*{margin:0;box-sizing:border-box}body{width:1080px;height:1920px;background:${INK};position:relative;overflow:hidden;font-family:Manrope}
#logo{position:absolute;left:190px;top:700px;width:700px;transform:scale(${scale.toFixed(4)});transform-origin:50% 50%;clip-path:inset(0 ${((1 - reveal) * 100).toFixed(2)}% 0 0)}
#bar{position:absolute;left:190px;top:930px;height:8px;width:${(700 * bar).toFixed(1)}px;background:${BLUE}}
.row{position:absolute;left:190px;width:700px;display:flex;align-items:center;gap:18px;padding:18px 26px;border-radius:999px}
#follow{top:1040px;background:${WHITE};color:${INK};font:800 44px Manrope;opacity:${f1.toFixed(3)};transform:translateY(${((1 - f1) * 40).toFixed(1)}px)}
#share{top:1160px;border:3px solid ${GRAY};color:${WHITE};font:600 40px Manrope;opacity:${f2.toFixed(3)};transform:translateY(${((1 - f2) * 40).toFixed(1)}px)}
</style><img id="logo" src="${wm}"><div id="bar"></div>
<div class="row" id="follow"><span style="display:inline-flex;transform:scale(${pop.toFixed(3)})">${followIcon(BLUE)}</span><span id="followText">${cfg.follow}</span></div>
<div class="row" id="share"><span style="display:inline-flex;transform:translateX(${nudge.toFixed(1)}px)">${sendIcon(WHITE)}</span><span id="shareText">${cfg.share}</span></div>`;
}

// Renders exactly seconds*fps frames to an mp4 (yuv420p, 30 fps). Returns layout boxes of the last frame.
export async function renderOutro(out, cfg = OUTRO) {
  const n = Math.round(cfg.seconds * cfg.fps);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'outro-'));
  const browser = await launchBrowser();
  const page = await browser.newPage({viewport: {width: 1080, height: 1920}});
  let meas;
  for (let i = 0; i < n; i++) {
    await page.setContent(outroHTML(i / cfg.fps, cfg));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({path: path.join(dir, `${String(i).padStart(3, '0')}.png`)});
    if (i === n - 1)
      meas = await page.evaluate(() => {
        const r = s => (({x, y, width, height}) => ({x, y, w: width, h: height}))(document.querySelector(s).getBoundingClientRect());
        return {
          logo: r('#logo'),
          follow: r('#follow'),
          share: r('#share'),
          followText: document.querySelector('#followText').textContent,
          shareText: document.querySelector('#shareText').textContent
        };
      });
  }
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 5000))]);
  execFileSync('ffmpeg', [
    '-y',
    '-v',
    'error',
    '-framerate',
    String(cfg.fps),
    '-i',
    path.join(dir, '%03d.png'),
    '-frames:v',
    String(n),
    '-c:v',
    'libx264',
    '-crf',
    '18',
    '-preset',
    'fast',
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(cfg.fps),
    '-video_track_timescale',
    '15360',
    out
  ]);
  fs.rmSync(dir, {recursive: true, force: true});
  return {frames: n, seconds: n / cfg.fps, ...meas, handle: cfg.handle};
}

if (isMain(import.meta.url)) console.log(JSON.stringify(await renderOutro(path.resolve(process.argv[2] || 'outro.mp4'))));
