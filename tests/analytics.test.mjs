import test from 'node:test';
import assert from 'node:assert/strict';

test('records project traffic and summarizes requests, errors, and bandwidth', async () => {
  const module = await import('../src/core/analytics.mjs').catch(() => ({}));
  assert.equal(typeof module.recordRequestAnalytics, 'function', 'analytics recording is not implemented');
  assert.equal(typeof module.projectAnalytics, 'function', 'analytics summaries are not implemented');
  const state = {};

  module.recordRequestAnalytics(state, {
    projectId: 'project-1', statusCode: 200, responseBytes: 1500, occurredAt: '2026-09-09T10:15:00.000Z',
  });
  module.recordRequestAnalytics(state, {
    projectId: 'project-1', statusCode: 503, responseBytes: 500, occurredAt: '2026-09-09T10:45:00.000Z',
  });

  assert.deepEqual(module.projectAnalytics(state, 'project-1', new Date('2026-09-09T11:00:00.000Z')), {
    totalRequests: 2,
    errorRequests: 1,
    errorRate: 50,
    responseBytes: 2000,
    lastRequestAt: '2026-09-09T10:45:00.000Z',
    last24Hours: [{ hour: '2026-09-09T10:00:00.000Z', requests: 2, errors: 1, responseBytes: 2000 }],
  });
});

test('keeps analytics separated by project and excludes old hourly buckets', async () => {
  const { recordRequestAnalytics, projectAnalytics } = await import('../src/core/analytics.mjs');
  const state = {};
  recordRequestAnalytics(state, {
    projectId: 'one', statusCode: 200, responseBytes: 10, occurredAt: '2026-09-07T08:00:00.000Z',
  });
  recordRequestAnalytics(state, {
    projectId: 'two', statusCode: 404, responseBytes: 20, occurredAt: '2026-09-09T08:00:00.000Z',
  });

  const summary = projectAnalytics(state, 'one', new Date('2026-09-09T09:00:00.000Z'));
  assert.equal(summary.totalRequests, 1);
  assert.deepEqual(summary.last24Hours, []);
  assert.equal(projectAnalytics(state, 'two', new Date('2026-09-09T09:00:00.000Z')).errorRequests, 1);
});
