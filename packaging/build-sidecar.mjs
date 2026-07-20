import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const isWindows = process.platform === "win32";
const pythonCandidates = isWindows
  ? [join(root, ".venv", "Scripts", "python.exe"), "python"]
  : [join(root, ".venv", "bin", "python"), "python3"];
const python = pythonCandidates.find((candidate) => candidate === "python" || candidate === "python3" || existsSync(candidate));
if (!python) {
  throw new Error("Python was not found; create .venv and install .[dev] first.");
}

const cargo = isWindows
  ? join(homedir(), ".cargo", "bin", "rustc.exe")
  : join(homedir(), ".cargo", "bin", "rustc");
const rustc = existsSync(cargo) ? cargo : "rustc";
const host = spawnSync(rustc, ["-vV"], { encoding: "utf8" });
if (host.status !== 0) {
  throw new Error(host.stderr || "Unable to determine the Rust host target.");
}
const targetLine = host.stdout.split(/\r?\n/u).find((line) => line.startsWith("host: "));
if (!targetLine) throw new Error("Rust host target is missing from rustc -vV.");
const target = targetLine.slice("host: ".length);

const build = spawnSync(
  python,
  [
    "-m",
    "PyInstaller",
    "--noconfirm",
    "--clean",
    "--distpath",
    join(root, "dist", "sidecar"),
    "--workpath",
    join(root, "build", "sidecar"),
    join(root, "packaging", "Bilidown-sidecar.spec"),
  ],
  { cwd: root, stdio: "inherit" },
);
if (build.status !== 0) process.exit(build.status ?? 1);

const suffix = isWindows ? ".exe" : "";
const source = join(root, "dist", "sidecar", `bilidown-backend${suffix}`);
const binaryDirectory = join(root, "src-tauri", "binaries");
mkdirSync(binaryDirectory, { recursive: true });
copyFileSync(source, join(binaryDirectory, `bilidown-backend-${target}${suffix}`));
