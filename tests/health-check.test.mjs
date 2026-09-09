import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

test('health probe drains a response body and returns its status', async (context) => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('healthy response body');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => server.close());

  const module = await import('../src/core/health-check.mjs').catch(() => ({}));
  assert.equal(typeof module.probeHttp, 'function', 'body-draining health probe is not implemented');
  const status = await module.probeHttp(server.address().port, 1000);

  assert.equal(status, 200);
});
