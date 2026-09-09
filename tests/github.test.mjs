import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { branchFromRef, verifyGitHubSignature } from '../src/core/github.mjs';

test('verifies GitHub sha256 signatures', () => {
  const body = Buffer.from('{"ref":"refs/heads/main"}');
  const signature = `sha256=${crypto.createHmac('sha256', 'secret').update(body).digest('hex')}`;
  assert.equal(verifyGitHubSignature('secret', body, signature), true);
  assert.equal(verifyGitHubSignature('wrong', body, signature), false);
});
test('extracts branch names from refs', () => {
  assert.equal(branchFromRef('refs/heads/feature/demo'), 'feature/demo');
  assert.equal(branchFromRef('refs/tags/v1'), null);
});
