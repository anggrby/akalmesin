// npm run reel:build -- <slug> [--out <mp4>] [--reuse-tts]
// Faceless explainer reel from <post>/reel/reel.json. Separate from the carousel pipeline:
// reads post.json and processed photos, never writes post.json, workflow.json or carousel assets.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {ROOT, loadPost, parseArgs, launchBrowser, readJSON, writeJSON, writeFile, fileHash} from '../core.mjs';
import {visual, SAFE} from './visuals.mjs';

const {
  _: [slug],
  out: outArg,
  ...flags
} = parseArgs(process.argv.slice(2), ['reuse-tts']);
const {post, paths} = loadPost(slug);
const reelDir = path.join(paths.dir, 'reel');
const spec = readJSON(path.join(reelDir, 'reel.json'));
const work = path.join(paths.dir, 'out', 'reel');
const tts = path.join(work, 'tts');
const frames = path.join(work, 'frames');
fs.rmSync(frames, {recursive: true, force: true});
fs.mkdirSync(frames, {recursive: true});
const sh = (cmd, args) => execFileSync(cmd, args, {stdio: ['ignore', 'pipe', 'pipe']}).toString();
const probeDur = f => Number(sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]));

let words;
if (spec.layout === 'card') {
  const {renderCard} = await import('./card.mjs');
  console.log(JSON.stringify(await renderCard({spec, post, paths, reelDir, work, tts, frames, outArg, flags, sh, probeDur})));
  process.exit(0);
}
if (spec.layout !== 'news') {
  if (!flags['reuse-tts'] || !fs.existsSync(path.join(tts, 'words.json')))
    sh('python3', [path.join(ROOT, 'scripts/reel/tts.py'), path.join(reelDir, 'reel.json'), tts]);
  words = readJSON(path.join(tts, 'words.json'));
}

// Subtitle cues: split each beat's narration at punctuation / ~30 chars, time from WordBoundary offsets.
const TAIL = 0.35,
  MAXC = 30;
function cuesFor(beat, start, wordsIn = words) {
  const ws = wordsIn[beat.id];
  const text = beat.narration;
  let pos = 0;
  const spans = ws.map(w => {
    const i = text.indexOf(w.w, pos);
    if (i < 0) throw Error(`word "${w.w}" not found in narration of ${beat.id}`);
    pos = i + w.w.length;
    return {...w, i, j: pos};
  });
  const groups = [];
  let g = [];
  for (const [k, s] of spans.entries()) {
    g.push(s);
    const len = text.slice(g[0].i, s.j).length;
    const next = spans[k + 1];
    const punct = /[.,:?!]/.test(text.slice(s.j, s.j + 1));
    const nextLen = next ? text.slice(g[0].i, next.j).length : 0;
    if (!next || (punct && len > 8) || nextLen > MAXC) (groups.push(g), (g = []));
  }
  const end = ws.at(-1).t + ws.at(-1).d + TAIL;
  return {
    end,
    cues: groups.map((g, k) => ({
      beat: beat.id,
      text: text.slice(k ? g[0].i : 0, k === groups.length - 1 ? text.length : groups[k + 1][0].i).trim(),
      start: start + (k ? g[0].t : 0),
      end: start + (k === groups.length - 1 ? end : groups[k + 1][0].t)
    }))
  };
}
if (spec.layout === 'news') {
  const {renderNews} = await import('./news.mjs');
  const cues = (words, beat, start) => cuesFor(beat, start, words);
  console.log(JSON.stringify(await renderNews({spec, post, paths, reelDir, work, tts, frames, outArg, flags, cuesFor: cues, sh, probeDur})));
  process.exit(0);
}
let t = 0;
const timeline = spec.beats.map(beat => {
  const audio = path.join(tts, `${beat.id}.mp3`);
  const {end, cues} = cuesFor(beat, t);
  const b = {id: beat.id, start: t, end: t + end, audio, cues};
  t += end;
  return b;
});
const total = t;

// Render one PNG per cue (progressive reveal of on-screen items within the beat).
const photo = id => {
  const f = path.join(paths.dir, 'assets/processed', `${id}-blue-ink.png`);
  return {src: 'data:image/png;base64,' + fs.readFileSync(f).toString('base64'), credit: post.slides.find(s => s.id === id).credit};
};
const fontCSS = ['Manrope.ttf', 'IBMPlexMono-Regular.ttf']
  .map(
    (f, i) =>
      `@font-face{font-family:${i ? 'Plex' : 'Manrope'};src:url(data:font/ttf;base64,${fs.readFileSync(path.join(ROOT, 'brand/fonts', f)).toString('base64')})}`
  )
  .join('');
const browser = await launchBrowser();
const page = await browser.newPage({viewport: {width: 1080, height: 1920}});
const manifest = [];
for (const [bi, b] of timeline.entries()) {
  const beat = spec.beats[bi];
  for (const [ci, cue] of b.cues.entries()) {
    const reveal = Math.max(1, Math.ceil(((ci + 1) / b.cues.length) * beat.onScreen.length));
    const ph = beat.photo ? photo(beat.photo) : null;
    await page.setContent(`<!doctype html><style>${fontCSS}</style>${visual(beat, reveal, ph, cue.text, bi === 0)}`);
    await page.evaluate(() => document.fonts.ready);
    const m = await page.evaluate(() => {
      const r = el => (el ? (({x, y, width, height}) => ({x, y, w: width, h: height}))(el.getBoundingClientRect()) : null);
      return {
        sub: r(document.querySelector('#sub')),
        subText: document.querySelector('#sub')?.textContent,
        onScreen: [...document.querySelectorAll('[data-fact]')].map(e => ({text: e.textContent, box: r(e)})),
        credit: document.querySelector('#credit')?.textContent || null
      };
    });
    const file = path.join(frames, `${String(manifest.length).padStart(3, '0')}.png`);
    await page.screenshot({path: file});
    manifest.push({file: path.relative(paths.dir, file), ...cue, ...m});
  }
}
await browser.close();

// Video: concat stills with exact durations, then mux narration (each beat padded to its slot).
const list =
  manifest.map(f => `file '${path.join(paths.dir, f.file)}'\nduration ${(f.end - f.start).toFixed(3)}`).join('\n') +
  `\nfile '${path.join(paths.dir, manifest.at(-1).file)}'\n`;
writeFile(path.join(work, 'frames.txt'), list);
const aIn = timeline.flatMap(b => ['-i', b.audio]);
const aF =
  timeline.map((b, i) => `[${i + 1}:a]aresample=48000,apad,atrim=0:${(b.end - b.start).toFixed(3)}[a${i}]`).join(';') +
  ';' +
  timeline.map((_, i) => `[a${i}]`).join('') +
  `concat=n=${timeline.length}:v=0:a=1[a]`;
const out = path.resolve(outArg || path.join(work, 'reel.mp4'));
sh('ffmpeg', [
  '-y',
  '-v',
  'error',
  '-f',
  'concat',
  '-safe',
  '0',
  '-i',
  path.join(work, 'frames.txt'),
  ...aIn,
  '-filter_complex',
  `[0:v]fps=30,format=yuv420p,setsar=1[v];${aF}`,
  '-map',
  '[v]',
  '-map',
  '[a]',
  '-c:v',
  'libx264',
  '-preset',
  'medium',
  '-crf',
  '20',
  '-profile:v',
  'high',
  '-c:a',
  'aac',
  '-b:a',
  '160k',
  '-ar',
  '48000',
  '-movflags',
  '+faststart',
  '-t',
  total.toFixed(3),
  out
]);

// Contact sheet: one frame from the middle of each beat (6 beats → 3×2).
const sheetDir = path.join(work, 'sheet');
fs.rmSync(sheetDir, {recursive: true, force: true});
fs.mkdirSync(sheetDir, {recursive: true});
timeline.forEach((b, i) =>
  sh('ffmpeg', ['-y', '-v', 'error', '-ss', (b.end - 0.6).toFixed(2), '-i', out, '-frames:v', '1', '-vf', 'scale=360:640', path.join(sheetDir, `k${i}.png`)])
);
const sheet = path.join(reelDir, 'keyframes.png');
sh('ffmpeg', ['-y', '-v', 'error', '-i', path.join(sheetDir, 'k%d.png'), '-vf', 'tile=3x2:padding=8:color=white', '-frames:v', '1', '-update', '1', sheet]);

writeJSON(path.join(work, 'manifest.json'), {
  total,
  safe: SAFE,
  timeline: timeline.map(({audio, ...b}) => b),
  frames: manifest,
  mp4: out,
  mp4Sha256: fileHash(out)
});

// Human-readable script.
const fmt = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const md = [
  `# Reel script: ${spec.title}`,
  '',
  `Mechanism: ${spec.mechanism}. Voice: ${spec.voice.engine} ${spec.voice.voice} (${spec.voice.rate}), AI-generated. ${spec.aiDisclosure}`,
  `Length ${total.toFixed(1)} s, ${spec.format.width}×${spec.format.height}, ${spec.format.fps} fps. Footage: ${spec.footage}`,
  '',
  '| # | Time | Narration (= burned-in subtitles) | On-screen text | Visual source |',
  '|---|---|---|---|---|',
  ...timeline.map((b, i) => {
    const beat = spec.beats[i];
    const src = beat.photo
      ? `Carousel photo ${beat.photo} (blue ink), credit on screen: ${photo(beat.photo).credit}`
      : `Original HTML/SVG diagram (${beat.visual}), brand tokens`;
    return `| ${i + 1} | ${fmt(b.start)}–${fmt(b.end)} | ${beat.narration} | ${beat.onScreen.map(o => o.text).join(' · ')} | ${src} |`;
  }),
  '',
  'To edit: change `narration` or `onScreen[].text` in reel.json (or send a text file with the new lines) and rerun `npm run reel:build`, then `npm run reel:check`.',
  ''
].join('\n');
writeFile(path.join(reelDir, 'script.md'), md);
console.log(JSON.stringify({total: +total.toFixed(2), frames: manifest.length, out, sheet}));
