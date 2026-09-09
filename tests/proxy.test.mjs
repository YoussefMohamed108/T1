import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { proxyRequest } from '../src/services/proxy.mjs';

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server.address().port;
}

async function close(server) {
  await new Promise((resolve) => server.close(resolve));
}

test('reports response analytics after proxying a website request', async (context) => {
  const body = 'hello analytics';
  const upstream = http.createServer((_req, res) => {
    res.writeHead(201, { 'content-type': 'text/plain' });
    res.end(body);
  });
  const upstreamPort = await listen(upstream);
  let completed;
  const proxy = http.createServer((req, res) => proxyRequest(req, res, upstreamPort, {
    onComplete: (details) => { completed = details; },
  }));
  const proxyPort = await listen(proxy);
  context.after(async () => { await close(proxy); await close(upstream); });

  const response = await fetch(`http://127.0.0.1:${proxyPort}/play?private=value`);
  assert.equal(response.status, 201);
  assert.equal(await response.text(), body);
  assert.deepEqual(completed, {
    statusCode: 201,
    responseBytes: Buffer.byteLength(body),
    path: '/play',
  });
});
