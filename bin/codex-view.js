#!/usr/bin/env node

import http from "node:http";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HELP_TEXT = `codex-view

Usage:
  codex-view [options]
  codex-view start [options]

Options:
  --port <number>           Preferred port, default 3000
  --host <host>             Bind host, default 127.0.0.1
  --sessions-dir <path>     Override CODEX_SESSIONS_DIR
  --cache-dir <path>        Override CODEX_VIEW_CACHE_DIR
  --no-open                 Do not open the browser automatically
  -h, --help                Show help
  -v, --version             Show version
`;

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    port: 3000,
    host: "127.0.0.1",
    open: true,
    sessionsDir: undefined,
    cacheDir: undefined
  };

  if (args[0] === "start") args.shift();

  while (args.length > 0) {
    const arg = args.shift();

    if (!arg) continue;
    if (arg === "-h" || arg === "--help") {
      console.log(HELP_TEXT);
      process.exit(0);
    }
    if (arg === "-v" || arg === "--version") {
      const packageJson = JSON.parse(readFileSync(path.join(packageRoot(), "package.json"), "utf8"));
      console.log(packageJson.version);
      process.exit(0);
    }
    if (arg === "--no-open") {
      options.open = false;
      continue;
    }
    if (arg === "--port") {
      const value = args.shift();
      const port = Number.parseInt(value ?? "", 10);
      if (!Number.isFinite(port) || port <= 0) {
        throw new Error(`Invalid --port value: ${value ?? ""}`);
      }
      options.port = port;
      continue;
    }
    if (arg === "--host") {
      const value = args.shift();
      if (!value) throw new Error("Missing value for --host");
      options.host = value;
      continue;
    }
    if (arg === "--sessions-dir") {
      const value = args.shift();
      if (!value) throw new Error("Missing value for --sessions-dir");
      options.sessionsDir = value;
      continue;
    }
    if (arg === "--cache-dir") {
      const value = args.shift();
      if (!value) throw new Error("Missing value for --cache-dir");
      options.cacheDir = value;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function packageRoot() {
  const currentFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFile), "..");
}

async function ensureReadable(target) {
  try {
    await access(target);
  } catch {
    throw new Error(`Missing required file: ${target}`);
  }
}

function isPortAvailable(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on("error", () => resolve(false));
    server.listen(port, host, () => {
      server.close(() => resolve(true));
    });
  });
}

async function findPort(startPort, host) {
  for (let port = startPort; port < startPort + 50; port += 1) {
    if (await isPortAvailable(port, host)) return port;
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function waitForServer(url, timeoutMs = 30_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const ok = await new Promise((resolve) => {
      const req = http.get(url, (response) => {
        response.resume();
        resolve((response.statusCode ?? 500) < 500);
      });
      req.on("error", () => resolve(false));
      req.setTimeout(1_000, () => {
        req.destroy();
        resolve(false);
      });
    });

    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Server did not become ready within ${timeoutMs}ms`);
}

function openBrowser(url) {
  const platform = process.platform;

  try {
    if (platform === "darwin") {
      const child = spawn("open", [url], { detached: true, stdio: "ignore" });
      child.unref();
      return;
    }

    if (platform === "win32") {
      const child = spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" });
      child.unref();
      return;
    }

    const child = spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
    child.unref();
  } catch {
    // Ignore browser-open failures.
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = packageRoot();
  const nextBuildId = path.join(root, ".next", "BUILD_ID");
  const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");

  await ensureReadable(nextBuildId);
  await ensureReadable(nextCli);

  const port = await findPort(options.port, options.host);
  const urlHost = options.host === "0.0.0.0" ? "127.0.0.1" : options.host;
  const url = `http://${urlHost}:${port}`;

  if (port !== options.port) {
    console.log(`Port ${options.port} is in use, using ${port} instead.`);
  }

  const child = spawn(process.execPath, [nextCli, "start", "-p", String(port), "-H", options.host], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "production",
      ...(options.sessionsDir ? { CODEX_SESSIONS_DIR: options.sessionsDir } : {}),
      ...(options.cacheDir ? { CODEX_VIEW_CACHE_DIR: options.cacheDir } : {})
    }
  });

  const shutdown = (signal) => {
    if (!child.killed) child.kill(signal);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });

  await waitForServer(url);
  console.log(`codex-view is running at ${url}`);

  if (options.open) {
    openBrowser(url);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
