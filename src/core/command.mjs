import { spawn } from 'node:child_process';

export function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      windowsHide: true,
      shell: false,
    });
    let output = '';
    const append = (chunk) => {
      const text = chunk.toString();
      output = `${output}${text}`.slice(-200_000);
      options.onOutput?.(text);
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve({ code, output });
      else reject(Object.assign(new Error(`${command} exited with code ${code}`), { code, output }));
    });
  });
}
