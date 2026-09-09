import fs from 'node:fs/promises';
import path from 'node:path';

async function exists(file) {
  return fs.access(file).then(() => true, () => false);
}
export async function detectBuildPlan(repoDir, containerPort) {
  const dockerfilePath = path.join(repoDir, 'Dockerfile');
  if (await exists(dockerfilePath)) {
    return { type: 'dockerfile', dockerfilePath, dockerfile: null };
  }

  const requirementsPath = path.join(repoDir, 'requirements.txt');
  const appPath = path.join(repoDir, 'app.py');
  if (await exists(requirementsPath) && await exists(appPath)) {
    const [requirements, appSource] = await Promise.all([
      fs.readFile(requirementsPath, 'utf8'),
      fs.readFile(appPath, 'utf8'),
    ]);
    if (/^Flask(?:\W|$)/im.test(requirements) && /\bFlask\s*\(/.test(appSource)) {
      return {
        type: 'python-flask',
        dockerfilePath: null,
        dockerfile: [
          'FROM python:3.13-slim',
          'ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1',
          'WORKDIR /app',
          'COPY requirements.txt ./',
          'RUN pip install --no-cache-dir -r requirements.txt gunicorn',
          'COPY . .',
          `EXPOSE ${containerPort}`,
          `CMD ["gunicorn", "--bind", "0.0.0.0:${containerPort}", "app:app"]`,
          '',
        ].join('\n'),
      };
    }
  }

  throw new Error('No supported build configuration found. Add a Dockerfile or use a supported framework.');
}
