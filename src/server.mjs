import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './core/config.mjs';
import { createExternalDomainSetup, defaultHostname, routeHostname, verifyDomainOwnership } from './core/domains.mjs';
import { branchFromRef, verifyGitHubSignature } from './core/github.mjs';
import { JsonStore } from './core/store.mjs';
import { normalizeDomain, normalizeProjectInput } from './core/validation.mjs';
import { normalizeResources, setProjectResources } from './core/resources.mjs';
import { projectAnalytics, recordRequestAnalytics } from './core/analytics.mjs';
import { startupErrorMessage } from './core/startup.mjs';
import { deleteProject, pauseProject, resumeProject, terminateProject } from './core/project-lifecycle.mjs';
import { runCommand } from './core/command.mjs';
import { directorySizeBytes, persistentStoragePath, storageBudgetBytes } from './core/storage.mjs';
import { DeploymentService } from './services/deployments.mjs';
import { proxyRequest } from './services/proxy.mjs';
import { QuickTunnelService, resolveTunnelCommand } from './services/quick-tunnels.mjs';

const config = loadConfig();
const store = new JsonStore(config.dataDir);
await store.init();
const deployments = new DeploymentService(store, config.dataDir);
const quickTunnels = new QuickTunnelService({ command: resolveTunnelCommand(config.dataDir) });
const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const storageUsageCache = new Map();

async function projectStorage(project) {
  const cached = storageUsageCache.get(project.id);
  if (cached && Date.now() - cached.measuredAt < 10_000) return cached.value;
  const resources = normalizeResources(project.resources);
  const usedBytes = await directorySizeBytes(persistentStoragePath(config.dataDir, project.id));
  const budgetBytes = storageBudgetBytes(resources.storageGb);
  const value = {
    enabled: resources.storageGb > 0,
    usedBytes,
    budgetBytes,
    percentUsed: budgetBytes ? Math.min(100, (usedBytes / budgetBytes) * 100) : 0,
    containerPath: '/data',
  };
  storageUsageCache.set(project.id, { measuredAt: Date.now(), value });
  return value;
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req, limit = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('Request body is too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function serveAsset(res, file, type) {
  try {
    const body = await fs.readFile(path.join(publicDir, file));
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache' });
    res.end(body);
  } catch {
    sendJson(res, 404, { error: 'Not found' });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const route = routeHostname(store.snapshot(), req.headers.host);
    if (route.deployment?.localPort) {
      return proxyRequest(req, res, route.deployment.localPort, {
        onComplete: (event) => {
          store.update((state) => recordRequestAnalytics(state, { ...event, projectId: route.project.id }))
            .catch((error) => console.error(`Could not save analytics: ${error.message}`));
        },
      });
    }
    if (route.matched) return sendJson(res, 503, { error: 'This project does not have a ready deployment' });

    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    if (req.method === 'GET' && url.pathname === '/') return serveAsset(res, 'index.html', 'text/html; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/app.js') return serveAsset(res, 'app.js', 'text/javascript; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/styles.css') return serveAsset(res, 'styles.css', 'text/css; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/api/health') return sendJson(res, 200, { status: 'ok' });
    if (req.method === 'GET' && url.pathname === '/api/state') {
      const state = store.snapshot();
      const projects = await Promise.all(state.projects.map(async (project) => ({
        ...project,
        resources: normalizeResources(project.resources),
        storage: await projectStorage(project),
        analytics: projectAnalytics(state, project.id),
        defaultHostname: defaultHostname(project),
        defaultUrl: `http://${defaultHostname(project)}:${config.port}`,
      })));
      return sendJson(res, 200, {
        ...state,
        projects,
        quickTunnels: quickTunnels.snapshot(),
        webhookBaseUrl: `http://${config.host}:${config.port}`,
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/projects') {
      const input = JSON.parse((await readBody(req)).toString('utf8'));
      const normalized = normalizeProjectInput(input);
      const state = store.snapshot();
      if (state.projects.some((item) => item.slug === normalized.slug)) return sendJson(res, 409, { error: 'Project slug already exists' });
      const project = {
        id: crypto.randomUUID(), ...normalized,
        resources: normalizeResources(input.resources),
        webhookSecret: crypto.randomBytes(24).toString('hex'),
        createdAt: new Date().toISOString(),
      };
      await store.update((current) => { current.projects.push(project); return project; });
      return sendJson(res, 201, project);
    }

    const resourcesMatch = url.pathname.match(/^\/api\/projects\/([\w-]+)\/resources$/);
    if (req.method === 'PUT' && resourcesMatch) {
      const input = JSON.parse((await readBody(req)).toString('utf8'));
      const project = await store.update((state) => setProjectResources(state, resourcesMatch[1], input));
      storageUsageCache.delete(project.id);
      return sendJson(res, 200, { ...project, resources: normalizeResources(project.resources) });
    }

    const deployMatch = url.pathname.match(/^\/api\/projects\/([\w-]+)\/deploy$/);
    if (req.method === 'POST' && deployMatch) {
      const projectId = deployMatch[1];
      if (deployments.isDeploying(projectId)) return sendJson(res, 409, { error: 'Deployment already running' });
      deployments.deploy(projectId).catch((error) => console.error(error.message));
      return sendJson(res, 202, { status: 'building' });
    }

    const lifecycleMatch = url.pathname.match(/^\/api\/projects\/([\w-]+)\/(pause|resume|terminate)$/);
    if (req.method === 'POST' && lifecycleMatch) {
      const [, projectId, action] = lifecycleMatch;
      if (deployments.isDeploying(projectId)) return sendJson(res, 409, { error: 'Wait for the current deployment to finish first' });
      const state = store.snapshot();
      const allowedStatuses = action === 'pause' ? ['ready'] : action === 'resume' ? ['paused'] : ['ready', 'paused'];
      const runtime = state.deployments.find(
        (item) => item.projectId === projectId && allowedStatuses.includes(item.status),
      );
      if (!state.projects.some((item) => item.id === projectId)) return sendJson(res, 404, { error: 'Project not found' });
      if (!runtime?.containerName) return sendJson(res, 409, { error: `Project cannot ${action} because it has no matching running container` });
      if (action === 'pause') {
        await runCommand('docker', ['stop', runtime.containerName]);
        quickTunnels.stop(projectId);
        const updated = await store.update((current) => pauseProject(current, projectId));
        return sendJson(res, 200, updated);
      }
      if (action === 'resume') {
        await runCommand('docker', ['start', runtime.containerName]);
        const updated = await store.update((current) => resumeProject(current, projectId));
        return sendJson(res, 200, updated);
      }
      await runCommand('docker', ['rm', '--force', runtime.containerName]);
      quickTunnels.stop(projectId);
      const updated = await store.update((current) => terminateProject(current, projectId));
      return sendJson(res, 200, updated);
    }

    const deleteProjectMatch = url.pathname.match(/^\/api\/projects\/([\w-]+)$/);
    if (req.method === 'DELETE' && deleteProjectMatch) {
      const projectId = deleteProjectMatch[1];
      if (deployments.isDeploying(projectId)) return sendJson(res, 409, { error: 'Wait for the current deployment to finish before deleting the project' });
      const input = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const snapshot = store.snapshot();
      const project = snapshot.projects.find((item) => item.id === projectId);
      if (!project) return sendJson(res, 404, { error: 'Project not found' });
      const containerNames = [...new Set(snapshot.deployments
        .filter((item) => item.projectId === projectId)
        .map((item) => item.containerName)
        .filter(Boolean))];
      const cleanupWarnings = [];
      quickTunnels.stop(projectId);
      for (const containerName of containerNames) {
        await runCommand('docker', ['rm', '--force', containerName]).catch((error) => cleanupWarnings.push(error.message));
      }
      await fs.rm(path.join(config.dataDir, 'repos', projectId), { recursive: true, force: true });
      await fs.rm(path.join(config.dataDir, 'build-recipes', `${projectId}.Dockerfile`), { force: true });
      if (input.deleteStorage === true) {
        await fs.rm(persistentStoragePath(config.dataDir, projectId), { recursive: true, force: true });
      }
      await store.update((current) => deleteProject(current, projectId));
      storageUsageCache.delete(projectId);
      return sendJson(res, 200, {
        status: 'deleted',
        projectId,
        storageDeleted: input.deleteStorage === true,
        preservedStoragePath: input.deleteStorage === true ? null : persistentStoragePath(config.dataDir, projectId),
        cleanupWarnings,
      });
    }

    const publishMatch = url.pathname.match(/^\/api\/projects\/([\w-]+)\/publish$/);
    if (publishMatch && req.method === 'POST') {
      const projectId = publishMatch[1];
      const state = store.snapshot();
      if (!state.projects.some((item) => item.id === projectId)) return sendJson(res, 404, { error: 'Project not found' });
      const ready = state.deployments.find((item) => item.projectId === projectId && item.status === 'ready');
      if (!ready?.localPort) return sendJson(res, 409, { error: 'Deploy the project successfully before publishing it.' });
      return sendJson(res, 202, quickTunnels.start(projectId, ready.localPort));
    }
    if (publishMatch && req.method === 'DELETE') {
      return sendJson(res, 200, quickTunnels.stop(publishMatch[1]));
    }

    const domainMatch = url.pathname.match(/^\/api\/projects\/([\w-]+)\/domains$/);
    if (req.method === 'POST' && domainMatch) {
      const input = JSON.parse((await readBody(req)).toString('utf8'));
      const hostname = normalizeDomain(input.hostname);
      const state = store.snapshot();
      if (!state.projects.some((item) => item.id === domainMatch[1])) return sendJson(res, 404, { error: 'Project not found' });
      if (state.domains.some((item) => item.hostname === hostname)) return sendJson(res, 409, { error: 'Domain already registered' });
      const verificationToken = `localship-verification=${crypto.randomBytes(24).toString('hex')}`;
      const domain = {
        id: crypto.randomUUID(), projectId: domainMatch[1], hostname,
        status: 'pending',
        verificationStatus: 'pending',
        setup: createExternalDomainSetup(hostname, `http://${config.host}:${config.port}`, verificationToken),
        createdAt: new Date().toISOString(),
      };
      await store.update((current) => { current.domains.push(domain); return domain; });
      return sendJson(res, 201, domain);
    }

    const verifyDomainMatch = url.pathname.match(/^\/api\/domains\/([\w-]+)\/verify$/);
    if (req.method === 'POST' && verifyDomainMatch) {
      const domain = store.snapshot().domains.find((item) => item.id === verifyDomainMatch[1]);
      if (!domain) return sendJson(res, 404, { error: 'Domain not found' });
      if (domain.verificationStatus === 'verified') return sendJson(res, 200, domain);
      const token = domain.setup?.verification?.record?.value;
      if (!token) return sendJson(res, 409, { error: 'This older domain entry has no verification record. Add the domain again to verify it.' });
      const verified = await verifyDomainOwnership(domain.hostname, token);
      if (!verified) {
        return sendJson(res, 409, {
          error: `TXT record not found yet. Check _localship.${domain.hostname}, then retry after DNS has propagated.`,
          verificationStatus: 'pending',
        });
      }
      const updated = await store.update((current) => {
        const item = current.domains.find((entry) => entry.id === domain.id);
        item.status = 'active';
        item.verificationStatus = 'verified';
        item.verifiedAt = new Date().toISOString();
        return item;
      });
      return sendJson(res, 200, updated);
    }

    const webhookMatch = url.pathname.match(/^\/api\/webhooks\/github\/([\w-]+)$/);
    if (req.method === 'POST' && webhookMatch) {
      const project = store.snapshot().projects.find((item) => item.id === webhookMatch[1]);
      if (!project) return sendJson(res, 404, { error: 'Project not found' });
      const raw = await readBody(req);
      if (!verifyGitHubSignature(project.webhookSecret, raw, req.headers['x-hub-signature-256'])) {
        return sendJson(res, 401, { error: 'Invalid webhook signature' });
      }
      const event = req.headers['x-github-event'];
      if (event === 'ping') return sendJson(res, 200, { status: 'pong' });
      const payload = JSON.parse(raw.toString('utf8'));
      if (event === 'push' && branchFromRef(payload.ref) === project.branch && !deployments.isDeploying(project.id)) {
        deployments.deploy(project.id, 'github-push').catch((error) => console.error(error.message));
        return sendJson(res, 202, { status: 'building' });
      }
      return sendJson(res, 200, { status: 'ignored' });
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    sendJson(res, error instanceof SyntaxError ? 400 : 422, { error: error.message });
  }
});

server.once('error', (error) => {
  console.error(startupErrorMessage(error, config));
  process.exitCode = 1;
});

server.listen(config.port, config.host, () => {
  console.log(`Localship is running at http://${config.host}:${config.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    quickTunnels.stopAll();
    server.close(() => process.exit(0));
  });
}
