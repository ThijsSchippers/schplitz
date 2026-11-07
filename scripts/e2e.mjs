import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const launchOnly = process.argv.includes('--launch');
const servers = [];
let child;

async function stop() {
  child?.kill('SIGTERM');
  await Promise.all(servers.map(server => new Promise(resolve => server.httpServer.close(resolve))));
}
for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
  process.once(signal, async () => { await stop(); process.exit(code); });
}

async function serve(outDir, launch) {
  process.env.VITE_V2_AT_ROOT = String(launch);
  await build({ build: { outDir } });
  // An ephemeral port avoids collisions with a developer's running preview.
  const server = await preview({ build: { outDir }, preview: { host: '127.0.0.1', port: 0, strictPort: true, open: false } });
  servers.push(server);
  return `http://127.0.0.1:${server.httpServer.address().port}`;
}

async function run(file, env) {
  console.log(`\nBrowser scenario: ${file}\n`);
  await new Promise((resolve, reject) => {
    child = spawn(process.execPath, [`e2e/${file}.cjs`], { stdio: 'inherit', env: { ...process.env, ...env } });
    const timer = setTimeout(() => child?.kill('SIGKILL'), 120_000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      child = undefined;
      if (code === 0) resolve();
      else reject(new Error(`${file} failed (${signal ?? code})`));
    });
  });
}

try {
  const normal = await serve('dist', false);
  if (!launchOnly) {
    for (const file of ['two-phones', 'more-paths', 'two-tabs', 'groups']) {
      await run(file, { BASE: `${normal}/v2/` });
    }
  }
  const launch = await serve('dist-launch', true);
  await run('launch', { DEFAULT_BASE: normal, LAUNCH_BASE: launch });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await stop();
}
