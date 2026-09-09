import test from 'node:test';
import assert from 'node:assert/strict';

function sampleState() {
  return {
    projects: [{ id: 'one', name: 'One' }, { id: 'two', name: 'Two' }],
    deployments: [
      { id: 'deployment-one', projectId: 'one', status: 'ready', localPort: 4100, containerName: 'one-container' },
      { id: 'deployment-two', projectId: 'two', status: 'ready', localPort: 4200, containerName: 'two-container' },
    ],
    domains: [{ id: 'domain-one', projectId: 'one' }, { id: 'domain-two', projectId: 'two' }],
    analytics: { one: { totalRequests: 5 }, two: { totalRequests: 8 } },
  };
}

test('pauses and resumes the current deployment without replacing its runtime', async () => {
  const module = await import('../src/core/project-lifecycle.mjs').catch(() => ({}));
  assert.equal(typeof module.pauseProject, 'function', 'project pausing is not implemented');
  assert.equal(typeof module.resumeProject, 'function', 'project resuming is not implemented');
  const state = sampleState();

  const paused = module.pauseProject(state, 'one', '2026-09-09T12:00:00.000Z');
  assert.equal(paused.status, 'paused');
  assert.equal(paused.containerName, 'one-container');
  assert.equal(paused.localPort, 4100);
  assert.equal(paused.pausedAt, '2026-09-09T12:00:00.000Z');

  const resumed = module.resumeProject(state, 'one', '2026-09-09T13:00:00.000Z');
  assert.equal(resumed.status, 'ready');
  assert.equal(resumed.resumedAt, '2026-09-09T13:00:00.000Z');
  assert.equal(resumed.pausedAt, undefined);
});

test('terminates a ready or paused runtime while keeping the project', async () => {
  const module = await import('../src/core/project-lifecycle.mjs').catch(() => ({}));
  assert.equal(typeof module.terminateProject, 'function', 'project termination is not implemented');
  const state = sampleState();

  const terminated = module.terminateProject(state, 'one', '2026-09-09T14:00:00.000Z');

  assert.equal(terminated.status, 'terminated');
  assert.equal(terminated.localPort, null);
  assert.equal(terminated.containerName, null);
  assert.equal(terminated.terminatedAt, '2026-09-09T14:00:00.000Z');
  assert.equal(state.projects.some((project) => project.id === 'one'), true);
});

test('deletes only the selected project and all of its related state', async () => {
  const module = await import('../src/core/project-lifecycle.mjs').catch(() => ({}));
  assert.equal(typeof module.deleteProject, 'function', 'project deletion is not implemented');
  const state = sampleState();

  const deleted = module.deleteProject(state, 'one');

  assert.equal(deleted.project.name, 'One');
  assert.deepEqual(deleted.containerNames, ['one-container']);
  assert.deepEqual(state.projects.map((item) => item.id), ['two']);
  assert.deepEqual(state.deployments.map((item) => item.id), ['deployment-two']);
  assert.deepEqual(state.domains.map((item) => item.id), ['domain-two']);
  assert.equal(state.analytics.one, undefined);
  assert.equal(state.analytics.two.totalRequests, 8);
  assert.throws(() => module.deleteProject(state, 'missing'), /not found/i);
});
