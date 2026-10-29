import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {TOPICS, checkCategory, readJSON} from '../scripts/core.mjs';
import {createPost} from '../scripts/post-new.mjs';
import {checkPost} from '../scripts/quality.mjs';
import {KIMI} from './helpers.mjs';

test('category enum is exactly the owner list (t94u)', () => {
  assert.deepEqual(TOPICS, ['AI', 'KOMPUTER', 'SAINS', 'PROGRAMMING', 'TUTORIAL AI', 'TEKNOLOGI', 'ROBOTIKA']);
  for (const t of TOPICS) assert.equal(checkCategory(t), t);
  for (const bad of ['ai', 'Robotika', 'Software', 'TECH', '', undefined])
    assert.throws(() => checkCategory(bad), /not allowed; use exactly one of: AI, KOMPUTER/);
});

test('post:new rejects a category outside the enum and accepts TUTORIAL AI', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'akalmesin-cat-'));
  try {
    assert.throws(() => createPost({name: 'x', date: '2026-10-29', category: 'Software', root}), /not allowed/);
    const r = createPost({name: 'y', date: '2026-10-29', category: 'TUTORIAL AI', root});
    assert.ok(r);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('quality check fails a post whose category is outside the enum', () => {
  const post = {...readJSON(path.join(KIMI, 'post.json')), category: 'Komputasi'};
  const r = checkPost(post);
  assert.ok(r.errors.some(i => i.code === 'category'));
});
