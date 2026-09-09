import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDomain, normalizeProjectInput } from '../src/core/validation.mjs';

test('normalizes valid project input', () => {
  assert.deepEqual(normalizeProjectInput({ name: 'My App', repoUrl: 'https://github.com/acme/app.git', branch: 'main', containerPort: '8080' }), {
    name: 'My App', slug: 'my-app', repoUrl: 'https://github.com/acme/app.git', branch: 'main', containerPort: 8080,
  });
});
test('rejects repositories outside GitHub', () => {
  assert.throws(() => normalizeProjectInput({ name: 'App', repoUrl: 'https://evil.example/app.git' }), /GitHub/);
});

test('normalizes custom domains', () => {
  assert.equal(normalizeDomain('App.Example.COM.'), 'app.example.com');
  assert.throws(() => normalizeDomain('localhost'), /valid/);
});
