import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const commands = [
  ["Lint", "eslint/bin/eslint.js", ["src/v2", "src/shared"]],
  ["Tests", "vitest/vitest.mjs", ["run"]],
  ["Default build", "vite/bin/vite.js", ["build"], "false"],
  ["Launch build", "vite/bin/vite.js", ["build", "--outDir", "dist-launch"], "true"],
];

for (const [label, executable, args, launch] of commands) {
  console.log(`\n${label}\n`);
  const result = spawnSync(process.execPath, [`node_modules/${executable}`, ...args], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...(launch ? { VITE_V2_AT_ROOT: launch } : {}) },
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
