#!/usr/bin/env node
// One command for local development: Redis (if needed) + web + worker.
// The worker is required for imports, sending, follow-ups and reply sync.
import net from "node:net";
import { spawn } from "node:child_process";
import { ensureRedis } from "./ensure-redis.mjs";

const PORT = Number(process.env.PORT || 3000);

function portInUse(port) {
  return new Promise((resolveProbe) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const done = (result) => { socket.destroy(); resolveProbe(result); };
    socket.setTimeout(700);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

await ensureRedis();

const children = [];
function run(label, args) {
  const child = spawn("npm", args, { stdio: "inherit", shell: true });
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) console.error(`[dev] ${label} exited with code ${code}`);
  });
  children.push(child);
  return child;
}

if (await portInUse(PORT)) {
  console.log(`[dev] web already running on http://localhost:${PORT}; starting the worker only.`);
} else {
  run("web", ["run", "dev:web"]);
}
run("worker", ["run", "dev:worker"]);

function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
