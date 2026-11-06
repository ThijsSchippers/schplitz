// Linting for Schplitz 2 and shared modules. The legacy app isn't covered yet.
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    files: ["src/v2/**/*.{js,jsx}", "src/shared/**/*.js"],
    plugins: { react, "react-hooks": reactHooks },
    languageOptions: {
      ecmaVersion: 2024, sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    settings: { react: { version: "18.2" } },
    rules: {
      "no-unused-vars": ["error", { args: "after-used", argsIgnorePattern: "^_" }],
      "no-undef": "error",
      "no-shadow": "error",
      "eqeqeq": ["error", "smart"],
      "no-var": "error",
      "prefer-const": "error",
      "no-prototype-builtins": "error",
      "require-await": "error",
      "no-promise-executor-return": "error",
      "consistent-return": "error",
      "react/jsx-uses-vars": "error",
      "react/jsx-key": "error",
      "react/no-unknown-property": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
  {
    files: ["src/v2/tally/**/*.js"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{ name: "../tally.js", message: "Import sibling tally modules directly to keep the public entry point out of dependency cycles." }],
      }],
    },
  },
  {
    // Test fakes stand in for async APIs like fetch without awaiting anything.
    files: ["src/v2/test/**/*.{js,jsx}"],
    rules: { "require-await": "off" },
  },
];
