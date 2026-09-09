export function startupErrorMessage(error, config) {
  if (error?.code === 'EADDRINUSE') {
    const url = `http://${config.host}:${config.port}`;
    return `Localship is already running at ${url}, or another app is using that port. Open ${url}, stop the existing process, or start this instance with PORT=${config.port + 1} npm start.`;
  }
  return `Localship could not start: ${error?.message ?? String(error)}`;
}
