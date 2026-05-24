import { nextJsConfig } from "@biztrack/eslint-config/next-js"

/** @type {import("eslint").Linter.Config} */
export default [
  {
    ignores: ['.next/**', 'dist/**', 'release/**'],
  },
  ...nextJsConfig,
]
