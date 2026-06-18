const { spawn } = require('node:child_process');

const isWindows = process.platform === 'win32';
const npm = isWindows ? 'npm.cmd' : 'npm';

const commands = [
  ['backend', ['run', 'dev', '--prefix', 'backend']],
  ['frontend', ['run', 'dev', '--prefix', 'frontend']]
];

const children = commands.map(([name, args]) => {
  const child = spawn(npm, args, {
    cwd: process.cwd(),
    stdio: 'pipe',
    shell: false
  });

  child.stdout.on('data', (data) => process.stdout.write(`[${name}] ${data}`));
  child.stderr.on('data', (data) => process.stderr.write(`[${name}] ${data}`));
  child.on('exit', (code) => {
    if (code) process.exitCode = code;
    children.forEach((processRef) => {
      if (processRef !== child && !processRef.killed) processRef.kill();
    });
  });
  return child;
});

process.on('SIGINT', () => {
  children.forEach((child) => child.kill('SIGINT'));
});
