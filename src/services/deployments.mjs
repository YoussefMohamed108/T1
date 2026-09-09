import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { detectBuildPlan } from '../core/build-plan.mjs';
import { runCommand } from '../core/command.mjs';
import { probeHttp } from '../core/health-check.mjs';
import { dockerResourceArgs, normalizeResources } from '../core/resources.mjs';
import {
  assertStorageWithinBudget,
  directorySizeBytes,
  persistentStorageDockerArgs,
  persistentStoragePath,
} from '../core/storage.mjs';

function shortId() {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 12);
}

async function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

export class DeploymentService {
  #store;
  #dataDir;
  #active = new Set();

  constructor(store, dataDir) {
    this.#store = store;
    this.#dataDir = dataDir;
  }

  isDeploying(projectId) {
    return this.#active.has(projectId);
  }

  async deploy(projectId, reason = 'manual') {
    if (this.#active.has(projectId)) throw new Error('A deployment is already running for this project');
    const project = this.#store.snapshot().projects.find((item) => item.id === projectId);
    if (!project) throw new Error('Project not found');
    const resources = normalizeResources(project.resources);
    const volumePath = persistentStoragePath(this.#dataDir, project.id);
    const storageUsedAtStart = await directorySizeBytes(volumePath);
    assertStorageWithinBudget(storageUsedAtStart, resources);
    if (resources.storageGb > 0) await fs.mkdir(volumePath, { recursive: true });

    this.#active.add(projectId);
    const deployment = {
      id: shortId(), projectId, reason, status: 'building', createdAt: new Date().toISOString(),
      logs: '', commit: null, localPort: null, containerName: null, resources, storageUsedAtStart,
    };
    let startedContainerName = null;
    await this.#store.update((state) => {
      state.deployments.unshift(deployment);
      return deployment;
    });

    const log = async (text) => {
      await this.#store.update((state) => {
        const current = state.deployments.find((item) => item.id === deployment.id);
        if (current) current.logs = `${current.logs}${text}`.slice(-200_000);
      });
    };

    try {
      const repoDir = path.join(this.#dataDir, 'repos', project.id);
      await fs.mkdir(path.dirname(repoDir), { recursive: true });
      const gitDirExists = await fs.access(path.join(repoDir, '.git')).then(() => true, () => false);
      if (!gitDirExists) {
        await log(`Cloning ${project.repoUrl} (${project.branch})\n`);
        await runCommand('git', ['clone', '--depth', '1', '--branch', project.branch, '--', project.repoUrl, repoDir], { onOutput: log });
      } else {
        await log(`Fetching ${project.branch}\n`);
        await runCommand('git', ['fetch', '--depth', '1', 'origin', project.branch], { cwd: repoDir, onOutput: log });
        await runCommand('git', ['checkout', '--force', 'FETCH_HEAD'], { cwd: repoDir, onOutput: log });
      }

      const { output: commitOutput } = await runCommand('git', ['rev-parse', 'HEAD'], { cwd: repoDir });
      const commit = commitOutput.trim();
      const image = `localship/${project.slug}:${deployment.id}`;
      const buildPlan = await detectBuildPlan(repoDir, project.containerPort);
      const buildArgs = ['build', '--label', `localship.project=${project.id}`, '-t', image];
      if (buildPlan.dockerfile) {
        const recipeDir = path.join(this.#dataDir, 'build-recipes');
        await fs.mkdir(recipeDir, { recursive: true });
        const recipePath = path.join(recipeDir, `${project.id}.Dockerfile`);
        await fs.writeFile(recipePath, buildPlan.dockerfile, 'utf8');
        buildArgs.push('--file', recipePath);
      }
      buildArgs.push('.');
      await log(`Detected ${buildPlan.type}; building ${image}\n`);
      await runCommand('docker', buildArgs, { cwd: repoDir, onOutput: log });

      const localPort = await availablePort();
      const containerName = `localship-${project.slug}-${deployment.id}`;
      startedContainerName = containerName;
      await log(`Starting container on 127.0.0.1:${localPort}\n`);
      await runCommand('docker', [
        'run', '--detach', '--name', containerName,
        '--label', `localship.project=${project.id}`,
        ...dockerResourceArgs(resources),
        ...persistentStorageDockerArgs(this.#dataDir, project.id, resources),
        '--restart', 'unless-stopped',
        '-p', `127.0.0.1:${localPort}:${project.containerPort}`,
        image,
      ], { onOutput: log });

      await this.#waitUntilReady(localPort, log);
      const previous = this.#store.snapshot().deployments.find(
        (item) => item.projectId === project.id && item.status === 'ready' && item.id !== deployment.id,
      );
      await this.#store.update((state) => {
        const current = state.deployments.find((item) => item.id === deployment.id);
        Object.assign(current, { status: 'ready', commit, localPort, containerName, readyAt: new Date().toISOString() });
        if (previous) {
          const old = state.deployments.find((item) => item.id === previous.id);
          old.status = 'superseded';
        }
      });
      if (previous?.containerName) {
        await runCommand('docker', ['rm', '--force', previous.containerName]).catch((error) => log(`Cleanup warning: ${error.message}\n`));
      }
      await log('Deployment is ready.\n');
      return this.#store.snapshot().deployments.find((item) => item.id === deployment.id);
    } catch (error) {
      if (startedContainerName) {
        await runCommand('docker', ['rm', '--force', startedContainerName]).catch(() => {});
      }
      await log(`Deployment failed: ${error.message}\n${error.output ?? ''}`);
      await this.#store.update((state) => {
        const current = state.deployments.find((item) => item.id === deployment.id);
        current.status = 'failed';
        current.finishedAt = new Date().toISOString();
      });
      throw error;
    } finally {
      this.#active.delete(projectId);
    }
  }

  async #waitUntilReady(port, log) {
    let lastError;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        const status = await probeHttp(port);
        if (status < 500) return;
        lastError = new Error(`Health check returned ${status}`);
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await log(`Health check failed: ${lastError?.message}\n`);
    throw new Error('Container did not become healthy within 10 seconds');
  }
}
