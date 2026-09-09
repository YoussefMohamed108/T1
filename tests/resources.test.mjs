import test from 'node:test';
import assert from 'node:assert/strict';

test('uses safe default resources for existing projects', async () => {
  const module = await import('../src/core/resources.mjs').catch(() => ({}));
  assert.equal(typeof module.normalizeResources, 'function', 'resource normalization is not implemented');

  assert.deepEqual(module.normalizeResources(), {
    cpu: 1,
    memoryMb: 512,
    pids: 256,
    storageGb: 5,
  });
});

test('normalizes a custom resource profile', async () => {
  const module = await import('../src/core/resources.mjs').catch(() => ({}));

  assert.deepEqual(module.normalizeResources({ cpu: '2.5', memoryMb: '2048', pids: '512', storageGb: '20' }), {
    cpu: 2.5,
    memoryMb: 2048,
    pids: 512,
    storageGb: 20,
  });
});

test('rejects unsafe resource limits', async () => {
  const module = await import('../src/core/resources.mjs').catch(() => ({}));

  assert.throws(() => module.normalizeResources({ cpu: 0, memoryMb: 512, pids: 256 }), /CPU/);
  assert.throws(() => module.normalizeResources({ cpu: 1, memoryMb: 64, pids: 256 }), /Memory/);
  assert.throws(() => module.normalizeResources({ cpu: 1, memoryMb: 512, pids: 8 }), /process/);
  assert.throws(() => module.normalizeResources({ cpu: 1, memoryMb: 512, pids: 256, storageGb: -1 }), /Storage/);
});

test('converts resource settings into Docker run arguments', async () => {
  const module = await import('../src/core/resources.mjs').catch(() => ({}));
  assert.equal(typeof module.dockerResourceArgs, 'function', 'Docker resource arguments are not implemented');

  assert.deepEqual(module.dockerResourceArgs({ cpu: 1.5, memoryMb: 768, pids: 300 }), [
    '--memory', '768m', '--cpus', '1.5', '--pids-limit', '300',
  ]);
});

test('updates one project resource profile without changing another project', async () => {
  const module = await import('../src/core/resources.mjs').catch(() => ({}));
  assert.equal(typeof module.setProjectResources, 'function', 'project resource updates are not implemented');
  const state = { projects: [{ id: 'one' }, { id: 'two', resources: { cpu: 1, memoryMb: 512, pids: 256 } }] };

  const updated = module.setProjectResources(state, 'one', { cpu: 2, memoryMb: 1024, pids: 300, storageGb: 10 });

  assert.deepEqual(updated.resources, { cpu: 2, memoryMb: 1024, pids: 300, storageGb: 10 });
  assert.deepEqual(state.projects[1].resources, { cpu: 1, memoryMb: 512, pids: 256 });
  assert.throws(() => module.setProjectResources(state, 'missing', {}), /not found/);
});
