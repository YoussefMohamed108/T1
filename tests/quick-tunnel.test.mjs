import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

test('extracts a TryCloudflare public URL from tunnel output', async () => {
  const module = await import('../src/services/quick-tunnels.mjs').catch(() => ({}));
  assert.equal(typeof module.extractQuickTunnelUrl, 'function', 'Quick Tunnel URL parsing is not implemented');

  assert.equal(
    module.extractQuickTunnelUrl('Your quick Tunnel has been created! Visit https://silver-bird.trycloudflare.com'),
    'https://silver-bird.trycloudflare.com',
  );
});

test('tracks a Quick Tunnel from connecting to published and stopped', async () => {
  const module = await import('../src/services/quick-tunnels.mjs').catch(() => ({}));
  assert.equal(typeof module.QuickTunnelService, 'function', 'Quick Tunnel lifecycle is not implemented');

  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => { child.emit('close', 0); return true; };
  let invocation;
  const service = new module.QuickTunnelService({
    spawnFn: (command, args) => { invocation = { command, args }; return child; },
  });

  const connecting = service.start('project-1', 58778);
  assert.equal(connecting.status, 'connecting');
  assert.deepEqual(invocation.args, ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', 'http://127.0.0.1:58778']);

  child.stderr.write('https://silver-bird.trycloudflare.com');
  assert.equal(service.get('project-1').status, 'connecting');
  child.stderr.write(' Registered tunnel connection');
  assert.equal(service.get('project-1').status, 'published');
  assert.equal(service.get('project-1').publicUrl, 'https://silver-bird.trycloudflare.com');

  service.stop('project-1');
  assert.equal(service.get('project-1').status, 'stopped');
});

test('prefers Localship bundled cloudflared when it exists', async () => {
  const module = await import('../src/services/quick-tunnels.mjs');
  assert.equal(typeof module.resolveTunnelCommand, 'function', 'bundled tunnel helper discovery is not implemented');

  const command = module.resolveTunnelCommand('C:\\LocalshipData', {
    env: {},
    platform: 'win32',
    exists: (candidate) => candidate.endsWith('cloudflared.exe'),
  });

  assert.equal(command, 'C:\\LocalshipData\\bin\\cloudflared.exe');
});
