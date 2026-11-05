// "Card" reel layout (reel.json "layout": "card"), after the owner's reference format (pt88u):
// plain black 9:16, a tweet-style screenshot card at the top (owner t89u: round akalmesin logo avatar, name + @handle,
// date; no verification tick, no X/platform logo), one media clip below it. Media with "rights": "apple-t89u" are shown
// unaltered: scaled to fit (contain) inside the clip box with black letterbox, never cropped/zoomed/panned, trim only.
// Other photos: slow pan; other video: cover crop. Geometry/timing filters only.
// card text updates per beat, no burned-in captions unless beat.caption is set, no bottom text mark (owner t90u),
// Apple STILLS get a gentle eased Ken Burns (cover-fill, zoom 100%->108% + slight pan, never reveals edges; owner t90u),
// music bed by mood, standard 2 s text outro. Called from render.mjs; checked by checkCard() from check.mjs.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {ROOT, launchBrowser, readJSON, writeJSON, writeFile, fileHash} from '../core.mjs';
import {SAFE} from './visuals.mjs';
import {OUTRO, renderOutro} from './outro.mjs';
import {MUSIC, contrast} from './news.mjs';

export const CARD_FILTERS = ['scale', 'crop', 'zoompan', 'pad', 'fps', 'setsar', 'format', 'trim', 'setpts', 'tpad'];
export const CLIP = {x: 60, y: 690, w: 900, h: 676}; // ~4:3 inside the safe area
const tokens = readJSON(path.join(ROOT, 'brand/tokens.json'));
const WHITE = tokens.color['reversed-text'].value,
  GRAY = tokens.color['editorial-gray'].value;
const BLUE = JSON.stringify(tokens).match(/"inkHex":"(#[0-9A-Fa-f]{6})"/)[1];
const BG = '#000000';
const AVATAR = fs.readFileSync(path.join(ROOT, 'brand/logos/Logo.jpg')).toString('base64');
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
const b64 = f => fs.readFileSync(f).toString('base64');
const relLum = ([r, g, b]) => {
  const f = c => ((c /= 255) <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const hexRGB = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

const CSS = `*{margin:0;box-sizing:border-box}body{width:1080px;height:1920px;background:transparent;font-family:Manrope;position:relative;overflow:hidden}
#card{position:absolute;left:60px;top:250px;width:900px;color:${WHITE}}
#head{display:flex;align-items:center;gap:18px}
#av{width:84px;height:84px;border-radius:50%;object-fit:cover;display:block;outline:2px solid #2f3336}
#name{font:800 34px/1.15 Manrope}#handle{font:500 28px/1.2 Manrope;color:${GRAY};margin-top:2px}
#hl{font:500 46px/1.3 Manrope;margin-top:48px;text-align:left}#date{font:500 26px Manrope;color:${GRAY};margin-top:18px}
#src{font:500 22px Plex;color:${GRAY};margin-top:16px}
#credit{position:absolute;left:60px;top:${CLIP.y + CLIP.h + 14}px;max-width:900px;font:500 20px/24px Plex;color:${GRAY}}
#sub{position:absolute;left:60px;width:900px;top:${CLIP.y + CLIP.h - 200}px;text-align:center;font:800 64px/84px Manrope;color:${WHITE}}
#sub span{background:rgba(0,0,0,.78);padding:4px 18px;border-radius:8px}
#mark{position:absolute;left:60px;width:900px;top:1440px;text-align:center;font:800 46px/56px Manrope;letter-spacing:-.01em}`;

function overlay(beat, m, spec, mark) {
  const hl = beat.onScreen.map((o, i) => `<span data-fact="${i}">${esc(o.text)}</span>`).join(' ');
  return `<div id="card"><div id="head"><img id="av" src="data:image/jpeg;base64,${AVATAR}"><div><div id="name">akalmesin</div><div id="handle">@akalmesin</div></div></div>
<div id="hl">${hl}</div><div id="date">${esc(spec.cardDate || '')}${beat.source ? ` · ${esc(beat.source)}` : ''}</div></div>
<div id="clipbox" style="position:absolute;left:${CLIP.x}px;top:${CLIP.y}px;width:${CLIP.w}px;height:${CLIP.h}px"></div>
<div id="credit">${esc(m.location)} · ${esc(m.tag)}</div>${beat.caption ? `<div id="sub"><span>${esc(beat.caption)}</span></div>` : ''}`;
}

export async function renderCard({spec, paths, reelDir, work, frames, outArg, sh, probeDur}) {
  const snap = x => Math.round(x * 30) / 30;
  let t = 0;
  const timeline = spec.beats.map(b => {
    const r = {id: b.id, start: t, end: snap(t + b.seconds)};
    t = r.end;
    return r;
  });
  const total = t;
  const withOutro = spec.outro !== false;
  const outroLen = withOutro ? Math.round(OUTRO.seconds * OUTRO.fps) / OUTRO.fps : 0;
  const full = total + outroLen;
  // Mark sits on the plain black background (never over the clip): colour from the background itself.
  const Lbg = relLum(hexRGB(BG));
  const auto = contrast(1, Lbg) >= contrast(0, Lbg) ? 'white' : 'black';
  const marks = spec.beats.map(b => {
    const chosen = b.mark || auto;
    return {beat: b.id, Lmin: Lbg, Lmax: Lbg, auto, chosen, contrast: +(chosen === 'white' ? contrast(1, Lbg) : contrast(0, Lbg)).toFixed(2)};
  });

  const font = (f, n) => `@font-face{font-family:${n};src:url(data:font/ttf;base64,${b64(path.join(ROOT, 'brand/fonts', f))})}`;
  const head = `<!doctype html><style>${font('Manrope.ttf', 'Manrope')}${font('IBMPlexMono-Regular.ttf', 'Plex')}${CSS}</style>`;
  const browser = await launchBrowser();
  const page = await browser.newPage({viewport: {width: 1080, height: 1920}});
  const bgDir = path.join(work, 'bg');
  fs.rmSync(bgDir, {recursive: true, force: true});
  fs.mkdirSync(bgDir, {recursive: true});
  const manifest = [],
    graphs = [];
  for (const [i, b] of timeline.entries()) {
    const beat = spec.beats[i],
      m = spec.media[beat.media],
      src = path.join(paths.dir, m.file);
    await page.setContent(head + overlay(beat, m, spec, marks[i].chosen));
    await page.evaluate(() => document.fonts.ready);
    const png = path.join(frames, `${String(i).padStart(3, '0')}.png`);
    await page.screenshot({path: png, omitBackground: true});
    const meas = await page.evaluate(() => {
      const r = el => (el ? (({x, y, width, height}) => ({x, y, w: width, h: height}))(el.getBoundingClientRect()) : null);
      const q = s => document.querySelector(s);
      const hl = q('#hl');
      return {
        card: r(q('#card')),
        clip: r(q('#clipbox')),
        credit: q('#credit').textContent,
        creditBox: r(q('#credit')),
        mark: r(q('#mark')),
        markText: q('#mark')?.textContent || null,
        headBox: r(q('#head')),
        hlBox: r(q('#hl')),
        sub: r(q('#sub')),
        subText: q('#sub')?.textContent || null,
        images: document.querySelectorAll('img').length,
        avatar: (({width, height}) => ({w: width, h: height, round: getComputedStyle(document.querySelector('#av')).borderRadius}))(
          document.querySelector('#av').getBoundingClientRect()
        ),
        tick: !!document.querySelector('[data-verified],svg'),
        hlLines: Math.round(hl.getBoundingClientRect().height / parseFloat(getComputedStyle(hl).lineHeight)),
        hlOverflow: hl.scrollWidth > hl.clientWidth,
        onScreen: [...document.querySelectorAll('[data-fact]')].map(e => ({text: e.textContent}))
      };
    });
    const D = (b.end - b.start).toFixed(3);
    // Opt-in typing effect (reel.json "typing": {"cps"?, "maxShare"?, "caret"?}; owner pt120u): the headline types out
    // character by character when the card appears, then stays static. Untyped text stays in the layout (hidden), so
    // line breaks never move. Off unless set, so reels without it render exactly as before.
    let overlayInput = ['-loop', '1', '-framerate', '30', '-t', D, '-i', png],
      typing = null;
    if (spec.typing && (i > 0 || spec.typing.firstCard)) {
      const full = beat.onScreen.map(o => o.text).join(' ');
      const share = spec.typing.maxShare ?? 0.4;
      const cps = Math.max(spec.typing.cps ?? 40, full.length / (share * Number(D)));
      const nFrames = Math.ceil((full.length / cps) * 30);
      const list = [],
        tdir = path.join(frames, `type-${String(i).padStart(3, '0')}`);
      fs.rmSync(tdir, {recursive: true, force: true});
      fs.mkdirSync(tdir, {recursive: true});
      let last = -1,
        lastFile = null,
        held = 0;
      for (let k = 0; k < nFrames; k++) {
        const n = Math.min(full.length, Math.floor(((k + 1) / 30) * cps));
        if (n !== last) {
          if (lastFile) list.push(`file '${lastFile}'`, `duration ${(held / 30).toFixed(6)}`);
          await page.evaluate(
            ({full, n, caret, blue}) => {
              const hl = document.querySelector('#hl');
              const e = s => s.replace(/[&<>]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'})[c]);
              hl.innerHTML =
                e(full.slice(0, n)) +
                (caret
                  ? `<span style="display:inline-block;width:0;position:relative"><span style="position:absolute;left:2px;top:-0.95em;width:4px;height:1.1em;background:${blue}"></span></span>`
                  : '') +
                `<span style="visibility:hidden">${e(full.slice(n))}</span>`;
            },
            {full, n, caret: spec.typing.caret !== false, blue: BLUE}
          );
          lastFile = path.join(tdir, `${String(k).padStart(4, '0')}.png`);
          await page.screenshot({path: lastFile, omitBackground: true});
          last = n;
          held = 0;
        }
        held++;
      }
      list.push(`file '${lastFile}'`, `duration ${(held / 30).toFixed(6)}`);
      const rest = Number(D) - nFrames / 30;
      list.push(`file '${png}'`, `duration ${Math.max(rest, 1 / 30).toFixed(6)}`, `file '${png}'`);
      const listFile = path.join(tdir, 'list.txt');
      writeFile(listFile, list.join('\n') + '\n');
      overlayInput = ['-f', 'concat', '-safe', '0', '-i', listFile];
      typing = {chars: full.length, cps: +cps.toFixed(2), typedBy: +(nFrames / 30).toFixed(3), share: +(nFrames / 30 / Number(D)).toFixed(3)};
    }
    manifest.push({file: path.relative(paths.dir, png), beat: beat.id, media: beat.media, start: b.start, end: b.end, ...meas, ...(typing ? {typing} : {})});
    const [w, h] = sh('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', src])
      .trim()
      .split(',')
      .map(Number);
    let vf,
      input,
      fit = null;
    if (m.rights === 'apple-t89u' && m.kind === 'photo') {
      // Ken Burns (owner t90u exception for stills): cover-crop to the 4:3 box, then eased zoom + slight pan inside it.
      const Z = 1.08,
        PAN = 0.3,
        SS = 3,
        N = Math.round(Number(D) * 30);
      const s0 = Math.max(CLIP.w / w, CLIP.h / h);
      const W = Math.ceil((w * s0) / 2) * 2,
        H = Math.ceil((h * s0) / 2) * 2;
      const dir = i % 2 ? -1 : 1;
      const e = `(0.5-0.5*cos(PI*on/${N - 1}))`;
      fit = {
        rule: 'kenburns: cover-fill box, eased (cosine) zoom, pan window kept inside image',
        src: [w, h],
        cover: [W, H],
        zoomMax: Z,
        pan: PAN * dir,
        frames: N,
        ss: SS
      };
      vf = `scale=${W}:${H},crop=${CLIP.w}:${CLIP.h},scale=${CLIP.w * SS}:${CLIP.h * SS},zoompan=z='1+${Z - 1}*${e}':x='(iw-iw/zoom)*(0.5+${PAN * dir}*(${e}-0.5))':y='(ih-ih/zoom)/2':d=1:s=${CLIP.w}x${CLIP.h}:fps=30,pad=1080:1920:${CLIP.x}:${CLIP.y}:black,fps=30,setsar=1,format=yuv420p`;
      input = ['-loop', '1', '-framerate', '30', '-t', D, '-i', src];
    } else if (m.rights === 'apple-t89u') {
      // As-is: contain-fit, black letterbox, no crop/zoom/pan.
      const s = Math.min(CLIP.w / w, CLIP.h / h);
      const W = Math.round((w * s) / 2) * 2,
        H = Math.round((h * s) / 2) * 2;
      const px = CLIP.x + Math.round((CLIP.w - W) / 4) * 2,
        py = CLIP.y + Math.round((CLIP.h - H) / 4) * 2;
      fit = {rule: 'contain: scale = min(boxW/w, boxH/h), letterbox, no crop', src: [w, h], scaled: [W, H], at: [px, py]};
      vf = `scale=${W}:${H},pad=1080:1920:${px}:${py}:black,fps=30,setsar=1,format=yuv420p`;
      if (m.kind === 'photo') input = ['-loop', '1', '-framerate', '30', '-t', D, '-i', src];
      else {
        input = ['-ss', String(beat.videoStart || 0), '-t', D, '-i', src];
        if (probeDur(src) < Number(D) + (beat.videoStart || 0)) throw Error(`${m.file} too short for ${beat.id}`);
      }
    } else if (m.kind === 'photo') {
      // Linear horizontal slide. media.pan (px each side, default 60) lets a reel move faster (owner t107u).
      const pan = m.pan ?? 60,
        s = Math.max((CLIP.h * 1.08) / h, (CLIP.w + 2 * pan) / w);
      const W = Math.round((w * s) / 2) * 2,
        H = Math.round((h * s) / 2) * 2;
      const cx = Math.round(Math.min(Math.max(W * (m.focusX ?? 0.5) - CLIP.w / 2, pan), W - CLIP.w - pan));
      const cy = Math.round(Math.min(Math.max(H * (m.focusY ?? 0.5) - CLIP.h / 2, 0), H - CLIP.h));
      const dir = i % 2 ? -1 : 1;
      vf = `scale=${W}:${H},crop=${CLIP.w}:${CLIP.h}:x='${cx}+${dir * pan}*(2*t/${D}-1)':y=${cy},pad=1080:1920:${CLIP.x}:${CLIP.y}:black,fps=30,setsar=1,format=yuv420p`;
      input = ['-loop', '1', '-framerate', '30', '-t', D, '-i', src];
    } else {
      const s = Math.max(CLIP.h / h, CLIP.w / w);
      const W = Math.round((w * s) / 2) * 2,
        H = Math.round((h * s) / 2) * 2;
      vf = `scale=${W}:${H},crop=${CLIP.w}:${CLIP.h},pad=1080:1920:${CLIP.x}:${CLIP.y}:black,fps=30,setsar=1,format=yuv420p`;
      input = ['-ss', String(beat.videoStart || 0), '-t', D, '-i', src];
      const short = Number(D) + (beat.videoStart || 0) - probeDur(src);
      // beat.holdLast (seconds, owner t115u): freeze the clip's last frame for up to that long when the source is too short. No content change.
      if (short > 0 && beat.holdLast >= short) vf = `tpad=stop_mode=clone:stop_duration=${beat.holdLast},${vf}`;
      else if (short > 0) throw Error(`${m.file} too short for ${beat.id}`);
    }
    graphs.push({beat: beat.id, media: beat.media, kind: m.kind, rights: m.rights || null, fit, videoStart: beat.videoStart || 0, graph: vf});
    sh('ffmpeg', [
      '-y',
      '-v',
      'error',
      ...input,
      ...overlayInput,
      '-filter_complex',
      `[0:v]${vf}[b];[1:v]${typing ? 'fps=30,' : ''}format=rgba[o];[b][o]overlay=0:0,format=yuv420p[v]`,
      '-map',
      '[v]',
      '-t',
      D,
      '-an',
      '-c:v',
      'libx264',
      '-crf',
      '18',
      '-preset',
      'fast',
      '-r',
      '30',
      '-video_track_timescale',
      '15360',
      path.join(bgDir, `${i}.mp4`)
    ]);
  }
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 5000))]);
  const files = timeline.map((_, i) => path.join(bgDir, `${i}.mp4`));
  let outroInfo = null;
  if (withOutro) {
    outroInfo = await renderOutro(path.join(bgDir, 'outro.mp4'));
    files.push(path.join(bgDir, 'outro.mp4'));
  }
  writeFile(path.join(bgDir, 'list.txt'), files.map(f => `file '${f}'`).join('\n') + '\n');
  const mood = MUSIC.moods[spec.mood];
  if (!mood) throw Error(`reel.json mood "${spec.mood}" not in scripts/reel/music.json`);
  const mu = {...mood, ...(spec.musicOverrides || {})},
    fin = mu.fadeIn ?? 1,
    fout = mu.fadeOut ?? 2;
  const wav = path.join(work, 'music.wav');
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
    `loudnorm=I=${mu.lufs ?? -18}:TP=-1.5:LRA=11${mu.gainDb ? `,volume=${mu.gainDb}dB` : ''},afade=t=in:d=${fin},afade=t=out:st=${(full - fout).toFixed(3)}:d=${fout},aresample=48000`,
    '-ac',
    '2',
    wav
  ]);
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
    path.join(bgDir, 'list.txt'),
    '-i',
    wav,
    '-map',
    '0:v',
    '-map',
    '1:a',
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
    '-pix_fmt',
    'yuv420p',
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

  const sheetDir = path.join(work, 'sheet');
  fs.rmSync(sheetDir, {recursive: true, force: true});
  fs.mkdirSync(sheetDir, {recursive: true});
  const times = [0.05, ...timeline.map(b => b.end - 0.5), ...(withOutro ? [full - 0.05] : [])];
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
    `tile=${times.length}x1:padding=8:color=white`,
    '-frames:v',
    '1',
    '-update',
    '1',
    sheet
  ]);

  writeJSON(path.join(work, 'manifest.json'), {
    layout: 'card',
    total: full,
    contentEnd: total,
    narration: false,
    music: {mood: spec.mood, file: mood.file},
    marks,
    outro: withOutro ? {start: total, end: full, ...outroInfo} : null,
    safe: SAFE,
    clipBox: CLIP,
    allowedMediaFilters: CARD_FILTERS,
    mediaGraphs: graphs,
    timeline,
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
      `Layout: card (black 9:16, tweet-style akalmesin card on top, one clip below, no voiceover). Music (mood ${spec.mood}): ${mood.title} by ${mood.author}, ${mood.licence}.${withOutro ? ` Outro: ${outroLen.toFixed(1)} s (${OUTRO.follow} / ${OUTRO.share}).` : ''}`,
      `Length ${full.toFixed(1)} s, 1080×1920, 30 fps. ${spec.footage}`,
      '',
      '| # | Time | Card text | Caption | Clip (as-is) · credit |',
      '|---|---|---|---|---|',
      ...timeline.map((b, i) => {
        const beat = spec.beats[i],
          m = spec.media[beat.media];
        return `| ${i + 1} | ${fmt(b.start)}–${fmt(b.end)} | ${beat.onScreen.map(o => o.text).join(' ')}${beat.source ? ` (${beat.source})` : ''} | ${beat.caption || '—'} | ${m.kind} \`${m.file}\` · ${m.location} · ${m.tag} |`;
      }),
      ...(withOutro ? [`| ${timeline.length + 1} | ${fmt(total)}–${fmt(full)} | outro | — | scripts/reel/outro.mjs |`] : []),
      ''
    ].join('\n')
  );
  return {total: +full.toFixed(2), beats: timeline.length, out, sheet};
}

// Deterministic gates for the card layout.
export function checkCard({spec, man, gate, inside, hit, paths, mp4, dur, carousel, norm}) {
  const C = man.clipBox;
  gate(
    'card text fits safe area (no overflow, <= 4 lines)',
    man.frames.every(f => inside(f.card) && !f.hlOverflow && f.hlLines <= 4),
    man.frames.map(f => `${f.beat}:${f.hlLines} lines`).join(', ')
  );
  gate(
    'card above clip, no overlap',
    man.frames.every(f => f.card.y + f.card.h <= C.y - 10),
    'ok'
  );
  gate(
    'clip within frame and safe area',
    inside({x: C.x, y: C.y, w: C.w, h: C.h}) && man.frames.every(f => f.clip.x === C.x && f.clip.w === C.w),
    JSON.stringify(C)
  );
  gate('clip ~4:3', Math.abs(C.w / C.h - 4 / 3) < 0.02, (C.w / C.h).toFixed(3));
  const missing = spec.beats.flatMap(b => b.onScreen.filter(o => !carousel.includes(norm(o.fact))).map(o => `${o.text} ← "${o.fact}"`));
  gate('card facts in verified carousel copy', !missing.length, missing.join('; ') || 'all facts found');
  const nums = spec.beats.flatMap(b => b.onScreen.flatMap(o => (o.text.match(/\d+/g) || []).filter(n => !carousel.includes(n))));
  gate('card numbers in carousel copy', !nums.length, nums.join(', ') || 'ok');
  const badTag = man.frames.filter(
    f => f.credit !== `${spec.media[f.media].location} · ${spec.media[f.media].tag}` || !inside(f.creditBox) || f.creditBox.y < C.y + C.h
  );
  gate('media credit under clip (every beat)', !badTag.length, badTag.map(f => f.beat).join(', ') || 'ok');
  const unused = Object.keys(spec.media).filter(k => !spec.beats.some(b => b.media === k));
  const prov = fs.readFileSync(path.join(paths.dir, 'reel/PROVENANCE.md'), 'utf8');
  const appleOK = m => m.rights === 'apple-t89u' && /Apple/.test(m.tag) && /t89u/.test(prov) && /LEGAL_NOTICE/.test(prov) && /(takedown|strike)/i.test(prov);
  // Owner-approved courtesy media (t107u): company-supplied footage credited on screen as "Courtesy of …" or "Dok. …" (t115u),
  // with the owner decision id and the takedown/strike risk written in provenance.
  const courtesyOK = m =>
    m.rights === 'owner-courtesy' && /(Courtesy of |Dok\. )/.test(m.tag) && !!m.decision && prov.includes(m.decision) && /(takedown|strike)/i.test(prov);
  const noLic = Object.entries(spec.media).filter(
    ([, m]) => !appleOK(m) && !courtesyOK(m) && (!/(CC BY|CC0|Domain publik)/.test(m.tag) || /apple\.com/.test(m.sourceURL || ''))
  );
  gate(
    'every media item used and licensed (CC/PD, Apple media under t89u, or owner-approved courtesy media; terms + risk in provenance)',
    !unused.length && !noLic.length,
    [...unused, ...noLic.map(([k]) => k)].join(', ') || 'ok'
  );
  const noHash = Object.values(spec.media).filter(m => !prov.includes(fileHash(path.join(paths.dir, m.file))) || !prov.includes(m.sourceURL));
  gate('provenance SHA-256 + source URL for every media file', !noHash.length, noHash.map(m => m.file).join(', ') || 'all listed');
  const allowed = new Set(man.allowedMediaFilters);
  const used = man.mediaGraphs.flatMap(g => g.graph.split(',').map(x => x.split('=')[0]));
  const bad = used.filter(f => !allowed.has(f));
  gate(
    'no-filter (media as-is)',
    spec.mediaFilter === 'none' && !bad.length && !man.mediaGraphs.some(g => /processed|blue-ink/.test(g.graph)),
    bad.join(',') || `only ${[...new Set(used)].join(', ')}`
  );
  const apple = man.mediaGraphs.filter(g => g.rights === 'apple-t89u');
  const badFit = apple.filter(g => {
    const f = g.fit;
    if (/rotate|eq=|hue|curves|colorchannel/.test(g.graph)) return true;
    if (g.kind === 'photo') {
      // Ken Burns: bounded zoom, cosine easing (zero velocity at ends), window always inside the image.
      if (!f || f.zoomMax > 1.15 || f.zoomMax < 1 || !/cos\(PI\*on/.test(g.graph) || Math.abs(f.pan) > 0.5) return true;
      if (f.cover[0] < C.w || f.cover[1] < C.h) return true;
      for (let k = 0; k < f.frames; k++) {
        const e = 0.5 - 0.5 * Math.cos((Math.PI * k) / (f.frames - 1)),
          z = 1 + (f.zoomMax - 1) * e;
        const iw = C.w * f.ss,
          ww = iw / z,
          x = (iw - ww) * (0.5 + f.pan * (e - 0.5));
        if (x < -1e-6 || x + ww > iw + 1e-6) return true;
      }
      return false;
    }
    if (!f || /crop|zoompan/.test(g.graph)) return true;
    const [w, h] = f.src,
      [W, H] = f.scaled;
    return W > C.w || H > C.h || (Math.abs(W - C.w) > 2 && Math.abs(H - C.h) > 2) || Math.abs(W / H - w / h) > 0.01 || f.at[0] < C.x || f.at[1] < C.y;
  });
  gate(
    'Apple video unaltered (contain-fit, no crop/zoom/pan/colour); Apple stills: smooth Ken Burns <=115%, no edges (t90u)',
    !badFit.length,
    badFit.map(g => g.beat).join(', ') ||
      apple
        .map(g => (g.kind === 'photo' ? `${g.beat}:kenburns ${g.fit.zoomMax}x pan ${g.fit.pan}` : `${g.beat}:${g.fit.src.join('x')}→${g.fit.scaled.join('x')}`))
        .join(', ')
  );
  const noCred = man.frames.filter(f => spec.media[f.media].rights === 'apple-t89u' && !/(Video|Foto): Apple/.test(f.credit));
  gate('Apple credit shown ("Video/Foto: Apple") on every Apple clip', !noCred.length, noCred.map(f => f.beat).join(', ') || 'ok');
  const badAv = man.frames.filter(f => f.images !== 1 || f.avatar.w !== f.avatar.h || f.avatar.round !== '50%' || f.tick);
  gate('tweet card: round logo avatar only image, no tick/platform logo', !badAv.length, badAv.map(f => f.beat).join(', ') || 'ok');
  const withMark = man.frames.filter(f => f.mark || f.markText);
  gate('no bottom text mark in card layout (owner t90u)', !withMark.length, withMark.map(f => f.beat).join(', ') || 'ok');
  const gaps = man.frames.map(f => Math.round(f.hlBox.y - (f.headBox.y + f.headBox.h)));
  gate(
    'handle-to-copy gap airy (>= 44 px)',
    gaps.every(g => g >= 44),
    gaps.join(', ') + ' px'
  );
  const caps = man.frames.filter(f => f.subText);
  gate(
    'captions only where set, in safe area, not over card',
    caps.every(f => inside(f.sub) && !hit(f.sub, f.card)),
    `${caps.length} beats with caption`
  );
  const mood = MUSIC.moods[spec.mood];
  const mprov = fs.readFileSync(path.join(ROOT, 'scripts/reel/music/PROVENANCE.md'), 'utf8');
  gate(
    'music mood set, track present + provenance hash',
    !!mood && fs.existsSync(path.join(ROOT, mood.file)) && mprov.includes(fileHash(path.join(ROOT, mood.file))) && man.music.file === mood.file,
    mood ? `${spec.mood} → ${mood.file}` : 'missing'
  );
  gate('no AI narration', spec.voice?.engine === 'none', `voice.engine=${spec.voice?.engine}`);
  const ebu = execFileSync('sh', ['-c', `ffmpeg -hide_banner -nostats -i "${mp4}" -vn -af ebur128=peak=true -f null - 2>&1 | tail -14`]).toString();
  const I = Number(ebu.match(/I:\s+(-?[\d.]+) LUFS/)?.[1]),
    TP = Number(ebu.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1]);
  gate('music loudness sane (-24..-14 LUFS)', I >= -24 && I <= -14, `${I} LUFS`);
  gate('no clipping (true peak <= -1 dBTP)', TP <= -1, `${TP} dBTP`);
  const slow = spec.beats.filter(b => b.onScreen.map(o => o.text).join(' ').length / b.seconds > 15);
  gate('card reading time <= 15 chars/s', !slow.length, slow.map(b => b.id).join(', ') || 'ok');
  const o = man.outro;
  if (spec.outro !== false) {
    gate(
      'outro = last 2.0 s',
      o && Math.abs(o.end - o.start - OUTRO.seconds) < 1e-6 && Math.abs(o.end - dur) <= 0.05,
      o ? `${o.start.toFixed(2)}–${o.end.toFixed(2)} s` : 'missing'
    );
    gate('outro text', o?.followText === `Ikuti ${OUTRO.handle}` && o?.shareText === OUTRO.share && o?.images === 0, `"${o?.followText}" / "${o?.shareText}"`);
  }
  gate('hook card at 0 s', man.frames[0].start === 0 && man.frames[0].onScreen.length > 0, man.frames[0].onScreen.map(x => x.text).join(' '));
}
