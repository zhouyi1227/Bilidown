import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packagingDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(packagingDir, "..");
const venvPython = process.platform === "win32"
  ? resolve(root, ".venv", "Scripts", "python.exe")
  : resolve(root, ".venv", "bin", "python");
const python = existsSync(venvPython) ? venvPython : "python";
const result = spawnSync(python, [resolve(packagingDir, "generate-openapi.py")], {
  cwd: root,
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}
process.exit(result.status ?? 1);
