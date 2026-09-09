const projectList = document.querySelector('#projects');
const empty = document.querySelector('#empty');
const projectDialog = document.querySelector('#project-dialog');
const domainDialog = document.querySelector('#domain-dialog');
const resourceDialog = document.querySelector('#resource-dialog');
const helpDialog = document.querySelector('#help-dialog');
let latestState = null;
let currentDomainId = null;

function announce(message, kind = 'info') {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.dataset.kind = kind;
  toast.hidden = false;
  clearTimeout(announce.timer);
  announce.timer = setTimeout(() => { toast.hidden = true; }, 4500);
}

async function request(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'content-type': 'application/json', ...options.headers } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? 'Request failed');
  return body;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function timeAgo(value) {
  if (!value) return 'Never deployed';
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

const resourcePresets = {
  light: { cpu: 0.5, memoryMb: 256, pids: 128, storageGb: 1 },
  standard: { cpu: 1, memoryMb: 512, pids: 256, storageGb: 5 },
  heavy: { cpu: 2, memoryMb: 2048, pids: 512, storageGb: 20 },
};

function sameResources(left, right) {
  return left.cpu === right.cpu && left.memoryMb === right.memoryMb && left.pids === right.pids && left.storageGb === right.storageGb;
}

function resourceLabel(resources) {
  const memory = resources.memoryMb >= 1024 && resources.memoryMb % 1024 === 0
    ? `${resources.memoryMb / 1024} GB`
    : `${resources.memoryMb} MB`;
  const storage = resources.storageGb ? `${resources.storageGb} GB storage` : 'storage off';
  return `${resources.cpu} CPU · ${memory} · ${storage} · ${resources.pids} processes`;
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** index)).toFixed(index > 2 ? 2 : 0)} ${units[index]}`;
}

function presetFor(resources) {
  return Object.entries(resourcePresets).find(([, values]) => sameResources(values, resources))?.[0] ?? 'custom';
}

async function render() {
  const state = await request('/api/state');
  latestState = state;
  renderJourney(state);
  document.querySelector('#project-count').textContent = `${state.projects.length} project${state.projects.length === 1 ? '' : 's'}`;
  empty.hidden = state.projects.length > 0;
  projectList.innerHTML = state.projects.map((project) => {
    const deployment = state.deployments.find((item) => item.projectId === project.id);
    const domains = state.domains.filter((item) => item.projectId === project.id);
    const tunnel = state.quickTunnels[project.id] ?? { status: 'not-published', publicUrl: null };
    const status = deployment?.status ?? 'not-deployed';
    const configuredResources = project.resources;
    const deployedResources = { ...resourcePresets.standard, ...(deployment?.resources ?? {}) };
    const resourcesPending = status === 'ready' && (
      deployment?.resources?.storageGb === undefined || !sameResources(configuredResources, deployedResources)
    );
    const isReady = status === 'ready';
    const isPublishing = tunnel.status === 'connecting';
    const isPublished = tunnel.status === 'published';
    return `<article class="project-card">
      <div class="project-top"><div class="project-logo">${escapeHtml(project.name.slice(0, 1).toUpperCase())}</div><span class="status ${status}">${escapeHtml(status.replace('-', ' '))}</span></div>
      <div><h3>${escapeHtml(project.name)}</h3><p class="repo">${escapeHtml(project.repoUrl.replace('https://github.com/', ''))}</p></div>
      <div class="address-block"><span class="address-label">Local preview · this computer only</span><a class="default-domain" href="${escapeHtml(project.defaultUrl)}" target="_blank" rel="noreferrer"><span class="pulse"></span>${escapeHtml(project.defaultHostname)}<span>↗</span></a></div>
      ${isPublished ? `<div class="address-block public-address"><span class="address-label">Public preview · works on other devices</span><a class="default-domain" href="${escapeHtml(tunnel.publicUrl)}" target="_blank" rel="noreferrer"><span class="pulse"></span>${escapeHtml(tunnel.publicUrl.replace('https://', ''))}<span>↗</span></a></div>` : ''}
      ${tunnel.status === 'error' ? `<div class="inline-error"><strong>Could not publish</strong><span>${escapeHtml(tunnel.error)}</span><a href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" target="_blank" rel="noreferrer">Install cloudflared ↗</a></div>` : ''}
      <div class="meta"><span>Branch <strong>${escapeHtml(project.branch)}</strong></span><span>${timeAgo(deployment?.createdAt)}</span></div>
      <div class="resource-summary"><div class="resource-copy"><strong>Container resources</strong><span>${resourceLabel(configuredResources)}</span><div class="storage-meter"><div><span>Persistent storage used</span><span>${formatBytes(project.storage.usedBytes)} / ${configuredResources.storageGb || 0} GB</span></div><progress value="${project.storage.percentUsed}" max="100" aria-label="Persistent storage ${project.storage.percentUsed.toFixed(1)} percent used"></progress></div>${resourcesPending ? '<span class="pending-change">Redeploy to apply these changes</span>' : ''}</div><button type="button" data-resources="${project.id}">Manage</button></div>
      ${domains.map((domain) => domain.status === 'active'
        ? `<a class="domain" href="https://${escapeHtml(domain.hostname)}" target="_blank" rel="noreferrer"><span>${escapeHtml(domain.hostname)}</span><small>verified ↗</small></a>`
        : `<button class="domain" type="button" data-manage-domain="${domain.id}" ${domain.setup?.verification ? '' : 'disabled'}><span>${escapeHtml(domain.hostname)}</span><small>${domain.setup?.verification ? 'finish setup' : 'pending'}</small></button>`).join('')}
      ${deployment?.logs ? `<details><summary>Build logs</summary><pre>${escapeHtml(deployment.logs)}</pre></details>` : ''}
      <div class="action-guide"><strong>Next actions</strong><span>Deploy creates the container. Publish makes it reachable from the internet.</span></div>
      <div class="actions"><button data-deploy="${project.id}" ${status === 'building' ? 'disabled' : ''}>${status === 'building' ? 'Building…' : 'Deploy'}</button>${isPublished ? `<button class="secondary" data-unpublish="${project.id}">Stop sharing</button>` : `<button class="publish" data-publish="${project.id}" ${!isReady || isPublishing ? 'disabled' : ''}>${isPublishing ? 'Publishing…' : 'Publish preview'}</button>`}<button class="secondary" data-domain="${project.id}">Custom domain</button></div>
    </article>`;
  }).join('');
}

function renderJourney(state) {
  const hasProject = state.projects.length > 0;
  const hasDeployment = state.deployments.some((item) => item.status === 'ready');
  const hasPublicUrl = Object.values(state.quickTunnels).some((item) => item.status === 'published');
  const hasDomain = state.domains.some((item) => item.status === 'active');
  const steps = [
    { title: 'Add repository', detail: 'Choose a GitHub project and branch.', complete: hasProject },
    { title: 'Deploy locally', detail: 'Build and health-check its container.', complete: hasDeployment },
    { title: 'Publish preview', detail: 'Create a temporary public HTTPS link.', complete: hasPublicUrl },
    { title: 'Connect domain', detail: 'Optional: add a permanent purchased domain.', complete: hasDomain },
  ];
  const coreCompleted = steps.slice(0, 3).filter((step) => step.complete).length;
  document.querySelector('#journey-progress').textContent = coreCompleted === 3
    ? (hasDomain ? 'Public site and domain ready' : 'Public preview ready · domain optional')
    : `Step ${coreCompleted + 1} of 3`;
  document.querySelector('#journey-steps').innerHTML = steps.map((step, index) => {
    const classes = [step.complete ? 'complete' : '', index < 3 && index === coreCompleted ? 'current' : '', index === 3 ? 'optional' : ''].filter(Boolean).join(' ');
    return `<li class="${classes}"><span class="step-number">${step.complete ? '✓' : index === 3 ? 'OPT' : index + 1}</span><div><strong>${step.title}</strong><p>${step.detail}</p></div></li>`;
  }).join('');
}

function showDomainChoice(projectId) {
  const form = document.querySelector('#domain-form');
  form.reset();
  form.querySelector('[name=projectId]').value = projectId;
  document.querySelector('#domain-choice').hidden = false;
  form.hidden = true;
  document.querySelector('#domain-setup').hidden = true;
  document.querySelector('#domain-error').textContent = '';
  currentDomainId = null;
}

function showDomainSetup(domain) {
  currentDomainId = domain.id;
  document.querySelector('#domain-choice').hidden = true;
  document.querySelector('#domain-form').hidden = true;
  document.querySelector('#domain-setup').hidden = false;
  document.querySelector('#dns-name').textContent = domain.setup.verification.record.name;
  document.querySelector('#dns-value').textContent = domain.setup.verification.record.value;
  document.querySelector('#cloudflare-commands').textContent = domain.setup.cloudflare.commands.join('\n');
  document.querySelector('#cloudflare-config').textContent = domain.setup.cloudflare.config;
  document.querySelector('#manual-requirements').innerHTML = domain.setup.manual.requirements
    .map((requirement) => `<li>${escapeHtml(requirement)}</li>`).join('');
  const verified = domain.verificationStatus === 'verified';
  document.querySelector('#verify-domain').hidden = verified;
  document.querySelector('#verification-success').hidden = !verified;
  document.querySelector('#verification-error').textContent = '';
}

document.querySelector('#new-project').addEventListener('click', () => projectDialog.showModal());
document.querySelector('#help-button').addEventListener('click', () => helpDialog.showModal());
document.querySelector('.close-guide').addEventListener('click', () => helpDialog.close());
document.querySelectorAll('.close').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelectorAll('.close-domain').forEach((button) => button.addEventListener('click', () => domainDialog.close()));
document.querySelector('#domain-owned').addEventListener('click', () => {
  document.querySelector('#domain-choice').hidden = true;
  document.querySelector('#domain-form').hidden = false;
  document.querySelector('#domain-form [name=hostname]').focus();
});
document.querySelector('#domain-back').addEventListener('click', () => {
  document.querySelector('#domain-form').hidden = true;
  document.querySelector('#domain-choice').hidden = false;
});

function fillResourceForm(project) {
  const form = document.querySelector('#resource-form');
  form.querySelector('[name=projectId]').value = project.id;
  form.querySelector('[name=cpu]').value = project.resources.cpu;
  form.querySelector('[name=memoryMb]').value = project.resources.memoryMb;
  form.querySelector('[name=pids]').value = project.resources.pids;
  form.querySelector('[name=storageGb]').value = project.resources.storageGb;
  form.querySelector('[name=preset]').value = presetFor(project.resources);
  document.querySelector('#resource-error').textContent = '';
}

document.querySelector('#resource-form [name=preset]').addEventListener('change', (event) => {
  const values = resourcePresets[event.target.value];
  if (!values) return;
  const form = event.target.form;
  for (const [name, value] of Object.entries(values)) form.querySelector(`[name=${name}]`).value = value;
});

document.querySelectorAll('#resource-form input[type=number]').forEach((input) => input.addEventListener('input', () => {
  document.querySelector('#resource-form [name=preset]').value = 'custom';
}));

document.querySelector('#project-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const error = document.querySelector('#form-error');
  try {
    error.textContent = '';
    await request('/api/projects', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) });
    projectDialog.close();
    event.currentTarget.reset();
    await render();
  } catch (exception) { error.textContent = exception.message; }
});

projectList.addEventListener('click', async (event) => {
  const deploy = event.target.closest('[data-deploy]');
  const publish = event.target.closest('[data-publish]');
  const unpublish = event.target.closest('[data-unpublish]');
  const domain = event.target.closest('[data-domain]');
  const manageDomain = event.target.closest('[data-manage-domain]');
  const resources = event.target.closest('[data-resources]');
  if (deploy) {
    deploy.disabled = true;
    deploy.textContent = 'Building…';
    await request(`/api/projects/${deploy.dataset.deploy}/deploy`, { method: 'POST' });
    await render();
  }
  if (publish) {
    publish.disabled = true;
    publish.textContent = 'Publishing…';
    try {
      await request(`/api/projects/${publish.dataset.publish}/publish`, { method: 'POST' });
      announce('Creating a public HTTPS preview. This usually takes a few seconds.');
      await render();
    } catch (exception) { announce(exception.message, 'error'); await render(); }
  }
  if (unpublish) {
    await request(`/api/projects/${unpublish.dataset.unpublish}/publish`, { method: 'DELETE' });
    announce('Public sharing stopped. The local deployment is still running.');
    await render();
  }
  if (domain) {
    const resumable = latestState.domains.find((item) => item.projectId === domain.dataset.domain && item.status === 'pending' && item.setup?.verification);
    if (resumable) showDomainSetup(resumable);
    else showDomainChoice(domain.dataset.domain);
    domainDialog.showModal();
  }
  if (manageDomain) {
    const selected = latestState.domains.find((item) => item.id === manageDomain.dataset.manageDomain);
    if (selected?.setup?.verification) { showDomainSetup(selected); domainDialog.showModal(); }
  }
  if (resources) {
    const project = latestState.projects.find((item) => item.id === resources.dataset.resources);
    if (project) { fillResourceForm(project); resourceDialog.showModal(); }
  }
});

document.querySelector('#domain-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const error = document.querySelector('#domain-error');
  try {
    error.textContent = '';
    const domain = await request(`/api/projects/${form.get('projectId')}/domains`, {
      method: 'POST', body: JSON.stringify({ hostname: form.get('hostname') }),
    });
    showDomainSetup(domain);
    await render();
  } catch (exception) { error.textContent = exception.message; announce(exception.message, 'error'); }
});

document.querySelector('#verify-domain').addEventListener('click', async (event) => {
  const error = document.querySelector('#verification-error');
  const button = event.currentTarget;
  try {
    error.textContent = '';
    button.disabled = true;
    button.textContent = 'Checking DNS…';
    const domain = await request(`/api/domains/${currentDomainId}/verify`, { method: 'POST' });
    showDomainSetup(domain);
    announce('Domain ownership verified. Complete the tunnel step to make it publicly reachable.');
    await render();
  } catch (exception) {
    error.textContent = `${exception.message} DNS changes can take several minutes. You can close this window and retry later.`;
  } finally {
    button.disabled = false;
    button.textContent = 'Verify DNS record';
  }
});

document.querySelector('#resource-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const error = document.querySelector('#resource-error');
  const button = event.currentTarget.querySelector('[type=submit]');
  try {
    error.textContent = '';
    button.disabled = true;
    button.textContent = 'Saving…';
    await request(`/api/projects/${form.get('projectId')}/resources`, {
      method: 'PUT',
      body: JSON.stringify({ cpu: form.get('cpu'), memoryMb: form.get('memoryMb'), pids: form.get('pids'), storageGb: form.get('storageGb') }),
    });
    resourceDialog.close();
    announce('Resource limits saved. Deploy again to apply them to the running website.');
    await render();
  } catch (exception) {
    error.textContent = exception.message;
  } finally {
    button.disabled = false;
    button.textContent = 'Save resource limits';
  }
});

domainDialog.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-copy]');
  if (!button) return;
  await navigator.clipboard.writeText(document.querySelector(`#${button.dataset.copy}`).textContent);
  const original = button.textContent;
  button.textContent = 'Copied';
  setTimeout(() => { button.textContent = original; }, 1200);
});

await render();
setInterval(render, 3000);
