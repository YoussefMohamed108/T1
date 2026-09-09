import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JsonStore } from '../src/core/store.mjs';

test('persists state between store instances', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'localship-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const first = new JsonStore(directory);
  await first.init();
  await first.update((state) => state.projects.push({ id: 'one' }));
  const second = new JsonStore(directory);
  await second.init();
  assert.equal(second.snapshot().projects[0].id, 'one');
});
