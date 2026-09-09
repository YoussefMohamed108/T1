function requireProject(state, projectId) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) throw new Error('Project not found');
  return project;
}

function runtimeWithStatus(state, projectId, statuses) {
  requireProject(state, projectId);
  const deployment = state.deployments.find(
    (item) => item.projectId === projectId && statuses.includes(item.status),
  );
  if (!deployment) throw new Error(`Project does not have a ${statuses.join(' or ')} deployment`);
  if (!deployment.containerName) throw new Error('Project runtime does not have a container');
  return deployment;
}

export function pauseProject(state, projectId, occurredAt = new Date().toISOString()) {
  const deployment = runtimeWithStatus(state, projectId, ['ready']);
  deployment.status = 'paused';
  deployment.pausedAt = occurredAt;
  return deployment;
}

export function resumeProject(state, projectId, occurredAt = new Date().toISOString()) {
  const deployment = runtimeWithStatus(state, projectId, ['paused']);
  deployment.status = 'ready';
  deployment.resumedAt = occurredAt;
  delete deployment.pausedAt;
  return deployment;
}

export function terminateProject(state, projectId, occurredAt = new Date().toISOString()) {
  const deployment = runtimeWithStatus(state, projectId, ['ready', 'paused']);
  deployment.status = 'terminated';
  deployment.terminatedAt = occurredAt;
  deployment.localPort = null;
  deployment.containerName = null;
  return deployment;
}

export function deleteProject(state, projectId) {
  const project = requireProject(state, projectId);
  const projectDeployments = state.deployments.filter((item) => item.projectId === projectId);
  const containerNames = [...new Set(projectDeployments.map((item) => item.containerName).filter(Boolean))];
  state.projects = state.projects.filter((item) => item.id !== projectId);
  state.deployments = state.deployments.filter((item) => item.projectId !== projectId);
  state.domains = state.domains.filter((item) => item.projectId !== projectId);
  if (state.analytics) delete state.analytics[projectId];
  return { project, containerNames };
}
