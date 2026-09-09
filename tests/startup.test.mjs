import test from 'node:test';
import assert from 'node:assert/strict';

test('explains how to recover when the Localship port is already occupied', async () => {
  const module = await import('../src/core/startup.mjs').catch(() => ({}));
  assert.equal(typeof module.startupErrorMessage, 'function', 'friendly startup errors are not implemented');
  const error = Object.assign(new Error('address in use'), { code: 'EADDRINUSE' });

  const message = module.startupErrorMessage(error, { host: '127.0.0.1', port: 4321 });

  assert.match(message, /already running/i);
  assert.match(message, /http:\/\/127\.0\.0\.1:4321/);
  assert.match(message, /PORT=4322/);
});
