const EMPTY_ANALYTICS = Object.freeze({
  totalRequests: 0,
  errorRequests: 0,
  responseBytes: 0,
  lastRequestAt: null,
});

function hourKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Analytics timestamp is invalid');
  date.setUTCMinutes(0, 0, 0);
  return date.toISOString();
}

export function recordRequestAnalytics(state, event) {
  if (!event?.projectId) throw new Error('Analytics project ID is required');
  state.analytics ??= {};
  const metrics = state.analytics[event.projectId] ??= { ...EMPTY_ANALYTICS, hourly: {} };
  const occurredAt = new Date(event.occurredAt ?? Date.now()).toISOString();
  const statusCode = Number(event.statusCode ?? 500);
  const responseBytes = Math.max(0, Number(event.responseBytes) || 0);
  const isError = statusCode >= 400;
  const bucket = metrics.hourly[hourKey(occurredAt)] ??= { requests: 0, errors: 0, responseBytes: 0 };

  metrics.totalRequests += 1;
  metrics.errorRequests += isError ? 1 : 0;
  metrics.responseBytes += responseBytes;
  metrics.lastRequestAt = occurredAt;
  bucket.requests += 1;
  bucket.errors += isError ? 1 : 0;
  bucket.responseBytes += responseBytes;
  return metrics;
}

export function projectAnalytics(state, projectId, now = new Date()) {
  const metrics = state.analytics?.[projectId] ?? { ...EMPTY_ANALYTICS, hourly: {} };
  const cutoff = now.getTime() - (24 * 60 * 60 * 1000);
  const last24Hours = Object.entries(metrics.hourly ?? {})
    .filter(([hour]) => new Date(hour).getTime() >= cutoff)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([hour, values]) => ({ hour, ...values }));
  return {
    totalRequests: metrics.totalRequests ?? 0,
    errorRequests: metrics.errorRequests ?? 0,
    errorRate: metrics.totalRequests ? Number(((metrics.errorRequests / metrics.totalRequests) * 100).toFixed(1)) : 0,
    responseBytes: metrics.responseBytes ?? 0,
    lastRequestAt: metrics.lastRequestAt ?? null,
    last24Hours,
  };
}
