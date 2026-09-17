import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // exhibition-list-tool/ is a fully separate Python CLI (its own repo-within-a-repo,
    // not committed) — its vendored .venv/ dependencies aren't this project's JS/TS.
    "exhibition-list-tool/**",
  ]),
]);

export default eslintConfig;
