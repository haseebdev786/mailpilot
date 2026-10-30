#!/usr/bin/env node
// Ensures a local Redis server is reachable before the worker starts.
//
// On Windows Redis is commonly available inside WSL. Starting it there is not
// enough: WSL shuts the distro down as soon as the last session exits, so a
// detached keep-alive process is left running to keep Redis up.
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  for (const candidate of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")]) {
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return;
    }
  }
}

function redisTarget() {
  const raw = process.env.REDIS_URL || "redis://localhost:6379";
  try {
    const url = new URL(raw);
    return { host: url.hostname === "::1" ? "127.0.0.1" : url.hostname, port: Number(url.port || 6379), local: ["localhost", "127.0.0.1", "::1"].includes(url.hostname) };
  } catch {
    return { host: "127.0.0.1", port: 6379, local: true };
  }
}

function probe(host, port, timeout = 1_000) {
  return new Promise((resolveProbe) => {
    const socket = net.connect({ host, port });
    const done = (result) => { socket.destroy(); resolveProbe(result); };
    socket.setTimeout(timeout);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

function wslDistro() {
  if (process.env.WSL_DISTRO) return process.env.WSL_DISTRO;
  const result = spawnSync("wsl", ["-l", "-q"], { encoding: "utf8" });
  if (result.status !== 0) return null;
  const names = result.stdout.split(/\r?\n/).map((name) => name.replace(/\0/g, "").trim()).filter(Boolean);
  return names.find((name) => /ubuntu/i.test(name)) ?? names[0] ?? null;
}

function startRedisInWsl(distro) {
  const command = "service redis-server start >/dev/null 2>&1 || redis-server --daemonize yes >/dev/null 2>&1; exec sleep infinity";
  const child = spawn("wsl", ["-d", distro, "-u", "root", "-e", "sh", "-c", command], { detached: true, stdio: "ignore" });
  child.unref();
}

export async function ensureRedis({ quiet = false } = {}) {
  loadEnv();
  const { host, port, local } = redisTarget();
  if (await probe(host, port)) return { ok: true, started: false };

  if (!local) {
    if (!quiet) console.error(`[redis] ${host}:${port} is not reachable. Check REDIS_URL.`);
    return { ok: false, started: false };
  }

  if (process.platform === "win32") {
    const distro = wslDistro();
    if (distro) {
      if (!quiet) console.log(`[redis] starting Redis inside WSL (${distro})...`);
      startRedisInWsl(distro);
    } else if (!quiet) {
      console.error("[redis] Redis is not running and no WSL distro was found. Install Redis, Docker or WSL.");
    }
  } else if (!quiet) {
    console.error(`[redis] Redis is not reachable at ${host}:${port}. Start it with: redis-server --daemonize yes`);
  }

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));
    if (await probe(host, port)) {
      if (!quiet) console.log(`[redis] ready on ${host}:${port}`);
      return { ok: true, started: true };
    }
  }
  if (!quiet) console.error(`[redis] still not reachable at ${host}:${port} after 30s.`);
  return { ok: false, started: false };
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("ensure-redis.mjs")) {
  const result = await ensureRedis();
  // The worker itself reports a clear error if Redis stays down, so do not block
  // starting the app for a remote/misconfigured Redis URL.
  if (!result.ok && process.env.REQUIRE_REDIS === "true") process.exit(1);
}
