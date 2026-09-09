import test from 'node:test';
import assert from 'node:assert/strict';

const state = {
  projects: [{ id: 'project-1', slug: 'chess-game' }],
  deployments: [{ id: 'deployment-1', projectId: 'project-1', status: 'ready', localPort: 58778 }],
  domains: [{ id: 'domain-1', projectId: 'project-1', hostname: 'play.example.com', status: 'active' }],
};

test('routes an automatic project.localhost hostname to its ready deployment', async () => {
  const module = await import('../src/core/domains.mjs').catch(() => ({}));
  assert.equal(typeof module.routeHostname, 'function', 'default hostname routing is not implemented');

  const route = module.routeHostname(state, 'chess-game.localhost:4321');

  assert.equal(route.matched, true);
  assert.equal(route.kind, 'default');
  assert.equal(route.deployment.id, 'deployment-1');
});

test('routes a registered external hostname to its ready deployment', async () => {
  const module = await import('../src/core/domains.mjs').catch(() => ({}));
  assert.equal(typeof module.routeHostname, 'function', 'custom hostname routing is not implemented');

  const route = module.routeHostname(state, 'play.example.com');

  assert.equal(route.matched, true);
  assert.equal(route.kind, 'custom');
  assert.equal(route.deployment.id, 'deployment-1');
});

test('generates Cloudflare Tunnel instructions targeting the Localship router', async () => {
  const module = await import('../src/core/domains.mjs').catch(() => ({}));
  assert.equal(typeof module.createExternalDomainSetup, 'function', 'external domain setup is not implemented');

  const setup = module.createExternalDomainSetup(
    'play.example.com',
    'http://127.0.0.1:4321',
    'localship-verification=test-token',
  );

  assert.deepEqual(setup.verification.record, {
    type: 'TXT',
    name: '_localship.play.example.com',
    value: 'localship-verification=test-token',
  });
  assert.match(setup.cloudflare.config, /hostname: play\.example\.com/);
  assert.match(setup.cloudflare.config, /service: http:\/\/127\.0\.0\.1:4321/);
  assert.ok(setup.cloudflare.commands.some((command) => command.includes('tunnel route dns localship play.example.com')));
  assert.equal(setup.manual.preserveHostHeader, true);
});

test('verifies ownership when a DNS provider splits a TXT value into chunks', async () => {
  const module = await import('../src/core/domains.mjs').catch(() => ({}));
  assert.equal(typeof module.verifyDomainOwnership, 'function', 'DNS ownership verification is not implemented');

  const resolveTxt = async (hostname) => {
    assert.equal(hostname, '_localship.play.example.com');
    return [['localship-verification=', 'test-token'], ['unrelated=value']];
  };

  assert.equal(
    await module.verifyDomainOwnership('play.example.com', 'localship-verification=test-token', resolveTxt),
    true,
  );
});

test('treats a DNS record that has not propagated yet as unverified', async () => {
  const module = await import('../src/core/domains.mjs').catch(() => ({}));
  const resolveTxt = async () => {
    const error = new Error('queryTxt ENOTFOUND');
    error.code = 'ENOTFOUND';
    throw error;
  };

  assert.equal(
    await module.verifyDomainOwnership('play.example.com', 'localship-verification=test-token', resolveTxt),
    false,
  );
});
