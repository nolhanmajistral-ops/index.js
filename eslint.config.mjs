import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  { ignores: ["node_modules/**", ".next/**", "index.js", "next-env.d.ts", "coverage/**", "playwright-report/**", "test-results/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // Règle d'architecture : app/ et domain/ ne doivent jamais importer un provider externe.
    files: ["src/app/**/*.{ts,tsx}", "src/domain/**/*.ts", "src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["@/providers/*", "@/providers/**", "**/providers/planity/**", "**/providers/instagram/**", "**/providers/tiktok/**"], message: "app/ et domain/ lisent les données internes via repositories/services, jamais un provider externe." }] }],
    },
  },
];

export default eslintConfig;
