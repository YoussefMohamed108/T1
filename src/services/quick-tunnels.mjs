import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export function resolveTunnelCommand(dataDir, options = {}) {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const exists = options.exists ?? existsSync;
  if (env.CLOUDFLARED_PATH) return env.CLOUDFLARED_PATH;
  const bundled = path.join(dataDir, 'bin', platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
  return exists(bundled) ? bundled : 'cloudflared';
}

export function extractQuickTunnelUrl(output) {
  return String(output).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)?.[0] ?? null;
}

export class QuickTunnelService {
  #command;
  #spawn;
  #entries = new Map();

  constructor({ command = process.env.CLOUDFLARED_PATH ?? 'cloudflared', spawnFn = spawn } = {}) {
    this.#command = command;
    this.#spawn = spawnFn;
  }

  start(projectId, localPort) {
    const existing = this.#entries.get(projectId);
    if (existing && ['connecting', 'published'].includes(existing.state.status)) {
      return structuredClone(existing.state);
    }

    const state = {
      projectId,
      status: 'connecting',
      publicUrl: null,
      localTarget: `http://127.0.0.1:${localPort}`,
      error: null,
      startedAt: new Date().toISOString(),
      logs: '',
    };
    const child = this.#spawn(this.#command, [
      'tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', state.localTarget,
    ], { shell: false, windowsHide: true });
    const entry = { child, state };
    this.#entries.set(projectId, entry);

    const consume = (chunk) => {
      const text = chunk.toString();
      state.logs = `${state.logs}${text}`.slice(-20_000);
      const publicUrl = extractQuickTunnelUrl(state.logs);
      const connected = /Registered tunnel connection/i.test(state.logs);
      if (publicUrl && connected) {
        state.publicUrl = publicUrl;
        state.status = 'published';
        state.publishedAt = new Date().toISOString();
      }
    };
    child.stdout?.on('data', consume);
    child.stderr?.on('data', consume);
    child.once('error', (error) => {
      state.status = 'error';
      state.error = error.code === 'ENOENT'
        ? 'Cloudflared is not installed. Install it, restart Localship, then select Publish preview again.'
        : error.message;
    });
    child.once('close', (code) => {
      if (state.status === 'stopped') return;
      if (state.status !== 'error' && code !== 0) {
        state.status = 'error';
        state.error = `Cloudflare Tunnel stopped with exit code ${code}.`;
      } else if (state.status !== 'error') {
        state.status = 'stopped';
      }
    });
    return structuredClone(state);
  }

  stop(projectId) {
    const entry = this.#entries.get(projectId);
    if (!entry) return { projectId, status: 'stopped', publicUrl: null };
    entry.state.status = 'stopped';
    entry.state.publicUrl = null;
    entry.child.kill();
    return structuredClone(entry.state);
  }

  get(projectId) {
    const state = this.#entries.get(projectId)?.state;
    return state ? structuredClone(state) : { projectId, status: 'not-published', publicUrl: null };
  }

  snapshot() {
    return Object.fromEntries([...this.#entries].map(([projectId, entry]) => [projectId, structuredClone(entry.state)]));
  }

  stopAll() {
    for (const projectId of this.#entries.keys()) this.stop(projectId);
  }
}
