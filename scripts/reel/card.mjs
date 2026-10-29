// "Card" reel layout (reel.json "layout": "card"), after the owner's reference format (pt88u):
// plain black 9:16, our own akalmesin news card at the top (no imitation of another account / X post),
// one licensed media clip below it (photo with slow pan or video, as-is: geometry/timing filters only),
// card text updates per beat, no burned-in captions unless beat.caption is set, bottom text mark,
// music bed by mood, standard 2 s text outro. Called from render.mjs; checked by checkCard() from check.mjs.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {ROOT, launchBrowser, readJSON, writeJSON, writeFile, fileHash} from '../core.mjs';
import {SAFE} from './visuals.mjs';
import {OUTRO, renderOutro} from './outro.mjs';
import {MUSIC, contrast} from './news.mjs';

export const CARD_FILTERS = ['scale', 'crop', 'pad', 'fps', 'setsar', 'format', 'trim', 'setpts'];
export const CLIP = {x: 60, y: 690, w: 900, h: 676}; // ~4:3 inside the safe area
const tokens = readJSON(path.join(ROOT, 'brand/tokens.json'));
const WHITE = tokens.color['reversed-text'].value,
  GRAY = tokens.color['editorial-gray'].value;
const BLUE = JSON.stringify(tokens).match(/"inkHex":"(#[0-9A-Fa-f]{6})"/)[1];
const BG = '#000000';
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
#av{width:76px;height:76px;border-radius:50%;background:${BLUE};color:${WHITE};font:800 44px/76px Manrope;text-align:center}
#name{font:800 36px/1.1 Manrope}#meta{font:500 24px Plex;color:${GRAY};margin-top:4px}
#hl{font:700 50px/1.24 Manrope;margin-top:26px;letter-spacing:-.005em}
#src{font:500 22px Plex;color:${GRAY};margin-top:16px}
#credit{position:absolute;left:60px;top:${CLIP.y + CLIP.h + 14}px;max-width:900px;font:500 20px/24px Plex;color:${GRAY}}
#sub{position:absolute;left:60px;width:900px;top:${CLIP.y + CLIP.h - 200}px;text-align:center;font:800 64px/84px Manrope;color:${WHITE}}
#sub span{background:rgba(0,0,0,.78);padding:4px 18px;border-radius:8px}
#mark{position:absolute;left:60px;width:900px;top:1440px;text-align:center;font:800 46px/56px Manrope;letter-spacing:-.01em}`;

function overlay(beat, m, spec, mark) {
  const hl = beat.onScreen.map((o, i) => `<span data-fact="${i}">${esc(o.text)}</span>`).join(' ');
  return `<div id="card"><div id="head"><div id="av">a</div><div><div id="name">akalmesin</div><div id="meta">${esc(spec.cardMeta || 'Berita teknologi')}</div></div></div>
<div id="hl">${hl}</div>${beat.source ? `<div id="src">${esc(beat.source)}</div>` : ''}</div>
<div id="clipbox" style="position:absolute;left:${CLIP.x}px;top:${CLIP.y}px;width:${CLIP.w}px;height:${CLIP.h}px"></div>
<div id="credit">${esc(m.location)} · ${esc(m.tag)}</div>${beat.caption ? `<div id="sub"><span>${esc(beat.caption)}</span></div>` : ''}
<div id="mark" style="color:${mark === 'white' ? WHITE : '#000'}">akalmesin</div>`;
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
        markText: q('#mark').textContent,
        sub: r(q('#sub')),
        subText: q('#sub')?.textContent || null,
        images: document.querySelectorAll('img').length,
        hlLines: Math.round(hl.getBoundingClientRect().height / parseFloat(getComputedStyle(hl).lineHeight)),
        hlOverflow: hl.scrollWidth > hl.clientWidth,
        onScreen: [...document.querySelectorAll('[data-fact]')].map(e => ({text: e.textContent}))
      };
    });
    manifest.push({file: path.relative(paths.dir, png), beat: beat.id, media: beat.media, start: b.start, end: b.end, ...meas});
    const D = (b.end - b.start).toFixed(3);
    const [w, h] = sh('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', src])
      .trim()
      .split(',')
      .map(Number);
    let vf, input;
    if (m.kind === 'photo') {
      const pan = 60,
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
      if (probeDur(src) < Number(D) + (beat.videoStart || 0)) throw Error(`${m.file} too short for ${beat.id}`);
    }
    graphs.push({beat: beat.id, media: beat.media, graph: vf});
    sh('ffmpeg', [
      '-y',
      '-v',
      'error',
      ...input,
      '-loop',
      '1',
      '-framerate',
      '30',
      '-t',
      D,
      '-i',
      png,
      '-filter_complex',
      `[0:v]${vf}[b];[1:v]format=rgba[o];[b][o]overlay=0:0,format=yuv420p[v]`,
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
    `loudnorm=I=${mu.lufs ?? -18}:TP=-1.5:LRA=11,afade=t=in:d=${fin},afade=t=out:st=${(full - fout).toFixed(3)}:d=${fout},aresample=48000`,
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
      `Layout: card (black 9:16, akalmesin news card on top, one licensed clip below, no voiceover). Music (mood ${spec.mood}): ${mood.title} by ${mood.author}, ${mood.licence}.${withOutro ? ` Outro: ${outroLen.toFixed(1)} s (${OUTRO.follow} / ${OUTRO.share}).` : ''}`,
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
  const noLic = Object.entries(spec.media).filter(([, m]) => !/(CC BY|CC0|Domain publik)/.test(m.tag) || /apple\.com/.test(m.sourceURL || ''));
  gate(
    'every media item used and free-licensed (no Apple press media)',
    !unused.length && !noLic.length,
    [...unused, ...noLic.map(([k]) => k)].join(', ') || 'ok'
  );
  const prov = fs.readFileSync(path.join(paths.dir, 'reel/PROVENANCE.md'), 'utf8');
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
  const badMark = man.frames.filter(f => f.markText !== 'akalmesin' || !inside(f.mark) || f.mark.y < C.y + C.h || f.images > 0 || hit(f.mark, f.creditBox));
  gate('text mark at bottom on black, no logo image', !badMark.length, badMark.map(f => f.beat).join(', ') || 'ok');
  gate(
    'text mark colour contrast >= 4.5:1',
    man.marks.length === spec.beats.length && man.marks.every(m => m.contrast >= 4.5),
    man.marks.map(m => `${m.beat}:${m.chosen} ${m.contrast}:1`).join(', ')
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
