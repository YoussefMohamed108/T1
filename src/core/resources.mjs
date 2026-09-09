export const DEFAULT_RESOURCES = Object.freeze({
  cpu: 1,
  memoryMb: 512,
  pids: 256,
  storageGb: 5,
});

export function normalizeResources(input = DEFAULT_RESOURCES) {
  const cpu = Number(input?.cpu ?? DEFAULT_RESOURCES.cpu);
  const memoryMb = Number.parseInt(input?.memoryMb ?? DEFAULT_RESOURCES.memoryMb, 10);
  const pids = Number.parseInt(input?.pids ?? DEFAULT_RESOURCES.pids, 10);
  const storageGb = Number(input?.storageGb ?? DEFAULT_RESOURCES.storageGb);

  if (!Number.isFinite(cpu) || cpu < 0.25 || cpu > 16) {
    throw new Error('CPU limit must be between 0.25 and 16 cores');
  }
  if (!Number.isInteger(memoryMb) || memoryMb < 128 || memoryMb > 32768) {
    throw new Error('Memory limit must be between 128 and 32768 MB');
  }
  if (!Number.isInteger(pids) || pids < 32 || pids > 4096) {
    throw new Error('Container process limit must be between 32 and 4096');
  }
  if (!Number.isFinite(storageGb) || storageGb < 0 || (storageGb > 0 && storageGb < 0.25) || storageGb > 1024) {
    throw new Error('Storage budget must be 0 (disabled) or between 0.25 and 1024 GB');
  }

  return { cpu, memoryMb, pids, storageGb };
}

export function dockerResourceArgs(input) {
  const resources = normalizeResources(input);
  return [
    '--memory', `${resources.memoryMb}m`,
    '--cpus', String(resources.cpu),
    '--pids-limit', String(resources.pids),
  ];
}

export function setProjectResources(state, projectId, input) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) throw new Error('Project not found');
  project.resources = normalizeResources(input);
  project.resourcesUpdatedAt = new Date().toISOString();
  return project;
}
