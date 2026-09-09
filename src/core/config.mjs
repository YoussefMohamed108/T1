import path from 'node:path';

export function loadConfig(env = process.env, cwd = process.cwd()) {
  const port = Number.parseInt(env.PORT ?? '4321', 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  return {
    port,
    host: env.HOST ?? '127.0.0.1',
    dataDir: path.resolve(cwd, env.DATA_DIR ?? '.localship'),
  };
}
