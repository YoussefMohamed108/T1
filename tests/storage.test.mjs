import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('creates persistent Docker mount arguments for the project data directory', async () => {
  const module = await import('../src/core/storage.mjs').catch(() => ({}));
  assert.equal(typeof module.persistentStorageDockerArgs, 'function', 'persistent storage mount is not implemented');
  const dataDir = path.join('C:', 'localship-data');

  assert.deepEqual(module.persistentStorageDockerArgs(dataDir, 'project-1', { storageGb: 5 }), [
    '--mount', `type=bind,source=${path.resolve(dataDir, 'volumes', 'project-1')},target=/data`,
    '--env', 'LOCALSHIP_DATA_DIR=/data',
    '--env', `LOCALSHIP_STORAGE_BUDGET_BYTES=${5 * 1024 ** 3}`,
  ]);
  assert.deepEqual(module.persistentStorageDockerArgs(dataDir, 'project-1', { storageGb: 0 }), []);
});

test('measures persistent storage without following symbolic links', async () => {
  const module = await import('../src/core/storage.mjs').catch(() => ({}));
  assert.equal(typeof module.directorySizeBytes, 'function', 'storage usage measurement is not implemented');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'localship-storage-'));
  try {
    await fs.mkdir(path.join(root, 'nested'));
    await fs.writeFile(path.join(root, 'first.bin'), Buffer.alloc(17));
    await fs.writeFile(path.join(root, 'nested', 'second.bin'), Buffer.alloc(29));
    assert.equal(await module.directorySizeBytes(root), 46);
    assert.equal(await module.directorySizeBytes(path.join(root, 'missing')), 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('blocks deployment when persistent data is already over its storage budget', async () => {
  const module = await import('../src/core/storage.mjs').catch(() => ({}));
  assert.equal(typeof module.assertStorageWithinBudget, 'function', 'storage budget enforcement is not implemented');

  assert.doesNotThrow(() => module.assertStorageWithinBudget(1024, { storageGb: 1 }));
  assert.throws(
    () => module.assertStorageWithinBudget((2 * 1024 ** 3) + 1, { storageGb: 2 }),
    /exceeds.*2 GB/i,
  );
  assert.doesNotThrow(() => module.assertStorageWithinBudget(100, { storageGb: 0 }));
});
