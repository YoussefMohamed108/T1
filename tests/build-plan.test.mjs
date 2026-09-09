import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('detects a Flask repository and generates a production container recipe', async (context) => {
  const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'localship-flask-'));
  context.after(() => fs.rm(repoDir, { recursive: true, force: true }));
  await fs.writeFile(path.join(repoDir, 'requirements.txt'), 'Flask>=2.0\npython-chess>=1.999\n');
  await fs.writeFile(path.join(repoDir, 'app.py'), 'from flask import Flask\napp = Flask(__name__)\n');

  const module = await import('../src/core/build-plan.mjs').catch(() => ({}));
  assert.equal(typeof module.detectBuildPlan, 'function', 'automatic build-plan detection is not implemented');
  const plan = await module.detectBuildPlan(repoDir, 3000);

  assert.equal(plan.type, 'python-flask');
  assert.match(plan.dockerfile, /FROM python:3\.13-slim/);
  assert.match(plan.dockerfile, /gunicorn/);
  assert.match(plan.dockerfile, /0\.0\.0\.0:3000/);
});
