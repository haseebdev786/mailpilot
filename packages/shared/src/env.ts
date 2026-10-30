import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Hosting environment variables take precedence over the monorepo's local file.
for (const candidate of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")]) {
  if (existsSync(candidate)) {
    process.loadEnvFile(candidate);
    break;
  }
}
