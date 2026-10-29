// News-explainer reel layout (reel.json "layout": "news"). Called from render.mjs.
// Background = licensed media AS-IS (only scale/crop/fps/trim; no colour filter, no blue ink).
// Foreground = transparent HTML overlays (headline card, tags, subtitles, map, counter) in brand colours.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {ROOT, launchBrowser, readJSON, writeJSON, writeFile, fileHash} from '../core.mjs';
import {SAFE} from './visuals.mjs';
import {OUTRO, renderOutro} from './outro.mjs';
export const MUSIC = readJSON(path.join(ROOT, 'scripts/reel/music.json'));
// Bottom text mark: colour chosen per beat from the background luminance inside MARK_BOX.
export const MARK_BOX = {x: 60, y: 1405, w: 900, h: 90};
const relLum = ([r, g, b]) => {
  const f = c => ((c /= 255) <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
export const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

// ffmpeg filters allowed on media: geometry/timing only. check.mjs re-verifies the recorded graphs.
export const ALLOWED_MEDIA_FILTERS = ['scale', 'crop', 'fps', 'setsar', 'format', 'trim', 'setpts'];
const tokens = readJSON(path.join(ROOT, 'brand/tokens.json'));
const INK = tokens.color.ink.value,
  GRAY = tokens.color['editorial-gray'].value,
  WHITE = tokens.color['reversed-text'].value;
const BLUE = JSON.stringify(tokens).match(/"inkHex":"(#[0-9A-Fa-f]{6})"/)[1];
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
const b64 = f => fs.readFileSync(f).toString('base64');

export async function renderNews({spec, post, paths, reelDir, work, tts, frames, outArg, flags, cuesFor, sh, probeDur}) {
  // Captions-only mode (voice.engine "none"): no TTS; cue timing from reading speed (captions.cps chars/s).
  const silent = spec.voice?.engine === 'none';
  let words = null;
  if (!silent) {
    if (!flags['reuse-tts'] || !fs.existsSync(path.join(tts, 'words.json')))
      sh('python3', [path.join(ROOT, 'scripts/reel/tts.py'), path.join(reelDir, 'reel.json'), tts]);
    words = readJSON(path.join(tts, 'words.json'));
  }
  const F = 1 / 30,
    snap = x => Math.round(x * 30) / 30; // frame-accurate
  function captionCues(beat, start) {
    const {cps = 14, minCue = 1.4, beatPad = 0.4, maxChars = 30} = spec.captions || {};
    const toks = beat.narration.split(' ');
    const groups = [];
    let g = [];
    toks.forEach((w, k) => {
      g.push(w);
      const len = g.join(' ').length,
        next = toks[k + 1];
      if (!next || (/[.,:?!]$/.test(w) && len > 8) || (g.join(' ') + ' ' + next).length > maxChars) (groups.push(g.join(' ')), (g = []));
    });
    let t0 = start;
    const cues = groups.map((text, k) => {
      const d = Math.max(minCue, text.length / cps) + (k === groups.length - 1 ? beatPad : 0);
      const c = {beat: beat.id, text, start: snap(t0), end: snap(t0 + d)};
      t0 = c.end;
      return c;
    });
    return {end: t0 - start, cues};
  }
  let t = 0;
  const timeline = spec.beats.map(beat => {
    const {end, cues} = silent ? captionCues(beat, t) : cuesFor(words, beat, t);
    const b = {id: beat.id, start: t, end: t + end, audio: silent ? null : path.join(tts, `${beat.id}.mp3`), cues};
    t += end;
    return b;
  });
  const total = t;
  const withOutro = spec.outro !== false;
  const outroLen = withOutro ? Math.round(OUTRO.seconds * OUTRO.fps) / OUTRO.fps : 0;
  const full = total + outroLen;

  // 1) Background clips per beat, media as-is.
  const bgDir = path.join(work, 'bg');
  fs.rmSync(bgDir, {recursive: true, force: true});
  fs.mkdirSync(bgDir, {recursive: true});
  const graphs = [];
  for (const [i, b] of timeline.entries()) {
    const beat = spec.beats[i],
      m = spec.media[beat.media],
      src = path.join(paths.dir, m.file);
    const D = (b.end - b.start).toFixed(3);
    const [w, h] = sh('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', src])
      .trim()
      .split(',')
      .map(Number);
    let vf, input;
    if (m.kind === 'photo') {
      // cover 1080x1920 with 10% headroom, slow horizontal pan of ±110 px around focusX
      const s = Math.max((1920 * 1.1) / h, (1080 * 1.1) / w);
      const W = Math.round((w * s) / 2) * 2,
        H = Math.round((h * s) / 2) * 2;
      const cx = Math.min(Math.max(W * m.focusX - 540, 110), W - 1080 - 110);
      const dir = i % 2 ? -1 : 1;
      vf = `scale=${W}:${H},crop=1080:1920:x='${cx}+${dir * 110}*(2*t/${D}-1)':y='${Math.round((H - 1920) / 2)}',fps=30,setsar=1,scale=out_range=tv,format=yuv420p`;
      input = ['-loop', '1', '-framerate', '30', '-t', D, '-i', src];
    } else {
      const s = Math.max(1920 / h, 1080 / w);
      const W = Math.round((w * s) / 2) * 2,
        H = Math.round((h * s) / 2) * 2;
      const cx = Math.round(Math.min(Math.max(W * m.focusX - 540, 0), W - 1080));
      vf = `scale=${W}:${H},crop=1080:1920:${cx}:${Math.round((H - 1920) / 2)},fps=30,setsar=1,format=yuv420p`;
      input = ['-ss', String(beat.videoStart || 0), '-t', D, '-i', src];
      if (probeDur(src) < Number(D) + (beat.videoStart || 0)) throw Error(`${m.file} too short for ${beat.id}`);
    }
    graphs.push({beat: beat.id, media: beat.media, graph: vf});
    sh('ffmpeg', [
      '-y',
      '-v',
      'error',
      ...input,
      '-vf',
      vf,
      '-t',
      D,
      '-an',
      '-c:v',
      'libx264',
      '-crf',
      '18',
      '-preset',
      'fast',
      '-video_track_timescale',
      '15360',
      path.join(bgDir, `${i}.mp4`)
    ]);
  }
  let outroInfo = null;
  const bgFiles = timeline.map((_, i) => path.join(bgDir, `${i}.mp4`));
  if (withOutro) {
    outroInfo = await renderOutro(path.join(bgDir, 'outro.mp4'));
    bgFiles.push(path.join(bgDir, 'outro.mp4'));
  }
  // Text-mark colour per beat: sample 5 frames of the background clip inside MARK_BOX, take min/max relative
  // luminance, pick white or black by worst-case contrast. reel.json beat.mark (fixed per beat) overrides.
  const marks = timeline.map((b, i) => {
    const D = b.end - b.start,
      B = MARK_BOX;
    const L = [0.1, 0.3, 0.5, 0.7, 0.9].map(f => {
      const raw = execFileSync('ffmpeg', [
        '-v',
        'error',
        '-ss',
        (D * f).toFixed(3),
        '-i',
        path.join(bgDir, `${i}.mp4`),
        '-frames:v',
        '1',
        '-vf',
        `crop=${B.w}:${B.h}:${B.x}:${B.y},scale=1:1:flags=area,format=rgb24`,
        '-f',
        'rawvideo',
        '-'
      ]);
      return relLum([...raw.subarray(0, 3)]);
    });
    const lo = Math.min(...L),
      hi = Math.max(...L);
    const white = contrast(1, hi),
      black = contrast(0, lo);
    const auto = white >= black ? 'white' : 'black';
    const chosen = spec.beats[i].mark || auto;
    return {beat: b.id, Lmin: +lo.toFixed(4), Lmax: +hi.toFixed(4), auto, chosen, contrast: +(chosen === 'white' ? white : black).toFixed(2)};
  });
  writeFile(path.join(bgDir, 'list.txt'), bgFiles.map(f => `file '${f}'`).join('\n') + '\n');

  // 2) Transparent overlay frames, one per subtitle cue (+ counter animation sub-frames).
  const font = (f, n) => `@font-face{font-family:${n};src:url(data:font/ttf;base64,${b64(path.join(ROOT, 'brand/fonts', f))})}`;
  const head = `<!doctype html><style>${font('Manrope.ttf', 'Manrope')}${font('IBMPlexMono-Regular.ttf', 'Plex')}${CSS}</style>`;
  const geo = readJSON(path.join(ROOT, 'scripts/reel/data/finland.geo.json'));
  const browser = await launchBrowser();
  const page = await browser.newPage({viewport: {width: 1080, height: 1920}});
  const manifest = [];
  const shots = [];
  for (const [bi, b] of timeline.entries()) {
    const beat = spec.beats[bi],
      m = spec.media[beat.media];
    for (const [ci, cue] of b.cues.entries()) {
      const reveal = Math.max(1, Math.ceil(((ci + 1) / b.cues.length) * beat.onScreen.length));
      const steps = beat.overlay === 'counter' && ci === 0 ? 12 : 1;
      for (let k = 1; k <= steps; k++) {
        const html = overlay({beat, m, reveal, sub: cue.text, progress: k / steps, mark: marks[bi].chosen, geo, spec});
        if (process.env.REEL_DEBUG) console.error('frame', shots.length, beat.id, ci, k);
        await page.setContent(head + html);
        await page.evaluate(() => document.fonts.ready);
        const file = path.join(frames, `${String(shots.length).padStart(3, '0')}.png`);
        await page.screenshot({path: file, omitBackground: true});
        const s0 = cue.start + ((k - 1) / steps) * Math.min(0.8, cue.end - cue.start);
        const s1 = k === steps ? cue.end : cue.start + (k / steps) * Math.min(0.8, cue.end - cue.start);
        shots.push({file, dur: s1 - s0});
        if (k === steps) {
          const meas = await page.evaluate(() => {
            const r = el => (el ? (({x, y, width, height}) => ({x, y, w: width, h: height}))(el.getBoundingClientRect()) : null);
            const q = s => document.querySelector(s);
            return {
              sub: r(q('#sub')),
              subText: q('#sub')?.textContent,
              onScreen: [...document.querySelectorAll('[data-fact]')]
                .filter(e => getComputedStyle(e).opacity !== '0')
                .map(e => ({text: e.textContent, box: r(e)})),
              credit: q('#credit')?.textContent || null,
              creditBox: r(q('#credit')),
              location: q('#loc')?.textContent || null,
              locationBox: r(q('#loc')),
              mark: r(q('#mark')),
              markText: q('#mark')?.textContent,
              images: document.querySelectorAll('img').length,
              blocks: [...document.querySelectorAll('.card,.hl,.lt,#loc,#credit,#mark')].map(e => ({id: e.id || e.className, box: r(e)})),
              subLines: Math.round(q('#sub').getBoundingClientRect().height / parseFloat(getComputedStyle(q('#sub')).lineHeight)),
              subFontPx: parseFloat(getComputedStyle(q('#sub')).fontSize)
            };
          });
          manifest.push({file: path.relative(paths.dir, file), ...cue, media: beat.media, ...meas});
        }
      }
    }
  }
  if (process.env.REEL_DEBUG) console.error('closing');
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 5000))]);
  if (process.env.REEL_DEBUG) console.error('closed');
  if (withOutro) {
    // fully transparent overlay during the outro
    const blank = path.join(frames, 'blank.png');
    sh('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black@0.0:s=1080x1920,format=rgba', '-frames:v', '1', blank]);
    shots.push({file: blank, dur: outroLen});
  }
  const list = shots.map(s => `file '${s.file}'\nduration ${s.dur.toFixed(3)}`).join('\n') + `\nfile '${shots.at(-1).file}'\n`;
  writeFile(path.join(work, 'frames.txt'), list);

  // 3) Compose + narration.
  // Audio first (mixing it in the same graph as the concat video stalls ffmpeg), then video + mux.
  let wav;
  if (silent) {
    // Music bed: trim to length, fade in/out, loudness-normalise (music-only target ~-18 LUFS, TP -1.5).
    const mood = MUSIC.moods[spec.mood];
    if (!mood) throw Error(`reel.json mood "${spec.mood}" not in scripts/reel/music.json`);
    const mu = {...mood, ...(spec.musicOverrides || {})},
      fin = mu.fadeIn ?? 1.5,
      fout = mu.fadeOut ?? 2.5;
    wav = path.join(work, 'music.wav');
    sh('ffmpeg', [
      '-y',
      '-v',
      'error',
      '-ss',
      String(mu.start || 0),
      '-t',
      full.toFixed(3),
      '-i',
      path.join(ROOT, mu.file),
      '-af',
      `loudnorm=I=${mu.lufs ?? -18}:TP=-1.5:LRA=11,afade=t=in:d=${fin},afade=t=out:st=${(full - fout).toFixed(3)}:d=${fout},aresample=48000`,
      '-ac',
      '2',
      wav
    ]);
  } else {
    const aIn = timeline.flatMap(b => ['-i', b.audio]);
    const aF =
      timeline.map((b, i) => `[${i}:a]aresample=48000,apad,atrim=0:${(b.end - b.start).toFixed(3)}[a${i}]`).join(';') +
      ';' +
      timeline.map((_, i) => `[a${i}]`).join('') +
      `concat=n=${timeline.length}:v=0:a=1[a]`;
    wav = path.join(work, 'narration.wav');
    sh('ffmpeg', ['-y', '-v', 'error', ...aIn, '-filter_complex', aF, '-map', '[a]', '-ac', '1', wav]);
  }
  const out = path.resolve(outArg || path.join(work, 'reel.mp4'));
  // Overlay track as its own alpha video, then frame-indexed timestamps on both tracks so they stay in sync.
  const ov = path.join(work, 'overlay.mov');
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
    '-vf',
    'fps=30,format=rgba',
    '-c:v',
    'png',
    '-t',
    full.toFixed(3),
    ov
  ]);
  sh('ffmpeg', [
    '-y',
    '-v',
    'error',
    '-reinit_filter',
    '0',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    path.join(bgDir, 'list.txt'),
    '-i',
    ov,
    '-i',
    wav,
    '-filter_complex',
    `[0:v]setpts=N/30/TB[b];[1:v]setpts=N/30/TB[o];[b][o]overlay=0:0:eof_action=repeat,format=yuv420p,setsar=1[v]`,
    '-map',
    '[v]',
    '-map',
    '2:a',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '20',
    '-profile:v',
    'high',
    '-r',
    '30',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-ar',
    '48000',
    '-movflags',
    '+faststart',
    '-t',
    full.toFixed(3),
    out
  ]);

  // 4) Keyframes: first frame + one per beat (late in beat), 4x2.
  const sheetDir = path.join(work, 'sheet');
  fs.rmSync(sheetDir, {recursive: true, force: true});
  fs.mkdirSync(sheetDir, {recursive: true});
  const times = [0.05, ...timeline.map(b => b.end - 0.6), ...(withOutro ? [total + 0.3, total + 0.9, full - 0.05] : [])];
  times.forEach((s, i) =>
    sh('ffmpeg', ['-y', '-v', 'error', '-ss', s.toFixed(2), '-i', out, '-frames:v', '1', '-vf', 'scale=270:480', path.join(sheetDir, `k${i}.png`)])
  );
  const sheet = path.join(reelDir, 'keyframes.png');
  sh('ffmpeg', [
    '-y',
    '-v',
    'error',
    '-i',
    path.join(sheetDir, 'k%d.png'),
    '-vf',
    `tile=${Math.min(times.length, 6)}x${Math.ceil(times.length / 6)}:padding=8:color=white`,
    '-frames:v',
    '1',
    '-update',
    '1',
    sheet
  ]);

  writeJSON(path.join(work, 'manifest.json'), {
    layout: 'news',
    total: full,
    contentEnd: total,
    narration: !silent,
    music: silent ? {mood: spec.mood, file: MUSIC.moods[spec.mood].file} : null,
    marks,
    outro: withOutro ? {start: total, end: full, ...outroInfo} : null,
    safe: SAFE,
    allowedMediaFilters: ALLOWED_MEDIA_FILTERS,
    mediaGraphs: graphs,
    timeline: timeline.map(({audio, ...b}) => b),
    readingSpeed: silent ? (spec.captions?.cps ?? 14) : null,
    frames: manifest,
    mp4: out,
    mp4Sha256: fileHash(out)
  });

  const fmt = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
  writeFile(
    path.join(reelDir, 'script.md'),
    [
      `# Reel script: ${spec.title}`,
      '',
      silent
        ? `Layout: news explainer, captions only (no voiceover), reading speed ≤ ${spec.captions?.cps ?? 14} chars/s. Music (mood ${spec.mood}): ${MUSIC.moods[spec.mood].title} by ${MUSIC.moods[spec.mood].author}, ${MUSIC.moods[spec.mood].licence}.${withOutro ? ` Outro: ${outroLen.toFixed(1)} s akalmesin text mark (${OUTRO.follow} / ${OUTRO.share}).` : ''}`
        : `Layout: news explainer. Voice: ${spec.voice.engine} ${spec.voice.voice} (${spec.voice.rate}), AI-generated. ${spec.aiDisclosure}`,
      `Length ${full.toFixed(1)} s, ${spec.format.width}×${spec.format.height}, ${spec.format.fps} fps. Media filter: ${spec.mediaFilter} (as-is). ${spec.footage}`,
      '',
      `| # | Time | ${silent ? 'Caption text (narrates; = burned-in subtitles)' : 'Narration (= burned-in subtitles)'} | On-screen text | Media (as-is) · location tag · credit tag |`,
      '|---|---|---|---|---|',
      ...timeline.map((b, i) => {
        const beat = spec.beats[i],
          m = spec.media[beat.media];
        return `| ${i + 1} | ${fmt(b.start)}–${fmt(b.end)} | ${beat.narration} | ${beat.onScreen.map(o => o.text).join(' · ')}${beat.source ? ` · ${beat.source}` : ''} | ${m.kind} \`${m.file}\` · ${m.location} · ${m.tag} |`;
      }),
      ...(withOutro
        ? [
            `| ${timeline.length + 1} | ${fmt(total)}–${fmt(full)} | (no caption) | text mark "akalmesin" reveal · ${OUTRO.follow} · ${OUTRO.share} | Outro module scripts/reel/outro.mjs (text only, ${OUTRO.theme} theme) |`
          ]
        : []),
      '',
      'To edit: change `narration` or `onScreen[].text` in reel.json and rerun `npm run reel:build -- <slug>`, then `npm run reel:check -- <slug>`.',
      ''
    ].join('\n')
  );
  return {total: +full.toFixed(2), frames: manifest.length, out, sheet};
}

const CSS = `*{margin:0;box-sizing:border-box}body{width:1080px;height:1920px;background:transparent;font-family:Manrope;position:relative;overflow:hidden}
#mark{position:absolute;left:60px;width:900px;top:1420px;text-align:center;font:800 46px/56px Manrope;letter-spacing:-.01em}
#loc{position:absolute;left:80px;top:232px;font:500 26px Plex;color:${WHITE};background:rgba(0,0,0,.72);padding:8px 14px 8px 12px;display:flex;align-items:center;gap:10px}
#loc i{width:14px;height:14px;border-radius:50%;background:${BLUE};box-shadow:0 0 0 3px ${WHITE}}
#credit{position:absolute;left:80px;top:290px;max-width:820px;font:500 19px Plex;color:${WHITE};background:rgba(0,0,0,.55);padding:5px 10px}
#sub{position:absolute;left:80px;width:860px;bottom:530px;text-align:center;font:800 64px/84px Manrope;color:${WHITE}}
#sub span{background:rgba(0,0,0,.78);padding:4px 18px;border-radius:8px;box-decoration-break:clone;-webkit-box-decoration-break:clone}
.hl{position:absolute;left:80px;top:560px;width:860px}
.kick{display:inline-block;font:500 24px Plex;color:${WHITE};background:${BLUE};padding:6px 12px;margin-bottom:18px;letter-spacing:.06em}
.hl h1{font:800 84px/1.22 Manrope;letter-spacing:-.01em}
.hl h1 span{background:${WHITE};color:${INK};padding:2px 16px;box-decoration-break:clone;-webkit-box-decoration-break:clone}
.card{position:absolute;left:80px;width:860px;background:rgba(238,238,238,.94);color:${INK};padding:26px 30px;border-left:10px solid ${BLUE}}
.card .big{font:800 64px/1.1 Manrope}.card .mid{font:700 40px/1.2 Manrope;margin-top:10px}
.src{font:500 19px Plex;color:#333;margin-top:16px}
.lt{position:absolute;left:80px;top:900px}
.lt .n{display:inline-block;font:800 46px Manrope;color:${WHITE};background:${INK};padding:10px 20px;border-left:10px solid ${BLUE}}
.lt .r{display:block;width:fit-content;font:500 26px Plex;color:${INK};background:${WHITE};padding:8px 20px;margin-top:0}
.lt .src{color:${WHITE};background:rgba(0,0,0,.55);display:inline-block;padding:3px 8px;margin-top:8px}
.bar{height:44px;margin-top:10px;position:relative}.bar b{position:absolute;left:0;top:0;bottom:0}
.lab{font:600 30px Manrope;margin-top:18px}`;

function mapSVG(geo, onScreen, reveal) {
  const ring = geo.features[0].geometry.coordinates[0];
  const W = 420,
    H = 560,
    lon0 = 19.5,
    lon1 = 31.8,
    lat0 = 59.6,
    lat1 = 70.2;
  const k = Math.cos((65 * Math.PI) / 180);
  const sx = W / ((lon1 - lon0) * k),
    sy = H / (lat1 - lat0),
    s = Math.min(sx, sy);
  const P = ([x, y]) => [((x - lon0) * k * s + 20).toFixed(1), ((lat1 - y) * s + 10).toFixed(1)];
  const d = 'M' + ring.map(p => P(p).join(' ')).join('L') + 'Z';
  const [mx, my] = P([25.99, 64.81]),
    [kx, ky] = P([27.73, 64.22]),
    [hx, hy] = P([24.94, 60.17]);
  return `<svg width="${W + 40}" height="${H + 20}" style="display:block">
<path d="${d}" fill="${WHITE}" stroke="${INK}" stroke-width="3"/>
<circle cx="${hx}" cy="${hy}" r="6" fill="${INK}"/><text x="${+hx + 12}" y="${+hy + 6}" font-family="Plex" font-size="20">Helsinki</text>
<circle cx="${kx}" cy="${ky}" r="6" fill="${INK}"/><text x="${+kx + 12}" y="${+ky + 6}" font-family="Plex" font-size="20">Kajaani</text>
<circle cx="${mx}" cy="${my}" r="14" fill="${BLUE}" stroke="${WHITE}" stroke-width="4"/>
<text x="${+mx - 18}" y="${+my - 22}" font-family="Manrope" font-weight="800" font-size="34" text-anchor="end" data-fact="0">${esc(onScreen[0].text)}</text></svg>`;
}

function overlay({beat, m, reveal, sub, progress, mark, geo, spec}) {
  const o = beat.onScreen;
  const vis = i => `style="opacity:${i < reveal ? 1 : 0}"`;
  const src = beat.source ? `<div class="src">${esc(beat.source)}</div>` : '';
  let body = '';
  if (beat.overlay === 'headline')
    body = `<div class="hl"><div class="kick">AKALMESIN · BERITA</div><h1><span data-fact="0">${esc(o[0].text)}</span><br><span data-fact="1">${esc(o[1].text)}</span></h1></div>`;
  else if (beat.overlay === 'map')
    body = `<div class="card" style="top:400px;display:flex;gap:16px;align-items:flex-end;padding:20px">${mapSVG(geo, o, reveal)}<div style="padding-bottom:20px">
<div class="mid" data-fact="1" ${vis(1)}>${esc(o[1].text)}</div><div class="mid" style="color:${BLUE};opacity:${reveal > 2 ? 1 : 0}" data-fact="2">${esc(o[2].text)}</div>${src}</div></div>`;
  else if (beat.overlay === 'threshold')
    body = `<div class="card" style="top:700px">
<div class="lab" data-fact="0">${esc(o[0].text)}</div><div class="bar"><b style="width:${(200 / 330) * 100}%;background:${INK}"></b></div>
<div class="lab" data-fact="1" ${vis(1)}>${esc(o[1].text)}</div><div class="bar" ${vis(1)}><b style="width:100%;background:${BLUE}"></b><b style="left:${(200 / 330) * 100}%;width:4px;top:-8px;bottom:-8px;background:${INK}"></b></div>${src}</div>`;
  else if (beat.overlay === 'card')
    body = `<div class="card" style="top:760px"><div class="big" data-fact="0">${esc(o[0].text)}</div><div class="mid" data-fact="1" ${vis(1)}>${esc(o[1].text)}</div>${src}</div>`;
  else if (beat.overlay === 'lowerthird')
    body = `<div class="lt"><div class="n" data-fact="0">${esc(o[0].text)}</div><div class="r" data-fact="1" ${vis(1)}>${esc(o[1].text)}</div>${src}</div>`;
  else if (beat.overlay === 'counter') {
    const n = Number(o[0].text.replace(/\D/g, ''));
    const shown = progress < 1 ? '±' + Math.round(n * progress).toLocaleString('id-ID') : o[0].text;
    body = `<div class="card" style="top:680px"><div class="big" style="font-size:110px;color:${BLUE}" ${progress < 1 ? '' : 'data-fact="0"'}>${esc(shown)}</div><div class="mid" data-fact="1">${esc(o[1].text)}</div>${src}</div>`;
  } else if (beat.overlay === 'endcard')
    body = `<div class="card" style="top:560px"><div class="mid" data-fact="0">${esc(o[0].text)}</div><div class="mid" style="color:${BLUE}" data-fact="1" ${vis(1)}>${esc(o[1].text)}</div>
<div class="src">${esc(spec.sourcesText)}</div></div>`;
  return `<div id="mark" style="color:${mark === 'white' ? WHITE : INK}">akalmesin</div><div id="loc"><i></i>${esc(m.location)}</div><div id="credit">${esc(m.tag)}</div>${body}<div id="sub"><span>${esc(sub)}</span></div>`;
}
