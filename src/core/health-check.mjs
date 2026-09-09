import http from 'node:http';

export function probeHttp(port, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const request = http.get({ hostname: '127.0.0.1', port, path: '/' }, (response) => {
      const status = response.statusCode ?? 0;
      response.resume();
      response.once('end', () => resolve(status));
      response.once('error', reject);
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error('Health check timed out')));
    request.once('error', reject);
  });
}
