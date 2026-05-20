#!/usr/bin/env node
/**
 * Cross-platform rebuild script for native Node modules to match the Electron ABI.
 *
 * Strategy: try `prebuild-install` (fast, no compiler needed) for each native package,
 * fall back to a warning if it fails (the user will then need a C++ toolchain).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function readPkgJson(p) {
  try {
    return JSON.parse(readFileSync(path.join(p, "package.json"), "utf8"));
  } catch {
    return null;
  }
}

const electronPkg = readPkgJson(path.join(root, "node_modules", "electron"));
const electronVersion = electronPkg?.version;
if (!electronVersion) {
  console.warn("[rebuild-native] electron not installed yet; skipping native rebuild.");
  process.exit(0);
}

const arch = process.arch === "ia32" ? "ia32" : process.arch === "arm64" ? "arm64" : "x64";
const platform =
  process.platform === "darwin" ? "darwin" : process.platform === "linux" ? "linux" : "win32";

const targets = [
  path.join(root, "node_modules", "better-sqlite3"),
  path.join(
    root,
    "node_modules",
    "@langchain",
    "langgraph-checkpoint-sqlite",
    "node_modules",
    "better-sqlite3",
  ),
];

let hadFailure = false;
for (const cwd of targets) {
  if (!existsSync(cwd)) continue;
  const pkg = readPkgJson(cwd);
  console.log(
    `[rebuild-native] prebuild-install ${pkg?.name ?? cwd}@${pkg?.version ?? "?"} for electron ${electronVersion} (${platform}-${arch})`,
  );
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const res = spawnSync(
    npx,
    [
      "--yes",
      "prebuild-install",
      "--runtime",
      "electron",
      "--target",
      electronVersion,
      "--arch",
      arch,
      "--platform",
      platform,
    ],
    { cwd, stdio: "inherit", env: process.env },
  );
  if (res.status !== 0) {
    hadFailure = true;
    console.warn(
      `[rebuild-native] prebuild-install failed for ${pkg?.name ?? cwd}; you may need a C++ toolchain (Visual Studio Build Tools on Windows, Xcode CLI on macOS, build-essential on Linux).`,
    );
  }
}

if (hadFailure) {
  console.warn(
    "[rebuild-native] one or more native modules could not be auto-installed. Run `npx electron-rebuild` after installing a C++ toolchain.",
  );
}
