// npm run post:new -- <slug-without-date> [--date YYYY-MM-DD] [--category AI] [--title "..."]
// Creates content/posts/DATE-slug/ with an empty post.json skeleton for the agent to fill.
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, TOPICS, parseArgs, writeJSON, writeFile, newWorkflow, isMain, fail, wib} from './core.mjs';

export function createPost({name, date = wib().slice(0, 10), category = 'AI', title = '', root = ROOT}) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name || '')) throw Error('Slug must be lowercase-kebab, e.g. kimi-k3-1-pro');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error('--date must be YYYY-MM-DD');
  if (!TOPICS.includes(category)) throw Error('--category must be one of ' + TOPICS.join(', '));
  const slug = `${date}-${name}`,
    dir = path.join(root, 'content/posts', slug);
  if (fs.existsSync(dir)) throw Error('Already exists: ' + dir);
  for (const d of ['assets/originals', 'assets/processed', 'out']) fs.mkdirSync(path.join(dir, d), {recursive: true});
  writeJSON(path.join(dir, 'post.json'), {
    slug,
    category,
    title,
    format: 'standard',
    eventDate: date,
    slides: [
      {
        id: '01-main',
        layout: 'main',
        headline: ['', ''],
        summary: '',
        plannedImage: '',
        credit: 'FOTO: SUBJEK / SUMBER',
        alt: '',
        imagePosition: '50% 50%',
        imageSource: null
      }
    ],
    caption: ['', '', '', 'Sumber: … / Foto: …\n\n#akalmesin'],
    sources: []
  });
  writeJSON(path.join(dir, 'workflow.json'), newWorkflow(slug));
  writeFile(path.join(dir, 'sources.md'), `# Sources — ${title || slug} (retrieved ${wib()})\n\n| Claim | Status | Source |\n|---|---|---|\n`);
  writeFile(
    path.join(dir, 'assets/PROVENANCE.md'),
    `# Provenance — ${title || slug}\n\n| Slide | Original | Source URL | Crop / processing | Credit |\n|---|---|---|---|---|\n`
  );
  return {slug, dir};
}

if (isMain(import.meta.url))
  try {
    const a = parseArgs();
    const r = createPost({name: a._[0], date: a.date, category: a.category, title: a.title});
    console.log('✓ created ' + path.relative(ROOT, r.dir) + '\n  next: research → fill post.json + sources.md → npm run copy:review -- ' + r.slug);
  } catch (e) {
    fail(e);
  }
