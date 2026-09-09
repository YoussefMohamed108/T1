import http from 'node:http';

export function proxyRequest(req, res, port) {
  const upstream = http.request({
    hostname: '127.0.0.1', port, method: req.method, path: req.url,
    headers: { ...req.headers, host: req.headers.host },
  }, (upstreamResponse) => {
    res.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
    upstreamResponse.pipe(res);
  });
  upstream.setTimeout(30_000, () => upstream.destroy(new Error('Upstream timed out')));
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Deployment is unavailable' }));
  });
  req.pipe(upstream);
}
