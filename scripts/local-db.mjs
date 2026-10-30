/**
 * Starts a local, embedded PostgreSQL server for development (no Docker needed).
 *
 *   npm run db:local
 *
 * On first run it initialises the cluster in ./.pgdata, creates the database,
 * applies Prisma migrations and seeds the demo account. The server keeps running
 * until you press Ctrl+C.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import EmbeddedPostgres from "embedded-postgres";

try {
  process.loadEnvFile?.(".env");
} catch {
  // .env is optional if the variables are already set in the shell.
}

const connectionString =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_DATABASE_URL ??
  "postgresql://mailpilot:mailpilot@localhost:5432/mailpilot?schema=public";

// Embedded Postgres is a direct connection, so the unpooled URL mirrors it.
process.env.DATABASE_URL = connectionString;
process.env.DATABASE_URL_UNPOOLED ??= connectionString;

let parsed;
try {
  parsed = new URL(connectionString);
} catch {
  console.error("DATABASE_URL is not a valid connection string.");
  process.exit(1);
}

const port = Number(parsed.port || 5432);
if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) {
  console.error("db:local only starts a local database. Your DATABASE_URL points to a hosted database; use db:deploy for that connection.");
  process.exit(1);
}
const user = decodeURIComponent(parsed.username || "mailpilot");
const password = decodeURIComponent(parsed.password || "mailpilot");
const database = decodeURIComponent(parsed.pathname.replace(/^\//, "") || "mailpilot");
const dataDir = path.resolve(".pgdata");
const verbose = process.argv.includes("--verbose") || process.env.LOCAL_DB_VERBOSE === "true";

function runNpm(args, label) {
  console.log(`\n› ${label}…\n`);
  const result = spawnSync("npm", args, {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32"
  });
  if (result.status !== 0) {
    console.error(`\n✖ "${label}" failed.`);
    process.exit(result.status ?? 1);
  }
}

const postgres = new EmbeddedPostgres({
  databaseDir: dataDir,
  port,
  user,
  password,
  persistent: true,
  onLog: (message) => {
    if (verbose) process.stdout.write(message);
  },
  onError: (error) => {
    if (verbose) console.error(error);
  }
});

if (!fs.existsSync(path.join(dataDir, "PG_VERSION"))) {
  console.log(`Initialising a local PostgreSQL cluster in ${dataDir} …`);
  await postgres.initialise();
}

console.log(`Starting PostgreSQL on port ${port} …`);
try {
  await postgres.start();
} catch {
  console.error(
    `\n✖ Could not start PostgreSQL on port ${port}.\n` +
      "  Is another PostgreSQL server using that port? Stop it or change the port in POSTGRES_DATABASE_URL.\n"
  );
  process.exit(1);
}

try {
  await postgres.createDatabase(database);
  console.log(`Created database "${database}".`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (!message.includes("already exists")) {
    console.error(`Could not create database "${database}": ${message}`);
  }
}

runNpm(["run", "db:deploy"], "Applying Prisma migrations");
runNpm(["run", "db:seed"], "Seeding the demo workspace");

console.log(
  `\n✔ Local PostgreSQL ready: postgresql://${user}:****@localhost:${port}/${database}\n` +
    "  Keep this terminal open. Press Ctrl+C to stop the database.\n"
);

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log("\nStopping local PostgreSQL …");
  await postgres.stop();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
