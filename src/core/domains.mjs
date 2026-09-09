export function defaultHostname(project) {
  return `${project.slug}.localhost`;
}
export function routeHostname(state, hostHeader) {
  const hostname = String(hostHeader ?? '').split(':')[0].toLowerCase();
  const customDomain = state.domains.find((item) => item.hostname === hostname && item.status === 'active');
  const project = customDomain
    ? state.projects.find((item) => item.id === customDomain.projectId)
    : state.projects.find((item) => defaultHostname(item) === hostname);

  if (!project) return { matched: false, kind: null, project: null, deployment: null };
  const deployment = state.deployments.find(
    (item) => item.projectId === project.id && item.status === 'ready',
  ) ?? null;
  return {
    matched: true,
    kind: customDomain ? 'custom' : 'default',
    project,
    deployment,
  };
}

export async function verifyDomainOwnership(hostname, verificationToken, resolveTxt = nodeResolveTxt) {
  try {
    const records = await resolveTxt(`_localship.${hostname}`);
    return records.some((chunks) => chunks.join('') === verificationToken);
  } catch (error) {
    if (['ENODATA', 'ENOTFOUND', 'ESERVFAIL', 'ETIMEOUT'].includes(error.code)) return false;
    throw error;
  }
}

export function createExternalDomainSetup(hostname, localOrigin, verificationToken) {
  return {
    localOrigin,
    verification: {
      record: {
        type: 'TXT',
        name: `_localship.${hostname}`,
        value: verificationToken,
      },
    },
    cloudflare: {
      configFile: 'localship-cloudflared.yml',
      commands: [
        'cloudflared tunnel login',
        'cloudflared tunnel create localship',
        `cloudflared tunnel route dns localship ${hostname}`,
        'cloudflared tunnel --config ./localship-cloudflared.yml run localship',
      ],
      config: [
        'tunnel: YOUR_TUNNEL_ID',
        'credentials-file: PATH_TO_TUNNEL_CREDENTIALS.json',
        'ingress:',
        `  - hostname: ${hostname}`,
        `    service: ${localOrigin}`,
        '  - service: http_status:404',
        '',
      ].join('\n'),
    },
    manual: {
      target: localOrigin,
      preserveHostHeader: true,
      requirements: [
        'Point the domain DNS record at a public reverse proxy or public IP.',
        `Forward HTTPS traffic for ${hostname} to ${localOrigin}.`,
        'Preserve the original Host header so Localship selects the correct project.',
      ],
    },
  };
}
import { resolveTxt as nodeResolveTxt } from 'node:dns/promises';
