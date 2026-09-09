import crypto from 'node:crypto';

export function verifyGitHubSignature(secret, rawBody, signature) {
  if (!secret || !signature?.startsWith('sha256=')) return false;
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const supplied = Buffer.from(signature, 'utf8');
  const calculated = Buffer.from(expected, 'utf8');
  return supplied.length === calculated.length && crypto.timingSafeEqual(supplied, calculated);
}
export function branchFromRef(ref) {
  return typeof ref === 'string' && ref.startsWith('refs/heads/') ? ref.slice(11) : null;
}
