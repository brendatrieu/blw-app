// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/.data/**", "**/*.d.ts"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Plain Node scripts (no tsx/ts-node, run with `node`) — everything else
    // in the repo is TypeScript, where typescript-eslint's recommended
    // config already turns off `no-undef` in favor of TS's own checking, so
    // this override only needs to cover the runtime globals a `.mjs` script
    // actually touches.
    files: ["**/*.mjs"],
    languageOptions: {
      globals: { console: "readonly", process: "readonly" },
    },
  },
  eslintConfigPrettier,
);
