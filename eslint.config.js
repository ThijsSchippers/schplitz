// Linting for the v2 prototype (src/v2). The v1 app isn't covered yet.
import globals from "globals";

export default [
  {
    files: ["src/v2/**/*.js"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: { ...globals.browser, ...globals.node } },
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
    },
  },
  {
    // Test fakes stand in for async APIs like fetch without awaiting anything.
    files: ["src/v2/test/**/*.js"],
    rules: { "require-await": "off" },
  },
];
