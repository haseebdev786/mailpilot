import { createRequire } from "node:module";
import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)), resolvePluginsRelativeTo: dirname(require.resolve("eslint-config-next/package.json")) });
const config = [
  { ignores: [".next/**", ".next-production/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  { rules: { "@typescript-eslint/no-unused-vars": "off" } }
];

export default config;
