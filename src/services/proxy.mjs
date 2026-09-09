import http from 'node:http';

export function proxyRequest(req, res, port, options = {}) {
  let completed = false;
  const complete = (details) => {
    if (completed) return;
    completed = true;
    options.onComplete?.(details);
  };
  const upstream = http.request({
    hostname: '127.0.0.1', port, method: req.method, path: req.url,
    headers: { ...req.headers, host: req.headers.host },
  }, (upstreamResponse) => {
    let responseBytes = 0;
    upstreamResponse.on('data', (chunk) => { responseBytes += chunk.length; });
    upstreamResponse.on('end', () => complete({
      statusCode: upstreamResponse.statusCode ?? 502,
      responseBytes,
      path: new URL(req.url, 'http://localship').pathname,
    }));
    res.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
    upstreamResponse.pipe(res);
  });
  upstream.setTimeout(30_000, () => upstream.destroy(new Error('Upstream timed out')));
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
    const body = JSON.stringify({ error: 'Deployment is unavailable' });
    res.end(body);
    complete({ statusCode: 502, responseBytes: Buffer.byteLength(body), path: new URL(req.url, 'http://localship').pathname });
  });
  req.pipe(upstream);
}
