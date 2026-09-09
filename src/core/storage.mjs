import fs from 'node:fs/promises';
import path from 'node:path';

const GIBIBYTE = 1024 ** 3;

export function persistentStoragePath(dataDir, projectId) {
  if (!/^[\w-]+$/.test(projectId)) throw new Error('Project ID is invalid');
  return path.resolve(dataDir, 'volumes', projectId);
}

export function persistentStorageDockerArgs(dataDir, projectId, resources) {
  if (!resources.storageGb) return [];
  const source = persistentStoragePath(dataDir, projectId);
  return [
    '--mount', `type=bind,source=${source},target=/data`,
    '--env', 'LOCALSHIP_DATA_DIR=/data',
    '--env', `LOCALSHIP_STORAGE_BUDGET_BYTES=${resources.storageGb * GIBIBYTE}`,
  ];
}

export async function directorySizeBytes(directory) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }

  let total = 0;
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await directorySizeBytes(entryPath);
    else if (entry.isFile()) total += (await fs.stat(entryPath)).size;
  }
  return total;
}

export function storageBudgetBytes(storageGb) {
  return storageGb * GIBIBYTE;
}

export function assertStorageWithinBudget(usedBytes, resources) {
  if (!resources.storageGb) return;
  if (usedBytes > storageBudgetBytes(resources.storageGb)) {
    throw new Error(`Persistent storage usage exceeds the ${resources.storageGb} GB budget. Increase the budget or remove data before deploying.`);
  }
}
