// akalmesin blue-ink treatment (deterministic, local). Node/sharp port of the
// blue_ink.py used for Kimi K3.1 Pro (2026-10-28): tonal gradient map with #4E4FEB ink,
// pale off-white highlights, fine 45° engraved line texture + subtle paper grain.
// No flat overlay: every pixel is remapped from its own luminance, so detail is preserved.
// #4E4FEB is a photo-treatment parameter (brand/tokens.json → photoTreatment.inkHex), not a colour token.
import sharp from 'sharp';

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
export const STOPS = [
  [0, hex('#12114A')],
  [0.42, hex('#4E4FEB')],
  [0.78, hex('#B9BAF2')],
  [1, hex('#F2F1EC')]
];

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussian(rand) {
  let u = 0;
  while (!u) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

/**
 * @param {string} src original image
 * @param {string} dst output PNG
 * @param {object} o  crop:[left,top,width,height]  pad:{aspect, bg:'#RRGGBB', marginX}  maxWidth  seed
 */
export async function blueInk(src, dst, o = {}) {
  let img = sharp(src).removeAlpha().toColourspace('srgb');
  if (o.crop) {
    const [left, top, width, height] = o.crop;
    img = img.extract({left, top, width, height});
  }
  let buf = await img.png().toBuffer();
  if (o.pad) {
    const {width: w, height: h} = await sharp(buf).metadata();
    const bg = o.pad.bg || '#FFFFFF',
      mx = Math.round((o.pad.marginX || 0) * w),
      W = w + 2 * mx;
    const H = Math.max(h, Math.round(W / (o.pad.aspect || W / h)));
    buf = await sharp(buf)
      .extend({left: mx, right: mx, top: Math.floor((H - h) / 2), bottom: H - h - Math.floor((H - h) / 2), background: bg})
      .png()
      .toBuffer();
  }
  const maxWidth = o.maxWidth ?? 2160;
  const meta = await sharp(buf).metadata();
  if (meta.width > maxWidth) buf = await sharp(buf).resize({width: maxWidth, kernel: 'lanczos3'}).png().toBuffer();
  const {data, info} = await sharp(buf).raw().toBuffer({resolveWithObject: true});
  const {width: w, height: h, channels: c} = info,
    n = w * h;
  const L = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = (0.2126 * data[i * c] + 0.7152 * data[i * c + 1] + 0.0722 * data[i * c + 2]) / 255;
  const sorted = Float32Array.from(L).sort();
  const pct = q => {
    const x = ((n - 1) * q) / 100,
      i = Math.floor(x);
    return sorted[i] + (sorted[Math.min(i + 1, n - 1)] - sorted[i]) * (x - i);
  };
  const lo = pct(1),
    hi = pct(99.5),
    span = Math.max(hi - lo, 1e-3);
  const period = Math.max(3, w / 540),
    rand = mulberry32(o.seed ?? 7);
  const out = Buffer.alloc(n * 3);
  for (let y = 0, i = 0; y < h; y++)
    for (let x = 0; x < w; x++, i++) {
      let l = Math.min(1, Math.max(0, (L[i] - lo) / span));
      l = l * l * (3 - 2 * l) * 0.35 + l * 0.65; // gentle S-curve
      const dark = 1 - l,
        lines = 0.5 + 0.5 * Math.sin(((x + y) * 2 * Math.PI) / period / 1.414);
      if (dark > 0.08) l -= 0.07 * dark * (lines - 0.5); // texture follows tone
      l = Math.min(1, Math.max(0, l + gaussian(rand) * 0.018)); // paper grain
      let k = 0;
      while (k < STOPS.length - 2 && l > STOPS[k + 1][0]) k++;
      const [t0, c0] = STOPS[k],
        [t1, c1] = STOPS[k + 1],
        f = (l - t0) / (t1 - t0);
      for (let ch = 0; ch < 3; ch++) out[i * 3 + ch] = Math.round(c0[ch] * (1 - f) + c1[ch] * f);
    }
  await sharp(out, {raw: {width: w, height: h, channels: 3}})
    .png({compressionLevel: 9})
    .toFile(dst);
  return {width: w, height: h};
}

/** Colour statistics used by design:check to prove the treatment was applied:
 * the share of pixels lying on (within `tol` RGB units of) the blue-ink ramp
 * #12114A → #4E4FEB → #B9BAF2 → #F2F1EC. A colour photo scores far lower. */
export async function inkStats(file, region, tol = 22) {
  let img = sharp(file).removeAlpha();
  if (region) img = img.extract(region);
  const {data, info} = await img.resize({width: 270, fit: 'inside'}).raw().toBuffer({resolveWithObject: true});
  const c = info.channels,
    n = data.length / c,
    segs = STOPS.slice(1).map((s, i) => [STOPS[i][1], s[1]]);
  let onRamp = 0,
    total = 0,
    inkish = 0;
  for (let i = 0; i < n; i++) {
    const p = [data[i * c], data[i * c + 1], data[i * c + 2]];
    let best = Infinity;
    for (const [a, b] of segs) {
      const ab = a.map((v, k) => b[k] - v),
        ap = p.map((v, k) => v - a[k]);
      const t = Math.max(0, Math.min(1, ab.reduce((s, v, k) => s + v * ap[k], 0) / ab.reduce((s, v) => s + v * v, 0)));
      best = Math.min(best, Math.hypot(...p.map((v, k) => v - (a[k] + ab[k] * t))));
    }
    total += best;
    if (best <= tol) onRamp++;
    if (p[2] > p[0] + 30) inkish++;
  }
  return {onRamp: onRamp / n, meanDistance: total / n, inkPixels: inkish / n};
}
export const looksInked = s => s.onRamp >= 0.95 && s.meanDistance <= 12;
