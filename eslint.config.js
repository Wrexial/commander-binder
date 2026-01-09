// eslint.config.js
import globals from "globals";
import js from "@eslint/js";

export default [
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      }
    }
  },
  js.configs.recommended,
  {
    rules: {
      "no-undef": "error"
    }
  }
];