import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["dist", "node_modules", "prisma/migrations"],
  },
  {
    files: ["src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // Guardrail for the types convention: controllers wire HTTP to services and
    // must not own shapes. Domain/API types belong in the module's
    // `*.interface.ts`; `AuthenticatedRequest` lives in `src/types/express.ts`.
    files: ["src/**/*.controller.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSInterfaceDeclaration",
          message:
            "Controllers must not declare interfaces. Move this to the module's *.interface.ts.",
        },
        {
          selector: "TSTypeAliasDeclaration",
          message:
            "Controllers must not declare type aliases. Move this to the module's *.interface.ts.",
        },
      ],
    },
  }
);
