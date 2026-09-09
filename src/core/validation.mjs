const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BRANCH_PATTERN = /^(?!\/|.*(?:\.\.|\/\.|\.\/|\/\/|@\{|\\))[A-Za-z0-9._/-]{1,200}$/;
const HOST_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function normalizeProjectInput(input) {
  const name = String(input?.name ?? '').trim();
  const slug = String(input?.slug ?? name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const repoUrl = String(input?.repoUrl ?? '').trim();
  const branch = String(input?.branch ?? 'main').trim();
  const containerPort = Number.parseInt(input?.containerPort ?? '3000', 10);

  if (!name || name.length > 80) throw new Error('Project name is required and must be at most 80 characters');
  if (!SLUG_PATTERN.test(slug) || slug.length > 63) throw new Error('Project slug is invalid');
  if (!isAllowedRepository(repoUrl)) throw new Error('Repository must be a GitHub HTTPS or SSH URL');
  if (!BRANCH_PATTERN.test(branch)) throw new Error('Branch name is invalid');
  if (!Number.isInteger(containerPort) || containerPort < 1 || containerPort > 65535) {
    throw new Error('Container port must be between 1 and 65535');
  }

  return { name, slug, repoUrl, branch, containerPort };
}
export function isAllowedRepository(value) {
  return /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/i.test(value)
    || /^git@github\.com:[\w.-]+\/[\w.-]+(?:\.git)?$/i.test(value);
}

export function normalizeDomain(value) {
  const hostname = String(value ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (!HOST_PATTERN.test(hostname)) throw new Error('Enter a valid custom hostname');
  if (hostname.endsWith('.localhost')) throw new Error('Reserved local hostnames cannot be registered');
  return hostname;
}
