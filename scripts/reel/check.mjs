// npm run reel:check -- <slug> [--mp4 <file>]
// Deterministic reel gates. Independent of carousel gates and hashes.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {loadPost, parseArgs, readJSON, writeJSON, fileHash} from '../core.mjs';

const {
  _: [slug],
  mp4: mp4Arg
} = parseArgs();
const {post, paths} = loadPost(slug);
const spec = readJSON(path.join(paths.dir, 'reel/reel.json'));
const man = readJSON(path.join(paths.dir, 'out/reel/manifest.json'));
const mp4 = path.resolve(mp4Arg || man.mp4);
const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', mp4]).toString());
const v = probe.streams.find(s => s.codec_type === 'video'),
  a = probe.streams.find(s => s.codec_type === 'audio');
const dur = Number(probe.format.duration),
  F = spec.format,
  S = man.safe;
const norm = s => s.toLowerCase().replace(/\*\*/g, '').replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim();
const carousel = norm(JSON.stringify([post.slides.map(s => [s.headline, s.summary, s.paragraphs, s.credit]), post.caption]).replace(/\\n/g, ' '));
const inside = b => b && b.x >= S.x0 && b.y >= S.y0 && b.x + b.w <= S.x1 && b.y + b.h <= S.y1;
const results = [];
const gate = (name, ok, detail = '') => results.push({name, ok: !!ok, detail});

gate('duration', dur >= F.minSeconds && dur <= F.maxSeconds, `${dur.toFixed(2)} s`);
gate('resolution', v.width === F.width && v.height === F.height, `${v.width}x${v.height}`);
gate('fps', v.r_frame_rate === `${F.fps}/1`, v.r_frame_rate);
gate('codecs', v.codec_name === 'h264' && a?.codec_name === 'aac', `${v.codec_name}+${a?.codec_name}`);
gate('audio present', a && Number(a.duration || dur) > dur - 0.5, a ? `${a.sample_rate} Hz` : 'none');
const vol = execFileSync('ffmpeg', ['-v', 'info', '-i', mp4, '-af', 'volumedetect', '-vn', '-f', 'null', '-'], {stdio: ['ignore', 'pipe', 'pipe']}) && '';
const out = execFileSync('sh', ['-c', `ffmpeg -i "${mp4}" -af volumedetect -vn -f null - 2>&1 | grep mean_volume`])
  .toString()
  .trim();
gate('audio not silent', Number(out.match(/(-?[\d.]+) dB/)?.[1]) > -40, out.replace(/.*\] /, '') + vol);
const badSub = man.frames.filter(f => !inside(f.sub));
gate('subtitles in safe area', !badSub.length, badSub.length ? badSub.map(f => f.file).join(', ') : `${man.frames.length} cues inside ${JSON.stringify(S)}`);
const badOn = man.frames.flatMap(f => f.onScreen.filter(o => !inside(o.box)).map(o => `${f.file}: ${o.text}`));
gate('on-screen text in safe area', !badOn.length, [...new Set(badOn)].join('; '));
const subs = norm(man.frames.map(f => f.subText).join(' ')),
  narr = norm(spec.beats.map(b => b.narration).join(' '));
gate('subtitles == narration script', subs === narr, subs === narr ? `${narr.split(' ').length} words` : `subs: ${subs}\nnarr: ${narr}`);
const badT = man.frames.filter(f => f.end <= f.start || f.end > dur + 0.05);
gate('cue timing', !badT.length, `${man.frames.length} cues`);
const missing = spec.beats.flatMap(b => b.onScreen.filter(o => !carousel.includes(norm(o.fact))).map(o => `${o.text} ← "${o.fact}"`));
gate('on-screen facts in verified carousel copy', !missing.length, missing.join('; ') || 'all facts found');
const nums = spec.beats.flatMap(b => b.onScreen.flatMap(o => (o.text.match(/\d+/g) || []).filter(n => !carousel.includes(n)).map(n => `${o.text}: ${n}`)));
gate('on-screen numbers in carousel copy', !nums.length, nums.join('; ') || 'ok');
if (spec.layout === 'news') {
  // News layout: media shown as-is, credit + location tag for every media item, watermark, all in safe area.
  const badTag = man.frames.filter(f => f.credit !== spec.media[f.media]?.tag || !inside(f.creditBox));
  gate(
    'media credit tag on screen (every cue)',
    !badTag.length,
    badTag.map(f => f.file).join(', ') || `${new Set(man.frames.map(f => f.media)).size} media items credited`
  );
  const unused = Object.keys(spec.media).filter(k => !spec.beats.some(b => b.media === k));
  const noLic = Object.entries(spec.media).filter(([, m]) => !/(CC BY|CC0|Domain publik)/.test(m.tag));
  gate('every media item used and licensed', !unused.length && !noLic.length, [...unused, ...noLic.map(([k]) => k)].join(', ') || 'ok');
  const badLoc = man.frames.filter(f => !f.location || !inside(f.locationBox));
  gate('location tag on screen', !badLoc.length, badLoc.map(f => f.file).join(', ') || 'ok');
  const badWm = man.frames.filter(f => !inside(f.watermark));
  gate('watermark in safe area', !badWm.length, badWm.map(f => f.file).join(', ') || 'ok');
  const allowed = new Set(man.allowedMediaFilters);
  const used = man.mediaGraphs.flatMap(g => g.graph.split(',').map(x => x.split('=')[0]));
  const bad = used.filter(f => !allowed.has(f));
  const flagged = Object.entries(spec.media).filter(([, m]) => m.filter !== 'none');
  const ink = man.mediaGraphs.filter(g => /blue-ink|processed/.test(g.graph));
  gate(
    'no-filter (media as-is)',
    spec.mediaFilter === 'none' && !bad.length && !flagged.length && !ink.length,
    bad.length || flagged.length
      ? `bad filters: ${bad.join(',')} flagged: ${flagged.map(([k]) => k).join(',')}`
      : `only ${[...new Set(used)].join(', ')} (geometry/timing)`
  );
  const hashes = Object.values(spec.media).filter(
    m => !fs.readFileSync(path.join(paths.dir, 'reel/PROVENANCE.md'), 'utf8').includes(fileHash(path.join(paths.dir, m.file)))
  );
  gate('provenance SHA-256 for every media file', !hashes.length, hashes.map(m => m.file).join(', ') || 'all hashes listed');
} else {
  const photoBeats = spec.beats.filter(b => b.photo).map(b => b.id);
  const noCredit = man.frames.filter(
    f => photoBeats.includes(f.beat) && f.credit !== post.slides.find(s => s.id === spec.beats.find(b => b.id === f.beat).photo).credit
  );
  gate('footage credits shown', !noCredit.length, noCredit.map(f => f.file).join(', ') || `${photoBeats.length} photo beats credited`);
}
const hook = man.frames[0];
gate('hook within 2 s', hook.start === 0 && hook.onScreen.length > 0, `first text at 0.0 s, first cue "${hook.subText}"`);
const errors = results.filter(r => !r.ok);
writeJSON(path.join(paths.dir, 'reel/check.json'), {mp4: path.basename(mp4), passed: !errors.length, results});
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}: ${r.detail}`);
process.exit(errors.length ? 1 : 0);
