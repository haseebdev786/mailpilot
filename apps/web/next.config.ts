import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";

// The repository keeps a single .env at the monorepo root, but Next.js only
// reads env files from the app directory (apps/web). Load the root file here so
// `npm run dev` picks up DATABASE_URL, ENCRYPTION_KEY and the rest.
// Already-set variables (CI, hosting dashboards) win over the file.
for (const candidate of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")]) {
  if (existsSync(candidate)) {
    process.loadEnvFile?.(candidate);
    break;
  }
}

const nextConfig: NextConfig = {
  output: "standalone",
  // Keep production builds separate from a running development server.
  distDir: process.env.NODE_ENV === "development" ? ".next" : ".next-production",
  outputFileTracingRoot: resolve(__dirname, "../.."),
  transpilePackages: ["@mailpilot/shared"],
  serverExternalPackages: ["bullmq", "ioredis", "nodemailer", "imapflow", "mailparser"],
  typedRoutes: true,
  webpack: (config) => {
    config.resolve.alias = { ...config.resolve.alias, "@valkey/valkey-glide": false };
    return config;
  }
};

export default nextConfig;
