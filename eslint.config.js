import eslint from "@eslint/js"
import prettier from "eslint-config-prettier"
import tseslint from "typescript-eslint"

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "src/workbench/web/dist/**",
      "spec/audit/**",
      "spec/evidence/**",
      "spec/**/*.gen.*",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
)
